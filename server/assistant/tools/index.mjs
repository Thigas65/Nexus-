import { evaluateExpression, extractExpression } from "./calculator.mjs";
import { ToolExecutionError } from "./errors.mjs";
import {
  createDefaultIntegrationRegistry,
  IntegrationError,
} from "../integrations/index.mjs";
import { ConnectionManager } from "../integrations/ConnectionManager.mjs";
import { createSupervisedDevelopmentSystem } from "../supervision/index.mjs";

/**
 * @typedef {"safe-read" | "safe-compute" | "explicit-user-action" | "external"} ToolPermission
 * @typedef {{
 *   toolName: string | null,
 *   parameters: Record<string, unknown>,
 *   confidence: number,
 *   reason: string
 * }} ToolRequest
 * @typedef {{ ok: boolean, tool: string, [key: string]: unknown }} ToolResult
 * @typedef {{
 *   name: string,
 *   description: string,
 *   aliases: string[],
 *   permission: ToolPermission,
 *   parameters: Record<string, unknown>,
 *   execute: (input?: Record<string, unknown>, context?: Record<string, unknown>) => Promise<ToolResult>
 * }} Tool
 */

export { ToolExecutionError } from "./errors.mjs";

export const ToolPermission = Object.freeze({
  SAFE_READ: "safe-read",
  SAFE_COMPUTE: "safe-compute",
  EXPLICIT_USER_ACTION: "explicit-user-action",
  EXTERNAL: "external",
});

const validPermissions = new Set(Object.values(ToolPermission));

function createDefaultSchema() {
  return {
    type: "object",
    properties: {},
    required: [],
    additionalProperties: true,
  };
}

function normalizeSchema(schema = {}) {
  return {
    type: schema.type ?? "object",
    properties: schema.properties ?? {},
    required: Array.isArray(schema.required) ? schema.required : [],
    additionalProperties:
      schema.additionalProperties ?? true,
    description: schema.description ?? "",
    enum: schema.enum ?? undefined,
  };
}

export function createTool({
  name,
  description,
  parameters = {},
  execute,
  aliases = [],
  permission = ToolPermission.SAFE_READ,
}) {
  if (typeof name !== "string" || !name.trim()) {
    throw new Error("Cada ferramenta precisa de um nome válido.");
  }
  if (typeof description !== "string" || !description.trim()) {
    throw new Error("Cada ferramenta precisa de uma descrição válida.");
  }
  if (typeof execute !== "function") {
    throw new Error("Cada ferramenta precisa de uma função execute().");
  }
  if (!validPermissions.has(permission)) {
    throw new Error("Cada ferramenta precisa de uma permissão válida.");
  }

  const tool = {
    name: name.trim(),
    description: description.trim(),
    aliases: Array.isArray(aliases) ? aliases.map((alias) => String(alias).trim().toLocaleLowerCase()).filter(Boolean) : [],
    permission,
    parameters: normalizeSchema(parameters),
    execute: async (input = {}, context = {}) => {
      const normalizedInput = validateParameters(tool.parameters, input ?? {});
      const result = await execute(normalizedInput, context ?? {});
      if (!result || typeof result !== "object" || Array.isArray(result) || typeof result.ok !== "boolean") {
        throw new ToolExecutionError(
          `A ferramenta "${tool.name}" retornou um resultado inválido.`,
          "invalid_tool_result",
        );
      }
      return { ...result, tool: tool.name };
    },
  };

  return tool;
}

