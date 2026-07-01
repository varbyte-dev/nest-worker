import { MiddlewareFn } from '@varbyte/nest-worker';
import type { AuthUser, ApiKeyAuthOptions } from '../types';
import { setAuthUser } from '../get-user';

// ─── API Key Strategy Middleware Factory ───────────────────────────────────

/**
 * Create an auth middleware that validates an API key from a request header.
 *
 * Supports static keys and environment-bound keys.
 *
 * @param options - API Key verification options.
 *
 * @example
 * ```ts
 * import { AuthGuard, getAuthUser } from '@nest-worker/auth';
 *
 * // With a static key
 * @UseMiddleware(AuthGuard.apiKey({ key: 'sk-secret-key-123' }))
 *
 * // With an environment binding
 * @UseMiddleware(AuthGuard.apiKey({
 *   header: 'X-API-Key',
 *   keyEnvKey: 'API_KEY',
 * }))
 * ```
 */
export function apiKeyAuth(options: ApiKeyAuthOptions): MiddlewareFn {
  const {
    header = 'X-API-Key',
    key: staticKey,
    keyEnvKey,
  } = options;

  if (!staticKey && !keyEnvKey) {
    throw new Error(
      'AuthGuard.apiKey() requires either `key` or `keyEnvKey` option',
    );
  }

  return (req, env, _ctx) => {
    const apiKey = req.headers.get(header);

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: 'Unauthorized',
          message: `Missing API key header: ${header}`,
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const expectedKey = staticKey || (keyEnvKey ? (env[keyEnvKey] as string) : null);

    if (!expectedKey) {
      return new Response(
        JSON.stringify({
          error: 'Internal Server Error',
          message: 'API key not configured',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Support comma-separated multiple keys (for key rotation)
    const validKeys = expectedKey.split(',').map((k) => k.trim());

    if (!validKeys.includes(apiKey)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden', message: 'Invalid API key' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── Build user ────────────────────────────────────────────────
    // API keys don't have a standard identity, so we create a basic one
    const user: AuthUser = {
      id: apiKey.slice(0, 8) + '...',
      name: `API Key (${header})`,
      strategy: 'api-key',
    };

    setAuthUser(req, user);
  };
}
