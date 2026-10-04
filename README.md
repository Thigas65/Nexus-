# N.E.X.U.S.

Assistente virtual pessoal N.E.X.U.S. A interface React conversa com um servidor Node.js local, que protege a chave e encaminha o contexto da conversa para a API do Gemini.

## Requisitos

- Node.js 20.18 ou superior (usa `fetch`, arquivos de ambiente e APIs nativas do Node)
- npm

## Configurar a chave do Gemini

Copie `.env.example` para `.env` e preencha `GEMINI_API_KEY` com uma chave criada no Google AI Studio. O servidor carrega `.env` automaticamente; a chave fica apenas no servidor e não deve ser adicionada ao React, a variáveis `VITE_*` ou a arquivos públicos. A chave também pode ser fornecida como secret/variável de ambiente no ambiente de hospedagem.

`GEMINI_MODEL` é opcional e, se omitido, usa `gemini-2.5-flash`. Não compartilhe nem versione o arquivo `.env`.

## Executar em desenvolvimento

```bash
npm install
npm run dev
```

O comando inicia o servidor de backend na porta 3001 e o Vite na porta 5173. Abra o endereço mostrado pelo Vite e envie uma mensagem no chat. Sem chave configurada, o servidor responde com uma mensagem clara de configuração necessária.

## Executar em produção local

```bash
npm run build
npm start
```

O servidor entrega a interface compilada e atende `/api/chat` na mesma origem. A porta pode ser configurada pela variável `PORT`.

## Testar a conexão

Com o servidor em execução, verifique se está ativo e se a chave foi carregada:

```bash
curl http://localhost:3001/api/health
```

O campo `configured` deve ser `true`. Para testar uma solicitação ao Gemini:

```bash
curl -X POST http://localhost:3001/api/chat \
  -H 'Content-Type: application/json' \
  -d '{"message":"Responda apenas: conexão funcionando"}'
```

O endpoint não retorna nem registra a chave. A interface mostra o erro caso o servidor esteja inacessível, a chave falte, o Gemini esteja indisponível ou a resposta venha vazia.

## Validação

```bash
npm test
npm run build
npm run preview
```

## Publicação do frontend no GitHub Pages

O workflow `.github/workflows/deploy-pages.yml` publica automaticamente o conteúdo de `dist/` no GitHub Pages a cada push na branch `main`. Ele usa `/Nexus-/` como base para o endereço de projeto `https://SEU_USUARIO.github.io/Nexus-/`; se o repositório for renomeado, ajuste `VITE_BASE_PATH` no workflow para o novo caminho. Builds locais continuam usando `/` por padrão, e `dist/` também continua sendo a pasta usada pelo Capacitor.

O workflow publica somente os arquivos estáticos do frontend; não envia o backend, `node_modules` ou arquivos `.env`. O backend e sua configuração de credenciais permanecem separados. O chat publicado precisa de um backend acessível pela web, configurado no campo “Endpoint do backend”; esta etapa não hospeda o backend nem aponta o APK para uma hospedagem remota.

## Etapa atual

