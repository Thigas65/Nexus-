import { useEffect, useMemo, useState } from "react";
import { ChatPanel } from "../features/assistant/components/ChatPanel";
import type { AssistantActivityState } from "../features/assistant/domain/AssistantActivityState";
import type { Message } from "../features/assistant/domain/Message";
import { NexusCore } from "../features/assistant/components/NexusCore";
import { NexusBackground } from "../features/assistant/components/NexusBackground";
import { NexusMark } from "../features/assistant/components/NexusMark";
import { NexusPresentation } from "../features/assistant/components/NexusPresentation";
import type { AssistantPresentation } from "../features/assistant/domain/AssistantPresentation";
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
  const [activePanel, setActivePanel] = useState<"chat" | "voice" | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState<boolean>(() => readStoredBoolean(SPEECH_ENABLED_STORAGE_KEY, true));
  const [messageCount, setMessageCount] = useState(0);
  const [assistantState, setAssistantState] = useState<AssistantActivityState>("idle");
  const [speechIntensity, setSpeechIntensity] = useState(0);
  const [presentation, setPresentation] = useState<AssistantPresentation | null>(null);
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

  useEffect(() => {
    if (activePanel) return;
    setPresentation(null);
  }, [activePanel]);

  useEffect(() => {
    if (!presentation || assistantState === "speaking" || assistantState === "processing") return;
    const timeout = window.setTimeout(() => setPresentation(null), 8_000);
    return () => window.clearTimeout(timeout);
  }, [assistantState, presentation]);

  const assistantService = useMemo(
    () => new HttpAssistantService({ baseUrl: backendUrl }),
    [backendUrl],
  );

  return (
    <main className="app-shell">
      <NexusBackground />
      <section className="workspace">
        <header className="topbar">
          <a className="brand" href={import.meta.env.BASE_URL} aria-label="N.E.X.U.S. início">
            <NexusMark />
            <span>N.E.X.U.S.</span>
          </a>
          <button
            className="settings-trigger"
            type="button"
            aria-label={showSettings ? "Fechar configurações" : "Abrir configurações"}
            aria-expanded={showSettings}
            onClick={() => setShowSettings((current) => !current)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 3v2M10 15v2M3.5 10h2M14.5 10h2M5.2 5.2l1.4 1.4M13.4 13.4l1.4 1.4M5.2 14.8l1.4-1.4M13.4 6.6l1.4-1.4" />
              <circle cx="10" cy="10" r="2.4" />
            </svg>
          </button>
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

        <div
          className={`home-screen${activePanel ? " home-screen--panel-open" : ""}${presentation ? " home-screen--presenting" : ""}`}
        >
          <div className="core-stage core-stage--home">
            <div className="core-stage__grid" />
            <NexusCore state={assistantState} speechIntensity={speechIntensity} />
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

          <NexusPresentation data={presentation} />

          <div className="home-actions" aria-label="Ações principais">
            <button
              className={`home-action${activePanel === "chat" ? " home-action--active" : ""}`}
              type="button"
              aria-label={activePanel === "chat" ? "Fechar conversa" : "Abrir conversa"}
              aria-expanded={activePanel === "chat"}
              onClick={() => setActivePanel((current) => current === "chat" ? null : "chat")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5 8 8 0 0 1-3.7-.9L4 20l1.4-4.1A7.5 7.5 0 1 1 20 11.5Z" />
                <path d="M8.5 11.5h.01M12.5 11.5h.01M16.5 11.5h.01" />
              </svg>
            </button>
            <button
              className={`home-action${activePanel === "voice" ? " home-action--active" : ""}`}
              type="button"
              aria-label={activePanel === "voice" ? "Fechar interface de voz" : "Abrir interface de voz"}
              aria-expanded={activePanel === "voice"}
              onClick={() => setActivePanel((current) => current === "voice" ? null : "voice")}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="9" y="3" width="6" height="12" rx="3" />
                <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6" />
              </svg>
            </button>
          </div>

          <ChatPanel
            assistantService={assistantService}
            messages={messages}
            onMessagesChange={setMessages}
            onMessageSent={() => setMessageCount((count) => count + 1)}
            onActivityStateChange={setAssistantState}
            onSpeechIntensityChange={setSpeechIntensity}
            onPresentationChange={setPresentation}
            speechEnabled={speechEnabled}
            mode={activePanel ?? "closed"}
            onClose={() => setActivePanel(null)}
          />
        </div>
        <footer className="workspace-footer">
          <span>N.E.X.U.S. <span className="footer-separator">·</span> VERSÃO 0.1.0</span>
          <span>CONSTRUÍDO PARA O FUTURO</span>
          <span>{String(messageCount).padStart(2, "0")} MENSAGENS</span>
        </footer>
      </section>
    </main>
  );
}

export default App;
