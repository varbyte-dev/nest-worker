import { MiddlewareFn } from "@varbyte/nest-worker";
import type { AuthUser, JwtAuthOptions } from "../types";
import { setAuthUser } from "../get-user";

// ─── JWT Utilities (pure JS, uses Web Crypto) ──────────────────────────────

/**
 * Base64-url decode a string.
 */
function base64UrlDecode(input: string): Uint8Array {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

/**
 * Base64-url encode a Uint8Array.
 */
function base64UrlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode a JSON payload from a base64url-encoded string.
 */
function decodeJson<T = Record<string, unknown>>(input: string): T {
  const bytes = base64UrlDecode(input);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text);
}

/**
 * Decode the JWT header without verification.
 */
function decodeHeader(token: string): {
  alg: string;
  kid?: string;
  typ?: string;
} {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  return decodeJson(parts[0]);
}

/**
 * Decode the JWT payload without verification.
 */
function decodePayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  return decodeJson(parts[1]);
}

/**
 * Get the signing input (header.payload) from a JWT.
 */
function signingInput(token: string): string {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  return `${parts[0]}.${parts[1]}`;
}

/**
 * Get the signature bytes from a JWT.
 */
function signatureBytes(token: string): Uint8Array {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT format");
  return base64UrlDecode(parts[2]);
}

/**
 * Import a secret key for HMAC verification.
 */
async function importHmacKey(secret: string): Promise<CryptoKey> {
  const keyData = new TextEncoder().encode(secret);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

/**
 * Import a PEM-encoded public key for RSA/EC verification.
 */
async function importPublicKey(pem: string, alg: string): Promise<CryptoKey> {
  const pemHeader = "-----BEGIN PUBLIC KEY-----";
  const pemFooter = "-----END PUBLIC KEY-----";
  const pemContent = pem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  const keyData = Uint8Array.from(atob(pemContent), (c) => c.charCodeAt(0));

  const algorithm =
    alg.startsWith("RS") || alg.startsWith("PS")
      ? { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }
      : {
          name: "ECDSA",
          hash: "SHA-256",
          namedCurve: alg === "ES256" ? "P-256" : "P-384",
        };

  return crypto.subtle.importKey("spki", keyData, algorithm, false, ["verify"]);
}

// ─── JWT Strategy Middleware Factory ────────────────────────────────────────

/**
 * Create an auth middleware that validates a JWT bearer token.
 *
 * Supports HS256, RS256, and ES256 algorithms using Web Crypto API.
 * No external dependencies required.
 *
 * @param options - JWT verification options.
 *
 * @example
 * ```ts
 * import { AuthGuard } from '@nest-worker/auth';
 * import { getAuthUser } from '@nest-worker/auth';
 *
 * // Per-route protection
 * @Get('/profile')
 * @UseMiddleware(AuthGuard.jwt({ secret: 'my-secret' }))
 * getProfile() {
 *   // Access user via getAuthUser(req) — requires @Req() injection
 * }
 *
 * // With env-based secret
 * @UseMiddleware(AuthGuard.jwt({
 *   secretEnvKey: 'JWT_SECRET',
 *   issuer: 'https://auth.example.com',
 *   audience: 'my-api',
 * }))
 * ```
 */
export function jwtAuth(options: JwtAuthOptions): MiddlewareFn {
  const {
    secret: staticSecret,
    secretEnvKey,
    algorithm = "HS256",
    issuer,
    audience,
    clockTolerance = 30,
  } = options;

  return async (req, env, _ctx) => {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Missing or invalid Authorization header",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const token = authHeader.slice(7);

    // ── Decode without verification first ────────────────────────────
    let payload: Record<string, unknown>;
    let header: { alg: string; kid?: string };

    try {
      header = decodeHeader(token);
      payload = decodePayload(token);
    } catch {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Invalid JWT format",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Check expiration ────────────────────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && (payload.exp as number) < now - clockTolerance) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Token expired" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Check not-before ────────────────────────────────────────────
    if (payload.nbf && (payload.nbf as number) > now + clockTolerance) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Token not yet valid",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Check issuer ────────────────────────────────────────────────
    if (issuer && payload.iss !== issuer) {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Invalid token issuer",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Check audience ──────────────────────────────────────────────
    if (audience) {
      const tokenAud = payload.aud;
      const audiences = Array.isArray(tokenAud) ? tokenAud : [tokenAud];
      if (!audiences.includes(audience)) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
            message: "Invalid token audience",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // ── Verify signature ────────────────────────────────────────────
    try {
      const secret =
        staticSecret ||
        (secretEnvKey ? (env[secretEnvKey] as string) : undefined);
      if (!secret) {
        return new Response(
          JSON.stringify({
            error: "Internal Server Error",
            message: "JWT secret not configured",
          }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      const alg = algorithm || header.alg;
      const key =
        alg === "HS256"
          ? await importHmacKey(secret)
          : await importPublicKey(secret, alg);

      const isValid = await crypto.subtle.verify(
        alg === "HS256"
          ? { name: "HMAC", hash: "SHA-256" }
          : { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        key,
        signatureBytes(token),
        new TextEncoder().encode(signingInput(token)),
      );

      if (!isValid) {
        return new Response(
          JSON.stringify({
            error: "Unauthorized",
            message: "Invalid token signature",
          }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
    } catch {
      return new Response(
        JSON.stringify({
          error: "Unauthorized",
          message: "Token verification failed",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // ── Build user and attach to context ────────────────────────────
    const user: AuthUser = {
      id: (payload.sub as string) || "",
      name: (payload.name as string) || (payload.preferred_username as string),
      email: payload.email as string,
      roles:
        (payload.roles as string[]) ||
        ((payload as any).realm_access?.roles as string[]),
      raw: payload,
      strategy: "jwt",
    };

    setAuthUser(req, user);
  };
}