- A interface visual do N.E.X.U.S. usa um fundo escuro, uma paleta azul e um Nexus Core 3D como elemento principal da identidade do produto.
- O Nexus Core reflete os estados `idle`, `waiting-for-wake-word`, `listening`, `processing`, `speaking`, `paused` e `error` com animações suaves e futuristas.
- O estado de fala usa respiração aberta/fechada para dar sensação de presença; o estado de escuta aplica pulsos discretos; o processamento é mais energético; os estados de pausa e erro reduzem a atividade ou sinalizam indisponibilidade sem criar ruído visual extra.
- O layout da interface mantém o chat, o campo de mensagem, o microfone, os controles de voz/TTS e o controle da palavra de ativação integrados ao mesmo conjunto visual blue-on-dark.
- A composição é responsiva para celular, tablet e desktop e respeita `prefers-reduced-motion` para evitar movimento excessivo.
- O fluxo `/api/chat` integra `AssistantService` → `ToolRegistry` → `Tool` → resultado verificado → Gemini; pedidos que não correspondem a um comando de ferramenta continuam no fluxo normal do chat.
- O `ToolRegistry` oferece `get_current_time` e `get_current_date` (UTC), `calculator` (parser aritmético limitado, sem `eval` ou execução de código) e `get_assistant_status` (sem expor segredos), além dos comandos locais de memória e resumo já existentes.
- Cada ferramenta declara uma permissão (`safe-read`, `safe-compute`, `explicit-user-action` ou `external`). Ações explícitas e ferramentas externas exigem concessão no servidor; nenhuma ferramenta externa está registrada.
- O Nexus Core permanece em `processing` durante a solicitação completa ao backend, incluindo a execução de ferramentas e a composição da resposta pelo Gemini.
- A infraestrutura de integrações é separada das Tools: `IntegrationRegistry`, contratos de adaptadores e permissões por capacidade existem no backend, sem conexões ou chamadas externas.
- Android, Samsung Smart TV, Spotify, Gmail, WhatsApp e Instagram estão registrados como placeholders `unavailable`, não configurados e não conectados. As Tools `list_integrations` e `get_integration_status` apenas consultam estado local.
- O `ConnectionManager` prepara o ciclo de início/verificação de conexão, conclusão de autorização, desconexão e revogação. O estado `connected` exige autorização verificada e confirmação do adaptador.
- `AuthorizationProvider` e `SecureCredentialStore` são contratos backend-only para futuras autorizações OAuth 2.0, API keys e tokens. As implementações padrão recusam operações; nenhuma credencial é solicitada ou armazenada.
- As Tools `connect_integration`, `disconnect_integration` e `get_connection_status` são locais; as integrações placeholder não fazem chamadas externas nem podem ser marcadas como conectadas.
- A camada de autodesenvolvimento supervisionado mantém aprendizados e propostas estruturados em memória do processo, registra aprovações em histórico append-only e executa diagnósticos locais somente de leitura.
- Propostas precisam passar por `draft` → `pending_review` → aprovação explícita. A única alteração aplicável é o estilo de resposta allowlisted; código, credenciais, permissões, integrações, segurança, confirmações, logs e supervisão não podem ser alterados por ferramentas.
- Feedback e aprendizado não autorizam mudanças automaticamente. Não existe execução irrestrita nem escrita automática no código-fonte; os registros desta camada não persistem após reiniciar o servidor.
- Os primeiros comandos baseados em ferramenta são locais e seguros: lembrar um fato, consultar memórias e resumir o contexto recente da conversa. Nenhuma ferramenta externa, automação, Android nativo ou API key do frontend foi adicionada.
- A interface continua sendo uma camada web local e visual; não há sons, músicas, wake word nativa Android, escuta em segundo plano ou serviços de áudio em background.

## Estrutura

- `src/app/`: composição e estilos da aplicação.
- `src/features/assistant/domain/`: tipos e contrato do serviço do assistente.
- `src/features/assistant/services/`: comunicação HTTP, reconhecimento e síntese de voz do navegador, serviço abstrato da palavra de ativação e armazenamento local opcional de memórias explícitas, desacoplados do provedor.
- `src/features/assistant/components/`: componentes visuais do chat e do Nexus Core.
- `server/assistant/`: integração com Gemini e personalidade do N.E.X.U.S.
- `server/assistant/assistantService.mjs`: orquestração da requisição, roteamento e passagem de resultados locais ao Gemini.
- `server/assistant/tools/`: contratos, registry, permissões, ferramentas locais e calculadora limitada.
- `server/assistant/integrations/`: IntegrationRegistry, ConnectionManager, contratos de autorização/armazenamento seguro, estados, permissões por capacidade e placeholders sem conexões externas.
- `server/assistant/supervision/`: LearningRegistry, propostas supervisionadas, configurações allowlisted, histórico append-only e diagnósticos locais somente de leitura.
- `server/assistant/selfKnowledge.mjs`: fonte estruturada de verdade sobre identidade, arquitetura e estado documentado do projeto.
- `server/index.mjs`: API protegida e servidor local.
- `src/main.tsx`: ponto de entrada React.

O roadmap atual termina na camada de autodesenvolvimento supervisionado: alterações estruturais continuam exigindo implementação e revisão humanas. Funcionamento com tela bloqueada ou aplicativo fechado, wake word nativa Android, escuta em segundo plano, voz personalizada/clonagem, integrações reais e autodesenvolvimento irrestrito permanecem fora do escopo.
