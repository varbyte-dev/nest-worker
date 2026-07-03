import "reflect-metadata";
import { describe, expect, it } from "vitest";
import {
  ApiModel,
  Prop,
  ApiOperation,
  ApiBody,
  ApiResponse,
  ApiTags,
  ApiSecurity,
  SecuritySchemes,
  buildOpenApiSpec,
} from "../src/index";

// ─── Sample models ────────────────────────────────────────────────

@ApiModel({ description: "A user in the system" })
class User {
  @Prop() id!: number;
  @Prop({ description: "Full name of the user" }) name!: string;
  @Prop({ example: "user@example.com" }) email!: string;
  @Prop() role!: string;
  @Prop() created_at!: string;
}

@ApiModel()
class CreateUserDto {
  @Prop() name!: string;
  @Prop() email!: string;
  @Prop() role?: string;
}

@ApiModel()
class UpdateUserDto {
  @Prop() name?: string;
  @Prop() email?: string;
}

// ─── Controllers for testing ──────────────────────────────────────

import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from "../src/index";

@ApiTags("Users")
@Controller("users")
class UsersController {
  @Get()
  @ApiOperation({
    summary: "List all users",
    description: "Returns paginated list",
  })
  async getAll(@Query("limit") limit?: string) {
    return [] as User[];
  }

  @Get(":id")
  @ApiOperation({ summary: "Get user by ID" })
  @ApiResponse({ status: 200, description: "User found" })
  @ApiResponse({ status: 404, description: "User not found" })
  async getOne(@Param("id") id: string): Promise<User | null> {
    return null;
  }

  @Post()
  @ApiOperation({ summary: "Create a new user" })
  @ApiResponse({ status: 201, description: "User created" })
  async create(@Body() body: CreateUserDto) {
    return { id: 1, ...body } as User;
  }

  @Put(":id")
  @ApiOperation({ summary: "Update an existing user" })
  async update(@Param("id") id: string, @Body() body: UpdateUserDto) {
    return {} as User;
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a user" })
  async remove(@Param("id") id: string) {
    return { message: "Deleted" };
  }
}

// ─── Controller without extra decorators ──────────────────────────

@Controller("health")
class HealthController {
  @Get()
  check() {
    return { ok: true };
  }

  @Get("ping")
  ping() {
    return "pong";
  }
}

// ─── Controller with manual ApiBody override ──────────────────────

@Controller("auth")
class AuthController {
  @Post("login")
  @ApiOperation({ summary: "Login with credentials" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        email: { type: "string", format: "email" },
        password: { type: "string", format: "password" },
      },
      required: ["email", "password"],
    },
  })
  @ApiResponse({ status: 200, description: "Login successful" })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  async login(@Body() body: unknown) {
    return { token: "..." };
  }
}

// ═══════════════════════════════════════════════════════════════════
//  TESTS
// ═══════════════════════════════════════════════════════════════════

describe("design:paramtypes diagnostics", () => {
  it("should detect param types via Reflect", () => {
    const createMeta = Reflect.getMetadata(
      "design:paramtypes",
      UsersController.prototype,
      "create",
    );
    expect(createMeta).toBeDefined();
    expect(createMeta).toHaveLength(1);
    expect(createMeta[0]).toBe(CreateUserDto);
  });

  it("should detect that CreateUserDto is a user class with model decorator", () => {
    const modelMeta = Reflect.getMetadata("__swagger_model__", CreateUserDto);
    expect(modelMeta).toBeDefined();
  });

  it("should get @Prop() metadata from CreateUserDto", () => {
    const nameMeta = Reflect.getMetadata(
      "__swagger_prop__:name",
      CreateUserDto,
    );
    expect(nameMeta).toBeDefined();
    expect(nameMeta.type).toBe("string");
  });
});

describe("@ApiModel() and @Prop()", () => {
  it("should store model metadata", () => {
    const meta = Reflect.getMetadata("__swagger_model__", User);
    expect(meta).toEqual({ description: "A user in the system" });
  });

  it("should store property metadata", () => {
    const nameMeta = Reflect.getMetadata("__swagger_prop__:name", User);
    expect(nameMeta).toMatchObject({
      type: "string",
      description: "Full name of the user",
    });

    const emailMeta = Reflect.getMetadata("__swagger_prop__:email", User);
    expect(emailMeta).toMatchObject({ type: "string" });
    expect(emailMeta.example).toBe("user@example.com");

    const idMeta = Reflect.getMetadata("__swagger_prop__:id", User);
    expect(idMeta).toMatchObject({ type: "number" });
  });
});

