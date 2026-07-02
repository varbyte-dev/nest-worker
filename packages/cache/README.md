# @varbyte/nest-worker-cache 🗄️

> Caching middleware for [@varbyte/nest-worker](https://github.com/varbyte-dev/nest-worker) — Cloudflare Cache API and KV strategies.

[![npm version](https://img.shields.io/npm/v/@varbyte/nest-worker-cache)](https://www.npmjs.com/package/@varbyte/nest-worker-cache)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- **Cloudflare Cache API** — Edge caching with no extra cost
- **KV Cache** — Persistent, configurable caching for dynamic content
- **Custom TTL** — Per-route or global expiration
- **Custom Cache Keys** — Derive keys from request URL, headers, or params
- **Cache Invalidation** — By header or explicit API
- **Stale-while-revalidate** — Serve stale data while fetching fresh content

## Installation

```bash
npm install @varbyte/nest-worker-cache
```

## Quick Start

### Global middleware (all GET responses)

```ts
import { cacheMiddleware } from '@varbyte/nest-worker-cache';
import { createApplication } from '@varbyte/nest-worker';

const app = createApplication(AppModule);

// Cache all GET responses for 1 hour via Cloudflare Cache API
app.use(cacheMiddleware({ ttl: 3600 }));

export default app.handler;
```

### Per-route with custom key and KV backend

```ts
import { cacheMiddleware } from '@varbyte/nest-worker-cache';
import { Controller, Get, UseMiddleware } from '@varbyte/nest-worker';

@Controller('products')
export class ProductsController {
  @Get()
  @UseMiddleware(cacheMiddleware({
    ttl: 60,
    storage: 'kv',
    kvBinding: 'PRODUCTS_CACHE',
    keyBy: (req) => `/products${req.url.search}`,
  }))
  async getAll() {
    // This response will be cached in KV for 60 seconds
    return { data: await fetch('https://api.example.com/products') };
  }
}
```

### Using `withCache` for precise control

```ts
import { withCache } from '@varbyte/nest-worker-cache';

export default {
  async fetch(req, env, ctx) {
    return withCache(req, env, ctx, { ttl: 3600 }, async () => {
      return app.handler(req, env, ctx);
    });
  },
};
```

### Cache invalidation

```ts
import { invalidateCache } from '@varbyte/nest-worker-cache';

// Invalidate a specific URL in the cache
await invalidateCache(env, '/products/123', 'kv', 'PRODUCTS_CACHE');

// Or send a request with x-cache-invalidate header
// GET /products/123 with header: x-cache-invalidate: true
```

## API Reference

### `cacheMiddleware(options?)`

Creates a MiddlewareFn that caches responses based on the given options.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `ttl` | `number` | `3600` | Time-to-live in seconds |
| `storage` | `'cache-api' \| 'kv'` | `'cache-api'` | Cache storage backend |
| `keyBy` | `(req) => string` | `(req) => req.url` | Custom cache key function |
| `kvBinding` | `string` | — | KV namespace binding name (required for `kv` storage) |
| `cacheableStatuses` | `number[]` | `[200]` | Only cache these status codes |
| `staleWhileRevalidate` | `boolean` | `false` | Enable stale-while-revalidate |
| `methods` | `string[]` | `['GET']` | HTTP methods to cache |

### `withCache(req, env, ctx, options, handler)`

Wraps a response producer with caching logic.

### `invalidateCache(env, url, storage?, kvBinding?)`

Explicitly invalidates a cached entry.

## Strategies

### Cache API (`'cache-api'`)

Uses `caches.default` to store responses at the Cloudflare edge. Fastest option, no additional cost.

### KV (`'kv'`)

Uses a KV namespace for persistent caching. Requires a KV namespace binding in `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "PRODUCTS_CACHE"
id = "YOUR_KV_NAMESPACE_ID"
```

## License

MIT © [Daniel Vargas](https://github.com/varbyte-dev)
