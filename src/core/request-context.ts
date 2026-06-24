/**
 * Request-scoped runtime state shared by core routing and bundled extras.
 *
 * Core owns this boundary so application/router code does not depend on
 * optional middleware implementations.
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

export function startRequestLogging(
  req: Request,
  state: RequestLoggerState,
): void {
  requestLoggerMap.set(req, state);
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

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function defaultFormatError(
  error: unknown,
): RequestLogError | undefined {
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

export function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
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
