import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import {
  BrowserWakeWordService,
  extractWakeWordCommand,
} from "./WakeWordService.ts";

class FakeRecognition {
  handlers;
  stopped = false;
  cancelled = false;

  start(handlers) {
    this.handlers = handlers;
  }

  stop() {
    this.stopped = true;
    this.handlers.onEnd();
  }

  cancel() {
    this.cancelled = true;
  }

  finalize(transcript) {
    this.handlers.onFinalTranscript?.(transcript);
  }
}

function createHarness(factory = () => new FakeRecognition()) {
  const recognitions = [];
  const service = new BrowserWakeWordService(() => {
    const recognition = factory();
    recognitions.push(recognition);
    return recognition;
  });
  return { service, recognitions };
}

test("creates a wake-word service and starts listening only when requested", () => {
  const { service, recognitions } = createHarness();
  assert.equal(service.isListening(), false);
  assert.equal(recognitions.length, 0);

  service.start();
  assert.equal(service.isListening(), true);
  assert.equal(recognitions.length, 1);
});

test("detects natural wake-word spellings and removes activation punctuation", () => {
  assert.equal(extractWakeWordCommand("N.E.X.U.S."), "");
  assert.equal(extractWakeWordCommand("nexus!"), "");
  assert.equal(extractWakeWordCommand("Nexus, que horas são?"), "que horas são?");
  assert.equal(extractWakeWordCommand("n.e.x.u.s. Explique isso"), "Explique isso");
  assert.equal(extractWakeWordCommand("NEXUSAURUS, olá"), null);
  assert.equal(extractWakeWordCommand("Diga nexus, por favor"), null);
});

test("calls wake-word listeners after stopping recognition and returns only the command", () => {
  const { service, recognitions } = createHarness();
  let detectedCommand;
  service.onWakeWord((command) => {
    detectedCommand = command;
  });

  service.start();
  recognitions[0].finalize("N.E.X.U.S., que horas são?");

  assert.equal(recognitions[0].stopped, true);
  assert.equal(service.isListening(), false);
  assert.equal(detectedCommand, "que horas são?");
});

test("stop cancels recognition and clears the listening state", () => {
  const { service, recognitions } = createHarness();
  service.start();
  service.stop();

  assert.equal(recognitions[0].cancelled, true);
  assert.equal(service.isListening(), false);
});

test("a cancelled recognition cycle cannot restart over a newer one", () => {
  const { service, recognitions } = createHarness();
  service.start();
  const cancelledRecognition = recognitions[0];
  service.stop();
  service.start();

  cancelledRecognition.handlers.onEnd();

  assert.equal(recognitions.length, 2);
  assert.equal(service.isListening(), true);
});

test("restarts after an empty recognition cycle and ignores no-speech errors", () => {
  const { service, recognitions } = createHarness();
  service.start();
  recognitions[0].handlers.onError(Object.assign(new Error("sem fala"), { code: "no-speech" }));
  recognitions[0].handlers.onEnd();

  assert.equal(recognitions.length, 2);
  assert.equal(service.isListening(), true);
});

test("reports recognition failures and stops listening", () => {
  const { service, recognitions } = createHarness();
  let reportedError;
  service.onError((error) => {
    reportedError = error;
  });
  service.start();
  recognitions[0].handlers.onError(new Error("Falha de rede."));

  assert.equal(reportedError.message, "Falha de rede.");
  assert.equal(service.isListening(), false);
});

test("reports browsers without recognition support without throwing", () => {
  const { service } = createHarness(() => {
    throw new Error("O reconhecimento de voz não é compatível com este navegador.");
  });
  let reportedError;
  service.onError((error) => {
    reportedError = error;
  });

  assert.doesNotThrow(() => service.start());
  assert.equal(reportedError.message, "O reconhecimento de voz não é compatível com este navegador.");
  assert.equal(service.isListening(), false);
});

test("keeps the text chat independent and includes no embedded API key in frontend source", async () => {
  const repositoryRoot = new URL("../../../../", import.meta.url);
  const chatPanelPath = new URL("../components/ChatPanel.tsx", import.meta.url);
  const chatPanel = await readFile(chatPanelPath, "utf8");
  assert.match(chatPanel, /assistantService\.sendMessage\(content, context\)/);
  assert.match(chatPanel, /onSubmit=\{handleSubmit\}/);

  async function readFrontendFiles(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const contents = [];
    for (const entry of entries) {
      const path = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) {
        contents.push(...(await readFrontendFiles(path)));
      } else if (/\.(?:ts|tsx|js|jsx)$/.test(entry.name)) {
        contents.push(await readFile(path, "utf8"));
      }
    }
    return contents;
  }

  const frontendSource = (await readFrontendFiles(new URL("src/", repositoryRoot))).join("\n");
  assert.doesNotMatch(frontendSource, /AIza[0-9A-Za-z_-]{30,}/);
});
