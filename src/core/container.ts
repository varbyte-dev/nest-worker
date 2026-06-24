import { InjectionToken } from "./types";

const MODULE_KEY = "__module__";
const DEPS_KEY = "__deps__";

type ProviderEntry =
  | { type: "value"; value: any }
  | { type: "factory"; value: (...args: any[]) => any; deps: InjectionToken[] }
  | { type: "class"; value: new (...args: any[]) => any };

interface ModuleContext {
  moduleClass: any;
  providers: Map<InjectionToken, ProviderEntry>;
  instances: Map<InjectionToken, any>;
  imports: ModuleContext[];
  exports: Set<InjectionToken>;
  controllers: any[];
}

export class Container {
  private rootContext?: ModuleContext;
  private moduleContexts = new Map<any, ModuleContext>();
  private controllerContexts = new Map<any, ModuleContext>();
  private controllers: any[] = [];

  register(moduleClass: any) {
    this.rootContext = this.createModuleContext(moduleClass);
    this.controllers = Array.from(this.controllerContexts.keys());
  }

  private createModuleContext(moduleClass: any): ModuleContext {
    const existing = this.moduleContexts.get(moduleClass);
    if (existing) return existing;

    const metadata = Reflect.getMetadata(MODULE_KEY, moduleClass) || {};
    const context: ModuleContext = {
      moduleClass,
      providers: new Map(),
      instances: new Map(),
      imports: [],
      exports: new Set(metadata.exports || []),
      controllers: metadata.controllers || [],
    };

    this.moduleContexts.set(moduleClass, context);

    const providers: any[] = metadata.providers || [];
    for (const provider of providers) {
      this.registerProvider(context, provider);
    }

    for (const ctrl of context.controllers) {
      this.controllerContexts.set(ctrl, context);
    }

    const imports: any[] = metadata.imports || [];
    for (const imp of imports) {
      const importedContext = this.createModuleContext(imp);
      context.imports.push(importedContext);
    }

    return context;
  }

  /**
   * Register a single provider entry (class, useClass, useValue, useFactory).
   */
  private registerProvider(context: ModuleContext, provider: any) {
    if (typeof provider === "function") {
      context.providers.set(provider, { type: "class", value: provider });
    } else if (provider && provider.provide) {
      if (provider.useValue !== undefined) {
        context.providers.set(provider.provide, {
          type: "value",
          value: provider.useValue,
        });
      } else if (provider.useFactory) {
        context.providers.set(provider.provide, {
          type: "factory",
          value: provider.useFactory,
          deps: provider.deps || provider.inject || [],
        });
      } else if (provider.useClass) {
        context.providers.set(provider.provide, {
          type: "class",
          value: provider.useClass,
        });
      } else {
        context.providers.set(provider.provide, {
          type: "class",
          value: provider.provide,
        });
      }
    }
  }

  resolve<T>(token: InjectionToken): T {
    if (!this.rootContext) {
      throw new Error("Container has not been registered with a root module");
    }

    return this.resolveFromContext(token, this.rootContext);
  }

  private resolveFromContext<T>(
    token: InjectionToken,
    context: ModuleContext,
  ): T {
    if (context.instances.has(token)) {
      return context.instances.get(token) as T;
    }

    const entry = this.findProviderEntry(token, context);
    if (!entry) {
      throw new Error(`No provider found for token: ${String(token)}`);
    }

    const ownerContext = entry.context;
    let instance: T;

    switch (entry.provider.type) {
      case "value":
        instance = entry.provider.value;
        break;

      case "factory": {
        const factoryDeps = entry.provider.deps.map((dep: InjectionToken) =>
          this.resolveFromContext(dep, ownerContext),
        );
        instance = entry.provider.value(...factoryDeps);
        break;
      }

      case "class":
      default: {
        const ProviderClass = entry.provider.value;
        const deps: InjectionToken[] =
          Reflect.getMetadata(DEPS_KEY, ProviderClass) || [];
        const resolvedDeps = deps.map((dep) =>
          this.resolveFromContext(dep, ownerContext),
        );
        instance = new ProviderClass(...resolvedDeps);
        break;
      }
    }

    ownerContext.instances.set(token, instance);
    return instance as T;
  }

  private findProviderEntry(
    token: InjectionToken,
    context: ModuleContext,
  ): { provider: ProviderEntry; context: ModuleContext } | undefined {
    const ownProvider = context.providers.get(token);
    if (ownProvider) return { provider: ownProvider, context };

    for (const importedContext of context.imports) {
      if (!importedContext.exports.has(token)) continue;

      const importedProvider = importedContext.providers.get(token);
      if (importedProvider) {
        return { provider: importedProvider, context: importedContext };
      }
    }
  }

  resolveController(ctrlClass: any): any {
    const context = this.controllerContexts.get(ctrlClass);
    if (!context) {
      throw new Error(`No controller found for token: ${String(ctrlClass)}`);
    }

    if (context.instances.has(ctrlClass)) {
      return context.instances.get(ctrlClass);
    }

    const deps: InjectionToken[] =
      Reflect.getMetadata(DEPS_KEY, ctrlClass) || [];
    const resolvedDeps = deps.map((dep) => this.resolveFromContext(dep, context));
    const instance = new ctrlClass(...resolvedDeps);
    context.instances.set(ctrlClass, instance);
    return instance;
  }

  getControllers(): any[] {
    return this.controllers;
  }
}
