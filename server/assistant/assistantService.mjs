import { generateResponse, AssistantError } from "./geminiClient.mjs";
import {
  createDefaultToolRegistry,
  ToolExecutionError,
  ToolPermission,
} from "./tools/index.mjs";
import { createDefaultIntegrationRegistry } from "./integrations/index.mjs";
import { ConnectionManager } from "./integrations/ConnectionManager.mjs";
import { createSupervisedDevelopmentSystem } from "./supervision/index.mjs";

const explicitMemoryCommand = /^(?:por favor,?\s*)?(?:lembre(?:-se)?|lembra|registre|guarde|salve|anote|memorize)\b/i;
const explicitConnectionCommand = /^(?:por favor,?\s*)?(?:conecte|conectar|conecta|desconecte|desconectar|desconecta)\b/i;
const explicitSupervisionCommands = {
  record_learning: /^(?:registre aprendizado|feedback|correção|correcao)\b/i,
  approve_learning: /^(?:aprovar aprendizado|aprovo aprendizado)\b/i,
  invalidate_learning: /^(?:invalidar aprendizado|não considerar aprendizado|nao considerar aprendizado)\b/i,
  create_improvement_proposal: /^(?:crie uma proposta|criar proposta|proponha melhoria|sugira melhoria)\b/i,
  request_proposal_approval: /^(?:enviar proposta para revisão|solicitar aprovação da proposta|solicitar aprovacao da proposta)\b/i,
  approve_improvement_proposal: /^(?:aprovar proposta|aprovo proposta)\b/i,
  reject_improvement_proposal: /^(?:rejeitar proposta|rejeito proposta)\b/i,
  apply_approved_change: /^(?:aplicar proposta aprovada|aplicar alteração aprovada|aplicar alteracao aprovada)\b/i,
};

export class AssistantService {
  constructor({
    toolRegistry,
    integrationRegistry = createDefaultIntegrationRegistry(),
    connectionManager,
    supervisedSystem = createSupervisedDevelopmentSystem(),
    generate = generateResponse,
    now = () => new Date(),
    geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim()),
  } = {}) {
    this.integrationRegistry = integrationRegistry;
    this.connectionManager = connectionManager ?? new ConnectionManager({ integrationRegistry });
    this.supervisedSystem = supervisedSystem;
    this.toolRegistry = toolRegistry ?? createDefaultToolRegistry({
      integrationRegistry,
      connectionManager: this.connectionManager,
      supervisedSystem,
    });
    this.generate = generate;
    this.now = now;
    this.geminiConfigured = geminiConfigured;
  }

  async respond(message, { context = [] } = {}) {
    const request = this.toolRegistry.route(message, { messages: context });
    if (!request.toolName) {
      return this.generate(message, { context });
    }

    const tool = this.toolRegistry.get(request.toolName);
    const permissionGrants = [];
    if (
      tool?.permission === ToolPermission.EXPLICIT_USER_ACTION &&
      explicitMemoryCommand.test(message.trim())
    ) {
      permissionGrants.push(ToolPermission.EXPLICIT_USER_ACTION);
    }
    if (
      tool?.permission === ToolPermission.EXPLICIT_USER_ACTION &&
      ["connect_integration", "disconnect_integration"].includes(tool.name) &&
      explicitConnectionCommand.test(message.trim())
    ) {
      permissionGrants.push(ToolPermission.EXPLICIT_USER_ACTION);
    }
    if (
      tool?.permission === ToolPermission.EXPLICIT_USER_ACTION &&
      explicitSupervisionCommands[tool.name]?.test(message.trim())
    ) {
      permissionGrants.push(ToolPermission.EXPLICIT_USER_ACTION);
    }

    let result;
    try {
      result = await this.toolRegistry.execute(request.toolName, request.parameters, {
        messages: context,
        now: this.now,
        integrationRegistry: this.integrationRegistry,
        connectionManager: this.connectionManager,
        supervisedSystem: this.supervisedSystem,
        toolRegistry: this.toolRegistry,
        supervisionActor: permissionGrants.includes(ToolPermission.EXPLICIT_USER_ACTION)
          ? "user"
          : undefined,
        permissionGrants,
        assistantStatus: {
          state: "available",
          provider: "Gemini",
          geminiConfigured: this.geminiConfigured,
          toolsEnabled: true,
          registeredToolCount: this.toolRegistry.list().length,
        },
      });
    } catch (error) {
      if (error instanceof ToolExecutionError) {
        const statusCode = error.code === "permission_required" ? 403 : 400;
        throw new AssistantError(error.message, statusCode, error.code);
      }
      throw error;
    }

    const settings = this.supervisedSystem.settingsRegistry.list();
    return this.generate(message, {
      context,
      toolResult: {
        request: {
          toolName: request.toolName,
          parameters: request.parameters,
        },
        result,
      },
      ...(settings.responseStyle !== "balanced" ? { supervisedSettings: settings } : {}),
    });
  }
}
