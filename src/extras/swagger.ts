import { MiddlewareFn, RouteDefinition, ParamMetadata } from "../core/types";

// ─── Metadata keys ───────────────────────────────────────────────
const SWAGGER_MODEL_KEY = "__swagger_model__";
const SWAGGER_PROP_PREFIX = "__swagger_prop__";
const CONTROLLER_KEY = "__controller__";
const ROUTES_KEY = "__routes__";
const PARAMS_KEY = "__params__";
const HTTP_CODE_KEY = "__http_code__";

// ─── Type helpers ────────────────────────────────────────────────

type SwaggerType =
  | "string"
  | "number"
  | "integer"
  | "boolean"
  | "object"
  | "array";

function designTypeToSwagger(designType?: any): {
  type: SwaggerType;
  items?: Record<string, unknown>;
} {
  if (!designType || designType === undefined) return { type: "string" };
  if (designType === String) return { type: "string" };
  if (designType === Number) return { type: "number" };
  if (designType === Boolean) return { type: "boolean" };
  if (designType === Array) return { type: "array", items: {} };
  if (designType === Object) return { type: "object" };
  if (typeof designType === "function" && isUserClass(designType))
    return { type: "object" };
  return { type: "string" };
}

function isUserClass(fn: any): boolean {
  if (typeof fn !== "function") return false;
  if (
    [
      String,
      Number,
      Boolean,
      Array,
      Object,
      Promise,
      Symbol,
      Function,
    ].includes(fn)
  )
    return false;
  return true;
}

function normalizePath(path: string): string {
  // Convert Express-style :param to OpenAPI {param}
  const cleaned = path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
  return cleaned.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, "{$1}");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ═══════════════════════════════════════════════════════════════════
//  DECORADORES
// ═══════════════════════════════════════════════════════════════════

export interface ApiModelOptions {
  description?: string;
}

/**
 * Marca una clase como modelo de datos para la documentación OpenAPI.
 * Las propiedades se documentan automáticamente si tienen el decorador `@Prop()`.
 *
 * @example
 * ```ts
 * @ApiModel({ description: 'Usuario del sistema' })
 * class CreateUserDto {
 *   @Prop() name!: string;
 *   @Prop() email!: string;
 * }
 * ```
 */
export function ApiModel(options?: ApiModelOptions): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(SWAGGER_MODEL_KEY, options || {}, target);
  };
}

export interface PropOptions {
  description?: string;
  example?: unknown;
  /** Sobreescribe el tipo detectado automáticamente (opcional) */
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array";
  /** Para tipos array, describe el tipo de los items */
  items?: Record<string, unknown>;
}

/**
 * Decorador de propiedad para modelos documentados con `@ApiModel()`.
 * Detecta automáticamente el tipo TypeScript de la propiedad.
 *
 * @example
 * ```ts
 * @ApiModel()
 * class User {
 *   @Prop() id!: number;
 *   @Prop({ description: 'Nombre completo' }) name!: string;
 *   @Prop({ example: 'user' }) role?: string;
 * }
 * ```
 */
export function Prop(options?: PropOptions): PropertyDecorator {
  return (target, propertyKey) => {
    const designType = Reflect.getMetadata("design:type", target, propertyKey);
    const inferred = designTypeToSwagger(designType);
    const key = String(propertyKey);
    const meta = {
      ...options,
      type: options?.type || inferred.type,
      items: options?.items || inferred.items,
    };
    Reflect.defineMetadata(
      `${SWAGGER_PROP_PREFIX}:${key}`,
      meta,
      target.constructor,
    );
  };
}

export interface ApiOperationOptions {
  summary?: string;
  description?: string;
  deprecated?: boolean;
}

/**
 * Describe metadata adicional para un endpoint en la documentación.
 * Opcional — sin este decorador se usa el nombre del método como summary.
 *
 * @example
 * ```ts
 * @Get(':id')
 * @ApiOperation({ summary: 'Obtener usuario por ID', description: '...' })
 * async getOne(@Param('id') id: string) {}
 * ```
 */
export function ApiOperation(options: ApiOperationOptions): MethodDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(
      `${SWAGGER_PROP_PREFIX}:operation:${String(propertyKey)}`,
      options,
      target.constructor,
    );
  };
}

export interface ApiBodyOptions {
  schema: Record<string, unknown>;
  description?: string;
  required?: boolean;
}

/**
 * Describe explícitamente el schema del body de un endpoint.
 * Opcional — sin este decorador se infiere del tipo del parámetro `@Body()`.
 */
