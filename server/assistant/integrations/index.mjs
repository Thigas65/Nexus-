export const IntegrationStatus = Object.freeze({
  UNAVAILABLE: "unavailable",
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  ERROR: "error",
});

export class IntegrationError extends Error {
  constructor(message, code = "integration_error", status = IntegrationStatus.ERROR) {
    super(message);
    this.name = "IntegrationError";
    this.code = code;
    this.status = status;
  }
}

/**
 * Base contract for server-side integration adapters.
 * Implementations must keep credentials in backend-only secret storage.
 */
export class IntegrationAdapter {
  async connect() {
    throw new IntegrationError(
      "Este adaptador de integração ainda não está disponível.",
      "adapter_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  }

  async beginConnection() {
    return this.connect();
  }

  async checkConnection() {
    return this.getStatus();
  }

  async completeAuthorization() {
    throw new IntegrationError(
      "Este adaptador não implementa conclusão de autorização.",
      "authorization_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  }

  async disconnect() {
    return this.getStatus();
  }

  async revokeAuthorization() {
    throw new IntegrationError(
      "Este adaptador não implementa revogação de autorização.",
      "authorization_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  }

  async getStatus() {
    return IntegrationStatus.UNAVAILABLE;
  }

  async getCapabilities() {
    return [];
  }

  async execute() {
    throw new IntegrationError(
      "Ações externas não estão disponíveis neste adaptador.",
      "adapter_unavailable",
      IntegrationStatus.UNAVAILABLE,
    );
  }
}

export class PlaceholderIntegrationAdapter extends IntegrationAdapter {
  constructor(capabilities) {
    super();
    this.capabilities = capabilities.map((capability) => ({ ...capability, available: false }));
  }

  async getStatus() {
    return IntegrationStatus.UNAVAILABLE;
  }

  async getCapabilities() {
    return this.capabilities.map((capability) => ({ ...capability }));
  }

  async disconnect() {
    return IntegrationStatus.UNAVAILABLE;
  }

  async revokeAuthorization() {
    return IntegrationStatus.UNAVAILABLE;
  }
}

function createIntegration({ id, name, description, type, capabilityDefinitions }) {
  return {
    id,
    name,
    description,
    type,
    status: IntegrationStatus.UNAVAILABLE,
    configured: false,
    permissions: capabilityDefinitions.map(({ id: capability, requiresConfirmation }) => ({
      integrationId: id,
      capability,
      granted: false,
      requiresConfirmation,
    })),
    capabilities: capabilityDefinitions.map(({ id: capability, description: capabilityDescription }) => ({
      id: capability,
      description: capabilityDescription,
      available: false,
    })),
  };
}

const integrationDefinitions = [
  {
    id: "android",
    name: "Android",
    description: "Integração futura com dispositivos Android.",
    type: "device",
    capabilityDefinitions: [
      { id: "device.status", description: "Consultar o status do dispositivo.", requiresConfirmation: false },
    ],
  },
  {
    id: "samsung-smart-tv",
    name: "Samsung Smart TV",
    description: "Integração futura com televisores Samsung Smart TV.",
    type: "device",
    capabilityDefinitions: [
      { id: "status.view", description: "Consultar o status da TV.", requiresConfirmation: false },
      { id: "playback.control", description: "Controlar a reprodução.", requiresConfirmation: true },
      { id: "volume.change", description: "Alterar o volume.", requiresConfirmation: true },
    ],
  },
  {
    id: "spotify",
    name: "Spotify",
    description: "Integração futura com o serviço Spotify.",
    type: "service",
    capabilityDefinitions: [
      { id: "music.search", description: "Pesquisar músicas.", requiresConfirmation: false },
      { id: "playback.control", description: "Controlar a reprodução.", requiresConfirmation: true },
    ],
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Integração futura com o serviço Gmail.",
    type: "service",
    capabilityDefinitions: [
      { id: "messages.read", description: "Ler mensagens.", requiresConfirmation: false },
      { id: "messages.send", description: "Enviar mensagens.", requiresConfirmation: true },
    ],
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Integração futura com o serviço WhatsApp.",
    type: "service",
    capabilityDefinitions: [
      { id: "messages.read", description: "Ler mensagens.", requiresConfirmation: false },
      { id: "messages.send", description: "Enviar mensagens.", requiresConfirmation: true },
    ],
  },
  {
    id: "instagram",
    name: "Instagram",
    description: "Integração futura com o serviço Instagram.",
    type: "service",
    capabilityDefinitions: [
      { id: "profile.read", description: "Consultar informações permitidas do perfil.", requiresConfirmation: false },
      { id: "content.publish", description: "Publicar conteúdo.", requiresConfirmation: true },
    ],
  },
];

export class IntegrationRegistry {
  constructor(integrations = []) {
    this.integrations = new Map();
    for (const entry of integrations) {
      this.register(entry.integration, entry.adapter);
    }
  }

  register(integration, adapter) {
    if (
      !integration ||
      typeof integration.id !== "string" ||
      !integration.id.trim() ||
      typeof integration.name !== "string" ||
      !integration.name.trim() ||
      typeof integration.description !== "string" ||
      typeof integration.type !== "string" ||
      !Object.values(IntegrationStatus).includes(integration.status) ||
      !Array.isArray(integration.permissions) ||
      !Array.isArray(integration.capabilities) ||
      !adapter ||
      typeof adapter.connect !== "function" ||
      typeof adapter.disconnect !== "function" ||
      typeof adapter.getStatus !== "function" ||
      typeof adapter.getCapabilities !== "function" ||
      typeof adapter.execute !== "function"
    ) {
      throw new TypeError("A integração e seu adaptador precisam cumprir o contrato obrigatório.");
    }

    const id = integration.id.trim();
    if (this.integrations.has(id)) {
      throw new Error(`A integração "${id}" já está registrada.`);
    }
    if (integration.permissions.some((permission) => permission.integrationId !== id)) {
      throw new TypeError(`As permissões da integração "${id}" têm um integrationId inválido.`);
    }

    const metadata = {
      ...integration,
      id,
      status: integration.status === IntegrationStatus.CONNECTED
        ? IntegrationStatus.DISCONNECTED
        : integration.status,
      configured: integration.configured === true,
      permissions: integration.permissions.map((permission) => ({ ...permission })),
      capabilities: integration.capabilities.map((capability) => ({ ...capability })),
    };
    this.integrations.set(id, {
      integration: metadata,
      adapter,
      runtimeStatus: metadata.status,
      stateManaged: false,
      authorizationVerified: false,
    });
    return this.get(id);
  }

  list() {
    return Array.from(this.integrations.values(), ({ integration }) => cloneIntegration(integration));
  }

  get(id) {
    const entry = this.integrations.get(String(id));
    return entry ? cloneIntegration(entry.integration) : undefined;
  }

  async getStatus(id) {
    const entry = this.requireIntegration(id);
    if (entry.runtimeStatus === IntegrationStatus.CONNECTING) {
      return {
        ...cloneIntegration(entry.integration),
        status: IntegrationStatus.CONNECTING,
        configured: entry.integration.configured,
        connected: false,
      };
    }
    if (entry.stateManaged && entry.runtimeStatus !== IntegrationStatus.CONNECTED) {
      return {
        ...cloneIntegration(entry.integration),
        status: entry.runtimeStatus,
        configured: entry.integration.configured,
        connected: false,
      };
    }
    try {
      const checkConnection = entry.adapter.checkConnection ?? entry.adapter.getStatus;
      const adapterStatus = await checkConnection.call(entry.adapter);
      if (!Object.values(IntegrationStatus).includes(adapterStatus)) {
        throw new IntegrationError("O adaptador retornou um status inválido.", "invalid_status");
      }
      const status = adapterStatus === IntegrationStatus.CONNECTED && !entry.authorizationVerified
        ? IntegrationStatus.DISCONNECTED
        : adapterStatus;
      const capabilities = await entry.adapter.getCapabilities();
      if (
        !Array.isArray(capabilities) ||
        capabilities.some(
          (capability) =>
            !capability ||
            typeof capability.id !== "string" ||
            !entry.integration.capabilities.some((registered) => registered.id === capability.id),
        )
      ) {
        throw new IntegrationError("O adaptador retornou capacidades inválidas.", "invalid_capabilities");
      }
      return {
        ...cloneIntegration(entry.integration),
        status,
        configured: entry.integration.configured,
        connected: status === IntegrationStatus.CONNECTED,
        capabilities: capabilities.map((item) => ({ ...item })),
      };
    } catch (error) {
      return {
        ...cloneIntegration(entry.integration),
        status: IntegrationStatus.ERROR,
        connected: false,
        error: error instanceof IntegrationError
          ? error.message
          : "Não foi possível consultar o status desta integração.",
      };
    }
  }

  async listWithStatus() {
    return Promise.all(this.list().map(({ id }) => this.getStatus(id)));
  }

  checkPermission(id, capability, { confirmedCapabilities = [] } = {}) {
    const integration = this.requireIntegration(id).integration;
    const permission = integration.permissions.find((item) => item.capability === capability);
    if (!permission || !permission.granted) return false;
    if (
      permission.requiresConfirmation &&
      (!Array.isArray(confirmedCapabilities) || !confirmedCapabilities.includes(capability))
    ) return false;
    return true;
  }

  setConnectionState(
    id,
    status,
    { authorizationVerified = false, authorizationRevoked = false } = {},
  ) {
    const entry = this.requireIntegration(id);
    if (!Object.values(IntegrationStatus).includes(status)) {
      throw new IntegrationError("O estado de conexão solicitado é inválido.", "invalid_status");
    }
    if (status === IntegrationStatus.CONNECTED && !authorizationVerified) {
      throw new IntegrationError(
        "Uma integração só pode ser conectada após autorização verificada.",
        "authorization_required",
        IntegrationStatus.DISCONNECTED,
      );
    }

    if (authorizationVerified) entry.authorizationVerified = true;
    if (authorizationRevoked) {
      entry.authorizationVerified = false;
      entry.integration.configured = false;
    }
    entry.runtimeStatus = status;
    entry.stateManaged = true;
    if (status === IntegrationStatus.CONNECTED) entry.integration.configured = true;
    if (status === IntegrationStatus.CONNECTING) entry.runtimeStatus = IntegrationStatus.CONNECTING;
    return this.get(id);
  }

  getAdapter(id) {
    return this.requireIntegration(id).adapter;
  }

  hasVerifiedAuthorization(id) {
    return this.requireIntegration(id).authorizationVerified;
  }

  async execute(id, capability, input = {}, options = {}) {
    const entry = this.requireIntegration(id);
    const status = await this.getStatus(id);
    if (status.status !== IntegrationStatus.CONNECTED) {
      throw new IntegrationError(
        `A integração "${entry.integration.name}" não está conectada e não pode executar ações.`,
        "integration_not_connected",
        status.status,
      );
    }
    if (!entry.integration.capabilities.some((item) => item.id === capability)) {
      throw new IntegrationError(
        `A capacidade "${capability}" não está registrada para "${entry.integration.name}".`,
        "unknown_capability",
        IntegrationStatus.UNAVAILABLE,
      );
    }
    if (!status.capabilities.some((item) => item.id === capability && item.available === true)) {
      throw new IntegrationError(
        `A capacidade "${capability}" ainda não está disponível em "${entry.integration.name}".`,
        "capability_unavailable",
        IntegrationStatus.UNAVAILABLE,
      );
    }
    if (!this.checkPermission(id, capability, options)) {
      throw new IntegrationError(
        `A capacidade "${capability}" não tem autorização explícita válida.`,
        "permission_required",
        IntegrationStatus.DISCONNECTED,
      );
    }
    try {
      return await entry.adapter.execute(capability, input);
    } catch (error) {
      if (error instanceof IntegrationError) throw error;
      throw new IntegrationError(
        `A integração "${entry.integration.name}" falhou durante a execução.`,
        "integration_execution_failed",
        IntegrationStatus.ERROR,
      );
    }
  }

  requireIntegration(id) {
    const entry = this.integrations.get(String(id));
    if (!entry) {
      throw new IntegrationError(`A integração "${id}" não foi encontrada.`, "integration_not_found", IntegrationStatus.UNAVAILABLE);
    }
    return entry;
  }
}

export function createDefaultIntegrationRegistry() {
  return new IntegrationRegistry(
    integrationDefinitions.map((definition) => {
      const integration = createIntegration(definition);
      return {
        integration,
        adapter: new PlaceholderIntegrationAdapter(integration.capabilities),
      };
    }),
  );
}

function cloneIntegration(integration) {
  return {
    ...integration,
    permissions: integration.permissions.map((permission) => ({ ...permission })),
    capabilities: integration.capabilities.map((capability) => ({ ...capability })),
  };
}
