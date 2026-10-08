import { useEffect, useMemo, useState } from "react";
import { ChatPanel } from "../features/assistant/components/ChatPanel";
import type { AssistantActivityState } from "../features/assistant/domain/AssistantActivityState";
import type { Message } from "../features/assistant/domain/Message";
import { NexusCore } from "../features/assistant/components/NexusCore";
import { NexusBackground } from "../features/assistant/components/NexusBackground";
import { NexusPresentation } from "../features/assistant/components/NexusPresentation";
import type { AssistantPresentation } from "../features/assistant/domain/AssistantPresentation";
import { HttpAssistantService, resolveBackendUrl } from "../features/assistant/services/HttpAssistantService";

const BACKEND_URL_STORAGE_KEY = "nexus-backend-url";

function App() {
  const [backendUrl, setBackendUrl] = useState<string>(() => {
    if (typeof window === "undefined") return resolveBackendUrl();
    return window.localStorage.getItem(BACKEND_URL_STORAGE_KEY)?.trim() || resolveBackendUrl();
  });
  const [activePanel, setActivePanel] = useState<"chat" | null>(null);
  const [assistantState, setAssistantState] = useState<AssistantActivityState>("idle");
  const [speechIntensity, setSpeechIntensity] = useState(0);
  const [presentation, setPresentation] = useState<AssistantPresentation | null>(null);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: "welcome",
      role: "assistant",
      content: "Estou por aqui, senhor. O que precisa?",
      createdAt: new Date(),
    },
  ]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(BACKEND_URL_STORAGE_KEY, backendUrl.trim());
    }
  }, [backendUrl]);

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
        <div
          className={`home-screen${activePanel ? " home-screen--panel-open" : ""}${presentation ? " home-screen--presenting" : ""}`}
        >
          <div className="core-stage core-stage--home">
            <div className="core-stage__grid" />
            <div className="core-title">N.E.X.U.S.</div>
            <NexusCore state={assistantState} speechIntensity={speechIntensity} />
            <span className="visually-hidden" aria-live="polite">
              {assistantState === "waiting-for-wake-word"
                ? "Escuta do N.E.X.U.S. ativa"
                : assistantState === "listening"
                  ? "Ouvindo"
                  : assistantState === "processing"
                    ? "Processando"
                    : assistantState === "speaking"
                      ? "Falando"
                      : assistantState === "paused"
                        ? "Escuta pausada"
                        : assistantState === "error"
                          ? "Escuta indisponível"
                          : "Em repouso"}
            </span>
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
              <span>CHAT</span>
            </button>
          </div>

          <ChatPanel
            assistantService={assistantService}
            messages={messages}
            onMessagesChange={setMessages}
            backendUrl={backendUrl}
            onBackendUrlChange={setBackendUrl}
            onActivityStateChange={setAssistantState}
            onSpeechIntensityChange={setSpeechIntensity}
            onPresentationChange={setPresentation}
            mode={activePanel ?? "closed"}
            onClose={() => setActivePanel(null)}
          />
        </div>
      </section>
    </main>
  );
}

export default App;
