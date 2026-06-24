import "reflect-metadata";
import { describe, expect, it } from "vitest";
import {
  Body,
  Controller,
  Env,
  Get,
  Module,
  Post,
  cors,
  createApplication,
  requestLogger,
} from "../src/index";
import type { RequestLogEntry } from "../src/index";

const ctx = {} as ExecutionContext;

function request(path: string, init?: RequestInit) {
  return new Request(`https://example.com${path}`, init);
}

function appFor(controller: any) {
  @Module({ controllers: [controller] })
  class TestModule {}

  return createApplication(TestModule);
}

describe("fetch handler integration", () => {
  it("should serve serialized controller responses through handler.fetch", async () => {
    @Controller("health")
    class HealthController {
      @Get()
      check(@Env("APP_ENV") appEnv: string) {
        return { ok: true, appEnv };
      }
    }

    const app = appFor(HealthController);

    const response = await app.handler.fetch(request("/health"), {
      APP_ENV: "test",
    }, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json");
    expect(await response.json()).toEqual({ ok: true, appEnv: "test" });
  });

  it("should preserve HEAD semantics through handler.fetch", async () => {
    @Controller("health")
    class HealthController {
      @Get()
      check() {
        return { ok: true };
      }
    }

    const app = appFor(HealthController);

    const response = await app.handler.fetch(request("/health", {
      method: "HEAD",
    }), {}, ctx);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("should return stable errors for invalid JSON through handler.fetch", async () => {
    @Controller("users")
    class UsersController {
      @Post()
      create(@Body() body: unknown) {
        return body;
      }
    }

    const app = appFor(UsersController);

    const response = await app.handler.fetch(request("/users", {
      method: "POST",
      body: "{",
    }), {}, ctx);

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Invalid JSON body",
      statusCode: 400,
    });
  });

  it("should apply global middleware effects through handler.fetch", async () => {
    const entries: RequestLogEntry[] = [];

    @Controller("health")
    class HealthController {
      @Get()
      check() {
        return { ok: true };
      }
    }

    const app = appFor(HealthController)
      .use(requestLogger({
        sink: (entry) => entries.push(entry),
      }))
      .use(cors({ origin: ["https://app.example"] }));

    const response = await app.handler.fetch(request("/health", {
      headers: {
        Origin: "https://app.example",
        "X-Request-Id": "fetch-id",
      },
    }), {}, ctx);

    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example",
    );
    expect(response.headers.get("X-Request-Id")).toBe("fetch-id");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      requestId: "fetch-id",
      method: "GET",
      path: "/health",
      status: 200,
    });
  });

  it("should include handled errors in request logs through handler.fetch", async () => {
    const entries: RequestLogEntry[] = [];

    @Controller("boom")
    class BoomController {
      @Get()
      explode() {
        throw new Error("fetch failed");
      }
    }

    const app = appFor(BoomController).use(requestLogger({
      sink: (entry) => entries.push(entry),
    }));

    const response = await app.handler.fetch(request("/boom", {
      headers: { "X-Request-Id": "fetch-error-id" },
    }), {}, ctx);

    expect(response.status).toBe(500);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      requestId: "fetch-error-id",
      method: "GET",
      path: "/boom",
      status: 500,
      error: {
        name: "Error",
        message: "fetch failed",
      },
    });
  });

  it("should return middleware short-circuit responses through handler.fetch", async () => {
    const entries: RequestLogEntry[] = [];

    @Controller("health")
    class HealthController {
      @Get()
      check() {
        return { ok: true };
      }
    }

    const app = appFor(HealthController)
      .use(requestLogger({
        generateRequestId: () => "blocked-id",
        sink: (entry) => entries.push(entry),
      }))
      .use(() => new Response("blocked", { status: 401 }));

    const response = await app.handler.fetch(request("/health"), {}, ctx);

    expect(response.status).toBe(401);
    expect(response.headers.get("X-Request-Id")).toBe("blocked-id");
    expect(await response.text()).toBe("blocked");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      requestId: "blocked-id",
      method: "GET",
      path: "/health",
      status: 401,
    });
  });
});
