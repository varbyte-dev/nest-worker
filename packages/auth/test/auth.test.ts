import { describe, it, expect, beforeEach, vi } from "vitest";
import { AuthGuard } from "../src/auth";
import { getAuthUser, setAuthUser, clearAuthUser } from "../src/get-user";
import type { AuthUser } from "../src/types";

// ─── Helpers ───────────────────────────────────────────────────────────────

function mockRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/test", { headers });
}

function mockRequestWithUrl(
  url: string,
  headers: Record<string, string> = {},
): Request {
  return new Request(url, { headers });
}

function mockEnv(
  bindings: Record<string, unknown> = {},
): Record<string, unknown> {
  return bindings;
}

function mockCtx(): ExecutionContext {
  return { waitUntil: vi.fn(), passThroughOnException: vi.fn() } as any;
}

// ─── Real JWT creation (HS256) using Web Crypto ───────────────────────────

async function createJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const payloadB64 = btoa(JSON.stringify(payload))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    { name: "HMAC", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput),
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${signingInput}.${sigB64}`;
}

// ─── Tests ─────────────────────────────────────────────────────────────────

describe("@nest-worker/auth", () => {
  beforeEach(() => {
    // Reset auth context between tests
  });

  describe("AuthGuard.jwt", () => {
    it("should pass with a valid JWT", async () => {
      const req = mockRequest({
        Authorization:
          "Bearer " + (await createJwt({ sub: "user123" }, "secret123")),
      });
      const mw = AuthGuard.jwt({ secret: "secret123" });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeUndefined();
      const user = getAuthUser(req);
      expect(user).toBeDefined();
      expect(user!.id).toBe("user123");
      expect(user!.strategy).toBe("jwt");
    });

    it("should return 401 with no Authorization header", async () => {
      const req = mockRequest({});
      const mw = AuthGuard.jwt({ secret: "secret" });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(401);
    });

    it("should return 401 with non-Bearer Authorization header", async () => {
      const req = mockRequest({ Authorization: "Basic abc123" });
      const mw = AuthGuard.jwt({ secret: "secret" });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(401);
    });

    it("should return 401 with an invalid signature", async () => {
      const token = await createJwt({ sub: "user123" }, "correct-secret");
      // Tamper the signature
      const parts = token.split(".");
      const tamperedToken = `${parts[0]}.${parts[1]}.invalidsignature`;
      const req = mockRequest({ Authorization: `Bearer ${tamperedToken}` });
      const mw = AuthGuard.jwt({ secret: "different-secret" });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(401);
    });

    it("should return 401 with an expired token", async () => {
      const token = await createJwt(
        {
          sub: "user123",
          exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
        },
        "secret123",
      );
      const req = mockRequest({ Authorization: `Bearer ${token}` });
      const mw = AuthGuard.jwt({ secret: "secret123" });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(401);
    });

    it("should pass with a token that is within clock tolerance", async () => {
      const token = await createJwt(
        {
          sub: "user123",
          exp: Math.floor(Date.now() / 1000) - 20, // 20 seconds ago
        },
        "secret123",
      );
      const req = mockRequest({ Authorization: `Bearer ${token}` });
      const mw = AuthGuard.jwt({ secret: "secret123", clockTolerance: 30 });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeUndefined();
    });

    it("should reject wrong issuer", async () => {
      const token = await createJwt(
        {
          sub: "user123",
          iss: "https://wrong-issuer.com",
        },
        "secret123",
      );
      const req = mockRequest({ Authorization: `Bearer ${token}` });
      const mw = AuthGuard.jwt({
        secret: "secret123",
        issuer: "https://correct.com",
      });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(401);
    });

    it("should reject wrong audience", async () => {
      const token = await createJwt(
        {
          sub: "user123",
          aud: "wrong-api",
        },
        "secret123",
      );
      const req = mockRequest({ Authorization: `Bearer ${token}` });
      const mw = AuthGuard.jwt({
        secret: "secret123",
        audience: "correct-api",
      });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(401);
    });

    it("should read secret from env when secretEnvKey is set", async () => {
      const token = await createJwt({ sub: "user123" }, "env-secret-value");
      const req = mockRequest({ Authorization: `Bearer ${token}` });
      const mw = AuthGuard.jwt({ secretEnvKey: "JWT_SECRET" });
      const env = mockEnv({ JWT_SECRET: "env-secret-value" });
      const result = await mw(req, env, mockCtx());
      expect(result).toBeUndefined();
      const user = getAuthUser(req);
      expect(user).toBeDefined();
      expect(user!.id).toBe("user123");
    });

    it("should extract user info from JWT claims", async () => {
      const token = await createJwt(
        {
          sub: "user456",
          name: "John Doe",
          email: "john@example.com",
          roles: ["admin", "user"],
        },
        "secret123",
      );
      const req = mockRequest({ Authorization: `Bearer ${token}` });
      const mw = AuthGuard.jwt({ secret: "secret123" });
      await mw(req, mockEnv(), mockCtx());
      const user = getAuthUser(req);
      expect(user!.id).toBe("user456");
      expect(user!.name).toBe("John Doe");
      expect(user!.email).toBe("john@example.com");
      expect(user!.roles).toEqual(["admin", "user"]);
    });
  });

  describe("AuthGuard.apiKey", () => {
    it("should pass with a valid API key", async () => {
      const req = mockRequest({ "X-API-Key": "sk-secret-123" });
      const mw = AuthGuard.apiKey({ key: "sk-secret-123" });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeUndefined();
      const user = getAuthUser(req);
      expect(user).toBeDefined();
      expect(user!.strategy).toBe("api-key");
    });

    it("should return 401 with no API key header", async () => {
      const req = mockRequest({});
      const mw = AuthGuard.apiKey({ key: "sk-secret-123" });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(401);
    });

    it("should return 403 with wrong API key", async () => {
      const req = mockRequest({ "X-API-Key": "wrong-key" });
      const mw = AuthGuard.apiKey({ key: "correct-key" });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(403);
    });

    it("should read key from env when keyEnvKey is set", async () => {
      const req = mockRequest({ "X-API-Key": "env-api-key" });
      const mw = AuthGuard.apiKey({ keyEnvKey: "API_KEY" });
      const env = mockEnv({ API_KEY: "env-api-key" });
      const result = await mw(req, env, mockCtx());
      expect(result).toBeUndefined();
    });

    it("should support custom header name", async () => {
      const req = mockRequest({ "X-Custom-Auth": "my-key" });
      const mw = AuthGuard.apiKey({ key: "my-key", header: "X-Custom-Auth" });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeUndefined();
    });

    it("should support comma-separated multiple valid keys", async () => {
      const req1 = mockRequest({ "X-API-Key": "key1" });
      const req2 = mockRequest({ "X-API-Key": "key2" });
      const mw = AuthGuard.apiKey({ key: "key1, key2" });
      const result1 = await mw(req1, mockEnv(), mockCtx());
      const result2 = await mw(req2, mockEnv(), mockCtx());
      expect(result1).toBeUndefined();
      expect(result2).toBeUndefined();
    });

    it("should throw if neither key nor keyEnvKey is set", () => {
      expect(() => AuthGuard.apiKey({} as any)).toThrow("requires either");
    });
  });

  describe("AuthGuard (multi-strategy)", () => {
    it('should pass if any strategy succeeds in "any" mode', async () => {
      const req = mockRequest({ "X-API-Key": "valid-key" });
      const mw = AuthGuard({
        strategies: [
          { strategy: "jwt", secret: "secret123" },
          { strategy: "api-key", key: "valid-key" },
        ],
        mode: "any",
      });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeUndefined();
    });

    it('should fail if all strategies fail in "any" mode', async () => {
      const req = mockRequest({}); // No auth headers at all
      const mw = AuthGuard({
        strategies: [
          { strategy: "jwt", secret: "secret123" },
          { strategy: "api-key", key: "valid-key" },
        ],
        mode: "any",
      });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(401);
    });

    it('should pass if all strategies succeed in "all" mode', async () => {
      const jwt = await createJwt({ sub: "user123" }, "jwt-secret");
      const req = mockRequest({
        Authorization: `Bearer ${jwt}`,
        "X-API-Key": "api-key-123",
      });
      const mw = AuthGuard({
        strategies: [
          { strategy: "jwt", secret: "jwt-secret" },
          { strategy: "api-key", key: "api-key-123" },
        ],
        mode: "all",
      });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeUndefined();
    });

    it('should fail if any strategy fails in "all" mode', async () => {
      const jwt = await createJwt({ sub: "user123" }, "jwt-secret");
      const req = mockRequest({
        Authorization: `Bearer ${jwt}`,
        "X-API-Key": "wrong-key", // This one will fail
      });
      const mw = AuthGuard({
        strategies: [
          { strategy: "jwt", secret: "jwt-secret" },
          { strategy: "api-key", key: "correct-key" },
        ],
        mode: "all",
      });
      const result = await mw(req, mockEnv(), mockCtx());
      expect(result).toBeInstanceOf(Response);
      expect(result!.status).toBe(403);
    });
  });

  describe("getAuthUser", () => {
    it("should return undefined for unauthenticated requests", () => {
      const req = mockRequest();
      const user = getAuthUser(req);
      expect(user).toBeUndefined();
    });

    it("should return the user set by setAuthUser", () => {
      const req = mockRequest();
      setAuthUser(req, { id: "test", strategy: "api-key" });
      const user = getAuthUser(req);
      expect(user).toBeDefined();
      expect(user!.id).toBe("test");
    });

    it("should isolate users between different requests", async () => {
      const req1 = mockRequest({
        Authorization:
          "Bearer " + (await createJwt({ sub: "user1" }, "secret")),
      });
      const req2 = mockRequest({
        Authorization:
          "Bearer " + (await createJwt({ sub: "user2" }, "secret")),
      });

      const mw = AuthGuard.jwt({ secret: "secret" });
      await mw(req1, mockEnv(), mockCtx());
      await mw(req2, mockEnv(), mockCtx());

      const user1 = getAuthUser(req1);
      const user2 = getAuthUser(req2);
      expect(user1!.id).toBe("user1");
      expect(user2!.id).toBe("user2");
    });

    it("should clear user with clearAuthUser", () => {
      const req = mockRequest();
      setAuthUser(req, { id: "test", strategy: "jwt" });
      clearAuthUser(req);
      const user = getAuthUser(req);
      expect(user).toBeUndefined();
    });
  });
});
