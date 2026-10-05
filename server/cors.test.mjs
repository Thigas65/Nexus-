import assert from "node:assert/strict";
import test from "node:test";
import { getCorsDecision, parseAllowedOrigins } from "./cors.mjs";

test("allows the official Pages origin and local development origins by default", () => {
  assert.deepEqual([...parseAllowedOrigins(undefined)], [
    "https://thigas65.github.io",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost",
  ]);
});

test("limits the default production CORS origin to the official Pages domain", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    assert.deepEqual([...parseAllowedOrigins(undefined)], ["https://thigas65.github.io"]);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
  }
});

test("accepts exact web origins and rejects wildcard or non-origin values", () => {
  assert.deepEqual([...parseAllowedOrigins("https://nexus.example, https://localhost")], [
    "https://nexus.example",
    "https://localhost",
  ]);
  assert.throws(() => parseAllowedOrigins("*"), /Invalid CORS origin/);
  assert.throws(() => parseAllowedOrigins("https://nexus.example/path"), /Invalid CORS origin/);
  assert.throws(() => parseAllowedOrigins("capacitor://localhost"), /Invalid CORS origin/);
});

test("allows same-origin or originless server requests without adding CORS headers", () => {
  const allowedOrigins = parseAllowedOrigins("https://nexus.example");
  assert.deepEqual(getCorsDecision({}, allowedOrigins), { allowed: true, headers: {} });
  assert.deepEqual(getCorsDecision({ origin: "" }, allowedOrigins), { allowed: true, headers: {} });
});

test("returns CORS headers only for an exact allowed origin", () => {
  const allowedOrigins = parseAllowedOrigins("https://nexus.example");
  assert.deepEqual(getCorsDecision({ origin: "https://nexus.example" }, allowedOrigins), {
    allowed: true,
    headers: {
      "Access-Control-Allow-Origin": "https://nexus.example",
      Vary: "Origin",
    },
  });
  assert.deepEqual(
    getCorsDecision({ origin: "https://attacker.example" }, allowedOrigins),
    { allowed: false, headers: {} },
  );
});

test("limits preflight to supported methods and content-type", () => {
  const allowedOrigins = parseAllowedOrigins("https://nexus.example");
  assert.deepEqual(
    getCorsDecision({
      origin: "https://nexus.example",
      requestedMethod: "POST",
      requestedHeaders: "content-type",
    }, allowedOrigins),
    {
      allowed: true,
      headers: {
        "Access-Control-Allow-Origin": "https://nexus.example",
        Vary: "Origin",
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "600",
      },
    },
  );
  assert.equal(
    getCorsDecision({
      origin: "https://nexus.example",
      requestedMethod: "DELETE",
    }, allowedOrigins).allowed,
    false,
  );
  assert.equal(
    getCorsDecision({
      origin: "https://nexus.example",
      requestedMethod: "POST",
      requestedHeaders: "authorization",
    }, allowedOrigins).allowed,
    false,
  );
});
