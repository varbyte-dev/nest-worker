import "reflect-metadata";
import { describe, expect, it } from "vitest";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Module,
  NotFoundException,
  Post,
  createApplication,
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
});
