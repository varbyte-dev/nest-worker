import { HttpMethod, MiddlewareFn, ParamMetadata, PipeFn } from "../core/types";

// ─── Metadata keys ───────────────────────────────────────────────
const MODULE_KEY = "__module__";
const INJECTABLE_KEY = "__injectable__";
const CONTROLLER_KEY = "__controller__";
const ROUTES_KEY = "__routes__";
const PARAMS_KEY = "__params__";
const MIDDLEWARES_KEY = "__middlewares__";
const DEPS_KEY = "__deps__";
const HTTP_CODE_KEY = "__http_code__";
const PIPES_KEY = "__pipes__";

// ─── Module ──────────────────────────────────────────────────────

export interface ModuleOptions {
  imports?: any[];
  controllers?: any[];
  providers?: any[];
  exports?: any[];
  /**
   * Plugins to register with this module.
   * Plugins can register providers, global middleware, and lifecycle hooks.
   */
  plugins?: any[];
}

export function Module(options: ModuleOptions): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(MODULE_KEY, options, target);
  };
}

// ─── Injectable ──────────────────────────────────────────────────

export function Injectable(deps?: any[]): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(INJECTABLE_KEY, true, target);
    const existing: any[] = Reflect.getMetadata(DEPS_KEY, target) || [];
    const paramTypes: any[] =
      deps || Reflect.getMetadata("design:paramtypes", target) || [];
    const merged = paramTypes.map((pt: any, i: number) => existing[i] ?? pt);
    Reflect.defineMetadata(DEPS_KEY, merged, target);
  };
}

// ─── Inject (manual token) ───────────────────────────────────────

export function Inject(token: any): ParameterDecorator {
  return (target, _propertyKey, parameterIndex) => {
    const existing: any[] = Reflect.getMetadata(DEPS_KEY, target) || [];
    existing[parameterIndex] = token;
    Reflect.defineMetadata(DEPS_KEY, existing, target);
  };
}

// ─── Controller ──────────────────────────────────────────────────

export function Controller(prefix: string = "", deps?: any[]): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(CONTROLLER_KEY, prefix.replace(/^\//, ""), target);
    const existing: any[] = Reflect.getMetadata(DEPS_KEY, target) || [];
    const paramTypes: any[] =
      deps || Reflect.getMetadata("design:paramtypes", target) || [];
    const merged = paramTypes.map((pt: any, i: number) => existing[i] ?? pt);
    Reflect.defineMetadata(DEPS_KEY, merged, target);
  };
}

// ─── Route method decorators ─────────────────────────────────────

function createRouteDecorator(method: HttpMethod) {
  return (path: string = ""): MethodDecorator => {
    return (target, propertyKey) => {
      const routes = Reflect.getMetadata(ROUTES_KEY, target.constructor) || [];
      routes.push({
        method,
        path: path.replace(/^\//, ""),
        handlerName: String(propertyKey),
      });
      Reflect.defineMetadata(ROUTES_KEY, routes, target.constructor);
    };
  };
}

export const Get = createRouteDecorator("GET");
export const Post = createRouteDecorator("POST");
export const Put = createRouteDecorator("PUT");
export const Patch = createRouteDecorator("PATCH");
export const Delete = createRouteDecorator("DELETE");
export const Options = createRouteDecorator("OPTIONS");

export function HttpCode(statusCode: number): MethodDecorator {
  if (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599) {
    throw new Error(`Invalid HTTP status code: ${statusCode}`);
  }

  return (target, propertyKey) => {
    Reflect.defineMetadata(
      `${HTTP_CODE_KEY}:${String(propertyKey)}`,
      statusCode,
      target.constructor,
    );
  };
}

// ─── Parameter decorators ─────────────────────────────────────────

function createParamDecorator(type: ParamMetadata["type"]) {
  return (key?: string): ParameterDecorator => {
    return (target, propertyKey, parameterIndex) => {
      const metaKey = `${PARAMS_KEY}:${String(propertyKey)}`;
      const existing: ParamMetadata[] =
        Reflect.getMetadata(metaKey, target.constructor) || [];
      existing.push({ index: parameterIndex, type, key });
      Reflect.defineMetadata(metaKey, existing, target.constructor);
    };
  };
}

export const Body = createParamDecorator("body");
export const Param = createParamDecorator("param");
export const Query = createParamDecorator("query");
export const Headers = createParamDecorator("header");
export const Req = createParamDecorator("request");

/** Injects env object or a specific env binding by key (e.g. KV namespace, secret) */
export const Env = createParamDecorator("env");

/** Injects a D1 database binding. Defaults to env.DB, or specify a key. */
export const D1 = createParamDecorator("db");

// ─── UseMiddleware ────────────────────────────────────────────────

export function UseMiddleware(...middlewares: MiddlewareFn[]) {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      // Method-level
      Reflect.defineMetadata(
        `${MIDDLEWARES_KEY}:${String(propertyKey)}`,
        middlewares,
        target.constructor,
      );
    } else {
      // Class-level
      Reflect.defineMetadata(MIDDLEWARES_KEY, middlewares, target);
    }
  };
}

export function UsePipe(...pipes: PipeFn[]) {
  return (target: any, propertyKey?: string | symbol) => {
    if (propertyKey) {
      Reflect.defineMetadata(
        `${PIPES_KEY}:${String(propertyKey)}`,
        pipes,
        target.constructor,
      );
    } else {
      Reflect.defineMetadata(PIPES_KEY, pipes, target);
    }
  };
}
