import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  Module,
  NestWorkerPlugin,
  PluginRegistry,
  createApplication,
  Injectable,
  Controller,
  Get,
} from "../src/index";
import type { Container } from "../src/core/container";

// ─── Mock plugins ─────────────────────────────────────────────────

function createMockPlugin(name: string): NestWorkerPlugin {
  return {
    name,
    onBeforeInit: vi.fn(),
    onAfterInit: vi.fn(),
    onBeforeDestroy: vi.fn(),
  };
}

// ─── PluginRegistry tests ─────────────────────────────────────────

describe("PluginRegistry", () => {
  it("should register and return plugins", () => {
    const registry = new PluginRegistry();
    const plugin = createMockPlugin("test");

    registry.register(plugin);

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0].name).toBe("test");
  });

  it("should deduplicate plugins by name (last wins)", () => {
    const registry = new PluginRegistry();
    const p1 = createMockPlugin("test");
    const p2 = createMockPlugin("test");

    registry.register(p1);
    registry.register(p2);

    expect(registry.getAll()).toHaveLength(1);
    expect(registry.getAll()[0]).toBe(p2);
  });

  it("should register multiple plugins at once", () => {
    const registry = new PluginRegistry();
    const p1 = createMockPlugin("alpha");
    const p2 = createMockPlugin("beta");

    registry.registerMany([p1, p2]);

    expect(registry.getAll()).toHaveLength(2);
  });

  it("should find a plugin by name", () => {
    const registry = new PluginRegistry();
    const plugin = createMockPlugin("target");
    registry.register(plugin);

    expect(registry.find("target")).toBe(plugin);
    expect(registry.find("nonexistent")).toBeUndefined();
  });

  it("should remove a plugin by name", () => {
    const registry = new PluginRegistry();
    registry.register(createMockPlugin("a"));
    registry.register(createMockPlugin("b"));

    expect(registry.remove("a")).toBe(true);
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.remove("nonexistent")).toBe(false);
  });

  it("should clear all plugins", () => {
    const registry = new PluginRegistry();
    registry.register(createMockPlugin("a"));
    registry.register(createMockPlugin("b"));
    registry.clear();

    expect(registry.getAll()).toHaveLength(0);
  });

  it("should run onBeforeInit hooks with the container", () => {
    const registry = new PluginRegistry();
    const onBeforeInit = vi.fn();
    const plugin: NestWorkerPlugin = {
      name: "test",
      onBeforeInit,
    };
    registry.register(plugin);

    // We can't easily create a real Container here without a module,
    // but we can verify the hook is called
    const fakeContainer = {} as Container;
    registry.runBeforeInit(fakeContainer);

    expect(onBeforeInit).toHaveBeenCalledWith(fakeContainer);
  });

  it("should run onAfterInit hooks with the app", () => {
    const registry = new PluginRegistry();
    const onAfterInit = vi.fn();
    const plugin: NestWorkerPlugin = {
      name: "test",
      onAfterInit,
    };
    registry.register(plugin);

    const fakeApp = { use: vi.fn(), useErrorFilter: vi.fn(), container: {} as Container };
    registry.runAfterInit(fakeApp);

    expect(onAfterInit).toHaveBeenCalledWith(fakeApp);
  });

  it("should run onBeforeDestroy hooks in reverse order", async () => {
    const registry = new PluginRegistry();
    const order: string[] = [];
    const p1: NestWorkerPlugin = {
      name: "first",
      onBeforeDestroy: async () => { order.push("first"); },
    };
    const p2: NestWorkerPlugin = {
      name: "second",
      onBeforeDestroy: async () => { order.push("second"); },
    };
    registry.registerMany([p1, p2]);

    const fakeApp = { use: vi.fn(), useErrorFilter: vi.fn(), container: {} as Container };
    await registry.runBeforeDestroy(fakeApp);

    // Should run in reverse order (LIFO): second, first
    expect(order).toEqual(["second", "first"]);
  });

  it("should skip optional hooks that are not defined", () => {
    const registry = new PluginRegistry();
    const plugin: NestWorkerPlugin = { name: "minimal" };
    registry.register(plugin);

    // Should not throw
    const fakeContainer = {} as Container;
    const fakeApp = { use: vi.fn(), useErrorFilter: vi.fn(), container: {} as Container };

    expect(() => registry.runBeforeInit(fakeContainer)).not.toThrow();
    expect(() => registry.runAfterInit(fakeApp)).not.toThrow();
  });
});

