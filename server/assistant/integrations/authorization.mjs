import { IntegrationError, IntegrationStatus } from "./index.mjs";

export const AuthorizationMethod = Object.freeze({
  OAUTH2: "oauth2",
  API_KEY: "api-key",
  ACCESS_TOKEN: "access-token",
  REFRESH_TOKEN: "refresh-token",
});

/**
 * Future implementations must keep authorization exchanges in the backend.
 * They must never return access or refresh tokens to tools, the browser, or logs.
 */
export class AuthorizationProvider {
  constructor({ credentialStore = new SecureCredentialStore() } = {}) {
    this.credentialStore = credentialStore;
  }

  async beginAuthorization() {
    throw new IntegrationError(
      "O fluxo de autorização real ainda não está configurado.",
      "authorization_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  }

  async completeAuthorization() {
    throw new IntegrationError(
      "A conclusão de autorização real ainda não está configurada.",
      "authorization_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  }

  async verifyAuthorization() {
    return false;
  }

  async revokeAuthorization() {
    throw new IntegrationError(
      "A revogação de autorização real ainda não está configurada.",
      "authorization_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  }
}

/**
 * Interface for a future backend secret manager.
 * Do not replace this with browser storage, localStorage, source files, or bundles.
 */
export class SecureCredentialStore {
  async store() {
    throw new IntegrationError(
      "Um armazenamento seguro de credenciais não está configurado.",
      "credential_store_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  }

  async retrieve() {
    throw new IntegrationError(
      "Um armazenamento seguro de credenciais não está configurado.",
      "credential_store_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  }

  async delete() {
    throw new IntegrationError(
      "Um armazenamento seguro de credenciais não está configurado.",
      "credential_store_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  }
}
