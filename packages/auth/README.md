# @nest-worker/auth

**Authentication middleware for `@varbyte/nest-worker`** — Validate JWT, Cloudflare Access, and API Key credentials with zero external dependencies.

Powered by the [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API), available natively in Cloudflare Workers.

## Features

- 🔐 **JWT** — Verify HS256, RS256, and ES256 bearer tokens
- ☁️ **Cloudflare Access** — Validate CF Access JWTs via JWKS endpoint
- 🔑 **API Key** — Simple API key authentication via request headers
- 🧩 **Multi-strategy** — Combine strategies with `any`/`all` logic
- 🧠 **Per-request context** — Access authenticated user via `getAuthUser(req)`
- ⚡ **No dependencies** — Uses Web Crypto API, no npm deps needed
- 📦 **Lightweight** — Treeshakable, ~3KB gzipped

## Installation

```bash
pnpm add @nest-worker/auth
```

## Quick Start

### 1. JWT Authentication

```ts
import { AuthGuard, getAuthUser } from '@nest-worker/auth';
import { Controller, Get, Req, UseMiddleware } from '@varbyte/nest-worker';

@Controller()
class ProfileController {
  @Get('/profile')
  @UseMiddleware(AuthGuard.jwt({ secret: process.env.JWT_SECRET }))
  getProfile(@Req() req: Request) {
    const user = getAuthUser(req);
    return { user };
  }
}
```

### 2. Cloudflare Access

```ts
import { AuthGuard } from '@nest-worker/auth';

@Get('/admin')
@UseMiddleware(AuthGuard.cfAccess({
  teamDomain: 'my-team.cloudflareaccess.com',
  audience: '12a345b6c7d8e9f0a1b2c3d4e5f6a7b8',
}))
getAdmin(@Req() req: Request) {
  const user = getAuthUser(req);
  return { admin: user };
}
```

### 3. API Key

```ts
import { AuthGuard } from '@nest-worker/auth';

// Static key
@UseMiddleware(AuthGuard.apiKey({ key: 'sk-secret-123' }))

// From environment binding
@UseMiddleware(AuthGuard.apiKey({
  header: 'X-API-Key',
  keyEnvKey: 'API_KEY',
}))

// Multiple valid keys (for rotation)
@UseMiddleware(AuthGuard.apiKey({ key: 'key1, key2, key3' }))
```

### 4. Multi-strategy

```ts
// Any strategy must pass
@UseMiddleware(AuthGuard({
  strategies: [
    { strategy: 'jwt', secretEnvKey: 'JWT_SECRET' },
    { strategy: 'api-key', keyEnvKey: 'API_KEY' },
  ],
  mode: 'any',  // default
}))

// All strategies must pass
@UseMiddleware(AuthGuard({
  strategies: [
    { strategy: 'jwt', secretEnvKey: 'JWT_SECRET' },
    { strategy: 'api-key', keyEnvKey: 'API_KEY' },
  ],
  mode: 'all',
}))
```

### 5. Global auth

```ts
import { createApplication } from '@varbyte/nest-worker';
import { AuthGuard } from '@nest-worker/auth';

const app = createApplication(AppModule);

// Protect all routes
app.use(AuthGuard.jwt({ secretEnvKey: 'JWT_SECRET' }));

export default app.handler;
```

## API Reference

### `AuthGuard.jwt(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `secret` | `string` | — | Shared secret for HS256 |
| `secretEnvKey` | `string` | — | Env binding name for the secret |
| `algorithm` | `'HS256' \| 'RS256' \| 'ES256'` | `'HS256'` | Expected algorithm |
| `issuer` | `string` | — | Expected `iss` claim |
| `audience` | `string` | — | Expected `aud` claim |
| `clockTolerance` | `number` | `30` | Clock skew tolerance (seconds) |

### `AuthGuard.cfAccess(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `teamDomain` | `string` | — | CF Access team domain (e.g. `my-team.cloudflareaccess.com`) |
| `audience` | `string` | — | Expected audience tag (AUD) |
| `clockTolerance` | `number` | `30` | Clock skew tolerance (seconds) |

### `AuthGuard.apiKey(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `header` | `string` | `'X-API-Key'` | Header name to read the API key from |
| `key` | `string` | — | The expected API key value |
| `keyEnvKey` | `string` | — | Env binding name for the expected key |

### `getAuthUser(req)`

Returns the authenticated user (`AuthUser`) or `undefined`.

```ts
interface AuthUser {
  id: string;
  name?: string;
  email?: string;
  roles?: string[];
  raw?: Record<string, unknown>;
  strategy: 'jwt' | 'cf-access' | 'api-key';
}
```

## How it works

1. The `AuthGuard` middleware intercepts the request before it reaches your handler
2. It extracts credentials from the request (Authorization header, custom header, etc.)
3. It validates the credentials using the configured strategy
4. On success, it stores the user info in a per-request context (WeakMap keyed on Request)
5. Your handler retrieves the user via `getAuthUser(req)`
6. On failure, it returns an appropriate HTTP error (401/403)
