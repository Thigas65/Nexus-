import assert from "node:assert/strict";
import test from "node:test";
import { BrowserVoiceRecognitionService } from "./VoiceRecognitionService.ts";

class FakeRecognition {
  onresult = null;
  onerror = null;
  onend = null;

  start() {}
  stop() {}
  abort() {}

  emitResult(transcript, isFinal) {
    const result = Object.assign([{ transcript }], { isFinal });
    this.onresult?.({ results: [result] });
  }
}

test("reports interim and final transcripts separately", () => {
  const recognition = new FakeRecognition();
  const service = new BrowserVoiceRecognitionService(() => recognition);
  const interimTranscripts = [];
  const finalTranscripts = [];
  service.start({
    onTranscript: (transcript) => interimTranscripts.push(transcript),
    onFinalTranscript: (transcript) => finalTranscripts.push(transcript),
    onError: (error) => assert.fail(error.message),
    onEnd: () => {},
  });

  recognition.emitResult("Nexus", false);
  recognition.emitResult("N.E.X.U.S.", true);

  assert.deepEqual(interimTranscripts, ["Nexus", "N.E.X.U.S."]);
  assert.deepEqual(finalTranscripts, ["N.E.X.U.S."]);
});

test("maps browser errors to clear messages while preserving their codes", () => {
  const recognition = new FakeRecognition();
  const service = new BrowserVoiceRecognitionService(() => recognition);
  let reportedError;
  service.start({
    onTranscript: () => {},
    onError: (error) => {
      reportedError = error;
    },
    onEnd: () => {},
  });

  recognition.onerror?.({ error: "network" });

  assert.match(reportedError.message, /conexão de rede/);
  assert.equal(reportedError.code, "network");
});