export function ApiBody(options: ApiBodyOptions): MethodDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(
      `${SWAGGER_PROP_PREFIX}:body:${String(propertyKey)}`,
      options,
      target.constructor,
    );
  };
}

export interface ApiResponseOptions {
  status?: number;
  description: string;
  schema?: Record<string, unknown>;
}

/**
 * Describe una respuesta posible de un endpoint.
 * Se puede usar múltiples veces para distintos códigos de estado.
 *
 * @example
 * ```ts
 * @ApiResponse({ status: 200, description: 'Usuario encontrado' })
 * @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
 * async getOne(@Param('id') id: string) {}
 * ```
 */
export function ApiResponse(options: ApiResponseOptions): MethodDecorator {
  return (target, propertyKey) => {
    const key = `${SWAGGER_PROP_PREFIX}:response:${String(propertyKey)}`;
    const existing: ApiResponseOptions[] =
      Reflect.getMetadata(key, target.constructor) || [];
    existing.push(options);
    Reflect.defineMetadata(key, existing, target.constructor);
  };
}

/**
 * Agrupa endpoints de un controlador bajo etiquetas en la UI de Swagger.
 *
 * @example
 * ```ts
 * @ApiTags('Users')
 * @Controller('users')
 * class UsersController {}
 * ```
 */
export function ApiTags(...tags: string[]): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(`${SWAGGER_PROP_PREFIX}:tags`, tags, target);
  };
}

// ═══════════════════════════════════════════════════════════════════
//  OPENAPI SPEC BUILDER
// ═══════════════════════════════════════════════════════════════════

export interface SwaggerOptions {
  title?: string;
  version?: string;
  description?: string;
  /** Ruta donde se servirá la documentación. Default: `/docs` */
  path?: string;
  /** Protección con Basic Auth */
  auth?: {
    username: string;
    password: string;
  };
  /** Servidores a mostrar en la spec */
  servers?: Array<{ url: string; description?: string }>;
  /** Schemas adicionales para components.schemas */
  schemas?: Record<string, Record<string, unknown>>;
}

interface OpenAPIObject {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, Record<string, any>>;
  components?: { schemas?: Record<string, any> };
  tags?: Array<{ name: string; description?: string }>;
  servers?: Array<{ url: string; description?: string }>;
}

/**
 * Construye la especificación OpenAPI 3.0.3 a partir de los controladores
 * registrados y sus decoradores.
 */
