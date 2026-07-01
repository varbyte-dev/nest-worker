/**
 * Cron / Scheduled Triggers for nest-worker.
 *
 * Provides a `@Scheduled()` decorator to easily register Workers Cron Triggers.
 *
 * @module cron
 */

// ─── Types ─────────────────────────────────────────────────────────────

export interface ScheduledOptions {
  /**
   * Cron expression, e.g. "0 * * * *" (every hour).
   * Standard 5-field cron format: minute hour day-of-month month day-of-week.
   */
  cron: string;
  /** Optional human-friendly name for the trigger. */
  name?: string;
  /** Optional timeout string, e.g. "5 minutes". */
  timeout?: string;
}

// ─── Metadata keys ─────────────────────────────────────────────────────

const SCHEDULED_KEY = "__scheduled__";

// ─── Decorator ─────────────────────────────────────────────────────────

/**
 * Marks a controller method as a Cron trigger handler.
 *
 * The method is called on the cron schedule specified by the `cron` option.
 * It receives the `ScheduledEvent` (or `ControllerEvent` in some runtimes)
 * as its first argument.
 *
 * Multiple `@Scheduled()` handlers can be registered in the same controller
 * or across different controllers; all matching handlers run on every
 * scheduled tick.
 *
 * @param options - Cron schedule options (`cron` expression required).
 *
 * @example
 * ```ts
 * import { Controller, Scheduled } from "@varbyte/nest-worker";
 *
 * @Controller()
 * class HealthCheckController {
 *   @Scheduled({ cron: "0 * * * *" })
 *   async healthCheck() {
 *     await this.healthService.ping();
 *   }
 * }
 * ```
 */
export function Scheduled(options: ScheduledOptions): MethodDecorator {
  return (target, propertyKey) => {
    const handlers = getScheduledHandlers(target.constructor);
    handlers.push({
      cron: options.cron,
      handlerName: String(propertyKey),
      name: options.name,
      timeout: options.timeout,
    });
    Reflect.defineMetadata(SCHEDULED_KEY, handlers, target.constructor);
  };
}

// ─── Introspection helpers ─────────────────────────────────────────────

/**
 * Returns the list of scheduled handlers registered on a class.
 */
export function getScheduledHandlers(target: any): Array<{
  cron: string;
  handlerName: string;
  name?: string;
  timeout?: string;
}> {
  return Reflect.getMetadata(SCHEDULED_KEY, target) || [];
}

// ─── Application integration ───────────────────────────────────────────

/**
 * Builds a "scheduled" handler that can be exported from the Worker entry-point.
 *
 * Scans all registered controllers for `@Scheduled()` decorators and
 * invokes every matching handler when a cron event fires.
 *
 * @param resolveController - Function that resolves a controller class to
 *                            its instance (typically container.resolveController).
 * @param controllers       - Array of registered controller classes.
 *
 * @example
 * ```ts
 * // worker.ts
 * import { createApplication, createScheduledHandler } from "@varbyte/nest-worker";
 *
 * const app = createApplication(AppModule);
 *
 * export default {
 *   fetch: app.handler.fetch,
 *   scheduled: createScheduledHandler(
 *     (cls) => app.container.resolveController(cls),
 *     app.container.getControllers(),
 *   ),
 * };
 * ```
 */
export function createScheduledHandler(
  resolveController: (ctrlClass: any) => any,
  controllers: any[],
): (event: ScheduledEvent, env: any, ctx: ExecutionContext) => Promise<void> {
  // Flatten all handler registrations
  const allHandlers: Array<{
    controllerClass: any;
    handlerName: string;
    cron: string;
  }> = [];

  for (const ctrlClass of controllers) {
    const scheduled = getScheduledHandlers(ctrlClass);
    for (const handler of scheduled) {
      allHandlers.push({
        controllerClass: ctrlClass,
        handlerName: handler.handlerName,
        cron: handler.cron,
      });
    }
  }

  return async (event: ScheduledEvent, env: any, ctx: ExecutionContext) => {
    for (const handler of allHandlers) {
      try {
        const instance = resolveController(handler.controllerClass);
        await instance[handler.handlerName](event);
      } catch (err) {
        console.error(
          `[nest-worker] Scheduled handler "${handler.handlerName}" (cron: ${handler.cron}) failed:`,
          err,
        );
      }
    }
  };
}