export function validateParameters(schema, input = {}) {
  const normalizedSchema = normalizeSchema(schema ?? createDefaultSchema());
  const value = input && typeof input === "object" && !Array.isArray(input) ? input : {};

  for (const requiredKey of normalizedSchema.required) {
    if (typeof value[requiredKey] === "undefined") {
      throw new ToolExecutionError(
        `A ferramenta precisa do parâmetro obrigatório "${requiredKey}".`,
        "missing_parameter",
      );
    }
  }

  for (const [key, propertySchema] of Object.entries(normalizedSchema.properties || {})) {
    if (typeof value[key] === "undefined") continue;
    if (propertySchema?.enum && !propertySchema.enum.includes(value[key])) {
      throw new ToolExecutionError(
        `O parâmetro "${key}" deve ser um dos valores permitidos: ${propertySchema.enum.join(", ")}.`,
        "invalid_parameter",
      );
    }
    if (propertySchema?.type === "string" && typeof value[key] !== "string") {
      throw new ToolExecutionError(`O parâmetro "${key}" precisa ser uma string.`, "invalid_parameter");
    }
    if (propertySchema?.type === "number" && typeof value[key] !== "number") {
      throw new ToolExecutionError(`O parâmetro "${key}" precisa ser um número.`, "invalid_parameter");
    }
    if (propertySchema?.type === "boolean" && typeof value[key] !== "boolean") {
      throw new ToolExecutionError(`O parâmetro "${key}" precisa ser um booleano.`, "invalid_parameter");
    }
    if (propertySchema?.type === "array" && !Array.isArray(value[key])) {
      throw new ToolExecutionError(`O parâmetro "${key}" precisa ser um array.`, "invalid_parameter");
    }
    if (propertySchema?.type === "object" && (typeof value[key] !== "object" || value[key] === null || Array.isArray(value[key]))) {
      throw new ToolExecutionError(`O parâmetro "${key}" precisa ser um objeto.`, "invalid_parameter");
    }
  }

  return value;
}

export class ToolRegistry {
  constructor(tools = []) {
    this.tools = new Map();
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool) {
    if (
      !tool ||
      typeof tool.name !== "string" ||
      !tool.name.trim() ||
      typeof tool.description !== "string" ||
      !tool.description.trim() ||
      typeof tool.execute !== "function" ||
      !validPermissions.has(tool.permission ?? ToolPermission.SAFE_READ)
    ) {
      throw new Error("A ferramenta precisa ter nome, descrição, permissão e execução válidos.");
    }
    const name = tool.name.trim();
    if (this.tools.has(name)) {
      throw new Error(`A ferramenta "${name}" já está registrada.`);
    }
    this.tools.set(name, tool);
    return tool;
  }

  list() {
    return Array.from(this.tools.values()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      aliases: tool.aliases ?? [],
      permission: tool.permission ?? ToolPermission.SAFE_READ,
      parameters: tool.parameters,
    }));
  }

  get(name) {
    return this.tools.get(String(name));
  }

  async execute(name, input = {}, context = {}) {
    const tool = this.get(name);
    if (!tool) {
      throw new ToolExecutionError(`A ferramenta "${name}" não está registrada.`, "unknown_tool");
    }

    const permission = tool.permission ?? ToolPermission.SAFE_READ;
    if (
      (permission === ToolPermission.EXPLICIT_USER_ACTION || permission === ToolPermission.EXTERNAL) &&
      !hasPermissionGrant(context.permissionGrants, permission)
    ) {
      throw new ToolExecutionError(
        `A ferramenta "${tool.name}" exige autorização explícita (${permission}).`,
        "permission_required",
      );
    }

    try {
      return await tool.execute(input, context);
    } catch (error) {
      if (error instanceof ToolExecutionError) throw error;
      throw new ToolExecutionError(
        `A ferramenta "${tool.name}" falhou durante a execução.`,
        "execution_failed",
      );
    }
  }

  route(request, context = {}) {
    const rawRequest = typeof request === "string" ? request.trim() : "";
    if (!rawRequest) {
      return { toolName: null, parameters: {}, confidence: 0, reason: "empty request" };
    }

    const normalizedRequest = normalizeText(rawRequest);
    const scoredTools = Array.from(this.tools.values())
      .map((tool) => {
        let score = 0;

        if (containsPhrase(normalizedRequest, normalizeText(tool.name.replaceAll("_", " ")))) {
          score = 10;
        }

        for (const alias of tool.aliases ?? []) {
          if (containsPhrase(normalizedRequest, normalizeText(alias))) {
            score = Math.max(score, 4 + Math.min(normalizeText(alias).length / 20, 1));
          }
        }

        return { tool, score };
      })
      .filter(({ score }) => score > 0)
      .sort((left, right) => right.score - left.score);

    if (scoredTools.length === 0) {
      return {
        toolName: null,
        parameters: {},
        confidence: 0,
        reason: "no tool match",
        context,
      };
    }

    const selected = scoredTools[0];
    const parameters = inferParametersFromRequest(selected.tool, rawRequest, context);
    return {
      toolName: selected.tool.name,
      parameters,
      confidence: Math.min(1, (selected.score + 3) / 15),
      reason: `matched an explicit command alias for ${selected.tool.name}`,
      context,
    };
  }
}

