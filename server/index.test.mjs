import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createTcpServer } from "node:net";
import test from "node:test";

async function getAvailablePort() {
  const server = createTcpServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  await new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
  return port;
}

test("returns a safe configuration error when the Gemini key is absent", async (context) => {
  const port = await getAvailablePort();
  const env = { ...process.env, HOST: "127.0.0.1", NODE_ENV: "test", PORT: String(port) };
  delete env.GEMINI_API_KEY;

  const server = spawn(process.execPath, ["server/index.mjs"], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "ignore", "ignore"],
  });
  context.after(() => {
    server.kill("SIGTERM");
  });

  const baseUrl = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 50 && !ready; attempt += 1) {
    if (server.exitCode !== null) {
      assert.fail("backend exited before it was ready");
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) });
      ready = response.ok;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  assert.equal(ready, true, "backend did not become ready");

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "Olá", context: [] }),
  });
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(typeof body.error, "string");
  assert.match(body.error, /não está configurada no servidor/);
  assert.equal(JSON.stringify(body).includes("test-key"), false);
});
