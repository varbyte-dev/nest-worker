import { MiddlewareFn } from '@varbyte/nest-worker';
import type {
  AuthGuardOptions,
  MultiStrategyAuthOptions,
} from './types';
import { jwtAuth } from './strategies/jwt';
import { cfAccessAuth } from './strategies/cf-access';
import { apiKeyAuth } from './strategies/api-key';

// ─── AuthGuard Factory ─────────────────────────────────────────────────────

/**
 * Create an authentication guard middleware for `@varbyte/nest-worker`.
 *
 * Supports three authentication strategies out of the box:
 * - **JWT** — Verify HS256/RS256/ES256 bearer tokens using Web Crypto API.
 * - **Cloudflare Access** — Verify CF Access JWTs via JWKS endpoint.
 * - **API Key** — Simple API key check via request header.
 *
 * @example
 * ```ts
 * import { AuthGuard, getAuthUser } from '@nest-worker/auth';
 * import { Controller, Get, Req } from '@varbyte/nest-worker';
 *
 * // Single strategy
 * @UseMiddleware(AuthGuard.jwt({ secret: 'my-secret' }))
 *
 * // Multi-strategy (any one must pass)
 * @UseMiddleware(AuthGuard({
 *   strategies: [
 *     { strategy: 'jwt', secret: 'my-secret' },
 *     { strategy: 'api-key', key: 'sk-123' },
 *   ],
 *   mode: 'any',
 * }))
 *
 * // Multi-strategy (all must pass)
 * @UseMiddleware(AuthGuard({
 *   strategies: [
 *     { strategy: 'jwt', secretEnvKey: 'JWT_SECRET' },
 *     { strategy: 'api-key', keyEnvKey: 'API_KEY' },
 *   ],
 *   mode: 'all',
 * }))
 * ```
 */
export function AuthGuard(
  options: AuthGuardOptions | MultiStrategyAuthOptions,
): MiddlewareFn {
  // Single strategy mode
  if ('strategy' in options) {
    return createStrategy(options);
  }

  // Multi-strategy mode
  const { strategies, mode = 'any' } = options;

  if (strategies.length === 0) {
    throw new Error('AuthGuard requires at least one strategy');
  }

  if (strategies.length === 1) {
    return createStrategy(strategies[0]);
  }

  const middlewares = strategies.map(createStrategy);

  return async (req, env, ctx) => {
    const results = await Promise.all(
      middlewares.map(async (mw) => {
        try {
          const result = await mw(req, env, ctx);
          return { passed: result === undefined || result === void 0, response: result };
        } catch {
          return { passed: false, response: undefined };
        }
      }),
    );

    if (mode === 'all') {
      // All must pass (no response returned)
      const failed = results.find((r) => !r.passed);
      if (failed?.response) return failed.response;
      if (failed) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized', message: 'Authentication failed' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return; // All passed
    }

    // 'any' mode — at least one must pass
    const passed = results.find((r) => r.passed);
    if (passed) return; // At least one passed

    // All failed — return first error response, or generic 401
    const firstError = results.find((r) => r.response);
    return (
      firstError?.response ||
      new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'All authentication strategies failed' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    );
  };
}

// ─── Strategy Factory ──────────────────────────────────────────────────────

function createStrategy(options: AuthGuardOptions): MiddlewareFn {
  switch (options.strategy) {
    case 'jwt':
      return jwtAuth(options);
    case 'cf-access':
      return cfAccessAuth(options);
    case 'api-key':
      return apiKeyAuth(options);
    default:
      throw new Error(
        `Unknown auth strategy: ${(options as any).strategy}. ` +
        `Supported strategies: jwt, cf-access, api-key`,
      );
  }
}

// ─── Named strategy exports (convenience) ──────────────────────────────────

AuthGuard.jwt = jwtAuth;
AuthGuard.cfAccess = cfAccessAuth;
AuthGuard.apiKey = apiKeyAuth;
