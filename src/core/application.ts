import { ErrorFilterFn, MiddlewareFn } from "./types";
import { Router } from "./router";
import { Container } from "./container";
import { finalizeRequestLogging } from "./request-context";
import { PluginRegistry } from "./plugin";
import type { SwaggerOptions } from "../extras/swagger";
import { buildOpenApiSpec, createSwaggerMiddleware } from "../extras/swagger";

export interface WorkerEnv {
  [key: string]: unknown;
}

export class NestWorkerApplication {
  private router: Router;
  private _container: Container;
  private _pluginRegistry: PluginRegistry;
  private globalMiddlewares: MiddlewareFn[] = [];
  private globalErrorFilters: ErrorFilterFn[] = [];

  constructor(private rootModule: any) {
    this._container = new Container();
    this._pluginRegistry = new PluginRegistry();
    this.router = new Router(this._container, this.globalErrorFilters);
    this.bootstrap();
  }

  /**
   * DI Container reference.
   * Exposed so utilities like `createQueueHandler` and `createScheduledHandler`
   * can resolve controller instances with their dependencies.
   */
  get container(): Container {
    return this._container;
  }

  /** Expose the plugin registry for advanced use cases. */
  get pluginRegistry(): PluginRegistry {
    return this._pluginRegistry;
  }

  private bootstrap() {
    // 1. Collect plugins from root module metadata
    const metadata = Reflect.getMetadata("__module__", this.rootModule) || {};
    if (metadata.plugins) {
      this._pluginRegistry.registerMany(metadata.plugins);
    }

    // 2. Run onBeforeInit hooks (plugins can register providers in the container)
    this._pluginRegistry.runBeforeInit(this._container);

    // 3. Register the root module and discover controllers
    this._container.register(this.rootModule);
    const controllers = this._container.getControllers();
    for (const ctrl of controllers) {
      this.router.registerController(ctrl);
    }

    // 4. Run onAfterInit hooks (plugins can register global middleware, etc.)
    this._pluginRegistry.runAfterInit(this);
  }

  use(middleware: MiddlewareFn): this {
    this.globalMiddlewares.push(middleware);
    return this;
  }

  useErrorFilter(...filters: ErrorFilterFn[]): this {
    this.globalErrorFilters.push(...filters);
    return this;
  }

  async handle(
    request: Request,
    env: WorkerEnv,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      // Run global middlewares (with ctx)
      for (const mw of this.globalMiddlewares) {
        const result = await mw(request, env, ctx);
        if (result instanceof Response) {
          return finalizeRequestLogging(request, result);
        }
      }

      const response = await this.router.resolve(request, env, ctx);
      return finalizeRequestLogging(request, response);
    } catch (err) {
      const response = await this.router.handleError(request, env, ctx, err);
      return finalizeRequestLogging(request, response);
    }
  }

  // ─── Swagger ────────────────────────────────────────────────────

  /**
   * Habilita la documentación OpenAPI (Swagger UI) para la aplicación.
   *
   * Inspecciona automáticamente todos los controladores registrados y genera
   * la especificación OpenAPI 3.0.3. Sirve la UI en la ruta configurada
   * (default: `/docs`) y la spec JSON en `/docs/json`.
   *
   * @example
   * ```ts
   * app.useSwagger({
   *   title: 'My API',
   *   version: '1.0.0',
   *   auth: { username: 'admin', password: env.SWAGGER_PASS },
   * });
   * ```
   */
  useSwagger(options: SwaggerOptions = {}): this {
    const controllers = this._container.getControllers();
    const spec = buildOpenApiSpec(controllers, options);
    const middleware = createSwaggerMiddleware(spec, options);
    // Run before global middlewares so it short-circuits quickly
    this.globalMiddlewares.unshift(middleware);
    return this;
  }

  /** Returns the fetch handler to export from the Worker */
  get handler() {
    return {
      fetch: (req: Request, env: WorkerEnv, ctx: ExecutionContext) =>
        this.handle(req, env, ctx),
    };
  }
}

export function createApplication(rootModule: any): NestWorkerApplication {
  return new NestWorkerApplication(rootModule);
}
