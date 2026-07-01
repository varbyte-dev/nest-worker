import type { AuthUser } from './types';

// ─── Per-request Auth Context ──────────────────────────────────────────────
//
// We use a WeakMap keyed on the Request object to store the authenticated user.
// This avoids polluting `env` and works within CF Workers' immutable Request model.
//
// The same Request reference flows through middleware → router → handler,
// so the WeakMap lookup always returns the correct user.

const authContext = new WeakMap<Request, AuthUser>();

/**
 * Store the authenticated user for the current request.
 *
 * Called internally by auth strategies after successful authentication.
 *
 * @internal
 */
export function setAuthUser(req: Request, user: AuthUser): void {
  authContext.set(req, user);
}

/**
 * Retrieve the authenticated user for the current request.
 *
 * Call this from your controller/handler after applying `AuthGuard` middleware.
 * Returns `undefined` if the request has not been authenticated.
 *
 * @example
 * ```ts
 * import { Controller, Get, Req } from '@varbyte/nest-worker';
 * import { getAuthUser } from '@nest-worker/auth';
 *
 * @Controller()
 * class ProfileController {
 *   @Get('/profile')
 *   getProfile(@Req() req: Request) {
 *     const user = getAuthUser(req);
 *     return { user };
 *   }
 * }
 * ```
 */
export function getAuthUser<T extends AuthUser = AuthUser>(
  req: Request,
): T | undefined {
  return authContext.get(req) as T | undefined;
}

/**
 * Remove the authenticated user from the request context.
 *
 * Useful for cleanup in testing or after logout flows.
 *
 * @internal
 */
export function clearAuthUser(req: Request): void {
  authContext.delete(req);
}