describe("buildOpenApiSpec()", () => {
  const spec = buildOpenApiSpec(
    [UsersController, HealthController, AuthController],
    {
      title: "Test API",
      version: "2.0.0",
      description: "API for testing",
      servers: [{ url: "https://api.example.com", description: "Production" }],
    },
  );

  it("should set openapi version and info", () => {
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.title).toBe("Test API");
    expect(spec.info.version).toBe("2.0.0");
    expect(spec.info.description).toBe("API for testing");
  });

  it("should include servers", () => {
    expect(spec.servers).toHaveLength(1);
    expect(spec.servers![0].url).toBe("https://api.example.com");
  });

  it("should generate paths for all controllers", () => {
    expect(spec.paths["/users"]).toBeDefined();
    expect(spec.paths["/users/{id}"]).toBeDefined();
    expect(spec.paths["/health"]).toBeDefined();
    expect(spec.paths["/health/ping"]).toBeDefined();
    expect(spec.paths["/auth/login"]).toBeDefined();
  });

  it("should set correct HTTP methods on paths", () => {
    const usersPath = spec.paths["/users"];
    expect(usersPath.get).toBeDefined();
    expect(usersPath.post).toBeDefined();

    const userByIdPath = spec.paths["/users/{id}"];
    expect(userByIdPath.get).toBeDefined();
    expect(userByIdPath.put).toBeDefined();
    expect(userByIdPath.delete).toBeDefined();
  });

  it("should add operation summary from @ApiOperation", () => {
    const usersGet = spec.paths["/users"].get;
    expect(usersGet.summary).toBe("List all users");
    expect(usersGet.description).toBe("Returns paginated list");
  });

  it("should use handler name as fallback summary", () => {
    const healthGet = spec.paths["/health"].get;
    expect(healthGet.summary).toBe("check");
  });

  it("should include path parameters", () => {
    const getById = spec.paths["/users/{id}"].get;
    expect(getById.parameters).toHaveLength(1);
    expect(getById.parameters[0]).toMatchObject({
      name: "id",
      in: "path",
      required: true,
    });
  });

  it("should include query parameters", () => {
    const usersGet = spec.paths["/users"].get;
    expect(usersGet.parameters).toHaveLength(1);
    expect(usersGet.parameters[0]).toMatchObject({
      name: "limit",
      in: "query",
    });
  });

  it("should generate requestBody for POST with @Body()", () => {
    const usersPost = spec.paths["/users"].post;
    expect(usersPost.requestBody).toBeDefined();
    expect(usersPost.requestBody.content["application/json"]).toBeDefined();
  });

  it("should reference model schema in requestBody when DTO has @ApiModel()", () => {
    const usersPost = spec.paths["/users"].post;
    const schema = usersPost.requestBody.content["application/json"].schema;
    expect(schema.$ref).toBe("#/components/schemas/CreateUserDto");
  });

  it("should include schemas in components", () => {
    // User won't be auto-detected because async methods return Promise<User>
    // and design:returntype only gives Promise, not User
    // Only DTOs referenced from @Body() params are detected
    expect(spec.components?.schemas?.CreateUserDto).toBeDefined();
    expect(spec.components?.schemas?.UpdateUserDto).toBeDefined();
  });

  it("should build model schema with properties", () => {
    const dtoSchema = spec.components!.schemas!.CreateUserDto as any;
    expect(dtoSchema.type).toBe("object");
    expect(dtoSchema.properties.name.type).toBe("string");
    expect(dtoSchema.properties.email.type).toBe("string");
    expect(dtoSchema.properties.role.type).toBe("string");
    expect(dtoSchema.required).toContain("name");
    expect(dtoSchema.required).toContain("email");
  });

  it("should use @ApiBody() schema when provided", () => {
    const loginPost = spec.paths["/auth/login"].post;
    const schema = loginPost.requestBody.content["application/json"].schema;
    expect(schema.properties.email.format).toBe("email");
    expect(schema.properties.password.format).toBe("password");
    expect(schema.required).toEqual(["email", "password"]);
  });

  it("should include multiple responses from @ApiResponse()", () => {
    const getById = spec.paths["/users/{id}"].get;
    expect(getById.responses["200"]).toBeDefined();
    expect(getById.responses["200"].description).toBe("User found");
    expect(getById.responses["404"]).toBeDefined();
    expect(getById.responses["404"].description).toBe("User not found");
  });

  it("should include @ApiResponse for auth endpoint", () => {
    const loginPost = spec.paths["/auth/login"].post;
    expect(loginPost.responses["200"]).toBeDefined();
    expect(loginPost.responses["200"].description).toBe("Login successful");
    expect(loginPost.responses["401"]).toBeDefined();
    expect(loginPost.responses["401"].description).toBe("Invalid credentials");
  });

  it("should add default response for endpoints without @ApiResponse", () => {
    // POST /users has @ApiResponse({ status: 201, description: 'User created' })
    const usersPost = spec.paths["/users"].post;
    expect(usersPost.responses["201"]).toBeDefined();
    expect(usersPost.responses["201"].description).toBe("User created");

    const healthGet = spec.paths["/health"].get;
    expect(healthGet.responses["200"]).toBeDefined();
    expect(healthGet.responses["200"].description).toBe("OK");
  });

  it("should include tags from @ApiTags", () => {
    const usersGet = spec.paths["/users"].get;
    expect(usersGet.tags).toContain("Users");

    expect(spec.tags).toBeDefined();
    expect(spec.tags!.some((t) => t.name === "Users")).toBe(true);
  });

  it("should not include body params as query/path params", () => {
    // POST /users has a @Body() but no @Param or @Query
    const usersPost = spec.paths["/users"].post;
    const paramNames = (usersPost.parameters || []).map((p: any) => p.name);
    expect(paramNames).not.toContain("body");
  });

  it("should handle controllers without decorators gracefully", () => {
    const healthPing = spec.paths["/health/ping"].get;
    expect(healthPing.summary).toBe("ping");
    expect(healthPing.responses["200"]).toBeDefined();
  });
});

