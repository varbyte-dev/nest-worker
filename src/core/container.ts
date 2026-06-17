import { InjectionToken } from "./types";

const MODULE_KEY = "__module__";
const INJECTABLE_KEY = "__injectable__";
const CONTROLLER_KEY = "__controller__";
const DEPS_KEY = "__deps__";

export class Container {
  private instances = new Map<InjectionToken, any>();
  private providers = new Map<InjectionToken, any>();
  private controllers: any[] = [];

  register(moduleClass: any) {
    const metadata = Reflect.getMetadata(MODULE_KEY, moduleClass) || {};

    // Register own providers
    const providers: any[] = metadata.providers || [];
    for (const provider of providers) {
      this.registerProvider(provider);
    }

    // Register own controllers
    const ctrlClasses: any[] = metadata.controllers || [];
    for (const ctrl of ctrlClasses) {
      this.controllers.push(ctrl);
    }

    // Process imported modules
    const imports: any[] = metadata.imports || [];
    for (const imp of imports) {
      this.registerImportedModule(imp);
    }
  }

  /**
   * Register a single provider entry (class, useClass, useValue, useFactory).
   */
  private registerProvider(provider: any) {
    if (typeof provider === "function") {
      this.providers.set(provider, { type: "class", value: provider });
    } else if (provider && provider.provide) {
      if (provider.useValue !== undefined) {
        this.providers.set(provider.provide, {
          type: "value",
          value: provider.useValue,
        });
      } else if (provider.useFactory) {
        this.providers.set(provider.provide, {
          type: "factory",
          value: provider.useFactory,
          deps: provider.deps || provider.inject || [],
        });
      } else if (provider.useClass) {
        this.providers.set(provider.provide, {
          type: "class",
          value: provider.useClass,
        });
      } else {
        // Fallback: treat the whole object as the provider class
        this.providers.set(provider.provide, {
          type: "class",
          value: provider.provide,
        });
      }
    }
  }

  /**
   * Register an imported module's providers and controllers.
   * - Controllers from imported modules are registered globally (like NestJS).
   * - Only EXPORTED providers are available to the parent module.
   * - Non-exported providers remain internal to the imported module.
   */
  private registerImportedModule(moduleClass: any) {
    const metadata = Reflect.getMetadata(MODULE_KEY, moduleClass) || {};
    const exported: any[] = metadata.exports || [];
    const providers: any[] = metadata.providers || [];
    const ctrlClasses: any[] = metadata.controllers || [];

    // Register only exported providers
    for (const provider of providers) {
      const token =
        typeof provider === "function" ? provider : provider.provide;
      if (exported.includes(token)) {
        this.registerProvider(provider);
      }
    }

    // Register controllers globally (like NestJS does for all modules)
    for (const ctrl of ctrlClasses) {
      this.controllers.push(ctrl);
    }

    // Recursively process sub-imports (using registerImportedModule to maintain encapsulation)
    const imports: any[] = metadata.imports || [];
    for (const imp of imports) {
      this.registerImportedModule(imp);
    }
  }

  resolve<T>(token: InjectionToken): T {
    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }

    const entry = this.providers.get(token);
    if (!entry) {
      throw new Error(`No provider found for token: ${String(token)}`);
    }

    let instance: T;

    switch (entry.type) {
      case "value":
        instance = entry.value;
        break;

      case "factory": {
        const factoryDeps = entry.deps.map((dep: InjectionToken) =>
          this.resolve(dep),
        );
        instance = entry.value(...factoryDeps);
        break;
      }

      case "class":
      default: {
        const ProviderClass = entry.value;
        const deps: InjectionToken[] =
          Reflect.getMetadata(DEPS_KEY, ProviderClass) || [];
        const resolvedDeps = deps.map((dep) => this.resolve(dep));
        instance = new ProviderClass(...resolvedDeps);
        break;
      }
    }

    // Only cache class-based and singleton-like instances (not raw values or factory results that could be request-scoped)
    this.instances.set(token, instance);
    return instance as T;
  }

  resolveController(ctrlClass: any): any {
    if (this.instances.has(ctrlClass)) {
      return this.instances.get(ctrlClass);
    }

    const deps: InjectionToken[] =
      Reflect.getMetadata(DEPS_KEY, ctrlClass) || [];
    const resolvedDeps = deps.map((dep) => this.resolve(dep));
    const instance = new ctrlClass(...resolvedDeps);
    this.instances.set(ctrlClass, instance);
    return instance;
  }

  getControllers(): any[] {
    return this.controllers;
  }
}
