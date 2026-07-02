import { MiddlewareFn } from '@varbyte/nest-worker';
import type { RateLimitGuardOptions, RateLimitStrategy } from './types';
import { memoryStrategy } from './strategies/memory';
import { kvStrategy } from './strategies/kv';

// ─── Default key extractor ─────────────────────────────────────────────────

function defaultKeyBy(req: Request): string {
  return (
    req.headers.get('CF-Connecting-IP') ||
    req.headers.get('X-Forwarded-For') ||
    'anonymous'
  );
}

// ─── RateLimitGuard Factory ────────────────────────────────────────────────

/**
 * Create a rate limiting middleware for `@varbyte/nest-worker`.
 *
 * Supports in-memory (development) and Cloudflare KV (production) storage.
 *
 * @param options - Rate limit configuration.
 *
 * @example
 * ```ts
 * import { RateLimitGuard } from '@nest-worker/rate-limit';
 * import { Controller, Get, UseMiddleware } from '@varbyte/nest-worker';
 *
 * // Per-route rate limit (in-memory, for development)
 * @Get('/api')
 * @UseMiddleware(RateLimitGuard({ windowMs: 60000, max: 100 }))
 * getData() {}
 *
 * // Global rate limit with KV storage
 * app.use(RateLimitGuard({
 *   windowMs: 60_000,
 *   max: 1000,
 *   storage: 'kv',
 *   kvBinding: 'RATE_LIMIT',
 * }));
 *
 * // Custom key extractor
 * @UseMiddleware(RateLimitGuard({
 *   max: 10,
 *   keyBy: (req) => req.headers.get('X-API-Key') || 'anonymous',
 * }))
 * ```
 */
export function RateLimitGuard(options: RateLimitGuardOptions = {}): MiddlewareFn {
  const {
    windowMs = 60_000,
    max = 60,
    keyBy = defaultKeyBy,
    storage = 'memory',
    kvBinding,
    statusCode = 429,
    message = { error: 'Too Many Requests', statusCode: 429 },
  } = options;

  // Initialize strategy lazily
  let strategy: RateLimitStrategy | null = null;

  function getStrategy(env: Record<string, unknown>): RateLimitStrategy {
    if (strategy) return strategy;

    if (storage === 'kv') {
      if (!kvBinding) {
        throw new Error(
          'RateLimitGuard with storage "kv" requires a `kvBinding` option. ' +
          'Example: { storage: "kv", kvBinding: "RATE_LIMIT" }',
        );
      }
      const namespace = env[kvBinding] as KVNamespace | undefined;
      if (!namespace) {
        throw new Error(
          `KV namespace "${kvBinding}" not found in environment bindings. ` +
          `Make sure it's defined in your wrangler.toml.`,
        );
      }
      strategy = kvStrategy(namespace);
    } else {
      strategy = memoryStrategy();
    }

    return strategy;
  }

  return async (req, env, ctx) => {
    const key = keyBy(req);
    const strat = getStrategy(env);

    const result = await strat.increment(key, windowMs, max);

    if (!result.allowed) {
      const body = typeof message === 'string'
        ? message
        : JSON.stringify(message);

      return new Response(body, {
        status: statusCode,
        headers: {
          'Content-Type': typeof message === 'string' ? 'text/plain' : 'application/json',
          'Retry-After': String(result.ttl),
          'X-RateLimit-Limit': String(max),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + result.ttl),
        },
      });
    }

    // Set rate limit headers on successful responses
    // We can't modify the response directly from middleware, but we set
    // headers via a custom property that the router can read.
    // For simplicity, we let the response go through and expose headers
    // via a custom mechanism.
    setRateLimitHeaders(req, max, result.remaining, result.ttl);
  };
}

// ─── Rate limit headers (per-request context) ─────────────────────────────

const RATE_LIMIT_HEADERS_KEY = Symbol('rate-limit-headers');

interface RateLimitHeaders {
  limit: number;
  remaining: number;
  reset: number;
}

/**
 * Store rate limit headers for a request (to be applied to the response later).
 *
 * @internal
 */
export function setRateLimitHeaders(
  req: Request,
  limit: number,
  remaining: number,
  ttl: number,
): void {
  (req as any)[RATE_LIMIT_HEADERS_KEY] = {
    limit,
    remaining,
    reset: Math.floor(Date.now() / 1000) + ttl,
  };
}

/**
 * Retrieve rate limit headers for a request.
 *
 * @internal
 */
export function getRateLimitHeaders(req: Request): RateLimitHeaders | undefined {
  return (req as any)[RATE_LIMIT_HEADERS_KEY];
}
