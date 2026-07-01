// ─── Auth User ──────────────────────────────────────────────────────────────

/**
 * Authenticated user information extracted from credentials.
 *
 * This is stored per-request and accessible via `getAuthUser()` in your handler.
 */
export interface AuthUser {
  /** Unique identifier (sub claim or API key identifier) */
  id: string;
  /** Human-readable name, if available */
  name?: string;
  /** Email address, if available */
  email?: string;
  /** Roles/permissions granted to the user */
  roles?: string[];
  /** Raw payload from the authentication source (JWT claims, etc.) */
  raw?: Record<string, unknown>;
  /** Which strategy authenticated this request */
  strategy: AuthStrategy;
}

// ─── Strategy Types ─────────────────────────────────────────────────────────

/** Supported authentication strategies */
export type AuthStrategy = 'jwt' | 'cf-access' | 'api-key';

// ─── Strategy-Specific Options ──────────────────────────────────────────────

/** JWT verification options */
export interface JwtAuthOptions {
  strategy: 'jwt';

  /**
   * Shared secret for HS256, or PEM-encoded public key for RS256/ES256.
   * Alternatively, set `secretEnvKey` to load from env.
   */
  secret?: string;

  /**
   * Environment binding name for the secret.
   * E.g. `"JWT_SECRET"` to read from `env.JWT_SECRET`.
   */
  secretEnvKey?: string;

  /**
   * Expected algorithm. Default: `"HS256"`.
   */
  algorithm?: 'HS256' | 'RS256' | 'ES256';

  /**
   * Expected issuer (`iss` claim). Optional.
   */
  issuer?: string;

  /**
   * Expected audience (`aud` claim). Optional.
   */
  audience?: string;

  /**
   * Clock tolerance in seconds. Default: `30`.
   */
  clockTolerance?: number;
}

/** Cloudflare Access JWT verification options */
export interface CfAccessAuthOptions {
  strategy: 'cf-access';

  /**
   * Your Cloudflare Access team domain.
   * E.g. `"my-team.cloudflareaccess.com"`
   */
  teamDomain: string;

  /**
   * Expected audience tag (AUD) from the Access application.
   * You can find this in the Access app configuration.
   */
  audience: string;

  /**
   * Clock tolerance in seconds. Default: `30`.
   */
  clockTolerance?: number;
}

/** API Key verification options */
export interface ApiKeyAuthOptions {
  strategy: 'api-key';

  /**
   * Header name to read the API key from. Default: `"X-API-Key"`.
   */
  header?: string;

  /**
   * The expected API key value.
   * Mutually exclusive with `keyEnvKey`.
   */
  key?: string;

  /**
   * Environment binding name that holds the expected API key.
   * E.g. `"API_KEY"` to read from `env.API_KEY`.
   * Mutually exclusive with `key`.
   */
  keyEnvKey?: string;
}

// ─── Combined Auth Options ──────────────────────────────────────────────────

/**
 * Options for a single-strategy auth guard.
 */
export type AuthGuardOptions =
  | JwtAuthOptions
  | CfAccessAuthOptions
  | ApiKeyAuthOptions;

/**
 * Options for a multi-strategy auth guard.
 */
export interface MultiStrategyAuthOptions {
  /**
   * List of strategy options to try.
   */
  strategies: AuthGuardOptions[];

  /**
   * How to evaluate multiple strategies:
   * - `"any"` — pass if ANY strategy succeeds (default)
   * - `"all"` — pass if ALL strategies succeed
   */
  mode?: 'any' | 'all';
}
