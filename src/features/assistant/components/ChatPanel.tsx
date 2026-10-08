import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import type {
  AssistantContextMessage,
  AssistantService,
} from "../domain/AssistantService";
import type { AssistantActivityState } from "../domain/AssistantActivityState";
import type { AssistantPresentation } from "../domain/AssistantPresentation";
import type { Message } from "../domain/Message";
import { BrowserSpeechSynthesisService } from "../services/SpeechSynthesisService";
import type { VoiceService } from "../services/VoiceService";
import { createVoiceService, createWakeWordService } from "../services/VoiceServices";
import { NexusMark } from "./NexusMark";

interface ChatPanelProps {
  assistantService: AssistantService;
  messages: Message[];
  onMessagesChange: (messages: Message[] | ((current: Message[]) => Message[])) => void;
  backendUrl: string;
  onBackendUrlChange: (url: string) => void;
  onActivityStateChange: (state: AssistantActivityState) => void;
  onSpeechIntensityChange: (intensity: number) => void;
  onPresentationChange: (presentation: AssistantPresentation | null) => void;
  mode: "chat" | "closed";
  onClose: () => void;
}

const suggestions = [
  "O que você poderá fazer?",
  "Me ajude a organizar minhas ideias",
  "Explique algo de um jeito simples",
];
const maxContextMessages = 40;
const maxContextCharacters = 32_000;
const wakeWordStorageKey = "nexus-wake-word-enabled";
const speechStorageKey = "nexus-speech-enabled";

function buildAssistantContext(messages: Message[]): AssistantContextMessage[] {
  const context: AssistantContextMessage[] = [];
  let characterCount = 0;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.id === "welcome") continue;
    if (
      context.length === maxContextMessages ||
      characterCount + message.content.length > maxContextCharacters
    ) {
      break;
    }

    context.unshift({ role: message.role, content: message.content });
    characterCount += message.content.length;
  }

  return context;
}

function isNoSpeechError(error: Error): boolean {
  return "code" in error && error.code === "no-speech";
}

function shouldPresentResponse(question: string): boolean {
  const normalized = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const mentionsDeputies = /\bdeputad[oa]s?\b/.test(normalized);
  const requestsData =
    /\b(mostre|exiba|apresente|visualize|pesquise|traga)\b/.test(normalized) &&
    /\b(dados?|informacoes?|indicadores?|resultados?|relatorios?)\b/.test(normalized);
  return mentionsDeputies || requestsData;
}

