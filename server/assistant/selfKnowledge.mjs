export const projectSelfKnowledge = {
  identity: {
    name: "N.E.X.U.S.",
    role: "assistente virtual pessoal",
    userAddress: "senhor",
  },
  currentArchitecture: {
    frontend: "React com Vite",
    backend: "Node.js",
    frontendBackendCommunication: "HTTP pela rota /api/chat",
    aiIntegration: "Gemini, chamado pelo backend",
    toolArchitecture:
      "O backend roteia comandos explícitos por uma camada Tool/ToolRequest/ToolResult e ToolRegistry; o serviço do assistente executa a ferramenta autorizada e encaminha o resultado local verificado ao Gemini para compor a resposta.",
    toolPermissions:
      "As ferramentas declaram permissões safe-read, safe-compute, explicit-user-action ou external. A execução de ações explícitas e ferramentas externas exige uma concessão de permissão no backend; não há ferramenta externa registrada.",
    integrationArchitecture:
      "Há uma camada de integrações separada das Tools, com IntegrationRegistry, ConnectionManager, contratos IntegrationAdapter e permissões por capacidade. Adaptadores de placeholder não fazem chamadas externas.",
    connectionLifecycle:
      "O ConnectionManager prepara início e verificação de conexão, conclusão de autorização, desconexão, revogação e consulta de status. O registry só pode marcar connected depois de autorização verificada e confirmação do adaptador.",
    authorizationArchitecture:
      "Os contratos AuthorizationProvider e SecureCredentialStore preparam OAuth 2.0, API keys e tokens para implementação futura no backend. O provider e o armazenamento de credenciais padrão estão indisponíveis; não há fluxo OAuth/API nem secrets armazenados.",
    supervisedDevelopment:
      "O sistema registra aprendizados em registry estruturado, cria propostas e mantém histórico de aprovação em memória do processo. A única aplicação disponível altera uma preferência de estilo allowlisted após aprovação e comando explícito; código-fonte e controles críticos não podem ser aplicados automaticamente.",
    conversationContext:
      "O histórico da conversa atual é mantido em memória na aplicação e enviado ao backend como contexto.",
    sessionMemory:
      "O contexto existe durante a sessão aberta e não é restaurado após recarregar a página.",
    persistentMemory:
      "Há uma camada local em localStorage com operações para salvar, consultar e remover memórias.",
    persistentMemoryPrivacy:
      "A camada local não salva informações automaticamente; salvar exige autorização explícita. Ela não é incorporada automaticamente ao contexto enviado ao Gemini.",
    voiceRecognition:
      "A interface usa a API de reconhecimento de voz disponível no navegador para transcrever fala em português (pt-BR) para o campo de mensagem.",
    speechSynthesis:
      "A interface usa a API de síntese de voz do navegador para falar respostas em português (pt-BR), sem enviar áudio ao backend.",
    wakeWord:
      "Há uma primeira implementação web da palavra de ativação N.E.X.U.S., desativada por padrão e iniciada somente após ação explícita do usuário. Ela reconhece fala final pela API do navegador enquanto a página está aberta e o navegador permite.",
  },
  currentState: {
    webInterface: "A interface web React está implementada.",
    backend: "O backend Node.js está implementado.",
    gemini: "A integração com Gemini está implementada no backend.",
    apiKeyProtection:
      "A GEMINI_API_KEY é lida pelo servidor a partir de variável de ambiente e não é enviada ao frontend.",
    sessionMemory: "O contexto da conversa atual é mantido na sessão da aplicação.",
    persistentMemory:
      "A implementação local da camada de memória persistente está disponível, com gravação somente mediante autorização explícita.",
    personality:
      "A personalidade está configurada separadamente no servidor e é incluída nas instruções do assistente.",
    selfKnowledge:
      "O autoconhecimento é baseado nesta documentação estruturada do projeto, incluída nas instruções enviadas ao assistente.",
    toolArchitecture:
      "A camada Tool/ToolRequest/ToolResult e ToolRegistry está conectada ao fluxo de /api/chat. O AssistantService roteia comandos explícitos, executa a ferramenta no servidor e envia o resultado verificado ao Gemini antes de responder. Erros de validação, permissão e execução são tratados sem expor detalhes internos.",
    builtInTools: {
      get_current_time: "Retorna hora e timestamp UTC a partir do relógio do servidor.",
      get_current_date: "Retorna a data UTC a partir do relógio do servidor.",
      calculator:
        "Calcula apenas números, parênteses e operadores +, -, *, /, %, ^ com parser limitado; não usa eval nem executa código.",
      get_assistant_status:
        "Retorna estado operacional, provedor, disponibilidade configurada do Gemini e contagem de ferramentas, sem expor a chave.",
    },
    toolPermissions:
      "Ferramentas de leitura e cálculo usam permissões safe-read e safe-compute. Ações explícitas exigem intenção explícita e concessão do backend; ferramentas externas exigem concessão e não estão habilitadas nem registradas.",
    integrationSystem:
      "O IntegrationRegistry mantém metadados, status, capacidades e permissões das integrações. O ConnectionManager controla o ciclo de vida. connected exige autorização verificada e confirmação do adaptador; adaptadores placeholder informam indisponibilidade.",
    connectionLifecycle:
      "As operações de iniciar, verificar, concluir autorização, desconectar, revogar autorização e consultar status estão definidas no backend. As Tools connect_integration, disconnect_integration e get_connection_status não realizam conexões externas.",
    authorizationSecurity:
      "OAuth 2.0, API keys, access tokens e refresh tokens existem apenas como tipos de contrato para implementação futura. O provider e o credential store padrão recusam operações; tokens futuros devem ficar apenas em secret manager no backend, nunca no frontend, localStorage, arquivos públicos, código ou bundle.",
    supervisedDevelopment:
      "LearningRegistry mantém fatos, preferências, correções, erros, soluções e sugestões com origem, confiança, revisão e estado ativo. ImprovementProposalRegistry controla draft, pending_review, approved, rejected, applied e failed, com histórico append-only. Só configurações allowlisted podem ser aplicadas após aprovação e comando explícitos.",
    protectedAreas:
      "Não existe ferramenta de escrita de código, credenciais, permissões, integrações, regras de segurança, confirmações, logs ou sistema de supervisão. Alterações estruturais devem ser implementadas externamente sob revisão humana.",
    diagnostics:
      "run_self_diagnostics executa verificações locais somente de leitura sobre ToolRegistry, IntegrationRegistry, memória/aprendizado e configurações protegidas.",
    supervisedTools: {
      record_learning: "Registra feedback explícito como aprendizado ainda não aprovado.",
      query_learning: "Consulta dados de aprendizado sem alterar o sistema.",
      approve_learning: "Aprova um registro ativo somente após comando explícito.",
      invalidate_learning: "Inativa um registro incorreto sem removê-lo.",
      create_improvement_proposal: "Cria proposta em draft, sem alteração aplicada.",
      get_improvement_proposal: "Consulta uma proposta.",
      request_proposal_approval: "Solicita revisão humana.",
      approve_improvement_proposal: "Registra aprovação explícita, sem aplicar automaticamente.",
      reject_improvement_proposal: "Rejeita proposta e registra no histórico.",
      apply_approved_change: "Aplica somente a preferência allowlisted após aprovação e comando explícitos.",
      run_self_diagnostics: "Gera relatório de verificações locais somente de leitura.",
      get_supervision_history: "Consulta histórico append-only sem operação de exclusão.",
    },
    preparedIntegrations: {
      android: "Preparada como placeholder; indisponível, não configurada e não conectada.",
      samsungSmartTV: "Preparada como placeholder; indisponível, não configurada e não conectada.",
      spotify: "Preparada como placeholder; indisponível, não configurada e não conectada.",
      gmail: "Preparada como placeholder; indisponível, não configurada e não conectada.",
      whatsapp: "Preparada como placeholder; indisponível, não configurada e não conectada.",
      instagram: "Preparada como placeholder; indisponível, não configurada e não conectada.",
    },
    integrationTools: {
      list_integrations: "Lista metadados e status local; não realiza chamadas externas.",
      get_integration_status: "Consulta status, capacidades e permissões localmente; não executa ações externas.",
      connect_integration: "Tenta iniciar o fluxo backend preparado, mas placeholders permanecem indisponíveis e nenhum payload de autorização é exposto ao modelo.",
      disconnect_integration: "Usa o ConnectionManager sem executar conexão externa; autorização não é revogada implicitamente.",
      get_connection_status: "Consulta status e autorização verificada sem iniciar conexões.",
    },
    visualInterface:
      "A interface visual atual usa fundo escuro, identidade azul e um Nexus Core 3D com estados visuais para idle, waiting-for-wake-word, listening, processing, speaking, paused e error.",
    voiceInput:
      "O reconhecimento de voz preenche o mesmo campo de texto da conversa. O usuário pode revisar e editar a transcrição e a envia pelo fluxo de mensagem existente.",
    voiceOutput:
      "As respostas do assistente podem ser faladas pela API SpeechSynthesis do navegador. A fala automática pode ser desativada, cada resposta pode ser reproduzida novamente e a fala atual pode ser interrompida.",
    wakeWord:
      "Quando ativada pelo usuário, a implementação web detecta N.E.X.U.S. usando reconhecimento de voz do navegador, pausa essa detecção e captura o comando para o campo de mensagem. A palavra de ativação é removida e não é enviada ao Gemini; o comando não é enviado automaticamente.",
    limitations: [
      "Os resultados de ferramentas são encaminhados ao Gemini para compor a resposta; a chave do Gemini continua necessária para concluir /api/chat.",
      "O relógio e a data são informados em UTC, e a calculadora aceita somente expressões aritméticas limitadas.",
      "A arquitetura prevê permissões para futuras ferramentas externas, mas nenhuma integração externa ou execução arbitrária está habilitada.",
      "Android, Samsung Smart TV, Spotify, Gmail, WhatsApp e Instagram são placeholders sem conexão ou ações externas implementadas.",
      "Nenhuma conta foi conectada e nenhum segredo ou credencial foi solicitado ou armazenado.",
      "As capacidades listadas para integrações futuras não estão disponíveis enquanto os adaptadores estiverem desconectados ou indisponíveis.",
      "A camada de memória persistente local não é conectada automaticamente à conversa.",
      "O reconhecimento de voz depende do suporte do navegador e da permissão de microfone.",
      "A síntese de voz depende do suporte e das vozes disponíveis no navegador ou sistema operacional.",
      "A palavra de ativação funciona somente com a página aberta e enquanto o navegador permitir reconhecimento de voz; depende da permissão de microfone e pode não estar disponível em todos os navegadores.",
      "A palavra de ativação não funciona com o aplicativo fechado ou a tela bloqueada; não há wake word nativa Android nem escuta em segundo plano.",
      "O aplicativo não grava nem armazena áudio. O navegador pode processar o reconhecimento usando serviços próprios conforme suas configurações e política de privacidade.",
      "Não há funcionamento em segundo plano no Android nem aplicativo Android nativo.",
      "Não há voz personalizada nem clonagem de voz.",
      "Não há integrações externas além do Gemini.",
      "Não há autodesenvolvimento irrestrito nem aplicação automática de mudanças em código; registros e propostas são mantidos somente durante a execução atual do servidor.",
    ],
  },
};

export function formatProjectSelfKnowledge() {
  return JSON.stringify(projectSelfKnowledge, null, 2);
}
