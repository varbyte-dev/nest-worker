import { MiddlewareFn } from "../core/types";

// ─── CORS Middleware ──────────────────────────────────────────────

/**
 * WeakMap to associate CORS response headers with each request.
 * Cleaner than mutating the Request object with a non-standard property.
 */
const corsHeadersMap = new WeakMap<Request, Record<string, string>>();

export function setCorsHeaders(
  req: Request,
  headers: Record<string, string>,
): void {
  corsHeadersMap.set(req, headers);
}

export function getCorsHeaders(
  req: Request,
): Record<string, string> | undefined {
  return corsHeadersMap.get(req);
}

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

export interface RequestLogEntry {
  timestamp: string;
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  error?: RequestLogError;
}

export interface RequestLogError {
  name: string;
  message?: string;
  statusCode?: number;
  cause?: string;
}

export interface RequestLoggerOptions {
  /**
   * Header used to read and return the request id.
   *
   * Defaults to X-Request-Id.
   */
  requestIdHeader?: string;
  generateRequestId?: () => string;
  json?: boolean;
  includeError?: boolean;
  formatError?: (error: unknown) => RequestLogError | undefined;
  sink?: (entry: RequestLogEntry) => void;
}

interface RequestLoggerState {
  requestId: string;
  requestIdHeader: string;
  startedAt: number;
  method: string;
  path: string;
  json: boolean;
  includeError: boolean;
  formatError: (error: unknown) => RequestLogError | undefined;
  sink?: (entry: RequestLogEntry) => void;
  error?: unknown;
}

const requestLoggerMap = new WeakMap<Request, RequestLoggerState>();

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

    requestLoggerMap.set(req, {
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

export function setRequestLogError(req: Request, error: unknown): void {
  const state = requestLoggerMap.get(req);
  if (state) state.error = error;
}

export function finalizeRequestLogging(
  req: Request,
  response: Response,
): Response {
  const state = requestLoggerMap.get(req);
  if (!state) return response;

  requestLoggerMap.delete(req);
  const completedAt = now();
  const entry: RequestLogEntry = {
    timestamp: new Date().toISOString(),
    requestId: state.requestId,
    method: state.method,
    path: state.path,
    status: response.status,
    durationMs: Math.max(0, Math.round(completedAt - state.startedAt)),
  };
  if (state.includeError && state.error !== undefined) {
    const error = state.formatError(state.error);
    if (error) entry.error = error;
  }

  const loggedResponse = new Response(response.body, response);
  loggedResponse.headers.set(state.requestIdHeader, state.requestId);

  try {
    writeRequestLog(entry, state);
  } catch (error) {
    console.error("requestLogger sink failed", error);
  }

  return loggedResponse;
}

function writeRequestLog(
  entry: RequestLogEntry,
  state: RequestLoggerState,
): void {
  if (state.sink) {
    state.sink(entry);
    return;
  }

  if (state.json) {
    console.log(JSON.stringify(entry));
    return;
  }

  console.log(
    `[${entry.timestamp}] ${entry.requestId} ${entry.method} ${entry.path} ${entry.status} ${entry.durationMs}ms`,
  );
}

function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function defaultFormatError(error: unknown): RequestLogError | undefined {
  if (error instanceof Error) {
    const formatted: RequestLogError = {
      name: error.name || "Error",
      message: error.message,
    };
    const statusCode = getStatusCode(error);
    if (statusCode !== undefined) formatted.statusCode = statusCode;
    const cause = formatCause(error);
    if (cause !== undefined) formatted.cause = cause;
    return formatted;
  }

  if (error === undefined || error === null) {
    return { name: String(error) };
  }

  return {
    name: "NonError",
    message: String(error),
  };
}

function getStatusCode(error: Error): number | undefined {
  const maybeStatusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof maybeStatusCode === "number" ? maybeStatusCode : undefined;
}

function formatCause(error: Error): string | undefined {
  const cause = (error as { cause?: unknown }).cause;
  if (cause === undefined) return undefined;
  if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
  return String(cause);
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// ─── Bearer Token Auth Guard ──────────────────────────────────────

export interface BearerAuthOptions {
  /** Env key that holds the expected token, or a static token string */
  tokenEnvKey?: string;
  staticToken?: string;
}

export function bearerAuth(options: BearerAuthOptions = {}): MiddlewareFn {
  return (req, env, _ctx) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice(7);
    const expected =
      options.staticToken ||
      (options.tokenEnvKey ? (env[options.tokenEnvKey] as string) : null);

    if (!expected || token !== expected) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
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