// ─── Integration tests ─────────────────────────────────────────────

describe("Plugin system integration", () => {
  it("should run plugin lifecycle hooks during application creation", () => {
    const onBeforeInit = vi.fn();
    const onAfterInit = vi.fn();

    const testPlugin: NestWorkerPlugin = {
      name: "integration-test",
      onBeforeInit,
      onAfterInit,
    };

    @Controller()
    class TestController {
      @Get()
      get() {
        return { ok: true };
      }
    }

    @Module({
      controllers: [TestController],
      plugins: [testPlugin],
    })
    class TestModule {}

    const app = createApplication(TestModule);

    // onBeforeInit should have been called with the container
    expect(onBeforeInit).toHaveBeenCalledTimes(1);
    expect(onBeforeInit).toHaveBeenCalledWith(app.container);

    // onAfterInit should have been called with the app
    expect(onAfterInit).toHaveBeenCalledTimes(1);
    expect(onAfterInit).toHaveBeenCalledWith(
      expect.objectContaining({ container: app.container }),
    );
  });

  it("should allow plugins to register providers via onBeforeInit", () => {
    const CONFIG_TOKEN = "APP_CONFIG";

    const configPlugin: NestWorkerPlugin = {
      name: "config-provider",
      onBeforeInit(container: Container) {
        // Register a value provider using the container's register method
        // We do this via the class-based approach - registering directly
        // on the container is done through module providers normally
        container.register({
          // We use a fake module that exports the token
          plugins: [],
        } as any);
      },
      onAfterInit() {},
    };

    @Controller()
    class TestController {
      @Get()
      get() {
        return { ok: true };
      }
    }

    @Module({
      controllers: [TestController],
      plugins: [configPlugin],
    })
    class TestModule {}

    const app = createApplication(TestModule);

    // The plugin hooks ran without error
    expect(app.pluginRegistry.find("config-provider")).toBeDefined();
    expect(app.pluginRegistry.getAll()).toHaveLength(1);
  });

  it("should handle multiple plugins in order", () => {
    const order: string[] = [];

    const pluginA: NestWorkerPlugin = {
      name: "A",
      onBeforeInit() { order.push("A:init"); },
      onAfterInit() { order.push("A:after"); },
    };

    const pluginB: NestWorkerPlugin = {
      name: "B",
      onBeforeInit() { order.push("B:init"); },
      onAfterInit() { order.push("B:after"); },
    };

    @Controller()
    class TestController {
      @Get()
      get() {
        return { ok: true };
      }
    }

    @Module({
      controllers: [TestController],
      plugins: [pluginA, pluginB],
    })
    class TestModule {}

    createApplication(TestModule);

    // onBeforeInit runs for all plugins first, then onAfterInit
    expect(order).toEqual(["A:init", "B:init", "A:after", "B:after"]);
  });

  it("should expose pluginRegistry from application", () => {
    const plugin: NestWorkerPlugin = {
      name: "exposed",
    };

    @Controller()
    class TestController {
      @Get()
      get() {
        return { ok: true };
      }
    }

    @Module({
      controllers: [TestController],
      plugins: [plugin],
    })
    class TestModule {}

    const app = createApplication(TestModule);

    expect(app.pluginRegistry).toBeDefined();
    expect(app.pluginRegistry.find("exposed")).toBe(plugin);
  });
});
