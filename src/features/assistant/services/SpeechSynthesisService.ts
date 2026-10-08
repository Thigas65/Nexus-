export interface SpeechSynthesisHandlers {
  onStart: () => void;
  onEnd: () => void;
  onError: (error: Error) => void;
  onBoundary?: (intensity: number) => void;
}

function estimateWordIntensity(text: string): number {
  const vowels = text.match(/[aeiouáéíóúâêôãõ]/gi)?.length ?? 0;
  const punctuation = /[,.!?;:]$/.test(text) ? 0.1 : 0;
  return Math.max(0.18, Math.min(0.9, 0.22 + Math.min(vowels, 5) * 0.12 - punctuation));
}

export function prepareTextForSpeech(text: string): string {
  return text.replace(/\bN\s*\.?\s*E\s*\.?\s*X\s*\.?\s*U\s*\.?\s*S\.?(?![\p{L}\p{N}])/giu, "Nexus");
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
    const content = prepareTextForSpeech(text).trim();
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
    utterance.onboundary = (event) => {
      if (this.activeUtterance !== utterance || event.name === "sentence") return;
      const remainingText = content.slice(event.charIndex);
      const word =
        event.charLength > 0
          ? content.slice(event.charIndex, event.charIndex + event.charLength)
          : remainingText.split(/\s/, 1)[0];
      if (word) handlers.onBoundary?.(estimateWordIntensity(word));
    };
    utterance.onend = () => {
      if (this.activeUtterance !== utterance) return;
      this.activeUtterance = null;
      handlers.onBoundary?.(0);
      handlers.onEnd();
    };
    utterance.onerror = (event) => {
      if (this.activeUtterance !== utterance) return;
      this.activeUtterance = null;
      handlers.onBoundary?.(0);
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
