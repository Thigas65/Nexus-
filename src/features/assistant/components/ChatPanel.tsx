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
import type { Message } from "../domain/Message";
import { BrowserSpeechSynthesisService } from "../services/SpeechSynthesisService";
import { BrowserVoiceRecognitionService } from "../services/VoiceRecognitionService";
import { BrowserWakeWordService } from "../services/WakeWordService";
import { NexusMark } from "./NexusMark";

interface ChatPanelProps {
  assistantService: AssistantService;
  messages: Message[];
  onMessagesChange: (messages: Message[] | ((current: Message[]) => Message[])) => void;
  onMessageSent: () => void;
  onActivityStateChange: (state: AssistantActivityState) => void;
  speechEnabled?: boolean;
}

const suggestions = [
  "O que você poderá fazer?",
  "Me ajude a organizar minhas ideias",
  "Explique algo de um jeito simples",
];
const maxContextMessages = 40;
const maxContextCharacters = 32_000;

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

export function ChatPanel({
  assistantService,
  messages,
  onMessagesChange,
  onMessageSent,
  onActivityStateChange,
  speechEnabled = true,
}: ChatPanelProps) {
  const voiceRecognition = useMemo(() => new BrowserVoiceRecognitionService(), []);
  const speechSynthesis = useMemo(() => new BrowserSpeechSynthesisService(), []);
  const wakeWordService = useMemo(
    () => new BrowserWakeWordService(() => new BrowserVoiceRecognitionService()),
    [],
  );
  const isVoiceSupported = voiceRecognition.isSupported();
  const isSpeechSupported = speechSynthesis.isSupported();
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [wakeWordError, setWakeWordError] = useState<string | null>(null);
  const [assistantState, setAssistantState] = useState<AssistantActivityState>("idle");
  const [automaticSpeechEnabled, setAutomaticSpeechEnabled] = useState(() => {
    if (typeof window === "undefined") return speechEnabled && isSpeechSupported;
    const stored = window.localStorage.getItem("nexus-speech-enabled");
    if (stored !== null) return stored === "true" && isSpeechSupported;
    return speechEnabled && isSpeechSupported;
  });
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceDraftPrefixRef = useRef("");
  const automaticSpeechEnabledRef = useRef(automaticSpeechEnabled);
  const wakeWordEnabledRef = useRef(false);
  const assistantStateRef = useRef<AssistantActivityState>("idle");

  const updateAssistantState = useCallback(
    (state: AssistantActivityState) => {
      assistantStateRef.current = state;
      setAssistantState(state);
      onActivityStateChange(state);
    },
    [onActivityStateChange],
  );

  const resumeWakeWord = useCallback(() => {
    if (wakeWordEnabledRef.current) {
      wakeWordService.start();
      if (wakeWordEnabledRef.current) updateAssistantState("waiting-for-wake-word");
    } else {
      updateAssistantState("idle");
    }
  }, [updateAssistantState, wakeWordService]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("nexus-speech-enabled", String(automaticSpeechEnabled));
    }
  }, [automaticSpeechEnabled]);

  useEffect(() => {
    scrollAreaRef.current?.scrollTo({
      top: scrollAreaRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isSending]);

  useEffect(() => {
    const unsubscribeWakeWord = wakeWordService.onWakeWord((command) => {
      setWakeWordError(null);
      updateAssistantState("listening");
      if (command) {
        setDraft(command);
        resumeWakeWord();
        return;
      }

      try {
        setIsRecording(true);
        voiceRecognition.start({
          onTranscript: (transcript) => setDraft(transcript),
          onError: (recognitionError) => {
            setVoiceError(recognitionError.message);
            if (isNoSpeechError(recognitionError)) return;
            wakeWordEnabledRef.current = false;
            setWakeWordEnabled(false);
            wakeWordService.stop();
            updateAssistantState("error");
          },
          onEnd: () => {
            setIsRecording(false);
            inputRef.current?.focus();
            resumeWakeWord();
          },
        });
      } catch (recognitionError) {
        setIsRecording(false);
        setVoiceError(
          recognitionError instanceof Error
            ? recognitionError.message
            : "Não foi possível iniciar o reconhecimento do comando.",
        );
        if (wakeWordEnabledRef.current) {
          wakeWordEnabledRef.current = false;
          setWakeWordEnabled(false);
          wakeWordService.stop();
        }
        updateAssistantState("error");
      }
    });
    const unsubscribeWakeWordError = wakeWordService.onError((serviceError) => {
      wakeWordEnabledRef.current = false;
      setWakeWordEnabled(false);
      setWakeWordError(serviceError.message);
      updateAssistantState("error");
    });

    return () => {
      unsubscribeWakeWord();
      unsubscribeWakeWordError();
      voiceRecognition.cancel();
      speechSynthesis.stop();
      wakeWordService.stop();
    };
  }, [resumeWakeWord, speechSynthesis, updateAssistantState, voiceRecognition, wakeWordService]);

  function speakResponse(content: string) {
    setSpeechError(null);
    wakeWordService.stop();
    updateAssistantState("speaking");
    try {
      speechSynthesis.speak(content, {
        onStart: () => {
          setIsSpeaking(true);
          updateAssistantState("speaking");
        },
        onEnd: () => {
          setIsSpeaking(false);
          resumeWakeWord();
        },
        onError: (synthesisError) => {
          setIsSpeaking(false);
          setSpeechError(synthesisError.message);
          resumeWakeWord();
        },
      });
    } catch (synthesisError) {
      setIsSpeaking(false);
      setSpeechError(
        synthesisError instanceof Error
          ? synthesisError.message
          : "Não foi possível reproduzir a resposta em voz.",
      );
      resumeWakeWord();
    }
  }

  async function requestResponse(
    content: string,
    context: AssistantContextMessage[],
  ) {
    setError(null);
    setIsSending(true);
    updateAssistantState("processing");
    wakeWordService.stop();

    try {
      const response = await assistantService.sendMessage(content, context);
      if (!response.trim()) {
        throw new Error("O assistente retornou uma resposta vazia.");
      }

      onMessagesChange((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response,
          createdAt: new Date(),
        },
      ]);
      if (automaticSpeechEnabledRef.current) speakResponse(response);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Não foi possível enviar sua mensagem. Tente novamente.",
      );
    } finally {
      setIsSending(false);
      if (assistantStateRef.current === "processing") resumeWakeWord();
      inputRef.current?.focus();
    }
  }

  async function sendMessage(value: string) {
    const content = value.trim();
    if (!content || isSending || isRecording) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content,
      createdAt: new Date(),
    };

    const nextMessages = [...messages, userMessage];
    onMessagesChange(nextMessages);
    setDraft("");
    onMessageSent();
    await requestResponse(content, buildAssistantContext(nextMessages));
  }

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

  function toggleVoiceRecognition() {
    setVoiceError(null);

    if (isRecording) {
      voiceRecognition.stop();
      return;
    }

    wakeWordService.stop();
    voiceDraftPrefixRef.current = draft.trimEnd();
    try {
      setIsRecording(true);
      updateAssistantState("listening");
      voiceRecognition.start({
        onTranscript: (transcript) => {
          const prefix = voiceDraftPrefixRef.current;
          setDraft(prefix ? `${prefix} ${transcript}` : transcript);
        },
        onError: (recognitionError) => {
          setVoiceError(recognitionError.message);
          updateAssistantState("error");
        },
        onEnd: () => {
          setIsRecording(false);
          inputRef.current?.focus();
          resumeWakeWord();
        },
      });
    } catch (recognitionError) {
      setIsRecording(false);
      setVoiceError(
        recognitionError instanceof Error
          ? recognitionError.message
          : "Não foi possível iniciar o reconhecimento de voz.",
      );
      resumeWakeWord();
    }
  }

  function toggleWakeWord(enabled: boolean) {
    setWakeWordError(null);
    wakeWordEnabledRef.current = enabled;
    setWakeWordEnabled(enabled);
    if (enabled) {
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
      updateAssistantState("paused");
    }
  }

  return (
    <section className="chat-panel" aria-label="Conversa com N.E.X.U.S.">
      <header className="chat-header">
        <div className="chat-header__identity">
          <NexusMark small />
          <div>
            <h2>N.E.X.U.S.</h2>
            <span className="chat-header__status">
              <span className="status-dot" />
              Assistente pessoal
            </span>
          </div>
        </div>
        <button
          className="icon-button"
          type="button"
          aria-label="Nova conversa"
          title="Nova conversa"
          disabled={isSending}
          onClick={() => {
            speechSynthesis.stop();
            setIsSpeaking(false);
            setSpeechError(null);
            resumeWakeWord();
            onMessagesChange([
              {
                id: "welcome",
                role: "assistant",
                content: "Olá! Sou o N.E.X.U.S. Como posso ajudar você hoje?",
                createdAt: new Date(),
              },
            ]);
            setError(null);
          }}
        >
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M10 4v12M4 10h12" />
          </svg>
        </button>
      </header>

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
            </div>
          </article>
        ))}

        {isSending && (
          <div className="message message--assistant" role="status" aria-label="Respondendo">
            <div className="message__avatar">
              <NexusMark small />
            </div>
            <div className="message__body">
              <div className="message__meta">
                <strong>N.E.X.U.S.</strong>
                <span>pensando</span>
              </div>
              <div className="typing-indicator" aria-hidden="true">
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
        )}
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
              disabled={!isVoiceSupported || isRecording || isSending}
              onChange={(event) => toggleWakeWord(event.target.checked)}
            />
            <span>Palavra de ativação: {wakeWordEnabled ? "Ativada" : "Desativada"}</span>
          </label>
          {wakeWordEnabled && (
            <span className="wake-word-status">
              {assistantState === "listening"
                ? "Fale seu comando."
                : "Aguardando “N.E.X.U.S.”"}
            </span>
          )}
          {!isVoiceSupported && (
            <span className="speech-feedback">
              Palavra de ativação indisponível neste navegador.
            </span>
          )}
        </div>
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
                  speechSynthesis.stop();
                  setIsSpeaking(false);
                  setSpeechError(null);
                  resumeWakeWord();
                }
              }}
            />
            <span>Falar respostas</span>
          </label>
          {isSpeaking && (
            <button
              className="speech-stop"
              type="button"
              onClick={() => {
                speechSynthesis.stop();
                setIsSpeaking(false);
                resumeWakeWord();
              }}
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
            disabled={isSending || isRecording}
          />
          <span className="composer__hint">Enter para enviar</span>
          <button
            className={`voice-button${isRecording ? " voice-button--recording" : ""}`}
            type="button"
            aria-label={isRecording ? "Parar reconhecimento de voz" : "Ditar mensagem"}
            title={
              isVoiceSupported
                ? isRecording
                  ? "Parar reconhecimento de voz"
                  : "Ditar mensagem"
                : "Reconhecimento de voz indisponível neste navegador"
            }
            aria-pressed={isRecording}
            disabled={!isVoiceSupported || isSending}
            onClick={toggleVoiceRecognition}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="7" y="3" width="6" height="10" rx="3" />
              <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0M10 15v3M7.5 18h5" />
            </svg>
          </button>
          <button
            className="send-button"
            type="submit"
            aria-label="Enviar mensagem"
            disabled={!draft.trim() || isSending || isRecording}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3 10 17 3l-4 14-3.5-5.5L3 10Z" />
              <path d="M9.5 11.5 17 3" />
            </svg>
          </button>
        </form>
        {isRecording && (
          <p className="voice-feedback" role="status">
            Ouvindo… fale sua mensagem. A transcrição aparecerá no campo acima.
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
