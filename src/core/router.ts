import { RouteDefinition, ParamMetadata, HttpMethod } from "./types";
import { HttpException, BadRequestException } from "./exceptions";
import { Container } from "./container";
import { getCorsHeaders } from "./middlewares";

const CONTROLLER_KEY = "__controller__";
const ROUTES_KEY = "__routes__";
const PARAMS_KEY = "__params__";
const MIDDLEWARES_KEY = "__middlewares__";

export class Router {
  private routes: Array<{
    method: HttpMethod;
    pattern: URLPattern;
    rawPath: string;
    handler: (
      req: Request,
      env: any,
      ctx: ExecutionContext,
      params: Record<string, string>,
    ) => Promise<Response>;
  }> = [];

  constructor(private container: Container) {}

  registerController(ctrlClass: any) {
    const prefix: string = Reflect.getMetadata(CONTROLLER_KEY, ctrlClass) || "";
    const routes: RouteDefinition[] =
      Reflect.getMetadata(ROUTES_KEY, ctrlClass) || [];
    const ctrlMiddlewares =
      Reflect.getMetadata(MIDDLEWARES_KEY, ctrlClass) || [];

    const instance = this.container.resolveController(ctrlClass);

    for (const route of routes) {
      const fullPath = normalizePath(`/${prefix}/${route.path}`);
      const pattern = new URLPattern({ pathname: fullPath });
      const routeMiddlewares =
        Reflect.getMetadata(
          `${MIDDLEWARES_KEY}:${route.handlerName}`,
          ctrlClass,
        ) || [];

      this.routes.push({
        method: route.method,
        pattern,
        rawPath: fullPath,
        handler: async (req, env, ctx, pathParams) => {
          // Run controller-level + route-level middlewares (with ctx)
          for (const mw of [...ctrlMiddlewares, ...routeMiddlewares]) {
            const result = await mw(req, env, ctx);
            if (result instanceof Response) return result;
          }

          const paramsMeta: ParamMetadata[] =
            Reflect.getMetadata(
              `${PARAMS_KEY}:${route.handlerName}`,
              ctrlClass,
            ) || [];

          const args = await resolveHandlerArgs(
            req,
            env,
            pathParams,
            paramsMeta,
          );
          const result = await instance[route.handlerName](...args);
          return toResponse(result);
        },
      });
    }
  }

  async resolve(
    request: Request,
    env: any,
    ctx: ExecutionContext,
  ): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase() as HttpMethod;

    for (const route of this.routes) {
      if (route.method !== method) continue;
      const match = route.pattern.exec({ pathname: url.pathname });
      if (match) {
        const params = match.pathname.groups as Record<string, string>;
        try {
          const response = await route.handler(request, env, ctx, params);
          return applyCorsHeaders(request, response);
        } catch (err: any) {
          const response =
            err instanceof HttpException
              ? err.toResponse()
              : jsonResponse(
                  {
                    error:
                      env?.APP_ENV === "production"
                        ? "Internal Server Error"
                        : err.message,
                  },
                  500,
                );
          return applyCorsHeaders(request, response);
        }
      }
    }

    return applyCorsHeaders(
      request,
      jsonResponse({ error: "Not Found", path: url.pathname }, 404),
    );
  }
}

// ---- Helpers ----

function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

async function resolveHandlerArgs(
  req: Request,
  env: Record<string, unknown>,
  pathParams: Record<string, string>,
  paramsMeta: ParamMetadata[],
): Promise<unknown[]> {
  const args: unknown[] = [];
  if (!paramsMeta.length) return args;

  let parsedBody: unknown = undefined;
  const url = new URL(req.url); // cache: created once for all params

  for (const meta of paramsMeta) {
    let value: unknown;

    switch (meta.type) {
      case "request":
        value = req;
        break;
      case "env":
        value = meta.key ? env[meta.key] : env;
        break;
      case "db":
        value = meta.key ? env[meta.key] : env["DB"];
        break;
      case "body": {
        if (!parsedBody) {
          if (req.body === null) {
            parsedBody = {};
          } else {
            try {
              parsedBody = await req.json();
            } catch {
              throw new BadRequestException("Invalid JSON body");
            }
          }
        }
        value = meta.key
          ? (parsedBody as Record<string, unknown>)[meta.key]
          : parsedBody;
        break;
      }
      case "param":
        value = meta.key ? pathParams[meta.key] : pathParams;
        break;
      case "query": {
        value = meta.key
          ? url.searchParams.get(meta.key)
          : Object.fromEntries(url.searchParams);
        break;
      }
      case "header":
        value = meta.key
          ? req.headers.get(meta.key)
          : Object.fromEntries(req.headers);
        break;
    }

    args[meta.index] = value;
  }

  return args;
}

function toResponse(value: unknown): Response {
  if (value instanceof Response) return value;
  if (value === undefined || value === null)
    return new Response(null, { status: 204 });
  if (typeof value === "string")
    return new Response(value, { headers: { "Content-Type": "text/plain" } });
  return jsonResponse(value, 200);
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function applyCorsHeaders(request: Request, response: Response): Response {
  const corsHeaders = getCorsHeaders(request);
  if (!corsHeaders) return response;
  const newRes = new Response(response.body, response);
  for (const [k, v] of Object.entries(corsHeaders)) {
    newRes.headers.set(k, v);
  }
  return newRes;
}
