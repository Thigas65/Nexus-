export interface SpeechSynthesisHandlers {
  onStart: () => void;
  onEnd: () => void;
  onError: (error: Error) => void;
}

export class BrowserSpeechSynthesisService {
  private activeUtterance: SpeechSynthesisUtterance | null = null;

  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance !== "undefined"
    );
  }

  speak(text: string, handlers: SpeechSynthesisHandlers): void {
    const content = text.trim();
    if (!content) {
      throw new Error("Não há texto para falar.");
    }
    if (!this.isSupported()) {
      throw new Error("A síntese de voz não é compatível com este navegador.");
    }

    this.stop();

    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "pt-BR";
    utterance.onstart = () => {
      if (this.activeUtterance === utterance) handlers.onStart();
    };
    utterance.onend = () => {
      if (this.activeUtterance !== utterance) return;
      this.activeUtterance = null;
      handlers.onEnd();
    };
    utterance.onerror = (event) => {
      if (this.activeUtterance !== utterance) return;
      this.activeUtterance = null;
      if (event.error !== "canceled" && event.error !== "interrupted") {
        handlers.onError(new Error("Não foi possível reproduzir a resposta em voz."));
      } else {
        handlers.onEnd();
      }
    };

    this.activeUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  stop(): void {
    if (!this.activeUtterance || !this.isSupported()) return;
    this.activeUtterance = null;
    window.speechSynthesis.cancel();
  }
}
