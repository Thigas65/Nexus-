interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  readonly length: number;
  readonly isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionResultListLike {
  readonly length: number;
  [index: number]: SpeechRecognitionResultLike;
}

interface SpeechRecognitionResultEventLike {
  readonly results: SpeechRecognitionResultListLike;
}

interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

type RecognitionWindow = Window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

export interface VoiceRecognitionHandlers {
  onTranscript: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onError: (error: Error) => void;
  onEnd: () => void;
}

function getRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const speechWindow = window as RecognitionWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

function getRecognitionErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Permita o acesso ao microfone nas configurações do navegador.";
    case "no-speech":
      return "Nenhuma fala foi detectada. Tente novamente.";
    case "audio-capture":
      return "Não foi possível acessar um microfone.";
    case "network":
      return "O reconhecimento de voz precisa de uma conexão de rede neste navegador.";
    case "language-not-supported":
      return "O reconhecimento de voz em português não está disponível neste navegador.";
    case "aborted":
      return "O reconhecimento de voz foi interrompido.";
    default:
      return "Não foi possível reconhecer a fala. Tente novamente.";
  }
}

class VoiceRecognitionError extends Error {
  readonly code: string;

  constructor(
    message: string,
    code: string,
  ) {
    super(message);
    this.name = "VoiceRecognitionError";
    this.code = code;
  }
}

export class BrowserVoiceRecognitionService {
  private recognition: SpeechRecognitionLike | null = null;
  private readonly createRecognition: () => SpeechRecognitionLike | undefined;

  constructor(
    createRecognition: () => SpeechRecognitionLike | undefined = () => {
      const Recognition = getRecognitionConstructor();
      return Recognition ? new Recognition() : undefined;
    },
  ) {
    this.createRecognition = createRecognition;
  }

  isSupported(): boolean {
    return getRecognitionConstructor() !== undefined;
  }

  start(handlers: VoiceRecognitionHandlers): void {
    const recognition = this.createRecognition();
    if (!recognition) {
      throw new Error("O reconhecimento de voz não é compatível com este navegador.");
    }

    this.cancel();
    this.recognition = recognition;
    recognition.lang = "pt-BR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const results = Array.from(
        { length: event.results.length },
        (_, index) => event.results[index],
      );
      const transcript = results.map((result) => result[0]?.transcript ?? "").join("").trim();

      if (transcript) handlers.onTranscript(transcript);

      const finalTranscript = results
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (finalTranscript) handlers.onFinalTranscript?.(finalTranscript);
    };
    recognition.onerror = (event) => {
      handlers.onError(new VoiceRecognitionError(
        getRecognitionErrorMessage(event.error),
        event.error,
      ));
    };
    recognition.onend = () => {
      if (this.recognition === recognition) this.recognition = null;
      handlers.onEnd();
    };

    try {
      recognition.start();
    } catch {
      if (this.recognition === recognition) this.recognition = null;
      throw new Error("Não foi possível iniciar o reconhecimento de voz.");
    }
  }

  stop(): void {
    this.recognition?.stop();
  }

  cancel(): void {
    if (!this.recognition) return;
    this.recognition.onresult = null;
    this.recognition.onerror = null;
    this.recognition.onend = null;
    this.recognition.abort();
    this.recognition = null;
  }
}
