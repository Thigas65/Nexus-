import {
  IntegrationError,
  IntegrationStatus,
} from "./index.mjs";
import {
  AuthorizationProvider,
  SecureCredentialStore,
} from "./authorization.mjs";

const knownStatuses = new Set(Object.values(IntegrationStatus));

export class ConnectionManager {
  constructor({
    integrationRegistry,
    authorizationProvider,
    credentialStore = new SecureCredentialStore(),
  } = {}) {
    if (
      !integrationRegistry ||
      typeof integrationRegistry.get !== "function" ||
      typeof integrationRegistry.getStatus !== "function" ||
      typeof integrationRegistry.getAdapter !== "function" ||
      typeof integrationRegistry.setConnectionState !== "function"
    ) {
      throw new TypeError("ConnectionManager precisa de um IntegrationRegistry válido.");
    }
    this.integrationRegistry = integrationRegistry;
    this.authorizationProvider = authorizationProvider ?? new AuthorizationProvider({ credentialStore });
    this.credentialStore = credentialStore;
  }

  async connect(integrationId) {
    const integration = this.requireIntegration(integrationId);
    const current = await this.integrationRegistry.getStatus(integrationId);
    if (current.status === IntegrationStatus.CONNECTED) {
      return { ok: true, integrationId, status: current.status, alreadyConnected: true };
    }
    if (!integration.configured) {
      return {
        ok: false,
        integrationId,
        status: current.status === IntegrationStatus.DISCONNECTED
          ? IntegrationStatus.DISCONNECTED
          : IntegrationStatus.UNAVAILABLE,
        message: "A integração ainda não está configurada; nenhuma conexão foi iniciada.",
      };
    }

    this.integrationRegistry.setConnectionState(integrationId, IntegrationStatus.CONNECTING);
    try {
      const adapter = this.integrationRegistry.getAdapter(integrationId);
      const adapterRequest = await adapter.beginConnection();
      const authorizationRequest = await this.authorizationProvider.beginAuthorization(
        integrationId,
        adapterRequest,
      );
      return {
        ok: true,
        integrationId,
        status: IntegrationStatus.CONNECTING,
        authorizationRequired: true,
        authorizationRequest,
      };
    } catch (error) {
      const status = safeFailureStatus(error);
      this.integrationRegistry.setConnectionState(integrationId, status);
      return {
        ok: false,
        integrationId,
        status,
        message: safeErrorMessage(error, "Não foi possível iniciar a conexão."),
      };
    }
  }

  async verifyConnection(integrationId) {
    this.requireIntegration(integrationId);
    if (!this.integrationRegistry.hasVerifiedAuthorization(integrationId)) {
      const status = await this.integrationRegistry.getStatus(integrationId);
      return {
        ok: false,
        integrationId,
        status: status.status,
        authorized: false,
        message: "Não há autorização verificada para esta integração.",
      };
    }

    try {
      const authorized = await this.authorizationProvider.verifyAuthorization(integrationId);
      const adapter = this.integrationRegistry.getAdapter(integrationId);
      const checkConnection = adapter.checkConnection ?? adapter.getStatus;
      const adapterStatus = await checkConnection.call(adapter);
      if (authorized !== true || adapterStatus !== IntegrationStatus.CONNECTED) {
        this.integrationRegistry.setConnectionState(
          integrationId,
          IntegrationStatus.DISCONNECTED,
          { authorizationRevoked: true },
        );
        return {
          ok: false,
          integrationId,
          status: IntegrationStatus.DISCONNECTED,
          authorized: false,
          message: "A autorização ou a conexão não pôde ser verificada.",
        };
      }

      this.integrationRegistry.setConnectionState(
        integrationId,
        IntegrationStatus.CONNECTED,
        { authorizationVerified: true },
      );
      return {
        ok: true,
        integrationId,
        status: IntegrationStatus.CONNECTED,
        authorized: true,
      };
    } catch (error) {
      const status = safeFailureStatus(error);
      this.integrationRegistry.setConnectionState(integrationId, status);
      return {
        ok: false,
        integrationId,
        status,
        authorized: false,
        message: safeErrorMessage(error, "Não foi possível verificar a conexão."),
      };
    }
  }

