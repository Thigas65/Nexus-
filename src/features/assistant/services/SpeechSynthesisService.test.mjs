import assert from "node:assert/strict";
import test from "node:test";
import {
  BrowserSpeechSynthesisService,
  prepareTextForSpeech,
} from "./SpeechSynthesisService.ts";

test("speaks the visual N.E.X.U.S. name as Nexus", () => {
  assert.equal(
    prepareTextForSpeech("N.E.X.U.S. está pronto, senhor."),
    "Nexus está pronto, senhor.",
  );
  assert.equal(prepareTextForSpeech('Ele disse: "N.E.X.U.S."'), 'Ele disse: "Nexus"');
  assert.equal(prepareTextForSpeech("Nexus está pronto."), "Nexus está pronto.");
  assert.equal(prepareTextForSpeech("NEXUSAURUS"), "NEXUSAURUS");
});

test("passes the spoken name to the browser synthesis API as Nexus", () => {
  const originalWindow = globalThis.window;
  const originalUtterance = globalThis.SpeechSynthesisUtterance;
  const spokenUtterances = [];

  globalThis.window = {
    speechSynthesis: {
      speak: (utterance) => spokenUtterances.push(utterance),
      cancel: () => {},
    },
  };
  globalThis.SpeechSynthesisUtterance = class {
    constructor(text) {
      this.text = text;
    }
  };

  try {
    new BrowserSpeechSynthesisService().speak("O N.E.X.U.S. está pronto.", {
      onStart: () => {},
      onEnd: () => {},
      onError: (error) => assert.fail(error.message),
    });
    assert.equal(spokenUtterances[0].text, "O Nexus está pronto.");
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
    if (originalUtterance === undefined) delete globalThis.SpeechSynthesisUtterance;
    else globalThis.SpeechSynthesisUtterance = originalUtterance;
  }
});
