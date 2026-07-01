import "reflect-metadata";
import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  QueueProducer,
  QueueConsumer,
  QueueProducerType,
  QueueBindingNotFoundError,
  getQueueProducerBindings,
  getQueueConsumers,
  _setQueueEnv,
  _clearQueueEnv,
} from "../src/extras/queue";
import { Controller, Module, Injectable, Get } from "../src/decorators/index";
import { createApplication } from "../src/core/application";

// ─── Helpers ───────────────────────────────────────────────────────────

/** Creates a fake queue binding similar to what Workers provides. */
function fakeQueue() {
  return {
    send: vi.fn(),
    sendBatch: vi.fn(),
  };
}

function setupEnv(bindings: Record<string, unknown>) {
  _setQueueEnv(bindings);
}

beforeEach(() => {
  _clearQueueEnv();
});

// ─── @QueueProducer ────────────────────────────────────────────────────

describe("@QueueProducer", () => {
  it("should store metadata with default binding name", () => {
    class TestService {
      @QueueProducer()
      declare queue: QueueProducerType;
    }

    const bindings = getQueueProducerBindings(TestService);
    expect(bindings).toHaveLength(1);
    expect(bindings[0]).toEqual({
      propertyKey: "queue",
      binding: "QUEUE",
    });
  });

  it("should accept a custom binding name", () => {
    class TestService {
      @QueueProducer("NOTIFICATIONS")
      declare notificationQueue: QueueProducerType;
    }

    const bindings = getQueueProducerBindings(TestService);
    expect(bindings[0].binding).toBe("NOTIFICATIONS");
  });

  it("should allow multiple producer properties", () => {
    class TestService {
      @QueueProducer()
      declare queueA: QueueProducerType;

      @QueueProducer("QUEUE_B")
      declare queueB: QueueProducerType;
    }

    const bindings = getQueueProducerBindings(TestService);
    expect(bindings).toHaveLength(2);
  });

  it("should return a producer that can send messages", async () => {
    const q = fakeQueue();

    class TestService {
      @QueueProducer()
      declare queue: QueueProducerType;
    }

    const instance = new TestService();
    setupEnv({ QUEUE: q });

    const producer: QueueProducerType = (instance as any).queue;
    await producer.send({ type: "hello" });

    expect(q.send).toHaveBeenCalledWith({ type: "hello" });
  });

  it("should support sendBatch", async () => {
    const q = fakeQueue();

    class TestService {
      @QueueProducer("MY_QUEUE")
      declare queue: QueueProducerType;
    }

    const instance = new TestService();
    setupEnv({ MY_QUEUE: q });

    const producer: QueueProducerType = (instance as any).queue;
    await producer.sendBatch([{ a: 1 }, { a: 2 }]);

    expect(q.sendBatch).toHaveBeenCalledWith([{ a: 1 }, { a: 2 }]);
  });

  it("should throw QueueBindingNotFoundError when binding is missing", () => {
    class TestService {
      @QueueProducer("MISSING")
      declare queue: QueueProducerType;
    }

    const instance = new TestService();
    setupEnv({}); // empty env

    expect(() => (instance as any).queue).toThrow(QueueBindingNotFoundError);
  });

  it("should allow overriding the property value (for tests)", () => {
    class TestService {
      @QueueProducer()
      declare queue: QueueProducerType;
    }

    const instance = new TestService() as any;
    const mock = { send: vi.fn(), sendBatch: vi.fn() };
    instance.queue = mock; // setter override

    // The cached value should be the mock
    expect((instance as any).queue).toBe(mock);
  });
});

// ─── @QueueConsumer ────────────────────────────────────────────────────