  async completeAuthorization(integrationId, authorizationResult) {
    this.requireIntegration(integrationId);
    this.integrationRegistry.setConnectionState(integrationId, IntegrationStatus.CONNECTING);
    try {
      const authorization = await this.authorizationProvider.completeAuthorization(
        integrationId,
        authorizationResult,
      );
      const verified = await this.authorizationProvider.verifyAuthorization(
        integrationId,
        authorization,
      );
      if (verified !== true) {
        throw new IntegrationError(
          "A autorização não foi verificada; a integração permanece desconectada.",
          "authorization_not_verified",
          IntegrationStatus.DISCONNECTED,
        );
      }

      const adapter = this.integrationRegistry.getAdapter(integrationId);
      await adapter.completeAuthorization(authorization);
      const status = await adapter.checkConnection();
      if (status !== IntegrationStatus.CONNECTED) {
        throw new IntegrationError(
          "A autorização foi recebida, mas a conexão do adaptador não foi confirmada.",
          "connection_not_verified",
          status === IntegrationStatus.ERROR ? status : IntegrationStatus.DISCONNECTED,
        );
      }

      this.integrationRegistry.setConnectionState(
        integrationId,
        IntegrationStatus.CONNECTED,
        { authorizationVerified: true },
      );
      return {
        ok: true,
        integrationId,
        status: IntegrationStatus.CONNECTED,
        authorized: true,
      };
    } catch (error) {
      const status = safeFailureStatus(error);
      this.integrationRegistry.setConnectionState(integrationId, status);
      return {
        ok: false,
        integrationId,
        status,
        authorized: false,
        message: safeErrorMessage(error, "Não foi possível concluir a autorização."),
      };
    }
  }

  async disconnect(integrationId) {
    this.requireIntegration(integrationId);
    try {
      const status = await this.integrationRegistry.getAdapter(integrationId).disconnect();
      if (!knownStatuses.has(status)) {
        throw new IntegrationError(
          "O adaptador retornou um estado de desconexão inválido.",
          "invalid_status",
          IntegrationStatus.ERROR,
        );
      }
      if (status === IntegrationStatus.CONNECTED) {
        throw new IntegrationError(
          "O adaptador não confirmou a desconexão.",
          "disconnect_not_verified",
          IntegrationStatus.ERROR,
        );
      }
      if (status === IntegrationStatus.ERROR) {
        throw new IntegrationError(
          "O adaptador não conseguiu confirmar a desconexão.",
          "disconnect_failed",
          IntegrationStatus.ERROR,
        );
      }
      const nextStatus = status === IntegrationStatus.UNAVAILABLE
        ? IntegrationStatus.UNAVAILABLE
        : IntegrationStatus.DISCONNECTED;
      this.integrationRegistry.setConnectionState(integrationId, nextStatus);
      return {
        ok: true,
        integrationId,
        status: nextStatus,
        authorizationRetained: this.integrationRegistry.hasVerifiedAuthorization(integrationId),
      };
    } catch (error) {
      const status = safeFailureStatus(error);
      this.integrationRegistry.setConnectionState(integrationId, status);
      return {
        ok: false,
        integrationId,
        status,
        message: safeErrorMessage(error, "Não foi possível desconectar a integração."),
      };
    }
  }

  async revokeAuthorization(integrationId) {
    this.requireIntegration(integrationId);
    if (!this.integrationRegistry.hasVerifiedAuthorization(integrationId)) {
      const status = await this.integrationRegistry.getStatus(integrationId);
      return {
        ok: true,
        integrationId,
        status: status.status,
        revoked: false,
        message: "Não há autorização armazenada para revogar.",
      };
    }

    try {
      const authorizationRevoked = await this.authorizationProvider.revokeAuthorization(integrationId);
      if (authorizationRevoked !== true) {
        throw new IntegrationError(
          "O provedor não confirmou a revogação da autorização.",
          "revocation_not_verified",
          IntegrationStatus.ERROR,
        );
      }
      await this.integrationRegistry.getAdapter(integrationId).revokeAuthorization();
      await this.credentialStore.delete(integrationId);
      this.integrationRegistry.setConnectionState(
        integrationId,
        IntegrationStatus.DISCONNECTED,
        { authorizationRevoked: true },
      );
      return {
        ok: true,
        integrationId,
        status: IntegrationStatus.DISCONNECTED,
        revoked: true,
      };
    } catch (error) {
      const status = safeFailureStatus(error);
      this.integrationRegistry.setConnectionState(integrationId, status);
      return {
        ok: false,
        integrationId,
        status,
        revoked: false,
        message: safeErrorMessage(error, "Não foi possível revogar a autorização."),
      };
    }
  }

  async getConnectionStatus(integrationId) {
    this.requireIntegration(integrationId);
    const status = await this.integrationRegistry.getStatus(integrationId);
    return {
      ...status,
      authorized: this.integrationRegistry.hasVerifiedAuthorization(integrationId),
    };
  }

  requireIntegration(integrationId) {
    const integration = this.integrationRegistry.get(integrationId);
    if (!integration) {
      throw new IntegrationError(
        `A integração "${integrationId}" não foi encontrada.`,
        "integration_not_found",
        IntegrationStatus.UNAVAILABLE,
      );
    }
    return integration;
  }
}

function safeFailureStatus(error) {
  return error instanceof IntegrationError && knownStatuses.has(error.status)
    ? error.status
    : IntegrationStatus.ERROR;
}

function safeErrorMessage(error, fallback) {
  if (error instanceof IntegrationError) {
    if (error.code === "adapter_unavailable" || error.code === "authorization_unavailable") {
      return "O fluxo de conexão real ainda não está configurado.";
    }
    if (error.code === "credential_store_unavailable") {
      return "O armazenamento seguro de credenciais ainda não está configurado.";
    }
  }
  return fallback;
}