function hasPermissionGrant(grants, permission) {
  if (grants instanceof Set) return grants.has(permission);
  return Array.isArray(grants) && grants.includes(permission);
}

function normalizeText(value) {
  return value
    .toLocaleLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsPhrase(text, phrase) {
  if (!phrase) return false;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(text);
}

function inferParametersFromRequest(tool, request, context = {}) {
  const parameters = {};
  const lowercaseRequest = normalizeText(request);

  if (tool.name === "remember_fact") {
    const content = request
      .replace(/^(?:por favor,?\s*)?(?:lembre(?:-se)?|lembra|registre|guarde|salve|anote|memorize)\b\s*(?:de\s+)?(?:que\s+)?/i, "")
      .trim();
    parameters.content = content || request.trim();
    parameters.category =
      lowercaseRequest.includes("prefer") || lowercaseRequest.includes("prefiro") || lowercaseRequest.includes("preferência")
        ? "preference"
        : "explicit";
    parameters.source = "user-request";
    if (context.defaultCategory) parameters.category = context.defaultCategory;
  }

  if (tool.name === "search_memory") {
    parameters.query = request.trim();
  }

  if (tool.name === "summarize_context") {
    parameters.messages = Array.isArray(context.messages) ? context.messages : [];
  }

  if (tool.name === "calculator") {
    parameters.expression = extractExpression(request);
  }

  if (tool.name === "get_integration_status") {
    parameters.integrationId = inferIntegrationId(lowercaseRequest);
  }
  if (
    tool.name === "connect_integration" ||
    tool.name === "disconnect_integration" ||
    tool.name === "get_connection_status"
  ) {
    parameters.integrationId = inferIntegrationId(lowercaseRequest);
  }
  if (tool.name === "record_learning") {
    parameters.content = request.replace(/^(?:registre aprendizado|feedback|correção|correcao)\s*[:,-]?\s*/i, "").trim();
    parameters.type =
      /\b(?:prefer[eê]ncia|prefiro)\b/i.test(request) ? "preference"
        : /\bcorre[cç][aã]o\b/i.test(request) ? "correction"
          : /\berro\b/i.test(request) ? "error"
            : /\bsolu[cç][aã]o\b/i.test(request) ? "solution"
              : "fact";
  }
  if (tool.name === "query_learning") {
    parameters.text = request.replace(/^(?:consultar|buscar|pesquisar)\s+(?:aprendizados?|aprendizagens?)\s*/i, "").trim();
  }
  if (tool.name === "create_improvement_proposal") {
    const concise = /\b(?:concisa|conciso|curta|curto)\b/i.test(request);
    parameters.proposal = request.trim();
    parameters.proposedChange = concise
      ? { type: "runtime-setting", area: "user-experience", key: "responseStyle", value: "concise" }
      : null;
  }
  if (
    tool.name === "get_improvement_proposal" ||
    tool.name === "request_proposal_approval" ||
    tool.name === "approve_improvement_proposal" ||
    tool.name === "reject_improvement_proposal" ||
    tool.name === "apply_approved_change"
  ) {
    parameters.proposalId = extractProposalId(request);
  }
  if (tool.name === "invalidate_learning") {
    parameters.learningId = extractLearningId(request);
    parameters.reason = request.trim();
  }
  if (tool.name === "approve_learning") {
    parameters.learningId = extractLearningId(request);
  }

  return parameters;
}

function extractProposalId(request) {
  return request.match(/\bproposal-[a-z0-9-]+\b/i)?.[0] ?? "";
}

function extractLearningId(request) {
  return request.match(/\blearning-[a-z0-9-]+\b/i)?.[0] ?? "";
}

function inferIntegrationId(request) {
  if (/\b(?:tv|televisao|samsung)\b/.test(request)) return "samsung-smart-tv";
  if (/\bandroid\b/.test(request)) return "android";
  if (/\bspotify\b/.test(request)) return "spotify";
  if (/\bgmail\b/.test(request)) return "gmail";
  if (/\bwhatsapp\b/.test(request)) return "whatsapp";
  if (/\binstagram\b/.test(request)) return "instagram";
  return "";
}

function requireIntegrationRegistry(context, integrationRegistry) {
  const registry = context.integrationRegistry ?? integrationRegistry;
  if (!registry) {
    throw new ToolExecutionError(
      "O serviço de integrações não está disponível.",
      "integration_registry_unavailable",
    );
  }
  return registry;
}

function requireConnectionManager(context, connectionManager) {
  const manager = context.connectionManager ?? connectionManager;
  if (!manager) {
    throw new ToolExecutionError(
      "O serviço de conexões não está disponível.",
      "connection_manager_unavailable",
    );
  }
  return manager;
}

function requireSupervisedSystem(context, supervisedSystem) {
  const system = context.supervisedSystem ?? supervisedSystem;
  if (!system) {
    throw new ToolExecutionError(
      "O serviço de desenvolvimento supervisionado não está disponível.",
      "supervision_unavailable",
    );
  }
  return system;
}

export function createBuiltinTools({
  integrationRegistry = createDefaultIntegrationRegistry(),
  connectionManager = new ConnectionManager({ integrationRegistry }),
  supervisedSystem = createSupervisedDevelopmentSystem(),
} = {}) {
  return [
    createTool({
      name: "remember_fact",
      aliases: [
        "lembre",
        "lembra",
        "registre",
        "guarde",
        "salve",
        "anote",
        "memorize",
        "recordar",
        "gravar",
        "lembrar",
      ],
      description: "Armazena um fato, preferência ou lembrete explícito para uso futuro no contexto local do assistente.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Texto da informação que deve ser lembrada.",
          },
          category: {
            type: "string",
            enum: ["preference", "setting", "explicit", "conversation-context"],
            description: "Tipo de memória local a guardar.",
          },
          source: {
            type: "string",
            description: "Origem da memória, normalmente a ação do usuário ou uma regra do sistema.",
          },
        },
        required: ["content"],
      },
      execute: async ({ content, category = "explicit", source = "user-request" }) => {
        const trimmed = String(content ?? "").trim();
        if (!trimmed) {
          throw new ToolExecutionError("A ferramenta de memória precisa de conteúdo válido.", "invalid_parameter");
        }

        return {
          ok: true,
          tool: "remember_fact",
          stored: {
            category,
            content: trimmed,
            source,
            createdAt: new Date().toISOString(),
          },
        };
      },
    }),
    createTool({
      name: "search_memory",
      aliases: ["buscar", "procurar", "consultar", "pesquisar", "memória"],
      description: "Busca memórias locais por palavra-chave, categoria ou assunto relacionado.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Texto de busca usado para localizar memórias relevantes.",
          },
        },
        required: ["query"],
      },
      execute: async ({ query }, context = {}) => {
        const memoryStore = Array.isArray(context.memoryStore) ? context.memoryStore : [];
        const searchText = String(query ?? "").trim().toLocaleLowerCase();

        if (!searchText) {
          throw new ToolExecutionError("A busca de memórias precisa de uma consulta válida.", "invalid_parameter");
        }

        const matches = memoryStore.filter((memory) => {
          const haystack = `${memory.category ?? ""} ${memory.content ?? ""}`.toLocaleLowerCase();
          return haystack.includes(searchText);
        });

        return {
          ok: true,
          tool: "search_memory",
          matches,
        };
      },
    }),
    createTool({
      name: "summarize_context",
      aliases: ["resumir", "resumo", "contexto", "histórico"],
      description: "Resumir o contexto recente da conversa para uso posterior em uma requisição ou em um comando do assistente.",
      parameters: {
        type: "object",
        properties: {
          messages: {
            type: "array",
            description: "Lista de mensagens recentes do histórico da conversa.",
          },
        },
        required: ["messages"],
      },
      execute: async ({ messages = [] }) => {
        const list = Array.isArray(messages) ? messages : [];
        const summary = list
          .slice(-6)
          .map((message) => `${message.role === "assistant" ? "assistente" : "usuário"}: ${String(message.content ?? "").trim()}`)
          .filter(Boolean)
          .join(" | ");

        return {
          ok: true,
          tool: "summarize_context",
          summary: summary || "Nenhuma mensagem recente para resumir.",
          count: list.length,
        };
      },
    }),
    createTool({
      name: "get_current_time",
      aliases: ["que horas são", "que horas", "hora atual", "horário atual", "horario atual"],
      description: "Informa o horário atual em UTC.",
      permission: ToolPermission.SAFE_READ,
      execute: async (_input, context = {}) => {
        const now = typeof context.now === "function" ? context.now() : new Date();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
          throw new ToolExecutionError("Não foi possível obter o horário atual.", "clock_unavailable");
        }
        return {
          ok: true,
          tool: "get_current_time",
          time: now.toISOString().slice(11, 19),
          timestamp: now.toISOString(),
          timezone: "UTC",
        };
      },
    }),
    createTool({
      name: "get_current_date",
      aliases: ["qual a data", "qual é a data", "data de hoje", "data atual", "que dia é hoje", "me diga a data"],
      description: "Informa a data atual em UTC.",
      permission: ToolPermission.SAFE_READ,
      execute: async (_input, context = {}) => {
        const now = typeof context.now === "function" ? context.now() : new Date();
        if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
          throw new ToolExecutionError("Não foi possível obter a data atual.", "clock_unavailable");
        }
        return {
          ok: true,
          tool: "get_current_date",
          date: now.toISOString().slice(0, 10),
          timezone: "UTC",
        };
      },
    }),
    createTool({
      name: "calculator",
      aliases: ["calcule", "calcular", "calcula", "resolva", "resolve", "quanto é", "quanto dá", "resultado de"],
      description: "Calcula expressões aritméticas limitadas, sem avaliar código ou expressões JavaScript.",
      permission: ToolPermission.SAFE_COMPUTE,
      parameters: {
        type: "object",
        properties: {
          expression: {
            type: "string",
            description: "Expressão aritmética com números, parênteses e operadores +, -, *, /, %, ^.",
          },
        },
        required: ["expression"],
      },
      execute: async ({ expression }) => ({
        ok: true,
        tool: "calculator",
        expression,
        result: evaluateExpression(expression),
      }),
    }),
    createTool({
      name: "get_assistant_status",
      aliases: ["status", "estado do assistente", "estado do nexus", "como está o assistente", "como esta o assistente", "está funcionando", "esta funcionando"],
      description: "Informa o estado operacional do assistente sem expor segredos de configuração.",
      permission: ToolPermission.SAFE_READ,
      execute: async (_input, context = {}) => ({
        ok: true,
        tool: "get_assistant_status",
        status: context.assistantStatus ?? {
          state: "available",
          provider: "Gemini",
          toolsEnabled: true,
        },
      }),
    }),
    createTool({
      name: "list_integrations",
      aliases: [
        "listar integrações",
        "liste as integrações",
        "quais integrações",
        "integrações disponíveis",
        "serviços conectados",
      ],
      description: "Lista integrações preparadas e seus estados sem realizar chamadas externas.",
      permission: ToolPermission.SAFE_READ,
      execute: async (_input, context = {}) => {
        const registry = requireIntegrationRegistry(context, integrationRegistry);
        try {
          return {
            ok: true,
            tool: "list_integrations",
            integrations: await registry.listWithStatus(),
          };
        } catch (error) {
          if (error instanceof IntegrationError) {
            throw new ToolExecutionError(error.message, error.code);
          }
          throw new ToolExecutionError(
            "Não foi possível consultar a lista de integrações.",
            "integration_registry_error",
          );
        }
      },
    }),
    createTool({
      name: "get_integration_status",
      aliases: [
        "status da integração",
        "status da integracao",
        "estado da integração",
        "estado da integracao",
        "controle minha tv",
        "controlar minha tv",
        "ligue minha tv",
        "ligar minha tv",
        "aumente o volume da tv",
        "controle a tv",
        "spotify",
        "gmail",
        "whatsapp",
        "instagram",
        "android",
      ],
      description: "Consulta o estado, as capacidades preparadas e as permissões de uma integração sem executar ações externas.",
      permission: ToolPermission.SAFE_READ,
      parameters: {
        type: "object",
        properties: {
          integrationId: {
            type: "string",
            description: "Identificador de uma integração registrada.",
          },
        },
        required: ["integrationId"],
      },
      execute: async ({ integrationId }, context = {}) => {
        const registry = requireIntegrationRegistry(context, integrationRegistry);
        if (!integrationId) {
          throw new ToolExecutionError(
            "Informe qual integração deseja consultar.",
            "missing_integration_id",
          );
        }
        try {
          const integration = await registry.getStatus(integrationId);
          return {
            ok: true,
            tool: "get_integration_status",
            integration: {
              id: integration.id,
              name: integration.name,
              status: integration.status,
              configured: integration.configured,
              connected: integration.connected,
              error: integration.error,
              capabilities: integration.capabilities,
              permissions: integration.permissions,
            },
          };
        } catch (error) {
          if (error instanceof IntegrationError) {
            throw new ToolExecutionError(error.message, error.code);
          }
          throw new ToolExecutionError(
            "Não foi possível consultar o estado da integração.",
            "integration_status_error",
          );
        }
      },
    }),
    createTool({
      name: "connect_integration",
      aliases: [
        "conectar android",
        "conectar tv",
        "conectar televisão",
        "conectar televisao",
        "conectar samsung",
        "conectar spotify",
        "conectar gmail",
        "conectar whatsapp",
        "conectar instagram",
        "iniciar conexão com",
        "iniciar conexao com",
      ],
      description: "Inicia apenas o fluxo local preparado; adaptadores ainda não configurados não fazem conexão externa.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: {
          integrationId: {
            type: "string",
            description: "Identificador de uma integração registrada.",
          },
        },
        required: ["integrationId"],
      },
      execute: async ({ integrationId }, context = {}) => {
        const manager = requireConnectionManager(context, connectionManager);
        try {
          const result = await manager.connect(integrationId);
          return {
            ok: result.ok,
            integrationId: result.integrationId,
            status: result.status,
            alreadyConnected: result.alreadyConnected,
            authorizationRequired: result.authorizationRequired,
            message: result.message,
          };
        } catch (error) {
          if (error instanceof IntegrationError) {
            throw new ToolExecutionError(error.message, error.code);
          }
          throw new ToolExecutionError(
            "Não foi possível iniciar o fluxo de conexão.",
            "connection_start_error",
          );
        }
      },
    }),
    createTool({
      name: "disconnect_integration",
      aliases: [
        "desconectar android",
        "desconectar tv",
        "desconectar samsung",
        "desconectar spotify",
        "desconectar gmail",
        "desconectar whatsapp",
        "desconectar instagram",
        "desconectar integração",
        "desconectar integracao",
      ],
      description: "Desconecta uma integração preparada sem revogar silenciosamente sua autorização.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: {
          integrationId: {
            type: "string",
            description: "Identificador de uma integração registrada.",
          },
        },
        required: ["integrationId"],
      },
      execute: async ({ integrationId }, context = {}) => {
        const manager = requireConnectionManager(context, connectionManager);
        try {
          const result = await manager.disconnect(integrationId);
          return {
            ok: result.ok,
            integrationId: result.integrationId,
            status: result.status,
            authorizationRetained: result.authorizationRetained,
            message: result.message,
          };
        } catch (error) {
          if (error instanceof IntegrationError) {
            throw new ToolExecutionError(error.message, error.code);
          }
          throw new ToolExecutionError(
            "Não foi possível desconectar a integração.",
            "connection_disconnect_error",
          );
        }
      },
    }),
    createTool({
      name: "get_connection_status",
      aliases: [
        "status da conexão",
        "status da conexao",
        "status da conexão do spotify",
        "status da conexão do gmail",
        "status da conexão do whatsapp",
        "status da conexão do instagram",
        "status da conexão da tv",
        "verificar conexão",
        "verificar conexao",
      ],
      description: "Consulta localmente o status da conexão e da autorização sem iniciar conexões externas.",
      permission: ToolPermission.SAFE_READ,
      parameters: {
        type: "object",
        properties: {
          integrationId: {
            type: "string",
            description: "Identificador de uma integração registrada.",
          },
        },
        required: ["integrationId"],
      },
      execute: async ({ integrationId }, context = {}) => {
        const manager = requireConnectionManager(context, connectionManager);
        try {
          const status = await manager.getConnectionStatus(integrationId);
          return {
            ok: true,
            tool: "get_connection_status",
            integration: {
              id: status.id,
              name: status.name,
              status: status.status,
              configured: status.configured,
              connected: status.connected,
              authorized: status.authorized,
              capabilities: status.capabilities,
              permissions: status.permissions,
              error: status.error,
            },
          };
        } catch (error) {
          if (error instanceof IntegrationError) {
            throw new ToolExecutionError(error.message, error.code);
          }
          throw new ToolExecutionError(
            "Não foi possível consultar o estado da conexão.",
            "connection_status_error",
          );
        }
      },
    }),
    createTool({
      name: "record_learning",
      aliases: ["registre aprendizado", "feedback:", "correção:", "correcao:"],
      description: "Registra um fato, preferência ou feedback explícito como dado supervisionado, sem alterar código ou configuração.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          type: { type: "string", enum: ["fact", "preference", "correction", "error", "solution", "improvement-suggestion"] },
        },
        required: ["content", "type"],
      },
      execute: async ({ content, type }, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        const learning = system.learningRegistry.register({
          content,
          type,
          source: "explicit-user-feedback",
          confidence: 0.7,
        });
        return { ok: true, learning };
      },
    }),
    createTool({
      name: "query_learning",
      aliases: ["consultar aprendizados", "buscar aprendizados", "pesquisar aprendizados", "o que foi aprendido"],
      description: "Consulta aprendizados estruturados; não altera registros.",
      permission: ToolPermission.SAFE_READ,
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
      },
      execute: async ({ text = "" }, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        return { ok: true, learnings: system.learningRegistry.query({ text }) };
      },
    }),
    createTool({
      name: "approve_learning",
      aliases: ["aprovar aprendizado", "aprovo aprendizado"],
      description: "Marca um aprendizado ativo como aprovado após ação explícita do usuário.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: { learningId: { type: "string" } },
        required: ["learningId"],
      },
      execute: async ({ learningId }, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        return {
          ok: true,
          learning: system.learningRegistry.approve(learningId, {
            actor: context.supervisionActor,
          }),
        };
      },
    }),
    createTool({
      name: "invalidate_learning",
      aliases: ["invalidar aprendizado", "remover aprendizado", "não considerar aprendizado", "nao considerar aprendizado"],
      description: "Inativa um aprendizado incorreto sem apagar seu registro.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: {
          learningId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["learningId", "reason"],
      },
      execute: async ({ learningId, reason }, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        return {
          ok: true,
          learning: system.learningRegistry.invalidate(learningId, {
            reason,
            source: "explicit-user-correction",
          }),
        };
      },
    }),
    createTool({
      name: "create_improvement_proposal",
      aliases: ["crie uma proposta", "criar proposta", "proponha melhoria", "sugira melhoria"],
      description: "Cria uma proposta em draft; nunca aplica alterações automaticamente.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: { proposal: { type: "string" } },
        required: ["proposal"],
      },
      execute: async ({ proposal, proposedChange }, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        const concise = proposedChange?.value === "concise";
        const created = system.proposalRegistry.create({
          problem: proposal,
          currentBehavior: "O comportamento atual permanece inalterado até uma aprovação explícita.",
          suggestedImprovement: concise
            ? "Usar o estilo de resposta conciso como preferência de execução."
            : proposal,
          reason: "Solicitação submetida como proposta supervisionada.",
          expectedImpact: concise
            ? "Ajustar somente a preferência de estilo de resposta."
            : "A avaliar durante a revisão humana.",
          affectedComponents: concise ? ["assistant-response-style"] : ["a definir durante revisão"],
          risk: concise ? "low" : "medium",
          proposedChange,
          source: "explicit-user-request",
        });
        return { ok: true, proposal: created };
      },
    }),
    createTool({
      name: "get_improvement_proposal",
      aliases: ["consultar proposta", "ver proposta", "status da proposta"],
      description: "Consulta uma proposta e seu estado atual sem alterá-la.",
      permission: ToolPermission.SAFE_READ,
      parameters: {
        type: "object",
        properties: { proposalId: { type: "string" } },
        required: ["proposalId"],
      },
      execute: async ({ proposalId }, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        const proposal = system.proposalRegistry.get(proposalId);
        if (!proposal) throw new ToolExecutionError("A proposta não foi encontrada.", "proposal_not_found");
        return { ok: true, proposal };
      },
    }),
    createTool({
      name: "request_proposal_approval",
      aliases: ["enviar proposta para revisão", "solicitar aprovação da proposta", "solicitar aprovacao da proposta"],
      description: "Move uma proposta draft para pending_review; não a aprova nem a aplica.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: { proposalId: { type: "string" } },
        required: ["proposalId"],
      },
      execute: async ({ proposalId }, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        return {
          ok: true,
          proposal: system.proposalRegistry.requestApproval(proposalId, { actor: context.supervisionActor }),
        };
      },
    }),
    createTool({
      name: "approve_improvement_proposal",
      aliases: ["aprovar proposta", "aprovo proposta"],
      description: "Registra aprovação explícita do usuário; não aplica a proposta.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: { proposalId: { type: "string" } },
        required: ["proposalId"],
      },
      execute: async ({ proposalId }, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        return {
          ok: true,
          proposal: system.proposalRegistry.approve(proposalId, { actor: context.supervisionActor }),
        };
      },
    }),
    createTool({
      name: "reject_improvement_proposal",
      aliases: ["rejeitar proposta", "rejeito proposta"],
      description: "Registra a rejeição explícita do usuário em histórico imutável.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: { proposalId: { type: "string" }, reason: { type: "string" } },
        required: ["proposalId"],
      },
      execute: async ({ proposalId, reason }, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        return {
          ok: true,
          proposal: system.proposalRegistry.reject(proposalId, {
            actor: context.supervisionActor,
            reason: reason || "Rejeitada explicitamente pelo usuário.",
          }),
        };
      },
    }),
    createTool({
      name: "apply_approved_change",
      aliases: ["aplicar proposta aprovada", "aplicar alteração aprovada", "aplicar alteracao aprovada"],
      description: "Aplica somente configurações de execução permitidas, após aprovação e comando explícito do usuário.",
      permission: ToolPermission.EXPLICIT_USER_ACTION,
      parameters: {
        type: "object",
        properties: { proposalId: { type: "string" } },
        required: ["proposalId"],
      },
      execute: async ({ proposalId }, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        return {
          ok: true,
          proposal: system.proposalRegistry.applyApprovedChange(proposalId, {
            actor: context.supervisionActor,
          }),
        };
      },
    }),
    createTool({
      name: "run_self_diagnostics",
      aliases: ["executar diagnóstico", "executar diagnostico", "verificar integridade", "diagnóstico do sistema", "diagnostico do sistema"],
      description: "Executa verificações locais somente de leitura sobre integridade, tools, integrações e registries supervisionados.",
      permission: ToolPermission.SAFE_READ,
      execute: async (_input, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        return {
          ok: true,
          report: await system.runDiagnostics({
            toolRegistry: context.toolRegistry,
            integrationRegistry: context.integrationRegistry ?? integrationRegistry,
          }),
        };
      },
    }),
    createTool({
      name: "get_supervision_history",
      aliases: ["consultar histórico supervisionado", "consultar historico supervisionado", "histórico de alterações", "historico de alteracoes"],
      description: "Consulta o histórico append-only de alterações supervisionadas; não há operação de exclusão.",
      permission: ToolPermission.SAFE_READ,
      parameters: {
        type: "object",
        properties: { proposalId: { type: "string" } },
      },
      execute: async ({ proposalId } = {}, context = {}) => {
        const system = requireSupervisedSystem(context, supervisedSystem);
        return {
          ok: true,
          history: system.proposalRegistry.getHistory({ proposalId }),
        };
      },
    }),
  ];
}

export function createDefaultToolRegistry(options = {}) {
  const integrationRegistry = options.integrationRegistry ?? createDefaultIntegrationRegistry();
  const connectionManager = options.connectionManager ?? new ConnectionManager({ integrationRegistry });
  const supervisedSystem = options.supervisedSystem ?? createSupervisedDevelopmentSystem();
  const toolRegistry = new ToolRegistry(createBuiltinTools({
    integrationRegistry,
    connectionManager,
    supervisedSystem,
  }));
  return toolRegistry;
}
