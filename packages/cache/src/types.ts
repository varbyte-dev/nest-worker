import type { MiddlewareFn } from '@varbyte/nest-worker';

// ─── Cache Storage Strategies ────────────────────────────────────────────

/**
 * Supported cache storage backends.
 * - `"cache-api"` — Cloudflare Cache API (edge cache, no extra cost)
 * - `"kv"` — Cloudflare KV (persistent, configurable, for dynamic content)
 */
export type CacheStorage = 'cache-api' | 'kv';

// ─── Cache Middleware Options ────────────────────────────────────────────

export interface CacheMiddlewareOptions {
  /**
   * Time-to-live in seconds. Default: 3600 (1 hour).
   */
  ttl?: number;

  /**
   * Cache storage backend. Default: `"cache-api"`.
   */
  storage?: CacheStorage;

  /**
   * Custom function to derive the cache key from the request.
   * Default: `(req) => req.url`.
   */
  keyBy?: (req: Request) => string;

  /**
   * KV namespace binding name (only required when `storage: "kv"`).
   * Example: `"PRODUCTS_CACHE"`.
   */
  kvBinding?: string;

  /**
   * Only cache responses whose status code matches one of these values.
   * Default: `[200]`.
   */
  cacheableStatuses?: number[];

  /**
   * Enable stale-while-revalidate pattern.
   * If `true`, serves stale cached data while fetching fresh data in the
   * background. Default: `false`.
   */
  staleWhileRevalidate?: boolean;

  /**
   * Request methods to cache. Default: `["GET"]`.
   */
  methods?: string[];
}

// ─── Cache Entry (KV storage) ────────────────────────────────────────────

export interface CacheEntry {
  /**
   * HTTP status code.
   */
  status: number;

  /**
   * Response headers as a record.
   */
  headers: Record<string, string>;

  /**
   * Response body as text (base64-encoded for binary data).
   */
  body: string;

  /**
   * When the entry was created (epoch ms).
   */
  createdAt: number;

  /**
   * TTL in seconds.
   */
  ttl: number;
}

// ─── Cache Strategy Interface ────────────────────────────────────────────

export interface CacheStrategy {
  /**
   * Retrieve a cached response for the given key.
   * Returns `null` if not found or expired.
   */
  get(key: string): Promise<Response | null>;

  /**
   * Store a response in the cache.
   */
  set(key: string, response: Response, ttl: number): Promise<void>;

  /**
   * Delete a cached entry by key.
   */
  delete(key: string): Promise<void>;

  /**
   * Check if the strategy is available in the current environment.
   */
  isAvailable(): boolean;
}