describe("createSwaggerMiddleware()", () => {
  it("should export createSwaggerMiddleware function", async () => {
    const { createSwaggerMiddleware } = await import("../src/extras/swagger");
    expect(createSwaggerMiddleware).toEqual(expect.any(Function));
  });
});

describe("Swagger decorator edge cases", () => {
  it("should handle model without any @Prop() properties", () => {
    @ApiModel()
    class EmptyDto {}

    const spec = buildOpenApiSpec(
      [
        (() => {
          @Controller("empty")
          class EmptyCtrl {
            @Post()
            create(@Body() body: EmptyDto) {
              return {};
            }
          }
          return EmptyCtrl;
        })(),
      ],
      {},
    );

    expect(spec.paths["/empty"]).toBeDefined();
    expect(spec.paths["/empty"].post.requestBody).toBeDefined();
    // EmptyDto has no @Prop(), so it won't be in schemas
  });

  it("should handle @ApiOperation with deprecated flag", () => {
    @Controller("old")
    class OldController {
      @Get("legacy")
      @ApiOperation({ summary: "Old endpoint", deprecated: true })
      legacy() {
        return {};
      }
    }

    const spec = buildOpenApiSpec([OldController], {});
    expect(spec.paths["/old/legacy"].get.deprecated).toBe(true);
    expect(spec.paths["/old/legacy"].get.summary).toBe("Old endpoint");
  });
});

