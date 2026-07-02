import type { RateLimitStrategy, RateLimitResult } from '../types';

// ─── KV rate limit entry ───────────────────────────────────────────────────

interface KvEntry {
  /** Current request count */
  count: number;
  /** Window expiration timestamp (epoch ms) */
  expiresAt: number;
}

// ─── KV Strategy ───────────────────────────────────────────────────────────

/**
 * Cloudflare KV-based rate limit strategy.
 *
 * Provides persistent rate limit counters across edge locations.
 * Uses KV's built-in TTL for automatic expiration.
 *
 * **Note:** KV is eventually consistent, so there may be slight
 * over-counting under high concurrency. For precise limits, consider
 * using Durable Objects.
 *
 * @param kvNamespace - The KV namespace binding.
 *
 * @example
 * ```ts
 * import { kvStrategy } from '@nest-worker/rate-limit';
 *
 * // In your worker:
 * const strategy = kvStrategy(env.RATE_LIMIT);
 * const result = await strategy.increment('user:123', 60000, 100);
 * ```
 */
export function kvStrategy(kvNamespace: KVNamespace): RateLimitStrategy {
  return {
    async increment(key: string, windowMs: number, max: number): Promise<RateLimitResult> {
      const now = Date.now();
      const prefixedKey = `ratelimit:${key}`;

      // Try to get existing entry
      let entry: KvEntry | null = null;
      try {
        const raw = await kvNamespace.get(prefixedKey, 'text');
        if (raw) {
          entry = JSON.parse(raw) as KvEntry;
        }
      } catch {
        // Ignore parse errors, treat as new entry
      }

      // No entry or window expired — start new window
      if (!entry || now > entry.expiresAt) {
        const ttlSec = Math.ceil(windowMs / 1000);
        const newEntry: KvEntry = { count: 1, expiresAt: now + windowMs };

        await kvNamespace.put(prefixedKey, JSON.stringify(newEntry), {
          expirationTtl: ttlSec,
        });

        return {
          count: 1,
          allowed: true,
          ttl: ttlSec,
          remaining: max - 1,
        };
      }

      // Existing window — increment
      entry.count++;
      const ttlSec = Math.max(0, Math.ceil((entry.expiresAt - now) / 1000));

      // Write back updated count, refreshing TTL
      await kvNamespace.put(prefixedKey, JSON.stringify(entry), {
        expirationTtl: Math.max(1, ttlSec),
      });

      return {
        count: entry.count,
        allowed: entry.count <= max,
        ttl: ttlSec,
        remaining: Math.max(0, max - entry.count),
      };
    },

    async reset(key: string): Promise<void> {
      const prefixedKey = `ratelimit:${key}`;
      try {
        await kvNamespace.delete(prefixedKey);
      } catch {
        // Ignore delete errors
      }
    },
  };
}
