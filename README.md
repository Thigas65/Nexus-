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

## Publicação na Netlify

O arquivo `netlify.toml` configura o build do frontend e publica `netlify/functions/chat.mjs` e `netlify/functions/health.mjs` como as rotas `/api/chat` e `/api/health`. As Functions reutilizam o handler e o `AssistantService` existentes; o servidor Node local continua disponível por `npm start`.

Configure `GEMINI_API_KEY` como variável privada das Functions no painel do site Netlify. Não use o prefixo `VITE_`, não a disponibilize ao build do frontend e não a inclua no repositório. `GEMINI_MODEL` continua opcional. Se frontend e backend estiverem no mesmo site Netlify, o frontend pode usar as rotas relativas no mesmo domínio. Se estiverem em sites separados, configure `VITE_BACKEND_URL` no ambiente de build do frontend com a URL HTTPS base do site que hospeda as Functions e configure `CORS_ALLOWED_ORIGINS` no backend com a origem HTTPS exata do frontend.

`VITE_BACKEND_URL` é configuração pública incorporada ao build do frontend; alterá-la exige novo build. O estado mantido em memória pelos registries do assistente pode não persistir entre chamadas das Functions, pois a Netlify não garante que chamadas diferentes sejam atendidas pela mesma instância.

Para o frontend hospedado no GitHub Pages, configure a variável **Actions** `NEXUS_BACKEND_URL` em **Settings → Secrets and variables → Actions → Variables** com a URL base HTTPS do backend; o workflow a injeta como `VITE_BACKEND_URL` durante o build. Essa URL não é secreta e fica incorporada no frontend publicado. Também é possível configurar/alterar a URL em **Configurações → Endpoint do backend**, que tem precedência no navegador, ou usar `VITE_BACKEND_URL` no ambiente local de build. O backend deve ser publicado separadamente em um host HTTPS acessível pelo dispositivo e permitir a origem exata `https://thigas65.github.io` em `CORS_ALLOWED_ORIGINS`. No emulador Android, `10.0.2.2:3001` aponta para a máquina host; se necessário, inicie o servidor com `HOST=0.0.0.0`. A chave Gemini permanece somente no ambiente do backend e não deve ser definida em GitHub Actions, variáveis `VITE_*`, Capacitor ou configuração do APK.

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

Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions** como origem de publicação. O workflow `.github/workflows/deploy-pages.yml` publica automaticamente o conteúdo compilado de `dist/` no GitHub Pages a cada push na branch `main`. Ele usa `/Nexus-/` como base para o endereço de projeto `https://SEU_USUARIO.github.io/Nexus-/`; se o repositório for renomeado, ajuste `VITE_BASE_PATH` no workflow para o novo caminho. Builds locais continuam usando `/` por padrão, e `dist/` também continua sendo a pasta usada pelo Capacitor.

O workflow publica somente os arquivos estáticos do frontend; não envia o backend, `node_modules` ou arquivos `.env`. O backend e sua configuração de credenciais permanecem separados. O chat publicado precisa de um backend acessível pela web, configurado no campo “Endpoint do backend”; esta etapa não hospeda o backend nem aponta o APK para uma hospedagem remota.

## Aplicativo web progressivo (PWA)

O frontend pode ser instalado como aplicativo pelo Chrome em HTTPS. O manifesto e o service worker são gerados no build com o mesmo `VITE_BASE_PATH` do site; no GitHub Pages, o início e o escopo ficam em `/Nexus-/`. O service worker pré-armazena os arquivos estáticos versionados e a página inicial para uso offline básico, sem armazenar respostas de API. Builds de desenvolvimento e runtimes nativos do Capacitor não registram service worker.

## Arquitetura de voz

O fluxo de conversa permanece separado dos mecanismos de áudio: `VoiceService` inicia/interrompe a escuta e entrega transcrições ou erros; a interface decide quando enviar o texto ao serviço do assistente; `SpeechSynthesisService` reproduz respostas separadamente. Nenhum áudio é enviado ao Gemini por essa arquitetura.

