import { MiddlewareFn } from '@varbyte/nest-worker';
import type { AuthUser, CfAccessAuthOptions } from '../types';
import { setAuthUser } from '../get-user';

// ─── Types for CF Access JWKS ──────────────────────────────────────────────

interface Jwk {
  kid: string;
  kty: string;
  alg: string;
  use: string;
  n?: string;   // RSA modulus
  e?: string;   // RSA exponent
  crv?: string;  // EC curve
  x?: string;   // EC x coordinate
  y?: string;   // EC y coordinate
}

interface CertsResponse {
  keys: Jwk[];
}

// ─── JWKS Cache ────────────────────────────────────────────────────────────

let cachedKeys: { keys: Map<string, Jwk>; expiresAt: number } | null = null;

/**
 * Fetch and cache Cloudflare Access public keys (JWKS).
 * Keys are cached for 1 hour by default.
 */
async function fetchPublicKeys(teamDomain: string): Promise<Map<string, Jwk>> {
  if (cachedKeys && cachedKeys.expiresAt > Date.now()) {
    return cachedKeys.keys;
  }

  const url = `https://${teamDomain}/cdn-cgi/access/certs`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch CF Access certs: ${response.status}`);
  }

  const data: CertsResponse = await response.json();
  const keys = new Map<string, Jwk>();

  for (const key of data.keys) {
    if (key.use === 'sig') {
      keys.set(key.kid, key);
    }
  }

  cachedKeys = { keys, expiresAt: Date.now() + 3_600_000 }; // 1 hour
  return keys;
}

// ─── JWK → CryptoKey conversion ────────────────────────────────────────────

/**
 * Import an RSA public key from JWK format.
 */
async function importRsaKey(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      n: jwk.n,
      e: jwk.e,
      alg: jwk.alg,
    },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
}

/**
 * Import an EC public key from JWK format.
 */
async function importEcKey(jwk: Jwk): Promise<CryptoKey> {
  const namedCurve = jwk.crv === 'P-384' ? 'P-384' : 'P-256';
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: jwk.kty,
      crv: jwk.crv,
      x: jwk.x,
      y: jwk.y,
    },
    { name: 'ECDSA', hash: 'SHA-256', namedCurve },
    false,
    ['verify'],
  );
}

// ─── JWT helpers (reused from jwt.ts but kept independent) ─────────────────

function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function decodeJson<T = Record<string, unknown>>(input: string): T {
  const bytes = base64UrlDecode(input);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

function signingInput(token: string): string {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  return `${parts[0]}.${parts[1]}`;
}

function signatureBytes(token: string): Uint8Array {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');
  return base64UrlDecode(parts[2]);
}

// ─── CF Access Strategy Middleware Factory ─────────────────────────────────

/**
 * Create an auth middleware that validates a Cloudflare Access JWT.
 *
 * Fetches the JWKS from your team domain and verifies the signature using
 * Web Crypto API. Certs are cached for 1 hour.
 *
 * @param options - Cloudflare Access verification options.
 *
 * @example
 * ```ts
 * import { AuthGuard, getAuthUser } from '@nest-worker/auth';
 *
 * // Protect a route with Cloudflare Access
 * @Get('/admin')
 * @UseMiddleware(AuthGuard.cfAccess({
 *   teamDomain: 'my-team.cloudflareaccess.com',
 *   audience: '12a345b6c7d8e9f0a1b2c3d4e5f6a7b8',
 * }))
 * getAdmin() {
 *   // User info available via getAuthUser(req)
 * }
 * ```
 */
export function cfAccessAuth(options: CfAccessAuthOptions): MiddlewareFn {
  const { teamDomain, audience, clockTolerance = 30 } = options;

  return async (req, _env, _ctx) => {
    // ── Extract token ─────────────────────────────────────────────
    // CF Access sends the JWT in the `Cf-Access-Jwt-Assertion` header
    // or the `Authorization` header as a Bearer token.
    const token =
      req.headers.get('Cf-Access-Jwt-Assertion') ||
      (req.headers.get('Authorization')?.startsWith('Bearer ')
        ? req.headers.get('Authorization')!.slice(7)
        : null);

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Missing Cloudflare Access token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── Decode header and payload ─────────────────────────────────
    let payload: Record<string, unknown>;
    let header: { kid: string; alg: string };

    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      header = decodeJson<{ kid: string; alg: string }>(parts[0]);
      payload = decodeJson(parts[1]);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid token format' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── Check expiration ─────────────────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && (payload.exp as number) < now - clockTolerance) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Token expired' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── Check audience ───────────────────────────────────────────
    const tokenAud = payload.aud;
    const audiences = Array.isArray(tokenAud) ? tokenAud : [tokenAud];
    if (!audiences.includes(audience)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Invalid token audience' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── Verify signature ─────────────────────────────────────────
    try {
      const keys = await fetchPublicKeys(teamDomain);
      const jwk = keys.get(header.kid);

      if (!jwk) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized', message: 'Unknown signing key' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }

      const key = jwk.kty === 'EC'
        ? await importEcKey(jwk)
        : await importRsaKey(jwk);

      const algorithm = jwk.kty === 'EC'
        ? { name: 'ECDSA' as const, hash: 'SHA-256' as const, namedCurve: (jwk.crv === 'P-384' ? 'P-384' : 'P-256') as 'P-256' | 'P-384' }
        : { name: 'RSASSA-PKCS1-v1_5' as const, hash: 'SHA-256' as const };

      const isValid = await crypto.subtle.verify(
        algorithm,
        key,
        signatureBytes(token),
        new TextEncoder().encode(signingInput(token)),
      );

      if (!isValid) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized', message: 'Invalid token signature' }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        );
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', message: 'Token verification failed' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // ── Build user ────────────────────────────────────────────────
    const user: AuthUser = {
      id: (payload.sub as string) || '',
      name: (payload.name as string) || (payload.preferred_username as string),
      email: (payload.email as string),
      roles: (payload.roles as string[]) || [],
      raw: payload,
      strategy: 'cf-access',
    };

    setAuthUser(req, user);
  };
}