export function ChatPanel({
  assistantService,
  messages,
  onMessagesChange,
  backendUrl,
  onBackendUrlChange,
  onActivityStateChange,
  onSpeechIntensityChange,
  onPresentationChange,
  mode,
  onClose,
}: ChatPanelProps) {
  const voiceRecognition: VoiceService = useMemo(createVoiceService, []);
  const speechSynthesis = useMemo(() => new BrowserSpeechSynthesisService(), []);
  const wakeWordService = useMemo(createWakeWordService, []);
  const isVoiceSupported = voiceRecognition.isSupported();
  const isSpeechSupported = speechSynthesis.isSupported();
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isVoiceStarting, setIsVoiceStarting] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() =>
    typeof window !== "undefined" && window.localStorage.getItem(wakeWordStorageKey) === "true",
  );
  const [wakeWordError, setWakeWordError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [assistantState, setAssistantState] = useState<AssistantActivityState>("idle");
  const [automaticSpeechEnabled, setAutomaticSpeechEnabled] = useState(() => {
    if (typeof window === "undefined") return isSpeechSupported;
    const stored = window.localStorage.getItem(speechStorageKey);
    return stored === null ? isSpeechSupported : stored === "true" && isSpeechSupported;
  });
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const automaticSpeechEnabledRef = useRef(automaticSpeechEnabled);
  const wakeWordEnabledRef = useRef(wakeWordEnabled);
  const isSendingRef = useRef(false);
  const isRecordingRef = useRef(false);
  const pendingVoiceCommandRef = useRef("");
  const speechPendingRef = useRef(false);
  const speechFinishedRef = useRef<(() => void) | null>(null);
  const sendMessageRef = useRef<(value: string) => void>(() => {});
  const commandCaptureRef = useRef<() => void>(() => {});
  const wakeWordHandlerRef = useRef<(command: string) => void>(() => {});
  const assistantStateRef = useRef<AssistantActivityState>("idle");
  const requestControllerRef = useRef<AbortController | null>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);

  const updateAssistantState = useCallback(
    (state: AssistantActivityState) => {
      assistantStateRef.current = state;
      setAssistantState(state);
      onActivityStateChange(state);
    },
    [onActivityStateChange],
  );

  const resumeWakeWord = useCallback(() => {
    if (isSendingRef.current || assistantStateRef.current === "processing") return;
    if (wakeWordEnabledRef.current && !document.hidden) {
      wakeWordService.start();
      if (wakeWordEnabledRef.current) updateAssistantState("waiting-for-wake-word");
    } else if (wakeWordEnabledRef.current) {
      updateAssistantState("paused");
    } else {
      updateAssistantState("idle");
    }
  }, [updateAssistantState, wakeWordService]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(speechStorageKey, String(automaticSpeechEnabled));
    }
    automaticSpeechEnabledRef.current = automaticSpeechEnabled;
  }, [automaticSpeechEnabled]);

  useEffect(() => {
    window.localStorage.setItem(wakeWordStorageKey, String(wakeWordEnabled));
  }, [wakeWordEnabled]);

  useEffect(
    () => () => {
      requestControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    scrollAreaRef.current?.scrollTo({
      top: scrollAreaRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  useEffect(() => {
    const unsubscribeWakeWord = wakeWordService.onWakeWord((command) =>
      wakeWordHandlerRef.current(command),
    );
    const unsubscribeWakeWordError = wakeWordService.onError((serviceError) => {
      wakeWordEnabledRef.current = false;
      setWakeWordError(serviceError.message);
      updateAssistantState("error");
    });

    return () => {
      unsubscribeWakeWord();
      unsubscribeWakeWordError();
      voiceRecognition.cancel();
      speechSynthesis.stop();
      onSpeechIntensityChange(0);
      wakeWordService.stop();
    };
  }, [
    onSpeechIntensityChange,
    resumeWakeWord,
    speechSynthesis,
    updateAssistantState,
    voiceRecognition,
    wakeWordService,
  ]);

  useEffect(() => {
    if (wakeWordEnabledRef.current) resumeWakeWord();
  }, [resumeWakeWord]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        wakeWordService.stop();
        voiceRecognition.cancel();
        isRecordingRef.current = false;
        setIsRecording(false);
        setIsVoiceStarting(false);
        if (assistantStateRef.current === "listening" || assistantStateRef.current === "waiting-for-wake-word") {
          updateAssistantState("paused");
        }
        return;
      }

      if (
        wakeWordEnabledRef.current &&
        (assistantStateRef.current === "paused" || assistantStateRef.current === "waiting-for-wake-word")
      ) {
        resumeWakeWord();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [resumeWakeWord, updateAssistantState, voiceRecognition, wakeWordService]);

  function speakResponse(content: string, onFinished: () => void = resumeWakeWord) {
    setSpeechError(null);
    onSpeechIntensityChange(0);
    wakeWordService.stop();
    speechPendingRef.current = true;
    speechFinishedRef.current = onFinished;
    try {
      speechSynthesis.speak(content, {
        onStart: () => {
          speechPendingRef.current = false;
          setIsSpeaking(true);
          updateAssistantState("speaking");
        },
        onBoundary: onSpeechIntensityChange,
        onEnd: () => {
          speechPendingRef.current = false;
          speechFinishedRef.current = null;
          setIsSpeaking(false);
          onSpeechIntensityChange(0);
          updateAssistantState("idle");
          onFinished();
        },
        onError: (synthesisError) => {
          speechPendingRef.current = false;
          speechFinishedRef.current = null;
          setIsSpeaking(false);
          onSpeechIntensityChange(0);
          setSpeechError(synthesisError.message);
          updateAssistantState("idle");
          onFinished();
        },
      });
    } catch (synthesisError) {
      speechPendingRef.current = false;
      speechFinishedRef.current = null;
      setIsSpeaking(false);
      onSpeechIntensityChange(0);
      setSpeechError(
        synthesisError instanceof Error
          ? synthesisError.message
          : "Não foi possível reproduzir a resposta em voz.",
      );
      updateAssistantState("idle");
      onFinished();
    }
  }

  function stopCurrentSpeech() {
    const onFinished = speechFinishedRef.current;
    speechFinishedRef.current = null;
    speechPendingRef.current = false;
    speechSynthesis.stop();
    setIsSpeaking(false);
    onSpeechIntensityChange(0);
    updateAssistantState("idle");
    (onFinished ?? resumeWakeWord)();
  }

  async function requestResponse(
    content: string,
    context: AssistantContextMessage[],
  ) {
    setError(null);
    onPresentationChange(null);
    isSendingRef.current = true;
    setIsSending(true);
    updateAssistantState("processing");
    wakeWordService.stop();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    const assistantMessageId = crypto.randomUUID();
    activeAssistantMessageIdRef.current = assistantMessageId;
    onMessagesChange((current) => [
      ...current,
      {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        createdAt: new Date(),
      },
    ]);

    try {
      const response = await assistantService.sendMessage(content, context, {
        signal: controller.signal,
        onChunk: (chunk) => {
          onMessagesChange((current) =>
            current.map((message) =>
              message.id === assistantMessageId
                ? { ...message, content: message.content + chunk }
                : message,
            ),
          );
        },
      });
      if (!response.trim()) {
        throw new Error("O assistente retornou uma resposta vazia.");
      }

      onMessagesChange((current) =>
        current.map((message) =>
          message.id === assistantMessageId ? { ...message, content: response } : message,
        ),
      );
      if (shouldPresentResponse(content)) {
        onPresentationChange({ question: content, answer: response });
      }
      if (automaticSpeechEnabledRef.current) speakResponse(response);
    } catch (sendError) {
      if (!controller.signal.aborted) {
        setError(
          sendError instanceof Error
            ? sendError.message
            : "Não foi possível enviar sua mensagem. Tente novamente.",
        );
        onMessagesChange((current) =>
          current.filter((message) =>
            message.id !== assistantMessageId || message.content.length > 0,
          ),
        );
      }
    } finally {
      if (requestControllerRef.current === controller) requestControllerRef.current = null;
      if (activeAssistantMessageIdRef.current === assistantMessageId) {
        activeAssistantMessageIdRef.current = null;
      }
      isSendingRef.current = false;
      setIsSending(false);
      if (
        assistantStateRef.current === "processing" &&
        !speechPendingRef.current
      ) {
        updateAssistantState("idle");
        resumeWakeWord();
      }
      inputRef.current?.focus();
    }
  }

  async function sendMessage(value: string) {
    const content = value.trim();
    if (!content || isSendingRef.current || isRecordingRef.current) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date(),
    };

    const nextMessages = [...messages, userMessage];
    onMessagesChange(nextMessages);
    setDraft("");
    await requestResponse(content, buildAssistantContext(nextMessages));
  }

  function startCommandCapture() {
    if (!wakeWordEnabledRef.current || document.hidden) {
      resumeWakeWord();
      return;
    }

    pendingVoiceCommandRef.current = "";
    setVoiceError(null);
    setIsVoiceStarting(true);
    try {
      voiceRecognition.startListening({
        onStart: () => {
          setIsVoiceStarting(false);
          isRecordingRef.current = true;
          setIsRecording(true);
          updateAssistantState("listening");
        },
        onTranscript: (transcript) => setDraft(transcript),
        onFinalTranscript: (transcript) => {
          pendingVoiceCommandRef.current = transcript;
          setDraft(transcript);
        },
        onError: (recognitionError) => {
          setIsVoiceStarting(false);
          setVoiceError(recognitionError.message);
          if (!isNoSpeechError(recognitionError)) updateAssistantState("error");
        },
        onEnd: () => {
          setIsVoiceStarting(false);
          isRecordingRef.current = false;
          setIsRecording(false);
          const command = pendingVoiceCommandRef.current.trim();
          pendingVoiceCommandRef.current = "";
          if (command) sendMessageRef.current(command);
          else resumeWakeWord();
        },
      });
    } catch (recognitionError) {
      setIsVoiceStarting(false);
      isRecordingRef.current = false;
      setIsRecording(false);
      setVoiceError(
        recognitionError instanceof Error
          ? recognitionError.message
          : "Não foi possível iniciar o reconhecimento do comando.",
      );
      updateAssistantState("error");
    }
  }

  sendMessageRef.current = (value) => {
    void sendMessage(value);
  };
  commandCaptureRef.current = startCommandCapture;
  wakeWordHandlerRef.current = (command) => {
    setWakeWordError(null);
    updateAssistantState("listening");
    onMessagesChange((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        role: "assistant",
        content: "Sim, senhor.",
        createdAt: new Date(),
      },
    ]);

    const continueAfterAcknowledgment = () => {
      if (command) sendMessageRef.current(command);
      else commandCaptureRef.current();
    };

    if (automaticSpeechEnabledRef.current && isSpeechSupported) {
      speakResponse("Sim, senhor.", continueAfterAcknowledgment);
    } else {
      continueAfterAcknowledgment();
    }
  };

  function retryLastMessage() {
    let lastUserIndex = messages.length - 1;
    while (lastUserIndex >= 0 && messages[lastUserIndex].role !== "user") {
      lastUserIndex -= 1;
    }
    if (lastUserIndex < 0) return;
    const lastUserMessage = messages[lastUserIndex];
    void requestResponse(
      lastUserMessage.content,
      buildAssistantContext(messages.slice(0, lastUserIndex)),
    );
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(draft);
  }

  function toggleWakeWord(enabled: boolean) {
    setWakeWordError(null);
    wakeWordEnabledRef.current = enabled;
    setWakeWordEnabled(enabled);
    if (enabled) {
      if (document.hidden) {
        updateAssistantState("paused");
        return;
      }
      try {
        wakeWordService.start();
        if (wakeWordEnabledRef.current) updateAssistantState("waiting-for-wake-word");
      } catch (serviceError) {
        wakeWordEnabledRef.current = false;
        setWakeWordEnabled(false);
        setWakeWordError(
          serviceError instanceof Error
            ? serviceError.message
            : "Não foi possível iniciar a palavra de ativação.",
        );
        updateAssistantState("error");
      }
    } else {
      wakeWordService.stop();
      voiceRecognition.cancel();
      pendingVoiceCommandRef.current = "";
      isRecordingRef.current = false;
      setIsRecording(false);
      setIsVoiceStarting(false);
      if (
        assistantStateRef.current !== "processing" &&
        assistantStateRef.current !== "speaking"
      ) {
        updateAssistantState("idle");
      }
    }
  }

  if (mode === "closed") return null;
  const isListening = assistantState === "waiting-for-wake-word" || assistantState === "listening";

  return (
    <section
      className={`chat-panel chat-panel--${mode}`}
      aria-label="Conversa com N.E.X.U.S."
    >
      <header className="chat-header">
        <div className="chat-header__identity">
          <NexusMark small />
          <div>
            <h2>N.E.X.U.S.</h2>
            <span className="chat-header__status">
              <span className={`status-dot${wakeWordEnabled && isListening && !document.hidden ? " status-dot--active" : ""}`} />
              {wakeWordError ??
                (assistantState === "processing"
                  ? "Verificando"
                  : assistantState === "speaking"
                    ? "Falando"
                    : assistantState === "paused"
                      ? "Escuta pausada"
                      : isListening
                        ? "Diga “Nexus”"
                        : wakeWordEnabled
                          ? "Escuta ativada"
                          : "Assistente pessoal")}
            </span>
          </div>
        </div>
        <div className="chat-header__actions">
          <button
            className="icon-button"
            type="button"
            aria-label={showSettings ? "Fechar configurações" : "Abrir configurações"}
            aria-expanded={showSettings}
            title="Configurações"
            onClick={() => setShowSettings((current) => !current)}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 3v2M10 15v2M3.5 10h2M14.5 10h2M5.2 5.2l1.4 1.4M13.4 13.4l1.4 1.4M5.2 14.8l1.4-1.4M13.4 6.6l1.4-1.4" />
              <circle cx="10" cy="10" r="2.4" />
            </svg>
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Nova conversa"
            title="Nova conversa"
            disabled={isSending}
            onClick={() => {
              speechSynthesis.stop();
              speechPendingRef.current = false;
              setIsSpeaking(false);
              onSpeechIntensityChange(0);
              updateAssistantState("idle");
              setSpeechError(null);
              resumeWakeWord();
              onMessagesChange([
                {
                  id: "welcome",
                  role: "assistant",
                  content: "Estou por aqui, senhor. O que precisa?",
                  createdAt: new Date(),
                },
              ]);
              setError(null);
              onPresentationChange(null);
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 4v12M4 10h12" />
            </svg>
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Fechar painel"
            title="Fechar painel"
            onClick={onClose}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="m5 5 10 10M15 5 5 15" />
            </svg>
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="settings-panel chat-settings" aria-label="Configurações do N.E.X.U.S.">
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
              onChange={(event) => onBackendUrlChange(event.target.value.trim() || "")}
              placeholder="http://10.0.2.2:3001"
            />
          </label>
          <p className="settings-note">
            Em Android, o emulador costuma usar <strong>10.0.2.2</strong> para acessar o backend local.
          </p>
        </div>
      )}

      <div className="chat-messages" ref={scrollAreaRef} aria-live="polite">
        <div className="conversation-date">HOJE</div>
        {messages.map((message) => (
          <article className={`message message--${message.role}`} key={message.id}>
            {message.role === "assistant" && (
              <div className="message__avatar">
                <NexusMark small />
              </div>
            )}
            <div className="message__body">
              <div className="message__meta">
                <strong>{message.role === "assistant" ? "N.E.X.U.S." : "Você"}</strong>
                <time>
                  {message.createdAt.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                {message.role === "assistant" && message.id !== "welcome" && (
                  <button
                    className="message__speak"
                    type="button"
                    aria-label="Ouvir esta resposta"
                    title={
                      isSpeechSupported
                        ? "Ouvir esta resposta"
                        : "Síntese de voz indisponível neste navegador"
                    }
                    disabled={!isSpeechSupported}
                    onClick={() => speakResponse(message.content)}
                  >
                    Ouvir
                  </button>
                )}
              </div>
              <p>{message.content}</p>
              {isSending && message.id === activeAssistantMessageIdRef.current && (
                <>
                  <span role="status">PROCESSANDO</span>
                  <div className="typing-indicator" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                </>
              )}
            </div>
          </article>
        ))}

        {error && (
          <div className="chat-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={retryLastMessage}>
              Tentar novamente
            </button>
          </div>
        )}
      </div>

      <div className="chat-footer">
        {messages.length === 1 && (
          <div className="suggestions" aria-label="Sugestões de mensagem">
            {suggestions.map((suggestion) => (
              <button
                className="suggestion-chip"
                key={suggestion}
                type="button"
                onClick={() => void sendMessage(suggestion)}
                disabled={isSending || isRecording}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
        <div className="wake-controls">
          <label className="speech-toggle">
            <input
              type="checkbox"
              checked={wakeWordEnabled}
              disabled={!isVoiceSupported && !wakeWordEnabled}
              onChange={(event) => toggleWakeWord(event.target.checked)}
            />
            <span>Escuta do N.E.X.U.S.: {wakeWordEnabled ? "Ativada" : "Desativada"}</span>
          </label>
          {wakeWordEnabled && <span className="wake-word-status">Diga “Nexus”</span>}
          {!isVoiceSupported && (
            <span className="speech-feedback">
              Reconhecimento de fala indisponível neste navegador.
            </span>
          )}
        </div>
        <p className="wake-word-note">
          Usa o reconhecimento do navegador e pode depender de rede. A escuta funciona com o app aberto e em primeiro plano; é interrompida ao sair da tela. Não é detecção local nem funciona com o app fechado.
        </p>
        {wakeWordError && (
          <p className="voice-feedback voice-feedback--error" role="alert">
            {wakeWordError}
          </p>
        )}
        <div className="speech-controls">
          <label className="speech-toggle">
            <input
              type="checkbox"
              checked={automaticSpeechEnabled}
              disabled={!isSpeechSupported}
              onChange={(event) => {
                setAutomaticSpeechEnabled(event.target.checked);
                automaticSpeechEnabledRef.current = event.target.checked;
                if (!event.target.checked) {
                  setSpeechError(null);
                  if (speechPendingRef.current || assistantStateRef.current === "speaking") {
                    stopCurrentSpeech();
                  }
                }
              }}
            />
            <span>Falar respostas</span>
          </label>
          {isSpeaking && (
            <button
              className="speech-stop"
              type="button"
              onClick={stopCurrentSpeech}
            >
              Parar fala
            </button>
          )}
          {!isSpeechSupported && (
            <span className="speech-feedback">Síntese de voz indisponível neste navegador.</span>
          )}
        </div>
        <form className="composer" onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Escreva uma mensagem..."
            aria-label="Mensagem para N.E.X.U.S."
            autoComplete="off"
            disabled={isSending || isRecording || isVoiceStarting}
          />
          <span className="composer__hint">Enter para enviar</span>
          <button
            className="send-button"
            type="submit"
            aria-label="Enviar mensagem"
            disabled={!draft.trim() || isSending || isRecording || isVoiceStarting}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 10 17 3l-4 14-3.5-5.5L3 10Z" />
              <path d="M9.5 11.5 17 3" />
            </svg>
          </button>
        </form>
        {isRecording && (
          <p className="voice-feedback" role="status">
            Ouvindo o comando do senhor…
          </p>
        )}
        {isVoiceStarting && (
          <p className="voice-feedback" role="status">
            Preparando o reconhecimento de voz…
          </p>
        )}
        {voiceError && (
          <p className="voice-feedback voice-feedback--error" role="alert">
            {voiceError}
          </p>
        )}
        {speechError && (
          <p className="voice-feedback voice-feedback--error" role="alert">
            {speechError}
          </p>
        )}
        <p className="chat-disclaimer">
          O histórico fica apenas nesta sessão. Memórias persistentes só serão salvas mediante ação explícita.
        </p>
      </div>
    </section>
  );
}
