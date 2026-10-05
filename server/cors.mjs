const OFFICIAL_ORIGIN = "https://thigas65.github.io";
const DEFAULT_DEVELOPMENT_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://localhost",
];

const allowedMethods = new Set(["GET", "POST"]);
const allowedHeaders = new Set(["content-type"]);

export function parseAllowedOrigins(value = process.env.CORS_ALLOWED_ORIGINS) {
  const origins = value === undefined
    ? [
        OFFICIAL_ORIGIN,
        ...(process.env.NODE_ENV === "production" ? [] : DEFAULT_DEVELOPMENT_ORIGINS),
      ]
    : value.split(",").map((origin) => origin.trim()).filter(Boolean);

  for (const origin of origins) {
    let parsedOrigin;
    try {
      parsedOrigin = new URL(origin);
    } catch {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }

    if (!["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
      throw new Error(`Invalid CORS origin: ${origin}`);
    }
  }

  return new Set(origins);
}

export function getCorsDecision(
  { origin, requestedMethod, requestedHeaders = "" },
  allowedOrigins,
) {
  if (!origin) return { allowed: true, headers: {} };
  if (!allowedOrigins.has(origin)) return { allowed: false, headers: {} };

  const headers = {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
  };

  if (!requestedMethod) return { allowed: true, headers };

  const requestedHeaderNames = requestedHeaders
    .split(",")
    .map((header) => header.trim().toLowerCase())
    .filter(Boolean);

  if (
    !allowedMethods.has(requestedMethod.toUpperCase()) ||
    requestedHeaderNames.some((header) => !allowedHeaders.has(header))
  ) {
    return { allowed: false, headers: {} };
  }

  return {
    allowed: true,
    headers: {
      ...headers,
      "Access-Control-Allow-Methods": "GET, POST",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    },
  };
}
