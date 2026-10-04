import { useEffect, useMemo, useState } from "react";
import { ChatPanel } from "../features/assistant/components/ChatPanel";
import type { AssistantActivityState } from "../features/assistant/domain/AssistantActivityState";
import type { Message } from "../features/assistant/domain/Message";
import { NexusCore } from "../features/assistant/components/NexusCore";
import { NexusMark } from "../features/assistant/components/NexusMark";
import { HttpAssistantService, resolveBackendUrl } from "../features/assistant/services/HttpAssistantService";

const BACKEND_URL_STORAGE_KEY = "nexus-backend-url";
const SPEECH_ENABLED_STORAGE_KEY = "nexus-speech-enabled";

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  const value = window.localStorage.getItem(key);
  if (value === null) return fallback;
  return value === "true";
}

function App() {
  const [backendUrl, setBackendUrl] = useState<string>(() => {
    if (typeof window === "undefined") return resolveBackendUrl();
    return window.localStorage.getItem(BACKEND_URL_STORAGE_KEY)?.trim() || resolveBackendUrl();
  });
  const [showSettings, setShowSettings] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState<boolean>(() => readStoredBoolean(SPEECH_ENABLED_STORAGE_KEY, true));
  const [messageCount, setMessageCount] = useState(0);
  const [assistantState, setAssistantState] = useState<AssistantActivityState>("idle");
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      content: "Olá! Sou o N.E.X.U.S. Como posso ajudar você hoje?",
      createdAt: new Date(),
    },
  ]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BACKEND_URL_STORAGE_KEY, backendUrl.trim());
    }
  }, [backendUrl]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SPEECH_ENABLED_STORAGE_KEY, String(speechEnabled));
    }
  }, [speechEnabled]);

  const assistantService = useMemo(
    () => new HttpAssistantService({ baseUrl: backendUrl }),
    [backendUrl],
  );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href={import.meta.env.BASE_URL} aria-label="N.E.X.U.S. início">
          <NexusMark />
          <span>N.E.X.U.S.</span>
        </a>

        <div className="sidebar__section">
          <span className="eyebrow">ESPAÇO PESSOAL</span>
          <button className="nav-item nav-item--active" type="button">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 4.5h14v11H3zM6.5 8h7M6.5 11.5h4" />
            </svg>
            <span>Conversa</span>
            <span className="nav-item__indicator" />
          </button>
          <button
            className="nav-item nav-item--muted"
            type="button"
            onClick={() => setShowSettings((current) => !current)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 3v2M10 15v2M3.5 10h2M14.5 10h2M5.2 5.2l1.4 1.4M13.4 13.4l1.4 1.4M5.2 14.8l1.4-1.4M13.4 6.6l1.4-1.4" />
            </svg>
            <span>Configurações</span>
          </button>
        </div>

        <div className="sidebar__bottom">
          <div className="connection-card">
            <span className="connection-card__icon">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M10 3v8M6.5 6.5a5 5 0 1 0 7 0" />
              </svg>
            </span>
            <div>
              <strong>Conexão protegida</strong>
              <span>Gemini via servidor</span>
            </div>
            <span className="connection-dot" />
          </div>
          <div className="profile">
            <div className="profile__avatar">V</div>
            <div className="profile__details">
              <strong>Visitante</strong>
              <span>Conta local</span>
            </div>
            <button className="more-button" type="button" aria-label="Mais opções" disabled>
              ···
            </button>
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Seu espaço</span>
            <span className="breadcrumb__divider">/</span>
            <strong>Conversa</strong>
          </div>
          <div className="topbar__right">
            <span className="stage-pill">
              <span /> ANDROID · NEXUS CORE
            </span>
            <button className="help-button" type="button" aria-label="Ajuda" title="N.E.X.U.S. em desenvolvimento">
              ?
            </button>
          </div>
        </header>

        {showSettings && (
          <div className="settings-panel" aria-label="Configurações do N.E.X.U.S.">
            <div className="settings-panel__header">
              <strong>Configurações</strong>
              <button type="button" className="settings-close" onClick={() => setShowSettings(false)}>
                Fechar
              </button>
            </div>

            <label className="settings-field">
              <span>Endpoint do backend</span>
              <input
                type="url"
                value={backendUrl}
                onChange={(event) => setBackendUrl(event.target.value.trim() || resolveBackendUrl())}
                placeholder="http://10.0.2.2:3001"
              />
            </label>

            <label className="settings-toggle">
              <input
                type="checkbox"
                checked={speechEnabled}
                onChange={(event) => setSpeechEnabled(event.target.checked)}
              />
              <span>Respostas por voz ativadas</span>
            </label>

            <p className="settings-note">
              Em Android, o emulador costuma usar <strong>10.0.2.2</strong> para acessar o backend local.
            </p>
          </div>
        )}

        <div className="workspace-grid">
          <section className="welcome-panel">
            <div className="welcome-panel__copy">
              <div className="overline">
                <span className="overline__line" />
                SEU ASSISTENTE PESSOAL
              </div>
              <h1>
                Um espaço para
                <br />
                <span>pensar em voz alta.</span>
              </h1>
              <p>
                Uma nova forma de aprender, criar e organizar suas ideias. O N.E.X.U.S. está
                começando a tomar forma no seu celular.
              </p>
            </div>

            <div className="core-stage">
              <div className="core-stage__grid" />
              <NexusCore state={assistantState} />
              <div className="core-caption">
                <span className="core-caption__pulse" />
                NEXUS CORE
                <span className="core-caption__divider">/</span>
                {assistantState === "waiting-for-wake-word"
                  ? "AGUARDANDO ATIVAÇÃO"
                  : assistantState === "listening"
                    ? "OUVINDO COMANDO"
                    : assistantState === "processing"
                      ? "PROCESSANDO"
                      : assistantState === "speaking"
                        ? "FALANDO"
                        : assistantState === "paused"
                          ? "PAUSADO"
                          : assistantState === "error"
                            ? "INDISPONÍVEL"
                            : assistantState === "connecting"
                              ? "CONECTANDO"
                              : "EM REPOUSO"}
              </div>
              <div className="core-coordinates">NX-01&nbsp;&nbsp; · &nbsp;&nbsp;ANDROID</div>
            </div>

            <div className="welcome-footer">
              <div className="feature-note">
                <span className="feature-note__icon">✳</span>
                <span>Feito para evoluir com você</span>
              </div>
              <span className="message-count">{String(messageCount).padStart(2, "0")} MENSAGENS</span>
            </div>
          </section>

          <ChatPanel
            assistantService={assistantService}
            messages={messages}
            onMessagesChange={setMessages}
            onMessageSent={() => setMessageCount((count) => count + 1)}
            onActivityStateChange={setAssistantState}
            speechEnabled={speechEnabled}
          />
        </div>
        <footer className="workspace-footer">
          <span>N.E.X.U.S. <span className="footer-separator">·</span> VERSÃO 0.1.0</span>
          <span>CONSTRUÍDO PARA O FUTURO</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
