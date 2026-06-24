import {
  RouteDefinition,
  ParamMetadata,
  HttpMethod,
  PipeContext,
  PipeFn,
} from "./types";
import { HttpException, BadRequestException } from "./exceptions";
import { Container } from "./container";
import { getCorsHeaders } from "./middlewares";

const CONTROLLER_KEY = "__controller__";
const ROUTES_KEY = "__routes__";
const PARAMS_KEY = "__params__";
const MIDDLEWARES_KEY = "__middlewares__";
const HTTP_CODE_KEY = "__http_code__";
const PIPES_KEY = "__pipes__";

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
    const ctrlPipes: PipeFn[] = Reflect.getMetadata(PIPES_KEY, ctrlClass) || [];

    const instance = this.container.resolveController(ctrlClass);

    for (const route of routes) {
      const fullPath = normalizePath(`/${prefix}/${route.path}`);
      const pattern = new URLPattern({ pathname: fullPath });
      const routeMiddlewares =
        Reflect.getMetadata(
          `${MIDDLEWARES_KEY}:${route.handlerName}`,
          ctrlClass,
        ) || [];
      const statusCode =
        Reflect.getMetadata(`${HTTP_CODE_KEY}:${route.handlerName}`, ctrlClass) ||
        200;
      const routePipes: PipeFn[] =
        Reflect.getMetadata(`${PIPES_KEY}:${route.handlerName}`, ctrlClass) ||
        [];

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
          const pipedArgs = await applyPipes([...ctrlPipes, ...routePipes], args, {
            request: req,
            env,
            ctx,
            params: pathParams,
            route,
          });
          const result = await instance[route.handlerName](...pipedArgs);
          return toResponse(result, statusCode);
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
      if (!methodMatches(route.method, method)) continue;
      const match = route.pattern.exec({ pathname: url.pathname });
      if (match) {
        const params = match.pathname.groups as Record<string, string>;
        try {
          const response = await route.handler(request, env, ctx, params);
          return applyCorsHeaders(request, toHeadResponse(request, response));
        } catch (err: any) {
          const response = toErrorResponse(err, env);
          return applyCorsHeaders(request, toHeadResponse(request, response));
        }
      }
    }

    return applyCorsHeaders(
      request,
      toHeadResponse(
        request,
        jsonResponse(
          {
            error: "Not Found",
            statusCode: 404,
            path: url.pathname,
          },
          404,
        ),
      ),
    );
  }
}

// ---- Helpers ----

function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
}

function methodMatches(routeMethod: HttpMethod, requestMethod: HttpMethod) {
  return (
    routeMethod === requestMethod ||
    (routeMethod === "GET" && requestMethod === "HEAD")
  );
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

async function applyPipes(
  pipes: PipeFn[],
  args: unknown[],
  context: PipeContext,
): Promise<unknown[]> {
  let currentArgs = args;

  for (const pipe of pipes) {
    const nextArgs = await pipe(currentArgs, context);
    if (nextArgs !== undefined) currentArgs = nextArgs;
  }

  return currentArgs;
}

function toResponse(value: unknown, status = 200): Response {
  if (value instanceof Response) return value;
  if (value === undefined || value === null)
    return new Response(null, { status: 204 });
  if (typeof value === "string")
    return new Response(value, {
      status,
      headers: { "Content-Type": "text/plain" },
    });
  return jsonResponse(value, status);
}

function jsonResponse(data: unknown, status: number): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toErrorResponse(err: unknown, env: Record<string, unknown>): Response {
  if (err instanceof HttpException) return err.toResponse();

  const isProduction = env?.APP_ENV === "production";
  const payload: Record<string, unknown> = {
    error: "Internal Server Error",
    statusCode: 500,
  };

  if (!isProduction) {
    payload.details = {
      message: errorMessage(err),
    };
  }

  return jsonResponse(payload, 500);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function toHeadResponse(request: Request, response: Response): Response {
  if (request.method.toUpperCase() !== "HEAD") return response;
  return new Response(null, response);
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
