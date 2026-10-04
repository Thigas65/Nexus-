export interface WakeWordRecognitionHandlers {
  onTranscript: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onError: (error: Error) => void;
  onEnd: () => void;
}

export interface WakeWordRecognition {
  start(handlers: WakeWordRecognitionHandlers): void;
  stop(): void;
  cancel(): void;
}

export interface WakeWordService {
  start(): void;
  stop(): void;
  isListening(): boolean;
  onWakeWord(callback: (command: string) => void): () => void;
  onError(callback: (error: Error) => void): () => void;
}

export function extractWakeWordCommand(transcript: string): string | null {
  const activation = /^\s*(?:n\s*\.?\s*e\s*\.?\s*x\s*\.?\s*u\s*\.?\s*s|nexus)(?=$|[\s,!?;:.-])/i;
  const match = activation.exec(transcript);
  if (!match) return null;
  return transcript.slice(match[0].length).replace(/^[\s,!?;:.-]+/, "").trim();
}

function isNoSpeechError(error: Error): boolean {
  return "code" in error && error.code === "no-speech";
}

export class BrowserWakeWordService implements WakeWordService {
  private active = false;
  private recognition: WakeWordRecognition | null = null;
  private pendingCommand: string | null = null;
  private readonly wakeWordListeners = new Set<(command: string) => void>();
  private readonly errorListeners = new Set<(error: Error) => void>();
  private readonly createRecognition: () => WakeWordRecognition;

  constructor(createRecognition: () => WakeWordRecognition) {
    this.createRecognition = createRecognition;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this.startRecognition();
  }

  stop(): void {
    this.active = false;
    this.pendingCommand = null;
    const recognition = this.recognition;
    this.recognition = null;
    if (!recognition) return;

    try {
      recognition.cancel();
    } catch (error) {
      this.emitError(
        error instanceof Error
          ? error
          : new Error("Não foi possível interromper a palavra de ativação."),
      );
    }
  }

  isListening(): boolean {
    return this.active && this.pendingCommand === null;
  }

  onWakeWord(callback: (command: string) => void): () => void {
    this.wakeWordListeners.add(callback);
    return () => this.wakeWordListeners.delete(callback);
  }

  onError(callback: (error: Error) => void): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  private startRecognition(): void {
    if (!this.active) return;

    let recognition: WakeWordRecognition;
    try {
      recognition = this.createRecognition();
      this.recognition = recognition;
      recognition.start({
        onTranscript: () => {},
        onFinalTranscript: (transcript) => {
          const command = extractWakeWordCommand(transcript);
          if (command === null || !this.active) return;
          this.pendingCommand = command;
          recognition.stop();
        },
        onError: (error) => {
          if (!this.active || this.pendingCommand !== null || isNoSpeechError(error)) return;
          this.active = false;
          this.emitError(error);
        },
        onEnd: () => {
          if (this.recognition !== recognition) return;
          this.recognition = null;
          if (this.pendingCommand !== null) {
            const command = this.pendingCommand;
            this.pendingCommand = null;
            this.active = false;
            for (const listener of this.wakeWordListeners) listener(command);
            return;
          }
          if (this.active) this.startRecognition();
        },
      });
    } catch (error) {
      this.active = false;
      if (this.recognition) {
        this.recognition = null;
      }
      this.emitError(
        error instanceof Error
          ? error
          : new Error("Não foi possível iniciar a palavra de ativação."),
      );
    }
  }

  private emitError(error: Error): void {
    for (const listener of this.errorListeners) listener(error);
  }
}
