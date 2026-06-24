import "reflect-metadata";
import { describe, it, expect } from "vitest";
import { Container } from "../src/core/container";

import { Injectable } from "../src/decorators/index";

// ─── Test classes ─────────────────────────────────────────────────

@Injectable()
class SimpleService {
  getName() {
    return "SimpleService";
  }
}

@Injectable()
class DependentService {
  constructor(public readonly simple: SimpleService) {}
}

const FACTORY_TOKEN = "FACTORY_TOKEN";
const VALUE_TOKEN = "VALUE_TOKEN";
const ALIAS_TOKEN = "ALIAS_TOKEN";

// ─── Module helpers ───────────────────────────────────────────────

const MODULE_KEY = "__module__";

function createModule(metadata: any) {
  const MockModule = class {};
  Reflect.defineMetadata(MODULE_KEY, metadata, MockModule);
  return MockModule;
}

describe("Container", () => {
  describe("useValue providers", () => {
    it("should resolve useValue providers", () => {
      const container = new Container();
      const MODULE = createModule({
        providers: [{ provide: VALUE_TOKEN, useValue: { apiKey: "sk-123" } }],
      });
      container.register(MODULE);
      const resolved = container.resolve(VALUE_TOKEN);
      expect(resolved).toEqual({ apiKey: "sk-123" });
    });

    it("should resolve primitive useValue", () => {
      const container = new Container();
      const MODULE = createModule({
        providers: [{ provide: "CONFIG", useValue: 42 }],
      });
      container.register(MODULE);
      expect(container.resolve("CONFIG")).toBe(42);
    });
  });

  describe("useFactory providers", () => {
    it("should resolve useFactory providers", () => {
      const container = new Container();
      const MODULE = createModule({
        providers: [
          SimpleService,
          {
            provide: FACTORY_TOKEN,
            useFactory: (simple: SimpleService) =>
              `factory-${simple.getName()}`,
            inject: [SimpleService],
          },
        ],
      });
      container.register(MODULE);
      const result = container.resolve(FACTORY_TOKEN);
      expect(result).toBe("factory-SimpleService");
    });
  });

  describe("useClass providers", () => {
    it("should resolve useClass providers", () => {
      const container = new Container();
      const MODULE = createModule({
        providers: [{ provide: ALIAS_TOKEN, useClass: SimpleService }],
      });
      container.register(MODULE);
      const resolved = container.resolve(ALIAS_TOKEN) as SimpleService;
      expect(resolved).toBeInstanceOf(SimpleService);
      expect(resolved.getName()).toBe("SimpleService");
    });
  });

  describe("class providers with dependency injection", () => {
    it("should automatically inject constructor dependencies", () => {
      const container = new Container();
      const MODULE = createModule({
        providers: [SimpleService, DependentService],
      });
      container.register(MODULE);
      const dependent = container.resolve(DependentService);
      expect(dependent).toBeInstanceOf(DependentService);
      expect(dependent.simple).toBeInstanceOf(SimpleService);
      // Should be the same singleton instance
      expect(dependent.simple).toBe(container.resolve(SimpleService));
    });
  });

  describe("module encapsulation", () => {
    it("should not expose non-exported providers from imported modules", () => {
      const container = new Container();

      const InternalService = class InternalService {
        get secret() {
          return "internal";
        }
      };

      const ImportedModule = createModule({
        providers: [InternalService],
        exports: [],
        controllers: [],
      });

      const RootModule = createModule({
        imports: [ImportedModule],
        providers: [],
        controllers: [],
      });

      container.register(RootModule);

      expect(() => container.resolve(InternalService)).toThrow(
        "No provider found",
      );
    });

    it("should expose exported providers from imported modules", () => {
      const container = new Container();

      const SharedService = class SharedService {
        getData() {
          return "shared";
        }
      };

      const ImportedModule = createModule({
        providers: [SharedService],
        exports: [SharedService],
      });

      const RootModule = createModule({
        imports: [ImportedModule],
      });

      container.register(RootModule);

      const resolved = container.resolve(SharedService);
      expect(resolved).toBeInstanceOf(SharedService);
      expect(resolved.getData()).toBe("shared");
    });

    it("should resolve imported module controllers with their internal providers", () => {
      const container = new Container();

      class InternalService {
        getData() {
          return "internal";
        }
      }

      class ImportedController {
        constructor(public readonly service: InternalService) {}
      }

      Reflect.defineMetadata("__deps__", [InternalService], ImportedController);

      const ImportedModule = createModule({
        providers: [InternalService],
        controllers: [ImportedController],
        exports: [],
      });

      const RootModule = createModule({
        imports: [ImportedModule],
      });

      container.register(RootModule);

      const controller = container.resolveController(ImportedController);

      expect(controller).toBeInstanceOf(ImportedController);
      expect(controller.service).toBeInstanceOf(InternalService);
      expect(controller.service.getData()).toBe("internal");
      expect(() => container.resolve(InternalService)).toThrow(
        "No provider found",
      );
    });
  });

  describe("error handling", () => {
    it("should throw when no provider found", () => {
      const container = new Container();
      const MODULE = createModule({ providers: [] });
      container.register(MODULE);
      expect(() => container.resolve("NONEXISTENT")).toThrow(
        "No provider found",
      );
    });
  });
});
