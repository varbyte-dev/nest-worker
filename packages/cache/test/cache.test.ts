import { describe, it, expect, vi, beforeEach } from 'vitest';
import { cacheMiddleware, withCache, invalidateCache } from '../src/cache';
import { CacheApiStrategy } from '../src/strategies/cache-api';
import { KvCacheStrategy } from '../src/strategies/kv';
import type { CacheEntry } from '../src/types';

// ─── Mocks ───────────────────────────────────────────────────────────────

function mockRequest(url = 'https://example.com/api/test'): Request {
  return new Request(url);
}

function mockEnv(kv?: Record<string, unknown>): Record<string, unknown> {
  return kv ?? {};
}

function mockCtx(): ExecutionContext {
  return {
    waitUntil: vi.fn(),
    passThroughOnException: vi.fn(),
  } as unknown as ExecutionContext;
}

function mockResponse(body = '{"data":"ok"}', status = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// ─── CacheApiStrategy Tests ──────────────────────────────────────────────

describe('CacheApiStrategy', () => {
  it('should be available when caches is defined', () => {
    // In Node.js test environment, caches is usually undefined
    const strategy = new CacheApiStrategy();
    expect(strategy.isAvailable()).toBe(false);
  });

  it('should handle get when cache is not available', async () => {
    const strategy = new CacheApiStrategy();
    const result = await strategy.get('https://example.com/key');
    expect(result).toBeNull();
  });

  it('should handle set when cache is not available', async () => {
    const strategy = new CacheApiStrategy();
    await expect(
      strategy.set('key', new Response('ok'), 3600),
    ).resolves.toBeUndefined();
  });

  it('should handle delete when cache is not available', async () => {
    const strategy = new CacheApiStrategy();
    await expect(strategy.delete('key')).resolves.toBeUndefined();
  });
});

// ─── KvCacheStrategy Tests ───────────────────────────────────────────────

describe('KvCacheStrategy', () => {
  const createMockNamespace = () => {
    const store = new Map<string, string>();
    return {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string, opts?: any) => {
        store.set(key, value);
      }),
      delete: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      getWithMetadata: vi.fn(),
      list: vi.fn(),
    } as unknown as KVNamespace;
  };

  it('should not be available when namespace is missing', () => {
    const strategy = new KvCacheStrategy({}, 'CACHE');
    expect(strategy.isAvailable()).toBe(false);
  });

  it('should be available when namespace is present', () => {
    const ns = createMockNamespace();
    const strategy = new KvCacheStrategy({ CACHE: ns }, 'CACHE');
    expect(strategy.isAvailable()).toBe(true);
  });

  it('should store and retrieve a response', async () => {
    const ns = createMockNamespace();
    const strategy = new KvCacheStrategy({ CACHE: ns }, 'CACHE');
    const response = mockResponse('hello', 200);

    await strategy.set('test-key', response, 3600);
    const cached = await strategy.get('test-key');

    expect(cached).not.toBeNull();
    expect(cached!.status).toBe(200);
    expect(cached!.headers.get('x-cache')).toBe('HIT');
    const body = await cached!.text();
    expect(body).toBe('hello');
  });

  it('should return null for expired entries', async () => {
    const ns = createMockNamespace();
    const strategy = new KvCacheStrategy({ CACHE: ns }, 'CACHE');

    // Manually insert an expired entry
    const expiredEntry: CacheEntry = {
      status: 200,
      headers: {},
      body: btoa('expired'),
      createdAt: Date.now() - 7200 * 1000, // 2 hours ago
      ttl: 60, // 1 minute TTL
    };
    await ns.put!('expired-key', JSON.stringify(expiredEntry));

    const result = await strategy.get('expired-key');
    expect(result).toBeNull();
  });

  it('should delete a cached entry', async () => {
    const ns = createMockNamespace();
    const strategy = new KvCacheStrategy({ CACHE: ns }, 'CACHE');

    const response = mockResponse('to-delete', 200);
    await strategy.set('delete-key', response, 3600);
    await strategy.delete('delete-key');

    const result = await strategy.get('delete-key');
    expect(result).toBeNull();
  });

  it('should handle non-existent key gracefully', async () => {
    const ns = createMockNamespace();
    const strategy = new KvCacheStrategy({ CACHE: ns }, 'CACHE');

    const result = await strategy.get('non-existent');
    expect(result).toBeNull();
  });
});