export function buildOpenApiSpec(
  controllers: any[],
  options: SwaggerOptions,
): OpenAPIObject {
  const spec: OpenAPIObject = {
    openapi: "3.0.3",
    info: {
      title: options.title || "API Documentation",
      version: options.version || "1.0.0",
    },
    paths: {},
    components: {
      schemas: { ...options.schemas },
    },
  };

  if (options.description) spec.info.description = options.description;
  if (options.servers) spec.servers = options.servers;

  const schemaRefs: Map<any, string> = new Map();
  const tagMap = new Map<string, { name: string; description?: string }>();

  for (const ctrl of controllers) {
    const prefix: string = Reflect.getMetadata(CONTROLLER_KEY, ctrl) || "";
    const routes: RouteDefinition[] =
      Reflect.getMetadata(ROUTES_KEY, ctrl) || [];
    const ctrlTags: string[] =
      Reflect.getMetadata(`${SWAGGER_PROP_PREFIX}:tags`, ctrl) || [];

    for (const route of routes) {
      const fullPath = normalizePath(`/${prefix}/${route.path}`);
      const method = route.method.toLowerCase() as string;
      const paramsMeta: ParamMetadata[] =
        Reflect.getMetadata(`${PARAMS_KEY}:${route.handlerName}`, ctrl) || [];

      // Metadata from optional decorators
      const operationMeta = Reflect.getMetadata(
        `${SWAGGER_PROP_PREFIX}:operation:${route.handlerName}`,
        ctrl,
      );
      const bodyMeta = Reflect.getMetadata(
        `${SWAGGER_PROP_PREFIX}:body:${route.handlerName}`,
        ctrl,
      );
      const responseMetaList: ApiResponseOptions[] =
        Reflect.getMetadata(
          `${SWAGGER_PROP_PREFIX}:response:${route.handlerName}`,
          ctrl,
        ) || [];

      // Build operation
      const operation: Record<string, any> = {
        summary: operationMeta?.summary || route.handlerName,
        parameters: [],
        responses: {},
      };

      if (operationMeta?.description)
        operation.description = operationMeta.description;
      if (operationMeta?.deprecated) operation.deprecated = true;

      // Build tags list
      const tags = [...ctrlTags];
      if (tags.length > 0) {
        operation.tags = tags;
        for (const t of tags) {
          if (!tagMap.has(t)) tagMap.set(t, { name: t });
        }
      }

      // Path / Query / Header params (skip body, request, env, db)
      for (const param of paramsMeta) {
        if (["body", "request", "env", "db"].includes(param.type)) continue;

        const inType =
          param.type === "param"
            ? "path"
            : param.type === "query"
              ? "query"
              : "header";
        const paramSchema: Record<string, any> = {
          name: param.key || "",
          in: inType,
          schema: { type: "string" },
        };

        if (param.type === "param") paramSchema.required = true;

        // Try to infer type from design:paramtypes
        const paramTypes =
          Reflect.getMetadata(
            "design:paramtypes",
            ctrl.prototype,
            route.handlerName,
          ) || [];
        if (paramTypes[param.index]) {
          const t = designTypeToSwagger(paramTypes[param.index]);
          paramSchema.schema = t as any;
        }

        operation.parameters.push(paramSchema);
      }

      // Request Body
      const bodyParam = paramsMeta.find((p) => p.type === "body");
      if (bodyParam) {
        if (bodyMeta) {
          operation.requestBody = {
            content: {
              "application/json": { schema: bodyMeta.schema },
            },
          };
        } else {
          // Try to detect DTO class from design:paramtypes
          const paramTypes =
            Reflect.getMetadata(
              "design:paramtypes",
              ctrl.prototype,
              route.handlerName,
            ) || [];
          const dtoClass = paramTypes[bodyParam.index];

          if (
            dtoClass &&
            isUserClass(dtoClass) &&
            hasModelDecorator(dtoClass)
          ) {
            const name = dtoClass.name;
            schemaRefs.set(dtoClass, name);
            operation.requestBody = {
              content: {
                "application/json": {
                  schema: { $ref: `#/components/schemas/${name}` },
                },
              },
            };
          } else {
            operation.requestBody = {
              content: {
                "application/json": { schema: { type: "object" } },
              },
            };
          }
        }
      }

      // Responses
      if (responseMetaList.length > 0) {
        for (const resp of responseMetaList) {
          const code = resp.status || 200;
          const respObj: Record<string, any> = {
            description: resp.description,
          };
          if (resp.schema) {
            respObj.content = { "application/json": { schema: resp.schema } };
          }
          operation.responses[String(code)] = respObj;
        }
      } else {
        // Default response based on method
        const code = getStatusCode(ctrl, route.handlerName);

        // Try to detect return type from design:returntype
        const returnType = Reflect.getMetadata(
          "design:returntype",
          ctrl.prototype,
          route.handlerName,
        );

        const respObj: Record<string, any> = {
          description: method === "post" ? "Created" : "OK",
        };

        if (
          returnType &&
          isUserClass(returnType) &&
          hasModelDecorator(returnType)
        ) {
          const name = returnType.name;
          schemaRefs.set(returnType, name);
          respObj.content = {
            "application/json": {
              schema: { $ref: `#/components/schemas/${name}` },
            },
          };
        } else if (returnType === Array) {
          respObj.content = {
            "application/json": {
              schema: { type: "array", items: {} },
            },
          };
        }

        operation.responses[String(code)] = respObj;
      }

      // Initialize path entry
      if (!spec.paths[fullPath]) spec.paths[fullPath] = {};
      spec.paths[fullPath][method] = operation;
    }
  }

  // Build components.schemas
  for (const [cls, name] of schemaRefs) {
    const schema = buildModelSchema(cls);
    if (schema) {
      if (!spec.components!.schemas) spec.components!.schemas = {};
      spec.components!.schemas[name] = schema;
    }
  }

  // Tags
  if (tagMap.size > 0) {
    spec.tags = Array.from(tagMap.values());
  }

  return spec;
}

function hasModelDecorator(cls: any): boolean {
  return !!Reflect.getMetadata(SWAGGER_MODEL_KEY, cls);
}