describe("app.useSwagger() integration", () => {
  it("should serve swagger UI at /docs", async () => {
    const { createApplication, Module, Get, Controller } =
      await import("../src/index");

    @Controller("test")
    class TestController {
      @Get()
      list() {
        return [];
      }
    }

    @Module({ controllers: [TestController] })
    class TestModule {}

    const app = createApplication(TestModule);
    app.useSwagger({ title: "Test", version: "1.0.0" });

    const ctx = {} as ExecutionContext;

    // Test swagger UI
    const uiResponse = await app.handler.fetch(
      new Request("https://example.com/docs"),
      {},
      ctx,
    );
    expect(uiResponse.status).toBe(200);
    expect(uiResponse.headers.get("Content-Type")).toBe("text/html");
    const html = await uiResponse.text();
    expect(html).toContain("swagger-ui");
    expect(html).toContain("/docs/json");
    expect(html).toContain("swagger-ui-standalone-preset.js");
    expect(html).toContain("SwaggerUIStandalonePreset");

    // Test JSON spec
    const jsonResponse = await app.handler.fetch(
      new Request("https://example.com/docs/json"),
      {},
      ctx,
    );
    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get("Content-Type")).toBe("application/json");
    const spec = await jsonResponse.json();
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.title).toBe("Test");
    expect(spec.paths["/test"]).toBeDefined();

    // Test non-swagger routes still work
    const testResponse = await app.handler.fetch(
      new Request("https://example.com/test"),
      {},
      ctx,
    );
    expect(testResponse.status).toBe(200);
  });

  it("should protect swagger with basic auth", async () => {
    const { createApplication, Module, Get, Controller } =
      await import("../src/index");

    @Controller("items")
    class ItemsController {
      @Get()
      list() {
        return [];
      }
    }

    @Module({ controllers: [ItemsController] })
    class TestModule {}

    const app = createApplication(TestModule);
    app.useSwagger({
      title: "Protected",
      auth: { username: "admin", password: "secret" },
    });

    const ctx = {} as ExecutionContext;

    // Without auth
    const noAuth = await app.handler.fetch(
      new Request("https://example.com/docs"),
      {},
      ctx,
    );
    expect(noAuth.status).toBe(401);

    // With wrong credentials
    const wrongAuth = await app.handler.fetch(
      new Request("https://example.com/docs", {
        headers: {
          Authorization: "Basic " + btoa("admin:wrong"),
        },
      }),
      {},
      ctx,
    );
    expect(wrongAuth.status).toBe(403);

    // With correct credentials
    const goodAuth = await app.handler.fetch(
      new Request("https://example.com/docs/json", {
        headers: {
          Authorization: "Basic " + btoa("admin:secret"),
        },
      }),
      {},
      ctx,
    );
    expect(goodAuth.status).toBe(200);
    const spec = await goodAuth.json();
    expect(spec.info.title).toBe("Protected");
  });
});

// ═══════════════════════════════════════════════════════════════════
//  Security Schemes & @ApiSecurity
// ═══════════════════════════════════════════════════════════════════

