import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RateLimitGuard } from '../src/rate-limit';
import { memoryStrategy } from '../src/strategies/memory';

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/test', { headers });
}

function mockEnv(bindings: Record<string, unknown> = {}): Record<string, unknown> {
  return bindings;
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('@nest-worker/rate-limit', () => {
  describe('RateLimitGuard (memory)', () => {
    it('should allow requests under the limit', async () => {
      const req = mockRequest({ 'CF-Connecting-IP': '1.2.3.4' });
      const mw = RateLimitGuard({ windowMs: 60000, max: 5 });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeUndefined(); // Not rate limited
    });

    it('should block requests over the limit', async () => {
      const req = mockRequest({ 'CF-Connecting-IP': '1.2.3.5' });
      const mw = RateLimitGuard({ windowMs: 60000, max: 3 });

      // First 3 requests should pass
      expect(await mw(req, mockEnv(), mockCtx())).toBeUndefined();
      expect(await mw(req, mockEnv(), mockCtx())).toBeUndefined();
      expect(await mw(req, mockEnv(), mockCtx())).toBeUndefined();

      // 4th request should be blocked
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(429);
    });

    it('should include Retry-After header when rate limited', async () => {
      const req = mockRequest({ 'CF-Connecting-IP': '1.2.3.6' });
      const mw = RateLimitGuard({ windowMs: 60000, max: 1 });

      await mw(req, mockEnv(), mockCtx()); // First request passes
      const result = await mw(req, mockEnv(), mockCtx()); // Second blocked

      expect(result).toBeInstanceOf(Response);
      expect(result!.headers.get('Retry-After')).toBeTruthy();
      expect(result!.headers.get('X-RateLimit-Limit')).toBe('1');
      expect(result!.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('should reset after the window expires', async () => {
      const req = mockRequest({ 'CF-Connecting-IP': '1.2.3.7' });

      // Use a very short window (10ms)
      const mw = RateLimitGuard({ windowMs: 50, max: 1 });

      // First request passes
      expect(await mw(req, mockEnv(), mockCtx())).toBeUndefined();

      // Second blocked
      const blocked = await mw(req, mockEnv(), mockCtx());
      expect(blocked).toBeInstanceOf(Response);
      expect(blocked!.status).toBe(429);

      // Wait for window to expire
      await new Promise((r) => setTimeout(r, 60));

      // Should pass again
      expect(await mw(req, mockEnv(), mockCtx())).toBeUndefined();
    });

    it('should isolate different IPs', async () => {
      const req1 = mockRequest({ 'CF-Connecting-IP': '1.1.1.1' });
      const req2 = mockRequest({ 'CF-Connecting-IP': '2.2.2.2' });
      const mw = RateLimitGuard({ windowMs: 60000, max: 1 });

      // Both pass on first request
      expect(await mw(req1, mockEnv(), mockCtx())).toBeUndefined();
      expect(await mw(req2, mockEnv(), mockCtx())).toBeUndefined();

      // Both blocked on second request
      expect(await mw(req1, mockEnv(), mockCtx())).toBeInstanceOf(Response);
      expect(await mw(req2, mockEnv(), mockCtx())).toBeInstanceOf(Response);
    });

    it('should use custom key extractor', async () => {
      const req = mockRequest({ 'X-API-Key': 'key-123' });
      const mw = RateLimitGuard({
        windowMs: 60000,
        max: 1,
        keyBy: (r) => r.headers.get('X-API-Key') || 'unknown',
      });

      expect(await mw(req, mockEnv(), mockCtx())).toBeUndefined();
      const blocked = await mw(req, mockEnv(), mockCtx());
      expect(blocked).toBeInstanceOf(Response);
      expect(blocked!.status).toBe(429);
    });

    it('should use custom status code', async () => {
      const req = mockRequest({ 'CF-Connecting-IP': '1.2.3.8' });
      const mw = RateLimitGuard({ windowMs: 60000, max: 1, statusCode: 503 });

      await mw(req, mockEnv(), mockCtx());
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(503);
    });

    it('should use custom error message (string)', async () => {
      const req = mockRequest({ 'CF-Connecting-IP': '1.2.3.9' });
      const mw = RateLimitGuard({
        windowMs: 60000,
        max: 1,
        message: 'Custom rate limit message',
      });

      await mw(req, mockEnv(), mockCtx());
      const result = await mw(req, mockEnv(), mockCtx());
      const body = await result!.text();
      expect(body).toBe('Custom rate limit message');
    });
  });

  describe('memoryStrategy', () => {
    it('should allow requests under max', async () => {
      const strategy = memoryStrategy();
      const result = await strategy.increment('test-key', 60000, 10);
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
      expect(result.remaining).toBe(9);
    });

    it('should block after exceeding max', async () => {
      const strategy = memoryStrategy();
      const key = 'block-test';

      await strategy.increment(key, 60000, 2);
      await strategy.increment(key, 60000, 2);
      const result = await strategy.increment(key, 60000, 2);
      expect(result.allowed).toBe(false);
      expect(result.count).toBe(3);
      expect(result.remaining).toBe(0);
    });

    it('should reset a key', async () => {
      const strategy = memoryStrategy();
      const key = 'reset-test';

      await strategy.increment(key, 60000, 1);
      await strategy.reset(key);
      const result = await strategy.increment(key, 60000, 1);
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
    });

    it('should start a new window after expiry', async () => {
      const strategy = memoryStrategy();
      const key = 'expiry-test';

      // Very short window (50ms)
      await strategy.increment(key, 50, 1);
      const blocked = await strategy.increment(key, 50, 1);
      expect(blocked.allowed).toBe(false);

      // Wait for window to expire
      await new Promise((r) => setTimeout(r, 60));

      const result = await strategy.increment(key, 50, 1);
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(1);
    });
  });

  describe('RateLimitGuard (kv)', () => {
    it('should throw if kvBinding is missing', async () => {
      const req = mockRequest();
      const mw = RateLimitGuard({ storage: 'kv' as any });

      await expect(mw(req, mockEnv(), mockCtx())).rejects.toThrow('kvBinding');
    });

    it('should throw if KV namespace is not in env', async () => {
      const req = mockRequest();
      const mw = RateLimitGuard({ storage: 'kv' as any, kvBinding: 'RATE_LIMIT' });

      await expect(mw(req, mockEnv(), mockCtx())).rejects.toThrow('not found in environment');
    });
  });
});
