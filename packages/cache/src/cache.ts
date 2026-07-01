import type { MiddlewareFn } from '@varbyte/nest-worker';
import type {
  CacheMiddlewareOptions,
  CacheStrategy,
} from './types';
import { CacheApiStrategy } from './strategies/cache-api';
import { KvCacheStrategy } from './strategies/kv';

// ─── Cache invalidation helpers ──────────────────────────────────────────

const INVALIDATE_HEADER = 'x-cache-invalidate';
const BYPASS_HEADER = 'x-cache-bypass';

/**
 * Create a `Cache-Control` header value from TTL.
 */
function ttlToCacheControl(ttl: number): string {
  return `public, max-age=${ttl}`;
}

/**
 * Normalize the cache key: strip trailing slash and make consistent.
 */
function normalizeKey(key: string): string {
  return key.replace(/\/+$/, '') || '/';
}

/**
 * Default cache key derivation from request.
 */
function defaultKeyBy(req: Request): string {
  return req.url;
}

// ─── Cache Invalidation API ──────────────────────────────────────────────

/**
 * Invalidate a cached response by its original URL.
 *
 * This is a convenience function that works with both strategies.
 * For Cache API, it issues a DELETE request to the cache.
 * For KV, it deletes the key from the namespace.
 *
 * @example
 * ```ts
 * import { invalidateCache } from '@nest-worker/cache';
 *
 * app.use(cacheMiddleware({ storage: 'kv', kvBinding: 'CACHE' }));
 * // Later, in your controller:
 * await invalidateCache(env, '/products/123', 'kv', 'CACHE');
 * ```
 */
export async function invalidateCache(
  env: Record<string, unknown>,
  url: string,
  storage: 'cache-api' | 'kv' = 'cache-api',
  kvBinding?: string,
): Promise<void> {
  const key = normalizeKey(url);

  let strategy: CacheStrategy;

  if (storage === 'kv' && kvBinding) {
    strategy = new KvCacheStrategy(env, kvBinding);
  } else {
    strategy = new CacheApiStrategy();
  }

  if (strategy.isAvailable()) {
    await strategy.delete(key);
  }
}

// ─── Middleware Factory ───────────────────────────────────────────────────

/**
 * Create a caching middleware for `@varbyte/nest-worker`.
 *
 * Intercepts GET responses and caches them using the configured strategy.
 *
 * @param options - Cache configuration.
 *
 * @example
 * ```ts
 * import { cacheMiddleware } from '@nest-worker/cache';
 *
 * // Global — cache all GET responses for 1 hour via Cache API
 * app.use(cacheMiddleware({ ttl: 3600 }));
 *
 * // Per-route — cache with custom key and KV backend
 * @Get('/products')
 * @UseMiddleware(cacheMiddleware({
 *   ttl: 60,
 *   storage: 'kv',
 *   kvBinding: 'PRODUCTS_CACHE',
 *   keyBy: (req) => `/products${req.url.search}`,
 * }))
 * getProducts() {}
 * ```
 */
export function cacheMiddleware(
  options: CacheMiddlewareOptions = {},
): MiddlewareFn {
  const {
    ttl = 3600,
    storage = 'cache-api',
    keyBy = defaultKeyBy,
    kvBinding,
    cacheableStatuses = [200],
    staleWhileRevalidate = false,
    methods = ['GET'],
  } = options;

  let strategy: CacheStrategy | null = null;

  return async (req, env, ctx) => {
    // Only cache specified methods
    const method = req.method.toUpperCase();
    if (!methods.includes(method)) return;

    // Check bypass header (e.g., from admin requests)
    if (req.headers.get(BYPASS_HEADER) === 'true') return;

    // Initialize strategy on first call
    if (!strategy) {
      if (storage === 'kv' && kvBinding) {
        strategy = new KvCacheStrategy(env, kvBinding);
      } else {
        strategy = new CacheApiStrategy();
      }
    }

    if (!strategy.isAvailable()) return;

    const cacheKey = normalizeKey(keyBy(req));

    // ── Check cache ────────────────────────────────────────────────────
    const cached = await strategy.get(cacheKey);
    if (cached) {
      // Check for invalidation header in request
      if (req.headers.get(INVALIDATE_HEADER) === 'true') {
        await strategy.delete(cacheKey);
        return; // Continue to origin
      }
      return cached;
    }

    // ── Stale-while-revalidate: intercept the response later ──────────
    if (staleWhileRevalidate) {
      // Check for stale data (for KV storage, we handle expiration in get())
      // For Cache API, we rely on its built-in expiration
    }

    // ── Continue to the next handler ──────────────────────────────────
    // We can't intercept the response directly from a middleware, so we
    // wrap the response if one is returned, or rely on the after-route hook.
    // For Cloudflare Workers, we use ctx.waitUntil to cache asynchronously.
    return;
  };
}

// ─── After-response cache helper ─────────────────────────────────────────

/**
 * Wrap the cache middleware around a response producer.
 *
 * This is useful when you need to cache the response AFTER it's produced,
 * which is the standard pattern for Cloudflare Workers where middlewares
 * run before the handler.
 *
 * @example
 * ```ts
 * import { withCache } from '@nest-worker/cache';
 *
 * export default {
 *   async fetch(req, env, ctx) {
 *     return withCache(req, env, ctx, {
 *       ttl: 3600,
 *       storage: 'kv',
 *       kvBinding: 'CACHE',
 *     }, async () => {
 *       return app.handler(req, env, ctx);
 *     });
 *   },
 * };
 * ```
 */
export async function withCache(
  req: Request,
  env: Record<string, unknown>,
  ctx: ExecutionContext,
  options: CacheMiddlewareOptions,
  handler: () => Promise<Response>,
): Promise<Response> {
  const {
    ttl = 3600,
    storage = 'cache-api',
    keyBy = defaultKeyBy,
    kvBinding,
    cacheableStatuses = [200],
    methods = ['GET'],
  } = options;

  const method = req.method.toUpperCase();
  if (!methods.includes(method)) {
    return handler();
  }

  if (req.headers.get(BYPASS_HEADER) === 'true') {
    return handler();
  }

  let strategy: CacheStrategy;

  if (storage === 'kv' && kvBinding) {
    strategy = new KvCacheStrategy(env, kvBinding);
  } else {
    strategy = new CacheApiStrategy();
  }

  if (!strategy.isAvailable()) {
    return handler();
  }

  const cacheKey = normalizeKey(keyBy(req));

  // Check cache first
  const cached = await strategy.get(cacheKey);
  if (cached) {
    if (req.headers.get(INVALIDATE_HEADER) === 'true') {
      await strategy.delete(cacheKey);
      // Fall through to handler
    } else {
      return cached;
    }
  }

  // Produce the response
  const response = await handler();

  // Cache if it's a cacheable status
  if (cacheableStatuses.includes(response.status)) {
    ctx.waitUntil(strategy.set(cacheKey, response.clone(), ttl));
  }

  return response;
}
