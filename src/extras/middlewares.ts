import { MiddlewareFn } from "../core/types";
import {
  createRequestId,
  defaultFormatError,
  now,
  RequestLoggerOptions,
  setCorsHeaders,
  startRequestLogging,
} from "../core/request-context";
export type {
  RequestLogEntry,
  RequestLogError,
  RequestLoggerOptions,
} from "../core/request-context";

// ─── CORS Middleware ──────────────────────────────────────────────

export interface CorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

export function cors(options: CorsOptions = {}): MiddlewareFn {
  const {
    origin = "*",
    methods = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders = ["Content-Type", "Authorization"],
    credentials = false,
    maxAge = 86400,
  } = options;

  if (credentials && origin === "*") {
    throw new Error("CORS credentials cannot be used with wildcard origin");
  }

  return (req, _env, _ctx) => {
    const requestOrigin = req.headers.get("Origin");
    const allowedOrigin = resolveAllowedOrigin(origin, requestOrigin);
    const headers: Record<string, string> = { Vary: "Origin" };

    if (allowedOrigin) {
      headers["Access-Control-Allow-Origin"] = allowedOrigin;
      headers["Access-Control-Allow-Methods"] = methods.join(", ");
      headers["Access-Control-Allow-Headers"] = allowedHeaders.join(", ");
      headers["Access-Control-Max-Age"] = String(maxAge);
      if (credentials) headers["Access-Control-Allow-Credentials"] = "true";
    }

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers });
    }

    setCorsHeaders(req, headers);
  };
}

function resolveAllowedOrigin(
  policy: NonNullable<CorsOptions["origin"]>,
  requestOrigin: string | null,
): string | undefined {
  if (policy === "*") return "*";
  if (!requestOrigin) return undefined;
  if (typeof policy === "string") {
    return policy === requestOrigin ? requestOrigin : undefined;
  }
  if (Array.isArray(policy)) {
    return policy.includes(requestOrigin) ? requestOrigin : undefined;
  }
  return policy(requestOrigin) ? requestOrigin : undefined;
}

// ─── Logger Middleware ────────────────────────────────────────────

export function logger(): MiddlewareFn {
  return async (req, _env, _ctx) => {
    const url = new URL(req.url);
    console.log(
      `[${new Date().toISOString()}] --> ${req.method} ${url.pathname}`,
    );
    // We can't intercept the response here, so we log the start only
    // For full req/res logging you can wrap the fetch handler instead
  };
}

export function requestLogger(options: RequestLoggerOptions = {}): MiddlewareFn {
  const {
    requestIdHeader = "X-Request-Id",
    generateRequestId = createRequestId,
    json = false,
    includeError = true,
    formatError = defaultFormatError,
    sink,
  } = options;

  return (req, _env, _ctx) => {
    const url = new URL(req.url);
    const requestId =
      req.headers.get(requestIdHeader) ||
      req.headers.get(requestIdHeader.toLowerCase()) ||
      generateRequestId();

    startRequestLogging(req, {
      requestId,
      requestIdHeader,
      startedAt: now(),
      method: req.method,
      path: url.pathname,
      json,
      includeError,
      formatError,
      sink,
    });
  };
}

// ─── Bearer Token Auth Guard ──────────────────────────────────────

export interface BearerAuthOptions {
  /** Env key that holds the expected token, or a static token string */
  tokenEnvKey?: string;
  staticToken?: string;
}

/**
 * Constant-time string comparison using SHA-256 digests.
 * Prevents timing attacks by ensuring comparison time does not
 * depend on how many characters match.
 */
async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const va = new Uint8Array(hashA);
  const vb = new Uint8Array(hashB);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/**
 * Build a RFC-9110-compliant 401 Unauthorized response with WWW-Authenticate header.
 * Both "missing header" and "invalid token" cases return 401, never 403.
 */
function bearerUnauthorized(errorCode = "invalid_token"): Response {
  return new Response(
    JSON.stringify({ error: "Unauthorized", statusCode: 401 }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": `Bearer error="${errorCode}"`,
      },
    },
  );
}

export function bearerAuth(options: BearerAuthOptions = {}): MiddlewareFn {
  return async (req, env, _ctx) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return bearerUnauthorized("missing_token");
    }

    const token = authHeader.slice(7);
    const expected =
      options.staticToken ||
      (options.tokenEnvKey ? (env[options.tokenEnvKey] as string) : null);

    // No secret configured or token mismatch → always 401
    if (!expected || !(await timingSafeEqualStr(token, expected))) {
      return bearerUnauthorized("invalid_token");
    }
  };
}

// ─── Development Rate Limiter (in-memory, per-IP) ────────────────

export interface RateLimitOptions {
  windowMs?: number;
  max?: number;
}

/**
 * In-memory rate limiter for local development and tests.
 *
 * This is not production-safe on Cloudflare Workers because isolate memory is
 * not durable or globally consistent. Use Durable Objects, KV, or Cloudflare
 * platform controls for production rate limiting.
 */
export function devRateLimit(options: RateLimitOptions = {}): MiddlewareFn {
  const { windowMs = 60_000, max = 60 } = options;
  const store = new Map<string, { count: number; reset: number }>();

  return (req, _env, _ctx) => {
    const ip =
      req.headers.get("CF-Connecting-IP") ||
      req.headers.get("X-Forwarded-For") ||
      "unknown";
    const now = Date.now();
    let entry = store.get(ip);

    if (!entry || now > entry.reset) {
      entry = { count: 0, reset: now + windowMs };
      store.set(ip, entry);
    }

    entry.count++;

    if (entry.count > max) {
      return new Response(JSON.stringify({ error: "Too Many Requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((entry.reset - now) / 1000)),
        },
      });
    }
  };
}

/**
 * @deprecated Use devRateLimit() to make the in-memory limitation explicit.
 */
export const rateLimit = devRateLimit;