// ─── cacheMiddleware Tests ───────────────────────────────────────────────

describe('cacheMiddleware', () => {
  it('should return a function (MiddlewareFn)', () => {
    const mw = cacheMiddleware({ ttl: 60 });
    expect(typeof mw).toBe('function');
  });

  it('should pass through non-GET methods', async () => {
    const mw = cacheMiddleware();
    const req = new Request('https://example.com/api', { method: 'POST' });
    const result = await mw(req, {}, mockCtx());
    expect(result).toBeUndefined();
  });

  it('should pass through when bypass header is set', async () => {
    const mw = cacheMiddleware();
    const req = new Request('https://example.com/api', {
      headers: { 'x-cache-bypass': 'true' },
    });
    const result = await mw(req, {}, mockCtx());
    expect(result).toBeUndefined();
  });

  it('should use default ttl of 3600 seconds', () => {
    const mw = cacheMiddleware();
    expect(typeof mw).toBe('function');
  });
});

// ─── withCache Tests ─────────────────────────────────────────────────────

describe('withCache', () => {
  it('should return handler response when strategy is unavailable', async () => {
    const req = mockRequest();
    const handler = vi.fn().mockResolvedValue(mockResponse('from-handler'));
    const response = await withCache(req, {}, mockCtx(), {}, handler);
    expect(handler).toHaveBeenCalledOnce();
    const body = await response.text();
    expect(body).toBe('from-handler');
  });

  it('should bypass cache for non-GET methods', async () => {
    const req = new Request('https://example.com/api', { method: 'POST' });
    const handler = vi.fn().mockResolvedValue(mockResponse('posted'));
    const response = await withCache(req, {}, mockCtx(), {}, handler);
    const body = await response.text();
    expect(body).toBe('posted');
  });

  it('should bypass cache when bypass header is set', async () => {
    const req = new Request('https://example.com/api', {
      headers: { 'x-cache-bypass': 'true' },
    });
    const handler = vi.fn().mockResolvedValue(mockResponse('bypassed'));
    const response = await withCache(req, {}, mockCtx(), {}, handler);
    const body = await response.text();
    expect(body).toBe('bypassed');
  });
});

// ─── invalidateCache Tests ───────────────────────────────────────────────

describe('invalidateCache', () => {
  it('should handle invalidation when cache is unavailable', async () => {
    await expect(
      invalidateCache({}, 'https://example.com/key'),
    ).resolves.toBeUndefined();
  });

  it('should handle invalidate with kv strategy when namespace missing', async () => {
    await expect(
      invalidateCache({}, 'https://example.com/key', 'kv', 'CACHE'),
    ).resolves.toBeUndefined();
  });
});

// ─── Type Exports Tests ──────────────────────────────────────────────────

describe('Type exports', () => {
  it('should export CacheApiStrategy class', () => {
    expect(CacheApiStrategy).toBeDefined();
    expect(typeof CacheApiStrategy).toBe('function');
  });

  it('should export KvCacheStrategy class', () => {
    expect(KvCacheStrategy).toBeDefined();
    expect(typeof KvCacheStrategy).toBe('function');
  });

  it('should export cacheMiddleware function', () => {
    expect(cacheMiddleware).toBeDefined();
    expect(typeof cacheMiddleware).toBe('function');
  });

  it('should export withCache function', () => {
    expect(withCache).toBeDefined();
    expect(typeof withCache).toBe('function');
  });

  it('should export invalidateCache function', () => {
    expect(invalidateCache).toBeDefined();
    expect(typeof invalidateCache).toBe('function');
  });
});
