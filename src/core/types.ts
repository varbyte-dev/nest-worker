export type HttpMethod =
  "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "HEAD";

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handlerName: string;
  middlewares?: MiddlewareFn[];
  isWebSocket?: boolean;
}

export type MiddlewareFn = (
  req: Request,
  env: Record<string, unknown>,
  ctx: ExecutionContext,
) => Promise<Response | void> | Response | void;

export interface PipeContext {
  request: Request;
  env: Record<string, unknown>;
  ctx: ExecutionContext;
  params: Record<string, string>;
  parameters: ParamMetadata[];
  route: RouteDefinition;
}

export type PipeFn = (
  args: unknown[],
  context: PipeContext,
) => Promise<unknown[] | void> | unknown[] | void;

export interface ErrorFilterContext {
  request: Request;
  env: Record<string, unknown>;
  ctx: ExecutionContext;
}

export type ErrorFilterFn = (
  error: unknown,
  context: ErrorFilterContext,
) => Promise<Response | void> | Response | void;

export type InjectionToken = string | symbol | (new (...args: any[]) => any);

export interface ParamMetadata {
  index: number;
  type: "body" | "param" | "query" | "header" | "request" | "env" | "db";
  key?: string;
}

export interface ControllerMetadata {
  prefix: string;
  routes: RouteDefinition[];
  params: Map<string, ParamMetadata[]>;
  middlewares: MiddlewareFn[];
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<D1ExecResult>;
  dump(): Promise<ArrayBuffer>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(colName?: string): Promise<T | null>;
  run<T = unknown>(): Promise<D1Result<T>>;
  all<T = unknown>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  error?: string;
  meta: {
    duration: number;
    last_row_id?: number;
    changes?: number;
    served_by?: string;
    internal_stats?: unknown;
  };
}

export interface D1ExecResult {
  count: number;
  duration: number;
}

/**
 * Sanitize a SQL identifier (column name, table name, alias) against injection.
 * Only allows alphanumeric characters and underscores.
 */
export function sanitizeIdentifier(id: string): string {
  if (!id) throw new Error("SQL identifier cannot be empty");
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    throw new Error(`Invalid SQL identifier: "${id}"`);
  }
  return id;
}