function buildModelSchema(cls: any): Record<string, unknown> | null {
  const modelMeta: ApiModelOptions | undefined = Reflect.getMetadata(
    SWAGGER_MODEL_KEY,
    cls,
  );
  if (!modelMeta) return null;

  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  // Collect property names by inspecting the prototype and metadata
  const propNames = collectPropNames(cls);

  for (const propName of propNames) {
    const propMeta: PropOptions | undefined = Reflect.getMetadata(
      `${SWAGGER_PROP_PREFIX}:${propName}`,
      cls,
    );
    const designType = Reflect.getMetadata(
      "design:type",
      cls.prototype,
      propName,
    );

    const schema: Record<string, unknown> = {};
    const t = propMeta?.type || designTypeToSwagger(designType).type;
    schema.type = t;

    if (propMeta?.description) schema.description = propMeta.description;
    if (propMeta?.example) schema.example = propMeta.example;
    if (propMeta?.items) schema.items = propMeta.items;
    if (t === "array" && !schema.items) schema.items = {};

    properties[propName] = schema;
    required.push(propName);
  }

  if (Object.keys(properties).length === 0) return null;

  const result: Record<string, unknown> = {
    type: "object",
    properties,
  };

  if (required.length > 0) result.required = required;
  if (modelMeta.description) result.description = modelMeta.description;

  return result;
}

function collectPropNames(cls: any): string[] {
  const names = new Set<string>();

  // 1. Get property names from own metadata keys
  const ownKeys: string[] = (Reflect as any).getOwnMetadataKeys
    ? (Reflect as any).getOwnMetadataKeys(cls)
    : [];
  const prefix = `${SWAGGER_PROP_PREFIX}:`;
  for (const key of ownKeys) {
    if (typeof key === "string" && key.startsWith(prefix)) {
      const propName = key.slice(prefix.length);
      if (propName && !propName.includes(":")) names.add(propName);
    }
  }

  // 2. Get all metadata keys (fallback for polyfill compatibility)
  if (names.size === 0) {
    const allKeys: string[] = Reflect.getMetadataKeys(cls) || [];
    for (const key of allKeys) {
      if (typeof key === "string" && key.startsWith(prefix)) {
        const propName = key.slice(prefix.length);
        if (propName && !propName.includes(":")) names.add(propName);
      }
    }
  }

  // 3. Also get prototype own property names (works for class properties with defaults)
  const protoKeys = Reflect.ownKeys(cls.prototype) as string[];
  for (const key of protoKeys) {
    if (key !== "constructor" && typeof key === "string") {
      // Only add if it has @Prop() metadata
      if (Reflect.getMetadata(`${SWAGGER_PROP_PREFIX}:${key}`, cls)) {
        names.add(key);
      }
    }
  }

  return Array.from(names);
}

function getStatusCode(ctrl: any, handlerName: string): number {
  return Reflect.getMetadata(`${HTTP_CODE_KEY}:${handlerName}`, ctrl) || 200;
}

// ═══════════════════════════════════════════════════════════════════
//  SWAGGER UI
// ═══════════════════════════════════════════════════════════════════

function swaggerUiHtml(specUrl: string, title: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *::before, *::after { box-sizing: inherit; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: ${JSON.stringify(specUrl)},
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset,
      ],
      layout: "StandaloneLayout",
    });
  </script>
</body>
</html>`;
}

// ═══════════════════════════════════════════════════════════════════
//  MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════

/**
 * Crea un middleware que sirve Swagger UI y la spec OpenAPI.
 * Se usa internamente por `app.useSwagger()`.
 */
export function createSwaggerMiddleware(
  spec: OpenAPIObject,
  options: SwaggerOptions,
): MiddlewareFn {
  const basePath = options.path || "/docs";
  const jsonPath = `${basePath}/json`;
  const uiPath = basePath;
  const specJson = JSON.stringify(spec);
  const uiHtml = swaggerUiHtml(jsonPath, spec.info.title);

  return (req, env, ctx) => {
    const url = new URL(req.url);

    if (url.pathname !== uiPath && url.pathname !== jsonPath) {
      return; // Let other middlewares / router handle it
    }

    // ── Basic Auth ──
    if (options.auth) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Basic ")) {
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="Swagger UI"' },
        });
      }

      let decoded: string;
      try {
        decoded = atob(authHeader.slice(6));
      } catch {
        return new Response("Forbidden", { status: 403 });
      }

      const colonIdx = decoded.indexOf(":");
      if (colonIdx === -1) {
        return new Response("Forbidden", { status: 403 });
      }

      const user = decoded.slice(0, colonIdx);
      const pass = decoded.slice(colonIdx + 1);

      if (user !== options.auth.username || pass !== options.auth.password) {
        return new Response("Forbidden", { status: 403 });
      }
    }

    // ── JSON spec ──
    if (url.pathname === jsonPath) {
      return new Response(specJson, {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    // ── Swagger UI ──
    return new Response(uiHtml, {
      headers: { "Content-Type": "text/html" },
    });
  };
}