describe("@ApiSecurity and securitySchemes", () => {
  it("should add securitySchemes to components when provided in options", () => {
    @ApiTags("Test")
    class SecCtrl {
      static __controller__ = true;
    }
    Reflect.defineMetadata("__controller__", "", SecCtrl);
    Reflect.defineMetadata("__routes__", [], SecCtrl);

    const spec = buildOpenApiSpec([SecCtrl], {
      securitySchemes: {
        bearerAuth: SecuritySchemes.bearerJwt(),
        apiKey: SecuritySchemes.apiKey(),
      },
    });

    expect(spec.components?.securitySchemes).toBeDefined();
    expect(spec.components!.securitySchemes!.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
    });
    expect(spec.components!.securitySchemes!.apiKey).toMatchObject({
      type: "apiKey",
      name: "X-API-Key",
      in: "header",
    });
  });

  it("should add security to operation when @ApiSecurity is on method", () => {
    @ApiTags("Protected")
    class ProtectedCtrl {
      list() {}
      me() {}
    }
    Reflect.defineMetadata("__controller__", "items", ProtectedCtrl);
    Reflect.defineMetadata(
      "__routes__",
      [
        { method: "GET", path: "", handlerName: "list" },
        { method: "GET", path: "me", handlerName: "me" },
      ],
      ProtectedCtrl,
    );

    // Apply @ApiSecurity only on 'me'
    ApiSecurity("bearerAuth")(
      ProtectedCtrl.prototype,
      "me",
      Object.getOwnPropertyDescriptor(ProtectedCtrl.prototype, "me")!,
    );

    const spec = buildOpenApiSpec([ProtectedCtrl], {
      securitySchemes: { bearerAuth: SecuritySchemes.bearerJwt() },
    });

    // 'list' should have no security
    expect(spec.paths["/items"]["get"].security).toBeUndefined();
    // 'me' should have bearerAuth security
    expect(spec.paths["/items/me"]["get"].security).toEqual([
      { bearerAuth: [] },
    ]);
  });

  it("should apply controller-level @ApiSecurity to all routes", () => {
    @ApiSecurity("bearerAuth")
    @ApiTags("Admin")
    class AdminCtrl {
      list() {}
      get() {}
    }
    Reflect.defineMetadata("__controller__", "admin", AdminCtrl);
    Reflect.defineMetadata(
      "__routes__",
      [
        { method: "GET", path: "", handlerName: "list" },
        { method: "GET", path: ":id", handlerName: "get" },
      ],
      AdminCtrl,
    );

    const spec = buildOpenApiSpec([AdminCtrl], {
      securitySchemes: { bearerAuth: SecuritySchemes.bearerJwt() },
    });

    // Both routes inherit the controller-level security
    expect(spec.paths["/admin"]["get"].security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/admin/{id}"]["get"].security).toEqual([
      { bearerAuth: [] },
    ]);
  });

  it("should allow route-level @ApiSecurity to override controller-level", () => {
    class MixedCtrl {
      publicRoute() {}
      privateRoute() {}
    }
    // Controller-level: bearerAuth on all
    ApiSecurity("bearerAuth")(MixedCtrl);
    // Route-level: apiKey overrides bearerAuth for privateRoute
    ApiSecurity("apiKey")(
      MixedCtrl.prototype,
      "privateRoute",
      Object.getOwnPropertyDescriptor(MixedCtrl.prototype, "privateRoute")!,
    );

    Reflect.defineMetadata("__controller__", "mixed", MixedCtrl);
    Reflect.defineMetadata(
      "__routes__",
      [
        { method: "GET", path: "public", handlerName: "publicRoute" },
        { method: "GET", path: "private", handlerName: "privateRoute" },
      ],
      MixedCtrl,
    );

    const spec = buildOpenApiSpec([MixedCtrl], {
      securitySchemes: {
        bearerAuth: SecuritySchemes.bearerJwt(),
        apiKey: SecuritySchemes.apiKey(),
      },
    });

    // publicRoute gets controller-level bearerAuth
    expect(spec.paths["/mixed/public"]["get"].security).toEqual([
      { bearerAuth: [] },
    ]);
    // privateRoute is overridden by route-level apiKey
    expect(spec.paths["/mixed/private"]["get"].security).toEqual([
      { apiKey: [] },
    ]);
  });

  it("SecuritySchemes.bearerJwt should create correct scheme object", () => {
    const scheme = SecuritySchemes.bearerJwt();
    expect(scheme.type).toBe("http");
    expect(scheme.scheme).toBe("bearer");
    expect(scheme.bearerFormat).toBe("JWT");
    expect(scheme.description).toBeTruthy();
  });

  it("SecuritySchemes.apiKey should create correct scheme object", () => {
    const scheme = SecuritySchemes.apiKey({ name: "X-My-Key" });
    expect(scheme.type).toBe("apiKey");
    expect(scheme.name).toBe("X-My-Key");
    expect(scheme.in).toBe("header");
  });

  it("SecuritySchemes.basicAuth should create correct scheme object", () => {
    const scheme = SecuritySchemes.basicAuth();
    expect(scheme.type).toBe("http");
    expect(scheme.scheme).toBe("basic");
  });

  it("should not add securitySchemes when not provided in options", () => {
    class NoSecCtrl {}
    Reflect.defineMetadata("__controller__", "", NoSecCtrl);
    Reflect.defineMetadata("__routes__", [], NoSecCtrl);

    const spec = buildOpenApiSpec([NoSecCtrl], { title: "No sec" });
    expect(spec.components?.securitySchemes).toBeUndefined();
  });

  it("Swagger UI HTML should have persistAuthorization enabled", async () => {
    const { createApplication, Module, Get, Controller } =
      await import("../src/index");

    @Controller("ping")
    class PingCtrl {
      @Get()
      ping() {
        return "pong";
      }
    }

    @Module({ controllers: [PingCtrl] })
    class PingMod {}

    const app = createApplication(PingMod);
    app.useSwagger({
      securitySchemes: { bearerAuth: SecuritySchemes.bearerJwt() },
    });

    const res = await app.handler.fetch(
      new Request("https://example.com/docs"),
      {},
      {} as ExecutionContext,
    );
    const html = await res.text();
    expect(html).toContain("persistAuthorization: true");
  });
});
