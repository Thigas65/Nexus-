import { BrowserVoiceRecognitionService } from "./VoiceRecognitionService";
import { BrowserWakeWordService } from "./WakeWordService";
import type { VoiceService } from "./VoiceService";
import type { WakeWordService } from "./WakeWordService";

export function createVoiceService(): VoiceService {
  return new BrowserVoiceRecognitionService();
}

export function createWakeWordService(): WakeWordService {
  return new BrowserWakeWordService(() => new BrowserVoiceRecognitionService());
}
