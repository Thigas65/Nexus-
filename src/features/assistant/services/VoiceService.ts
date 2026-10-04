export interface VoiceServiceHandlers {
  onTranscript: (transcript: string) => void;
  onFinalTranscript?: (transcript: string) => void;
  onStart?: () => void;
  onError: (error: Error) => void;
  onEnd: () => void;
}

export interface VoiceService {
  isSupported(): boolean;
  isListening(): boolean;
  startListening(handlers: VoiceServiceHandlers): void;
  stopListening(): void;
  cancel(): void;
}