describe("@QueueConsumer", () => {
  it("should register a consumer handler", () => {
    class TestController {
      @QueueConsumer("my-queue")
      handle(batch: any) {}
    }

    const consumers = getQueueConsumers(TestController);
    expect(consumers).toHaveLength(1);
    expect(consumers[0]).toEqual({
      queueName: "my-queue",
      handlerName: "handle",
      options: undefined,
    });
  });

  it("should accept consumer options", () => {
    class TestController {
      @QueueConsumer("my-queue", { batchSize: 10, maxRetries: 5 })
      handle(batch: any) {}
    }

    const consumers = getQueueConsumers(TestController);
    expect(consumers[0].options).toEqual({
      batchSize: 10,
      maxRetries: 5,
    });
  });

  it("should replace previous registration for the same queue name", () => {
    class TestController {
      @QueueConsumer("my-queue")
      handleA(batch: any) {}

      @QueueConsumer("my-queue")
      handleB(batch: any) {}
    }

    const consumers = getQueueConsumers(TestController);
    expect(consumers).toHaveLength(1);
    expect(consumers[0].handlerName).toBe("handleB");
  });

  it("should allow multiple consumers on different queues", () => {
    class TestController {
      @QueueConsumer("queue-a")
      handleA(batch: any) {}

      @QueueConsumer("queue-b")
      handleB(batch: any) {}
    }

    const consumers = getQueueConsumers(TestController);
    expect(consumers).toHaveLength(2);
  });

  it("should return empty array for classes without consumers", () => {
    class NoConsumers {}
    expect(getQueueConsumers(NoConsumers)).toEqual([]);
  });
});

// ─── createQueueHandler ────────────────────────────────────────────────

describe("createQueueHandler", () => {
  it("should handle a queue by dispatching to the matching consumer", async () => {
    const handlerFn = vi.fn();

    class TestController {
      @QueueConsumer("my-queue")
      async handle(batch: any) {
        handlerFn(batch);
      }
    }

    // Create app to gain access to container
    @Module({ controllers: [TestController] })
    class AppModule {}

    const app = createApplication(AppModule);

    // Create queue handler using the app's container
    const { createQueueHandler: buildHandler } =
      await import("../src/extras/queue");

    const queueHandler = buildHandler(
      (ctrlClass: any) => {
        // For test purposes, create a fresh instance
        return new ctrlClass();
      },
      [TestController],
    );

    const fakeBatch = {
      queue: "my-queue",
      messages: [{ id: "1", body: { hello: "world" } }],
    };

    await queueHandler(fakeBatch, { SOME_ENV: "val" }, {} as ExecutionContext);

    expect(handlerFn).toHaveBeenCalledOnce();
    expect(handlerFn).toHaveBeenCalledWith(fakeBatch);
  });

  it("should log an error when no consumer matches the queue", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { createQueueHandler: buildHandler } =
      await import("../src/extras/queue");

    const queueHandler = buildHandler(() => ({}), []);

    const fakeBatch = { queue: "unknown-queue", messages: [] };
    await queueHandler(fakeBatch, {}, {} as ExecutionContext);

    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0][0]).toContain("unknown-queue");

    consoleSpy.mockRestore();
  });

  it("should set env context so @QueueProducer works inside consumer", async () => {
    const q = fakeQueue();
    const sendSpy = q.send;

    class ChatService {
      @QueueProducer("OUTBOUND")
      declare outbound: QueueProducerType;
    }

    class ChatController {
      constructor(private chatService: ChatService) {}

      @QueueConsumer("incoming")
      async handle(batch: any) {
        // Producers should work because env is set
        await this.chatService.outbound.send({ reply: "ack" });
      }
    }

    const { createQueueHandler: buildHandler } =
      await import("../src/extras/queue");

    // Simulate the container-like instantiation
    const chatService = new ChatService();

    const queueHandler = buildHandler(() => {
      return new ChatController(chatService);
    }, [ChatController]);

    const fakeBatch = { queue: "incoming", messages: [{ id: "1" }] };

    await queueHandler(fakeBatch, { OUTBOUND: q }, {} as ExecutionContext);

    expect(sendSpy).toHaveBeenCalledWith({ reply: "ack" });
  });
});

// ─── Integration with full app ─────────────────────────────────────────

describe("Queue integration with application", () => {
  it("should work alongside regular HTTP controllers", async () => {
    const httpHandler = vi.fn().mockReturnValue(new Response("ok"));

    class TestController {
      @Get("hello")
      hello() {
        return httpHandler();
      }

      @QueueConsumer("my-queue")
      async handleBatch(batch: any) {}
    }

    @Module({ controllers: [TestController] })
    class AppModule {}

    const app = createApplication(AppModule);

    const response = await app.handle(
      new Request("http://localhost/hello"),
      {},
      {} as ExecutionContext,
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("ok");
  });
});
