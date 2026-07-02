import type { MiddlewareFn } from '@varbyte/nest-worker';

// ─── Rate Limit Strategy Interface ─────────────────────────────────────────

/**
 * Strategy for counting and limiting requests.
 */
export interface RateLimitStrategy {
  /**
   * Increment the counter for a given key and return the current count
   * along with the remaining TTL for the window.
   */
  increment(key: string, windowMs: number, max: number): Promise<RateLimitResult>;

  /**
   * Reset the counter for a given key.
   */
  reset(key: string): Promise<void>;
}

/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  /** Current request count in the window */
  count: number;
  /** Whether the request is allowed (count <= max) */
  allowed: boolean;
  /** Remaining time-to-live for the window in seconds */
  ttl: number;
  /** Remaining requests before hitting the limit */
  remaining: number;
}

// ─── Storage backends ──────────────────────────────────────────────────────

/** Supported rate limit storage backends */
export type RateLimitStorage = 'memory' | 'kv';

// ─── Rate Limit Guard Options ─────────────────────────────────────────────

/**
 * Configuration for the rate limit guard middleware.
 */
export interface RateLimitGuardOptions {
  /**
   * Time window in milliseconds. Default: `60000` (1 minute).
   */
  windowMs?: number;

  /**
   * Maximum number of requests allowed within the window. Default: `60`.
   */
  max?: number;

  /**
   * Custom function to derive the rate limit key from the request.
   * Default: uses `CF-Connecting-IP` header, falling back to `X-Forwarded-For`,
   * then `"anonymous"`.
   */
  keyBy?: (req: Request) => string;

  /**
   * Storage backend. Default: `"memory"`.
   * Use `"kv"` for production with Cloudflare KV namespace.
   */
  storage?: RateLimitStorage;

  /**
   * KV namespace binding name (required when `storage: "kv"`).
   * Example: `"RATE_LIMIT"`.
   */
  kvBinding?: string;

  /**
   * HTTP status code to return when rate limited. Default: `429`.
   */
  statusCode?: number;

  /**
   * Response body when rate limited.
   * Can be a string (plain text) or an object (JSON).
   * Default: `{ error: "Too Many Requests", statusCode: 429 }`.
   */
  message?: string | Record<string, unknown>;
}