O contrato `VoiceService` permite trocar o provedor sem acoplar a tela à IA. No navegador, `BrowserVoiceRecognitionService` adapta a API Speech Recognition do próprio navegador. Essa API combina captura do microfone e reconhecimento de fala e não expõe o áudio bruto para um pipeline próprio; portanto, o navegador/dispositivo controla o provedor de transcrição, que pode depender de rede e não é necessariamente local. A separação de captura de baixo nível e STT local ainda exige uma implementação nativa ou outra API de áudio que forneça os frames de áudio.

A permissão é solicitada pelo sistema/browser quando a captura começa. No Android Capacitor, `RECORD_AUDIO` está declarado no manifesto e o Bridge do Capacitor solicita a permissão runtime quando o WebView pede acesso ao áudio. Reconhecimento não suportado ou permissão negada é informado como erro; nenhuma gravação é persistida pela aplicação.

A palavra de ativação atual é experimental e usa reconhecimento contínuo do navegador somente enquanto a interface está aberta. Não é um detector local dedicado nem uma funcionalidade confiável em segundo plano. A arquitetura de ativação (`WakeWordService`) está desacoplada do assistente, mas ainda falta um motor local de palavra-chave e uma implementação Android nativa para captura controlada em segundo plano. Essa etapa futura exigirá consentimento e permissões explícitas, serviço em primeiro plano com notificação persistente e conformidade com as restrições de bateria/execução do Android; o sistema pode interrompê-la. Não funcionará com o telefone completamente desligado e não será implementada nesta etapa.

## Etapa atual

- A interface visual do N.E.X.U.S. usa um fundo escuro, uma paleta azul e um Nexus Core 3D como elemento principal da identidade do produto.
- O Nexus Core reflete os estados `idle`, `waiting-for-wake-word`, `listening`, `processing`, `speaking`, `paused` e `error` com animações suaves e futuristas.
- O estado de fala usa respiração aberta/fechada para dar sensação de presença; o estado de escuta aplica pulsos discretos; o processamento é mais energético; os estados de pausa e erro reduzem a atividade ou sinalizam indisponibilidade sem criar ruído visual extra.
- A tela inicial mobile-first centraliza o Nexus Core azul; os ícones de chat e microfone abrem painéis na mesma tela, mantendo o Core visível.
- O painel de voz só indica microfone ativo após o evento real de início do reconhecimento; estados de solicitação de permissão, indisponibilidade e erro são apresentados separadamente.
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
- Não há wake word nativa Android nem serviço de áudio em segundo plano; o reconhecimento existente depende das APIs e limitações do navegador.

## Estrutura

- `src/app/`: composição e estilos da aplicação.
- `src/features/assistant/domain/`: tipos e contrato do serviço do assistente.
- `src/features/assistant/services/`: comunicação HTTP, contrato e fábrica de provedores de voz, adaptador de reconhecimento do navegador, síntese de voz, serviço abstrato experimental da palavra de ativação e armazenamento local opcional de memórias explícitas, desacoplados do provedor.
- `src/features/assistant/components/`: componentes visuais do chat e do Nexus Core.
- `server/assistant/`: integração com Gemini e personalidade do N.E.X.U.S.
- `server/assistant/assistantService.mjs`: orquestração da requisição, roteamento e passagem de resultados locais ao Gemini.
- `server/assistant/tools/`: contratos, registry, permissões, ferramentas locais e calculadora limitada.
- `server/assistant/integrations/`: IntegrationRegistry, ConnectionManager, contratos de autorização/armazenamento seguro, estados, permissões por capacidade e placeholders sem conexões externas.
- `server/assistant/supervision/`: LearningRegistry, propostas supervisionadas, configurações allowlisted, histórico append-only e diagnósticos locais somente de leitura.
- `server/assistant/selfKnowledge.mjs`: fonte estruturada de verdade sobre identidade, arquitetura e estado documentado do projeto.
- `server/index.mjs`: API protegida e servidor local.
- `src/main.tsx`: ponto de entrada React.

O roadmap atual termina na camada de autodesenvolvimento supervisionado: alterações estruturais continuam exigindo implementação e revisão humanas. Um motor local de wake word, execução controlada em segundo plano no Android, voz personalizada/clonagem, integrações reais e autodesenvolvimento irrestrito permanecem fora do escopo atual.
