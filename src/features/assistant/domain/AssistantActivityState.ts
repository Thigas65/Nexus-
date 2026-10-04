export type AssistantActivityState =
  | "idle"
  | "waiting-for-wake-word"
  | "listening"
  | "processing"
  | "speaking"
  | "paused"
  | "connecting"
  | "error";
