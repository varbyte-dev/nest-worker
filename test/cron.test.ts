import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  Scheduled,
  ScheduledOptions,
  getScheduledHandlers,
  createScheduledHandler,
} from "../src/extras/cron";
import { Controller, Module, Get } from "../src/decorators/index";
import { createApplication } from "../src/core/application";

describe("@Scheduled", () => {
  it("should register a scheduled handler", () => {
    class TestCtrl {
      @Scheduled({ cron: "0 * * * *" })
      async run() {}
    }

    const handlers = getScheduledHandlers(TestCtrl);
    expect(handlers).toHaveLength(1);
    expect(handlers[0]).toEqual({
      cron: "0 * * * *",
      handlerName: "run",
      name: undefined,
      timeout: undefined,
    });
  });

  it("should accept optional name and timeout", () => {
    class TestCtrl {
      @Scheduled({
        cron: "0 * * * *",
        name: "hourly-check",
        timeout: "10 minutes",
      })
      async run() {}
    }

    const handlers = getScheduledHandlers(TestCtrl);
    expect(handlers[0].name).toBe("hourly-check");
    expect(handlers[0].timeout).toBe("10 minutes");
  });

  it("should allow multiple handlers in the same class", () => {
    class TestCtrl {
      @Scheduled({ cron: "0 * * * *" })
      hourly() {}

      @Scheduled({ cron: "0 0 * * *" })
      daily() {}
    }

    const handlers = getScheduledHandlers(TestCtrl);
    expect(handlers).toHaveLength(2);
  });

  it("should return empty array for classes without handlers", () => {
    class NoScheduled {}
    expect(getScheduledHandlers(NoScheduled)).toEqual([]);
  });
});

describe("createScheduledHandler", () => {
  it("should call all registered handlers on a scheduled event", async () => {
    const handlerA = vi.fn();
    const handlerB = vi.fn();

    class TestCtrl {
      @Scheduled({ cron: "0 * * * *" })
      async handleA() {
        handlerA();
      }

      @Scheduled({ cron: "0 0 * * *" })
      async handleB() {
        handlerB();
      }
    }

    const scheduledHandler = createScheduledHandler(
      () => new TestCtrl(),
      [TestCtrl],
    );

    await scheduledHandler({} as ScheduledEvent, {}, {} as ExecutionContext);

    expect(handlerA).toHaveBeenCalledOnce();
    expect(handlerB).toHaveBeenCalledOnce();
  });

  it("should continue if one handler throws", async () => {
    const handlerA = vi.fn().mockRejectedValue(new Error("fail"));
    const handlerB = vi.fn();

    class TestCtrl {
      @Scheduled({ cron: "0 * * * *" })
      async fail() {
        return handlerA();
      }

      @Scheduled({ cron: "0 * * * *" })
      async succeed() {
        handlerB();
      }
    }

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const scheduledHandler = createScheduledHandler(
      () => new TestCtrl(),
      [TestCtrl],
    );

    await scheduledHandler({} as ScheduledEvent, {}, {} as ExecutionContext);

    expect(handlerA).toHaveBeenCalledOnce();
    expect(handlerB).toHaveBeenCalledOnce();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("should work with controllers that have no scheduled handlers", async () => {
    class NoScheduledCtrl {
      @Get()
      hello() {
        return new Response("ok");
      }
    }

    const scheduledHandler = createScheduledHandler(
      () => new NoScheduledCtrl(),
      [NoScheduledCtrl],
    );

    // Should not throw
    await scheduledHandler({} as ScheduledEvent, {}, {} as ExecutionContext);
  });

  it("should pass the event to the handler", async () => {
    const receivedEvents: any[] = [];

    class TestCtrl {
      @Scheduled({ cron: "0 * * * *" })
      async handle(event: any) {
        receivedEvents.push(event);
      }
    }

    const scheduledHandler = createScheduledHandler(
      () => new TestCtrl(),
      [TestCtrl],
    );

    const fakeEvent = { type: "cron", cron: "0 * * * *" } as ScheduledEvent;
    await scheduledHandler(fakeEvent, {}, {} as ExecutionContext);

    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents[0]).toBe(fakeEvent);
  });
});

describe("Scheduled + HTTP integration", () => {
  it("should coexist with regular HTTP routes", async () => {
    const httpHandler = vi.fn().mockReturnValue(new Response("ok"));
    const cronHandler = vi.fn();

    class TestCtrl {
      @Get("ping")
      ping() {
        return httpHandler();
      }

      @Scheduled({ cron: "0 * * * *" })
      async tick() {
        cronHandler();
      }
    }

    @Module({ controllers: [TestCtrl] })
    class AppModule {}

    const app = createApplication(AppModule);

    // HTTP still works
    const response = await app.handle(
      new Request("http://localhost/ping"),
      {},
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");

    // Scheduled handler works independently
    const scheduledHandler = createScheduledHandler(
      () => new TestCtrl(),
      [TestCtrl],
    );
    await scheduledHandler({} as ScheduledEvent, {}, {} as ExecutionContext);
    expect(cronHandler).toHaveBeenCalledOnce();
  });
});
