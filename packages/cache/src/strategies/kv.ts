import type { CacheEntry, CacheStrategy } from '../types';

/**
 * Cloudflare KV strategy.
 *
 * Stores serialized responses in a KV namespace.
 * Useful for persistent, configurable caching of dynamic content.
 *
 * @example
 * ```ts
 * const strategy = new KvCacheStrategy(env, 'PRODUCTS_CACHE');
 * await strategy.set('my-key', new Response('ok'), 3600);
 * const cached = await strategy.get('my-key');
 * ```
 */
export class KvCacheStrategy implements CacheStrategy {
  private namespace: KVNamespace | null = null;

  /**
   * @param env - Cloudflare Worker env object.
   * @param bindingName - KV namespace binding name (e.g. `"PRODUCTS_CACHE"`).
   */
  constructor(
    env: Record<string, unknown>,
    bindingName: string,
  ) {
    const ns = env[bindingName];
    if (ns && typeof (ns as KVNamespace).get === 'function') {
      this.namespace = ns as KVNamespace;
    }
  }

  async get(key: string): Promise<Response | null> {
    if (!this.namespace) return null;
    try {
      const raw = await this.namespace.get(key, 'text');
      if (!raw) return null;

      const entry: CacheEntry = JSON.parse(raw);

      // Check expiration
      const elapsed = (Date.now() - entry.createdAt) / 1000;
      if (elapsed >= entry.ttl) {
        await this.delete(key);
        return null;
      }

      // Decode body and reconstruct response
      const body = entry.body
        ? new Uint8Array(
            atob(entry.body)
              .split('')
              .map((c) => c.charCodeAt(0)),
          )
        : new Uint8Array(0);

      return new Response(body, {
        status: entry.status,
        headers: {
          ...entry.headers,
          'x-cache': 'HIT',
          'x-cache-strategy': 'kv',
        },
      });
    } catch {
      return null;
    }
  }

  async set(key: string, response: Response, ttl: number): Promise<void> {
    if (!this.namespace) return;
    try {
      const body = await response.clone().text();
      const headers: Record<string, string> = {};
      response.headers.forEach((value, name) => {
        if (!name.startsWith('x-cache')) {
          headers[name] = value;
        }
      });

      const entry: CacheEntry = {
        status: response.status,
        headers,
        body: btoa(body),
        createdAt: Date.now(),
        ttl,
      };

      // KV TTL is in seconds; add a small buffer
      await this.namespace.put(key, JSON.stringify(entry), {
        expirationTtl: ttl + 60,
      });
    } catch {
      // Silently fail
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.namespace) return;
    try {
      await this.namespace.delete(key);
    } catch {
      // Silently fail
    }
  }

  isAvailable(): boolean {
    return this.namespace !== null;
  }
}
