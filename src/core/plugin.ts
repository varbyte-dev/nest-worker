import type { Container } from "./container";
import type { MiddlewareFn, ErrorFilterFn } from "./types";

/**
 * Minimal application interface exposed to plugins.
 * Avoids circular dependency by not importing NestWorkerApplication directly.
 */
export interface PluginApp {
  /** Register global middleware. */
  use(middleware: MiddlewareFn): this;
  /** Register global error filters. */
  useErrorFilter(...filters: ErrorFilterFn[]): this;
  /** Access the DI container. */
  container: Container;
}

/**
 * Lifecycle hooks available to a plugin.
 *
 * Hooks execute in this order during `createApplication()`:
 *   1. `onBeforeInit(container)` — Register providers before module resolution
 *   2. Module registration and controller discovery
 *   3. `onAfterInit(app)` — Register global middleware, pipes, error filters
 *   4. `onBeforeDestroy(app)` — Cleanup when the Worker shuts down (can be async)
 */
export interface NestWorkerPlugin {
  /** Unique plugin name (used for deduplication and debugging) */
  name: string;

  /**
   * Called before the root module is registered.
   * Use this to register custom providers in the DI container.
   */
  onBeforeInit?(container: Container): void;

  /**
   * Called after the application has been fully initialised
   * (module registered, controllers discovered, routes built).
   * Use this to register global middleware, error filters, etc.
   */
  onAfterInit?(app: PluginApp): void;

  /**
   * Called when the Worker is about to shut down (e.g. on `SIGTERM`).
   * Use this to close connections or flush buffers.
   */
  onBeforeDestroy?(app: PluginApp): void | Promise<void>;
}

// ─── Plugin configuration helper ──────────────────────────────────

/**
 * Helper type for a plugin factory with typed options.
 *
 * @example
 * ```ts
 * class MyPlugin implements NestWorkerPlugin {
 *   name = 'my-plugin';
 *   constructor(private opts: { apiKey: string }) {}
 *   onAfterInit(app: PluginApp) { … }
 *   static register(opts: { apiKey: string }) {
 *     return new MyPlugin(opts);
 *   }
 * }
 * ```
 */
export type PluginFactory<
  TPlugin extends NestWorkerPlugin,
  TOptions = void,
> = TOptions extends void ? () => TPlugin : (options: TOptions) => TPlugin;

// ─── Plugin Registry ──────────────────────────────────────────────

/**
 * Registry that holds all plugins registered via `@Module()`.
 * Ensures plugins are initialized in order and deduplicated by name.
 */
export class PluginRegistry {
  private plugins: NestWorkerPlugin[] = [];

  /**
   * Register a plugin. If a plugin with the same `name` already exists,
   * it will be replaced (last-registered wins).
   */
  register(plugin: NestWorkerPlugin): void {
    const idx = this.plugins.findIndex((p) => p.name === plugin.name);
    if (idx !== -1) {
      this.plugins[idx] = plugin;
    } else {
      this.plugins.push(plugin);
    }
  }

  /** Register multiple plugins at once. */
  registerMany(plugins: NestWorkerPlugin[]): void {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  /** Get all registered plugins (in registration order). */
  getAll(): NestWorkerPlugin[] {
    return [...this.plugins];
  }

  /** Find a plugin by name. */
  find(name: string): NestWorkerPlugin | undefined {
    return this.plugins.find((p) => p.name === name);
  }

  /** Remove a plugin by name. */
  remove(name: string): boolean {
    const len = this.plugins.length;
    this.plugins = this.plugins.filter((p) => p.name !== name);
    return this.plugins.length < len;
  }

  /** Clear all plugins. */
  clear(): void {
    this.plugins = [];
  }

  // ─── Lifecycle helpers ──────────────────────────────────────────

  /** Run `onBeforeInit` hooks in registration order. */
  runBeforeInit(container: Container): void {
    for (const plugin of this.plugins) {
      plugin.onBeforeInit?.(container);
    }
  }

  /** Run `onAfterInit` hooks in registration order. */
  runAfterInit(app: PluginApp): void {
    for (const plugin of this.plugins) {
      plugin.onAfterInit?.(app);
    }
  }

  /** Run `onBeforeDestroy` hooks in reverse order (LIFO). */
  async runBeforeDestroy(app: PluginApp): Promise<void> {
    for (const plugin of [...this.plugins].reverse()) {
      await plugin.onBeforeDestroy?.(app);
    }
  }
}
