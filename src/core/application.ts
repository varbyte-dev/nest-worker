import { ErrorFilterFn, MiddlewareFn } from "./types";
import { Router } from "./router";
import { Container } from "./container";
import { finalizeRequestLogging } from "./request-context";

export interface WorkerEnv {
  [key: string]: unknown;
}

export class NestWorkerApplication {
  private router: Router;
  private container: Container;
  private globalMiddlewares: MiddlewareFn[] = [];
  private globalErrorFilters: ErrorFilterFn[] = [];

  constructor(private rootModule: any) {
    this.container = new Container();
    this.router = new Router(this.container, this.globalErrorFilters);
    this.bootstrap();
  }

  private bootstrap() {
    this.container.register(this.rootModule);
    const controllers = this.container.getControllers();
    for (const ctrl of controllers) {
      this.router.registerController(ctrl);
    }
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
