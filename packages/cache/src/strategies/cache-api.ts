import type { CacheStrategy } from '../types';

/**
 * Cloudflare Cache API strategy.
 *
 * Uses the `caches.default` API to store responses at the edge.
 * This is the fastest and most cost-effective strategy.
 *
 * @example
 * ```ts
 * const strategy = new CacheApiStrategy();
 * await strategy.set('my-key', new Response('ok'), 3600);
 * const cached = await strategy.get('my-key');
 * ```
 */
export class CacheApiStrategy implements CacheStrategy {
  private cache: Cache | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    try {
      if (typeof caches !== 'undefined' && caches.default) {
        this.cache = caches.default;
      }
    } catch {
      // caches not available (e.g. local dev without Cache API)
    }
  }

  async get(key: string): Promise<Response | null> {
    if (!this.cache) return null;
    try {
      const request = new Request(key);
      const response = await this.cache.match(request);
      if (!response) return null;

      // Check if expired via custom header
      const expiresAt = response.headers.get('x-cache-expires');
      if (expiresAt && Date.now() > parseInt(expiresAt, 10)) {
        await this.delete(key);
        return null;
      }

      return response;
    } catch {
      return null;
    }
  }

  async set(key: string, response: Response, ttl: number): Promise<void> {
    if (!this.cache) return;
    try {
      const request = new Request(key);
      const expiresAt = (Date.now() + ttl * 1000).toString();

      // Clone and add expiration header
      const headers = new Headers(response.headers);
      headers.set('x-cache-expires', expiresAt);
      headers.set('x-cache', 'HIT');

      const cachedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });

      await this.cache.put(request, cachedResponse);
    } catch {
      // Silently fail — cache is optional
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.cache) return;
    try {
      const request = new Request(key);
      await this.cache.delete(request);
    } catch {
      // Silently fail
    }
  }

  isAvailable(): boolean {
    return this.cache !== null;
  }
}
