import type { RateLimitStrategy, RateLimitResult } from '../types';

// ─── In-memory store entry ─────────────────────────────────────────────────

interface WindowEntry {
  count: number;
  resetAt: number;
}

// ─── In-memory Strategy ────────────────────────────────────────────────────

/**
 * In-memory rate limit strategy.
 *
 * Stores counters in a Map, automatically cleaning up expired entries.
 * Suitable for development, single-isolate, or low-traffic scenarios.
 *
 * **Note:** Cloudflare Workers isolates are recycled frequently, so in-memory
 * state is not durable. Use the KV strategy for production.
 *
 * @example
 * ```ts
 * import { memoryStrategy } from '@nest-worker/rate-limit';
 *
 * const strategy = memoryStrategy();
 * const result = await strategy.increment('user:123', 60000, 100);
 * ```
 */
export function memoryStrategy(): RateLimitStrategy {
  const store = new Map<string, WindowEntry>();

  // Periodic cleanup every 60 seconds
  let cleanupTimer: ReturnType<typeof setInterval> | null = null;

  function startCleanup(): void {
    if (cleanupTimer) return;
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (now > entry.resetAt) {
          store.delete(key);
        }
      }
      // If store is empty, stop the timer
      if (store.size === 0 && cleanupTimer) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
    }, 60_000);
  }

  return {
    async increment(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
      const now = Date.now();
      const entry = store.get(key);

      // No existing entry or window expired — start new window
      if (!entry || now > entry.resetAt) {
        const newEntry: WindowEntry = { count: 1, resetAt: now + windowMs };
        store.set(key, newEntry);
        startCleanup();
        return {
          count: 1,
          allowed: true,
          ttl: Math.ceil(windowMs / 1000),
          remaining: max - 1,
        };
      }

      // Existing window — increment
      entry.count++;
      const ttl = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));

      return {
        count: entry.count,
        allowed: entry.count <= max,
        ttl,
        remaining: Math.max(0, max - entry.count),
      };
    },

    async reset(key: string): Promise<void> {
      store.delete(key);
    },
  };
}
