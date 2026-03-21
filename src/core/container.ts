import { InjectionToken } from './types';

const MODULE_KEY = '__module__';
const INJECTABLE_KEY = '__injectable__';
const CONTROLLER_KEY = '__controller__';
const DEPS_KEY = '__deps__';

export class Container {
  private instances = new Map<InjectionToken, any>();
  private providers = new Map<InjectionToken, any>();
  private controllers: any[] = [];
  private env: Record<string, unknown> = {};

  setEnv(env: Record<string, unknown>) {
    this.env = env;
  }

  getEnv() {
    return this.env;
  }

  register(moduleClass: any) {
    const metadata = Reflect.getMetadata(MODULE_KEY, moduleClass) || {};

    // Register providers
    const providers: any[] = metadata.providers || [];
    for (const provider of providers) {
      if (typeof provider === 'function') {
        this.providers.set(provider, provider);
      } else if (provider.provide) {
        this.providers.set(provider.provide, provider.useClass || provider.useValue || provider.useFactory);
      }
    }

    // Register controllers
    const ctrlClasses: any[] = metadata.controllers || [];
    for (const ctrl of ctrlClasses) {
      this.controllers.push(ctrl);
    }

    // Import sub-modules (only exported providers are accessible)
    const imports: any[] = metadata.imports || [];
    for (const imp of imports) {
      const impMeta = Reflect.getMetadata(MODULE_KEY, imp) || {};
      const exported: any[] = impMeta.exports || [];
      const impProviders: any[] = impMeta.providers || [];

      // Register only exported providers from the imported module
      for (const provider of impProviders) {
        const token = typeof provider === 'function' ? provider : provider.provide;
        if (exported.includes(token)) {
          if (typeof provider === 'function') {
            this.providers.set(provider, provider);
          } else if (provider.provide) {
            this.providers.set(provider.provide, provider.useClass || provider.useValue || provider.useFactory);
          }
        }
      }

      // Recursively register the imported module's own imports and controllers
      this.register(imp);
    }
  }

  resolve<T>(token: InjectionToken): T {
    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }

    const ProviderClass = this.providers.get(token);
    if (!ProviderClass) {
      throw new Error(`No provider found for token: ${String(token)}`);
    }

    const deps: InjectionToken[] = Reflect.getMetadata(DEPS_KEY, ProviderClass) || [];
    const resolvedDeps = deps.map((dep) => this.resolve(dep));
    const instance = new ProviderClass(...resolvedDeps);
    this.instances.set(token, instance);
    return instance as T;
  }

  resolveController(ctrlClass: any): any {
    if (this.instances.has(ctrlClass)) {
      return this.instances.get(ctrlClass);
    }

    const deps: InjectionToken[] = Reflect.getMetadata(DEPS_KEY, ctrlClass) || [];
    const resolvedDeps = deps.map((dep) => this.resolve(dep));
    const instance = new ctrlClass(...resolvedDeps);
    this.instances.set(ctrlClass, instance);
    return instance;
  }

  getControllers(): any[] {
    return this.controllers;
  }
}
