import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Param,
  Post,
  Query,
  cors,
  createApplication,
  devRateLimit,
  ErrorFilterFn,
  PipeFn,
  rateLimit,
  RequestLogEntry,
  requestLogger,
  UseMiddleware,
  UsePipe,
} from "../src/index";

const ctx = {} as ExecutionContext;

async function json(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function request(path: string, init?: RequestInit) {
  return new Request(`https://example.com${path}`, init);
}

function handle(
  app: ReturnType<typeof createApplication>,
  path: string,
  init?: RequestInit,
  env: Record<string, unknown> = {},
) {
  return app.handle(request(path, init), env, ctx);
}

function appFor(controller: any) {
  @Module({ controllers: [controller] })
  class TestModule {}

  return createApplication(TestModule);
}

function corsApp(options: Parameters<typeof cors>[0]) {
  @Controller("health")
  class HealthController {
    @Get()
    check() {
      return { ok: true };
    }
  }

  return appFor(HealthController).use(cors(options));
}

function rateLimitApp(options: Parameters<typeof devRateLimit>[0]) {
  @Controller("limited")
  class LimitedController {
    @Get()
    check() {
      return { ok: true };
    }
  }

  return appFor(LimitedController).use(devRateLimit(options));
}

describe("Router", () => {
  it("should serialize object responses with status 200 by default", async () => {
    @Controller("users")
    class UsersController {
      @Get()
      findAll() {
        return { data: ["Ada"] };
      }
    }

    const response = await handle(appFor(UsersController), "/users");

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ data: ["Ada"] });
  });

  it("should use @HttpCode for serialized controller results", async () => {
    @Controller("users")
    class UsersController {
      @Post()
      @HttpCode(201)
      create() {
        return { created: true };
      }
    }

    const response = await handle(appFor(UsersController), "/users", {
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(await json(response)).toEqual({ created: true });
  });

  it("should reject invalid @HttpCode values", () => {
    expect(() => HttpCode(99)).toThrow("Invalid HTTP status code: 99");
    expect(() => HttpCode(600)).toThrow("Invalid HTTP status code: 600");
    expect(() => HttpCode(200.5)).toThrow("Invalid HTTP status code: 200.5");
  });

  it("should return stable HTTP exception envelopes", async () => {
    @Controller("users")
    class UsersController {
      @Get(":id")
      findOne() {
        throw new NotFoundException("User not found");
      }
    }

    const response = await handle(appFor(UsersController), "/users/1");

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({
      error: "User not found",
      statusCode: 404,
    });
  });

  it("should hide unknown error details in production", async () => {
    @Controller("boom")
    class BoomController {
      @Get()
      explode() {
        throw new Error("database password leaked");
      }
    }

    const response = await handle(appFor(BoomController), "/boom", {}, {
      APP_ENV: "production",
    });

    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({
      error: "Internal Server Error",
      statusCode: 500,
    });
  });

  it("should include safe unknown error details outside production", async () => {
    @Controller("boom")
    class BoomController {
      @Get()
      explode() {
        throw "string failure";
      }
    }

    const response = await handle(appFor(BoomController), "/boom", {}, {
      APP_ENV: "development",
    });

    expect(response.status).toBe(500);
    expect(await json(response)).toEqual({
      error: "Internal Server Error",
      statusCode: 500,
      details: {
        message: "string failure",
      },
    });
  });

  it("should return stable not found envelopes", async () => {
    @Controller("users")
    class UsersController {
      @Get()
      findAll() {
        return [];
      }
    }

    const response = await handle(appFor(UsersController), "/missing");

    expect(response.status).toBe(404);
    expect(await json(response)).toEqual({
      error: "Not Found",
      statusCode: 404,
      path: "/missing",
    });
  });

  it("should use global error filters for route errors", async () => {
    const filter: ErrorFilterFn = (error, context) => {
      const url = new URL(context.request.url);
      return new Response(JSON.stringify({
        message: error instanceof Error ? error.message : "unknown",
        path: url.pathname,
      }), {
        status: 418,
        headers: { "Content-Type": "application/json" },
      });
    };

    @Controller("boom")
    class BoomController {
      @Get()
      explode() {
        throw new Error("custom failure");
      }
    }

    const response = await handle(
      appFor(BoomController).useErrorFilter(filter),
      "/boom",
    );

    expect(response.status).toBe(418);
    expect(await json(response)).toEqual({
      message: "custom failure",
      path: "/boom",
    });
  });

  it("should keep stable fallback errors when filters do not respond", async () => {
    const filter: ErrorFilterFn = () => undefined;

    @Controller("users")
    class UsersController {
      @Get()
      findAll() {
        throw new BadRequestException("invalid request");
      }
    }

    const response = await handle(
      appFor(UsersController).useErrorFilter(filter),
      "/users",
    );

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: "invalid request",
      statusCode: 400,
    });
  });

  it("should use global error filters for global middleware errors", async () => {
    const filter: ErrorFilterFn = (error) => {
      return new Response(JSON.stringify({
        handled: error instanceof Error ? error.message : "unknown",
      }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      });
    };

    @Controller("health")
    class HealthController {
      @Get()
      check() {
        return { ok: true };
      }
    }

    const response = await handle(
      appFor(HealthController)
        .use(() => {
          throw new Error("middleware failed");
        })
        .useErrorFilter(filter),
      "/health",
    );

    expect(response.status).toBe(503);
    expect(await json(response)).toEqual({
      handled: "middleware failed",
    });
  });

  it("should return bad request for invalid JSON bodies", async () => {
    @Controller("users")
    class UsersController {
      @Post()
      create(@Body() body: unknown) {
        return body;
      }
    }

    const response = await handle(appFor(UsersController), "/users", {
      method: "POST",
      body: "{",
    });

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: "Invalid JSON body",
      statusCode: 400,
    });
  });

  it("should resolve HEAD requests through GET routes without a body", async () => {
    @Controller("health")
    class HealthController {
      @Get()
      check() {
        return { ok: true };
      }
    }

    const response = await handle(appFor(HealthController), "/health", {
      method: "HEAD",
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("should reflect allowed CORS origins from an allowlist", async () => {
    const response = await handle(corsApp({
      origin: ["https://app.example", "https://admin.example"],
    }), "/health", {
      headers: { Origin: "https://app.example" },
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example",
    );
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("should not apply CORS headers for denied origins", async () => {
    const response = await handle(corsApp({
      origin: ["https://app.example"],
      credentials: true,
    }), "/health", {
      headers: { Origin: "https://evil.example" },
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect(response.headers.get("Vary")).toBe("Origin");
  });

  it("should support dynamic CORS origin predicates", async () => {
    const response = await handle(corsApp({
      origin: (origin) => origin.endsWith(".trusted.example"),
    }), "/health", {
      headers: { Origin: "https://api.trusted.example" },
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://api.trusted.example",
    );
  });

  it("should include credentials only with explicit allowed origins", async () => {
    const response = await handle(corsApp({
      origin: "https://app.example",
      credentials: true,
    }), "/health", {
      headers: { Origin: "https://app.example" },
    });

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example",
    );
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe(
      "true",
    );
  });

  it("should reject wildcard CORS origins with credentials", () => {
    expect(() => cors({ origin: "*", credentials: true })).toThrow(
      "CORS credentials cannot be used with wildcard origin",
    );
  });

  it("should respond to CORS preflight requests for allowed origins", async () => {
    const response = await handle(corsApp({
      origin: ["https://app.example"],
      methods: ["GET", "POST"],
      allowedHeaders: ["Content-Type", "Authorization"],
      maxAge: 600,
    }), "/health", {
      method: "OPTIONS",
      headers: {
        Origin: "https://app.example",
        "Access-Control-Request-Method": "POST",
      },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://app.example",
    );
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe(
      "GET, POST",
    );
    expect(response.headers.get("Access-Control-Allow-Headers")).toBe(
      "Content-Type, Authorization",
    );
    expect(response.headers.get("Access-Control-Max-Age")).toBe("600");
  });

  it("should limit requests in memory for the same client IP", async () => {
    const app = rateLimitApp({ windowMs: 60_000, max: 1 });
    const init = { headers: { "CF-Connecting-IP": "203.0.113.10" } };

    const first = await handle(app, "/limited", init);
    const second = await handle(app, "/limited", init);

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("Retry-After")).toBeTruthy();
    expect(await json(second)).toEqual({ error: "Too Many Requests" });
  });

  it("should track in-memory rate limits per client IP", async () => {
    const app = rateLimitApp({ windowMs: 60_000, max: 1 });

    await handle(app, "/limited", {
      headers: { "CF-Connecting-IP": "203.0.113.10" },
    });
    const otherClient = await handle(app, "/limited", {
      headers: { "CF-Connecting-IP": "203.0.113.11" },
    });

    expect(otherClient.status).toBe(200);
  });

  it("should keep rateLimit as a compatibility alias", () => {
    expect(rateLimit).toBe(devRateLimit);
  });

  it("should log completed requests with request ids", async () => {
    const entries: RequestLogEntry[] = [];

    @Controller("health")
    class HealthController {
      @Get()
      check() {
        return { ok: true };
      }
    }

    const app = appFor(HealthController).use(requestLogger({
      generateRequestId: () => "generated-id",
      sink: (entry) => entries.push(entry),
    }));

    const response = await handle(app, "/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toBe("generated-id");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      requestId: "generated-id",
      method: "GET",
      path: "/health",
      status: 200,
    });
    expect(entries[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(entries[0].timestamp).toEqual(expect.any(String));
  });

  it("should preserve incoming request ids in request logs", async () => {
    const entries: RequestLogEntry[] = [];

    @Controller("health")
    class HealthController {
      @Get()
      check() {
        return { ok: true };
      }
    }

    const app = appFor(HealthController).use(requestLogger({
      generateRequestId: () => "unused-id",
      sink: (entry) => entries.push(entry),
    }));

    const response = await handle(app, "/health", {
      headers: { "X-Request-Id": "incoming-id" },
    });

    expect(response.headers.get("X-Request-Id")).toBe("incoming-id");
    expect(entries[0].requestId).toBe("incoming-id");
  });

  it("should log responses returned by earlier middlewares", async () => {
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

    const response = await handle(app, "/health");

    expect(response.status).toBe(401);
    expect(response.headers.get("X-Request-Id")).toBe("blocked-id");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      requestId: "blocked-id",
      method: "GET",
      path: "/health",
      status: 401,
    });
  });

  it("should keep responses successful when request log sinks fail", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    @Controller("health")
    class HealthController {
      @Get()
      check() {
        return { ok: true };
      }
    }

    const app = appFor(HealthController).use(requestLogger({
      generateRequestId: () => "safe-id",
      sink: () => {
        throw new Error("sink unavailable");
      },
    }));

    try {
      const response = await handle(app, "/health");

      expect(response.status).toBe(200);
      expect(response.headers.get("X-Request-Id")).toBe("safe-id");
      expect(await json(response)).toEqual({ ok: true });
    } finally {
      consoleError.mockRestore();
    }
  });

  it("should include handled route errors in request logs", async () => {
    const entries: RequestLogEntry[] = [];

    @Controller("boom")
    class BoomController {
      @Get()
      explode() {
        throw new Error("route exploded");
      }
    }

    const app = appFor(BoomController).use(requestLogger({
      generateRequestId: () => "error-id",
      sink: (entry) => entries.push(entry),
    }));

    const response = await handle(app, "/boom");

    expect(response.status).toBe(500);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      requestId: "error-id",
      method: "GET",
      path: "/boom",
      status: 500,
      error: {
        name: "Error",
        message: "route exploded",
      },
    });
  });

  it("should include HTTP exception status codes in request log errors", async () => {
    const entries: RequestLogEntry[] = [];

    @Controller("users")
    class UsersController {
      @Get()
      findAll() {
        throw new BadRequestException("invalid filters");
      }
    }

    const app = appFor(UsersController).use(requestLogger({
      sink: (entry) => entries.push(entry),
    }));

    const response = await handle(app, "/users");

    expect(response.status).toBe(400);
    expect(entries[0].error).toEqual({
      name: "HttpException",
      message: "invalid filters",
      statusCode: 400,
    });
  });

  it("should support custom request log error formatting", async () => {
    const entries: RequestLogEntry[] = [];

    @Controller("boom")
    class BoomController {
      @Get()
      explode() {
        throw new Error("sensitive failure");
      }
    }

    const app = appFor(BoomController).use(requestLogger({
      formatError: (error) => ({
        name: error instanceof Error ? error.name : "unknown",
        message: "redacted",
      }),
      sink: (entry) => entries.push(entry),
    }));

    const response = await handle(app, "/boom");

    expect(response.status).toBe(500);
    expect(entries[0].error).toEqual({
      name: "Error",
      message: "redacted",
    });
  });

  it("should include error causes in request log errors", async () => {
    const entries: RequestLogEntry[] = [];

    @Controller("boom")
    class BoomController {
      @Get()
      explode() {
        throw new Error("outer failure", {
          cause: new Error("inner failure"),
        });
      }
    }

    const app = appFor(BoomController).use(requestLogger({
      sink: (entry) => entries.push(entry),
    }));

    const response = await handle(app, "/boom");

    expect(response.status).toBe(500);
    expect(entries[0].error).toEqual({
      name: "Error",
      message: "outer failure",
      cause: "Error: inner failure",
    });
  });

  it("should allow disabling request log error details", async () => {
    const entries: RequestLogEntry[] = [];

    @Controller("boom")
    class BoomController {
      @Get()
      explode() {
        throw new Error("hidden failure");
      }
    }

    const app = appFor(BoomController).use(requestLogger({
      includeError: false,
      sink: (entry) => entries.push(entry),
    }));

    const response = await handle(app, "/boom");

    expect(response.status).toBe(500);
    expect(entries[0].error).toBeUndefined();
  });

  it("should resolve path params and query params", async () => {
    @Controller("users")
    class UsersController {
      @Get(":id")
      find(
        @Param("id") id: string,
        @Query("tab") tab: string,
        @Query() query: Record<string, string>,
      ) {
        return { id, tab, query };
      }
    }

    const response = await handle(
      appFor(UsersController),
      "/users/42?tab=settings&active=true",
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      id: "42",
      tab: "settings",
      query: {
        active: "true",
        tab: "settings",
      },
    });
  });

  it("should run middlewares before handlers in registration order", async () => {
    const order: string[] = [];
    const globalMiddleware = () => {
      order.push("global");
    };
    const controllerMiddleware = () => {
      order.push("controller");
    };
    const routeMiddleware = () => {
      order.push("route");
    };

    @Controller("items")
    @UseMiddleware(controllerMiddleware)
    class ItemsController {
      @Get()
      @UseMiddleware(routeMiddleware)
      list() {
        order.push("handler");
        return { order };
      }
    }

    const response = await handle(
      appFor(ItemsController).use(globalMiddleware),
      "/items",
    );

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({
      order: ["global", "controller", "route", "handler"],
    });
    expect(order).toEqual(["global", "controller", "route", "handler"]);
  });

  it("should short-circuit route middleware before the handler", async () => {
    const order: string[] = [];
    const controllerMiddleware = () => {
      order.push("controller");
    };
    const routeMiddleware = () => {
      order.push("route");
      return new Response(JSON.stringify({ blocked: true }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      });
    };

    @Controller("items")
    @UseMiddleware(controllerMiddleware)
    class ItemsController {
      @Get()
      @UseMiddleware(routeMiddleware)
      list() {
        order.push("handler");
        return { ok: true };
      }
    }

    const response = await handle(appFor(ItemsController), "/items");

    expect(response.status).toBe(403);
    expect(await json(response)).toEqual({ blocked: true });
    expect(order).toEqual(["controller", "route"]);
  });

  it("should transform handler args with route pipes", async () => {
    const normalizeUser: PipeFn = (args) => {
      const body = args[0] as { name: string };
      return [{ ...body, name: body.name.trim() }];
    };

    @Controller("users")
    class UsersController {
      @Post()
      @UsePipe(normalizeUser)
      create(@Body() body: { name: string }) {
        return body;
      }
    }

    const response = await handle(appFor(UsersController), "/users", {
      method: "POST",
      body: JSON.stringify({ name: " Ada " }),
    });

    expect(response.status).toBe(200);
    expect(await json(response)).toEqual({ name: "Ada" });
  });

  it("should return stable errors when pipes reject input", async () => {
    const requireName: PipeFn = (args) => {
      const body = args[0] as { name?: unknown };
      if (typeof body.name !== "string") {
        throw new BadRequestException("name is required", { field: "name" });
      }
    };

    @Controller("users")
    class UsersController {
      @Post()
      @UsePipe(requireName)
      create(@Body() body: { name: string }) {
        return body;
      }
    }

    const response = await handle(appFor(UsersController), "/users", {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    expect(await json(response)).toEqual({
      error: "name is required",
      statusCode: 400,
      details: { field: "name" },
    });
  });

  it("should run controller pipes before route pipes", async () => {
    const addControllerMarker: PipeFn = (args) => {
      const body = args[0] as { order: string[] };
      return [{ order: [...body.order, "controller"] }];
    };
    const addRouteMarker: PipeFn = (args) => {
      const body = args[0] as { order: string[] };
      return [{ order: [...body.order, "route"] }];
    };

    @Controller("users")
    @UsePipe(addControllerMarker)
    class UsersController {
      @Post()
      @UsePipe(addRouteMarker)
      create(@Body() body: { order: string[] }) {
        return body;
      }
    }

    const response = await handle(appFor(UsersController), "/users", {
      method: "POST",
      body: JSON.stringify({ order: [] }),
    });

    expect(await json(response)).toEqual({ order: ["controller", "route"] });
  });

  it("should pass request context to pipes", async () => {
    const includePathParam: PipeFn = (args, context) => {
      const body = args[0] as Record<string, unknown>;
      return [{ ...body, userId: context.params.id }];
    };

    @Controller("users")
    class UsersController {
      @Post(":id")
      @UsePipe(includePathParam)
      update(@Body() body: Record<string, unknown>) {
        return body;
      }
    }

    const response = await handle(appFor(UsersController), "/users/42", {
      method: "POST",
      body: JSON.stringify({ name: "Ada" }),
    });

    expect(await json(response)).toEqual({ name: "Ada", userId: "42" });
  });
});
