# @nest-worker/rate-limit

**Rate limiting middleware for `@varbyte/nest-worker`** — Protect your APIs with configurable rate limits using in-memory or Cloudflare KV storage.

## Features

- 🛡️ **Request throttling** — Limit requests per time window per client
- 💾 **In-memory storage** — Simple, fast, no dependencies (for development)
- ☁️ **KV storage** — Persistent across edge locations (for production)
- 🔑 **Custom key extractor** — IP, API key, user ID, or any request attribute
- 📋 **Standard headers** — `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- ⚙️ **Configurable** — Window size, max requests, status code, error message
- 🧩 **Per-route or global** — Use as middleware on specific routes or app-wide

## Installation

```bash
pnpm add @nest-worker/rate-limit
```

## Quick Start

### 1. In-memory (development)

```ts
import { RateLimitGuard } from '@nest-worker/rate-limit';
import { Controller, Get, UseMiddleware } from '@varbyte/nest-worker';

@Controller()
class ApiController {
  @Get('/api')
  @UseMiddleware(RateLimitGuard({
    windowMs: 60_000, // 1 minute
    max: 100,         // 100 requests per minute
  }))
  getData() {
    return { ok: true };
  }
}
```

### 2. KV-backed (production)

```ts
import { createApplication } from '@varbyte/nest-worker';
import { RateLimitGuard } from '@nest-worker/rate-limit';

const app = createApplication(AppModule);

// Global rate limit using KV
app.use(RateLimitGuard({
  windowMs: 60_000,
  max: 1000,
  storage: 'kv',
  kvBinding: 'RATE_LIMIT',  // Must match your wrangler.toml binding
}));

export default app.handler;
```

### 3. Custom key extractor

```ts
// Rate limit by API key
@UseMiddleware(RateLimitGuard({
  max: 30,
  keyBy: (req) => req.headers.get('X-API-Key') || 'anonymous',
}))

// Rate limit by user ID from JWT
@UseMiddleware(RateLimitGuard({
  max: 50,
  keyBy: (req) => {
    const user = getAuthUser(req);
    return user?.id || 'anonymous';
  },
}))
```

### 4. Custom error response

```ts
// Custom JSON response
@UseMiddleware(RateLimitGuard({
  max: 5,
  message: { error: 'Slow down!', code: 'RATE_LIMITED' },
  statusCode: 429,
}))

// Custom plain text response
@UseMiddleware(RateLimitGuard({
  max: 5,
  message: 'Too many requests, please try again later.',
}))
```

## API Reference

### `RateLimitGuard(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `windowMs` | `number` | `60000` | Time window in milliseconds |
| `max` | `number` | `60` | Max requests per window |
| `keyBy` | `(req) => string` | IP-based | Custom key extractor |
| `storage` | `'memory' \| 'kv'` | `'memory'` | Storage backend |
| `kvBinding` | `string` | — | KV namespace binding name (required for `kv`) |
| `statusCode` | `number` | `429` | HTTP status when rate limited |
| `message` | `string \| object` | `{ error: "Too Many Requests" }` | Response body when rate limited |

### `memoryStrategy()`

Creates a standalone in-memory strategy. Useful for testing or custom usage.

```ts
import { memoryStrategy } from '@nest-worker/rate-limit';

const strategy = memoryStrategy();
const result = await strategy.increment('user:123', 60000, 100);
// { count: 1, allowed: true, ttl: 60, remaining: 99 }
```

### `kvStrategy(kvNamespace)`

Creates a standalone KV strategy. Requires a `KVNamespace` binding.

```ts
import { kvStrategy } from '@nest-worker/rate-limit';

const strategy = kvStrategy(env.RATE_LIMIT);
const result = await strategy.increment('user:123', 60000, 100);
```

## Response Headers

When rate limited, the middleware returns:

| Header | Description |
|--------|-------------|
| `Retry-After` | Seconds until the window resets |
| `X-RateLimit-Limit` | Max requests per window |
| `X-RateLimit-Remaining` | Remaining requests (`0` when blocked) |
| `X-RateLimit-Reset` | Unix timestamp when the window resets |

## How it works

1. The `RateLimitGuard` middleware extracts a unique key from each request (default: client IP)
2. It increments a counter for that key in the configured storage backend
3. If the counter exceeds `max`, it returns `429 Too Many Requests` with standard rate limit headers
4. After the `windowMs` period, the counter resets automatically
