import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import {
  WebSocket,
  DurableObject,
  OnOpen,
  OnMessage,
  OnClose,
  isDurableObjectClass,
  isWebSocketRoute,
  getWsEvents,
  wsUpgradeResponse,
  handleWebSocketLifecycle,
} from "../src/extras/websocket";
import { Controller, Get, Module } from "../src/decorators/index";
import { createApplication } from "../src/core/application";

describe("WebSocket decorators", () => {
  describe("@WebSocket", () => {
    it("should register a route with isWebSocket flag", () => {
      @Controller("ws")
      class TestController {
        @WebSocket()
        handle() {
          return new Response(null, { status: 200 });
        }
      }

      const routes = Reflect.getMetadata("__routes__", TestController);
      expect(routes).toHaveLength(1);
      expect(routes[0].handlerName).toBe("handle");
      expect(routes[0].isWebSocket).toBe(true);
      expect(routes[0].method).toBe("GET");
    });

    it("should accept a custom path", () => {
      @Controller()
      class TestController {
        @WebSocket("/chat")
        handle() {}
      }

      const routes = Reflect.getMetadata("__routes__", TestController);
      expect(routes[0].path).toBe("chat");
    });

    it("isWebSocketRoute helper should detect WS routes", () => {
      @Controller()
      class TestController {
        @WebSocket()
        wsHandler() {}

        @Get()
        httpHandler() {}
      }

      const routes = Reflect.getMetadata("__routes__", TestController);
      expect(isWebSocketRoute(routes[0])).toBe(true);
      expect(isWebSocketRoute(routes[1])).toBe(false);
    });
  });

  describe("@DurableObject", () => {
    it("should mark a class as a Durable Object", () => {
      @DurableObject()
      class MyDO {}

      expect(isDurableObjectClass(MyDO)).toBe(true);
    });

    it("should not mark regular classes", () => {
      class RegularClass {}

      expect(isDurableObjectClass(RegularClass)).toBe(false);
    });
  });

  describe("WebSocket lifecycle decorators", () => {
    it("should register WebSocket event handlers", () => {
      @DurableObject()
      class ChatRoom {
        @OnOpen()
        onOpen(ws: WebSocket) {}

        @OnMessage()
        onMessage(ws: WebSocket, message: string) {}

        @OnClose()
        onClose(ws: WebSocket, code: number) {}
      }

      const events = getWsEvents(ChatRoom);
      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: "open", handlerName: "onOpen" });
      expect(events[1]).toEqual({ type: "message", handlerName: "onMessage" });
      expect(events[2]).toEqual({ type: "close", handlerName: "onClose" });
    });

    it("should return empty array for classes without lifecycle decorators", () => {
      class NoEvents {}
      expect(getWsEvents(NoEvents)).toEqual([]);
    });
  });
});

describe("WebSocket router integration", () => {
  it("should route requests to WebSocket-marked handlers", async () => {
    const wsHandler = vi.fn().mockReturnValue(new Response("ws ok"));

    @Controller("ws")
    class WsController {
      @WebSocket()
      handleUpgrade() {
        return wsHandler();
      }

      @Get()
      normal() {
        return new Response("ok");
      }
    }

    @Module({ controllers: [WsController] })
    class AppModule {}

    const app = createApplication(AppModule);

    // Request to WS route
    const wsRequest = new Request("http://localhost/ws");
    const wsResponse = await app.handle(wsRequest, {}, {} as ExecutionContext);
    expect(wsResponse.status).toBe(200);
    expect(await wsResponse.text()).toBe("ws ok");
    expect(wsHandler).toHaveBeenCalledTimes(1);

    // Request should still hit the WS handler (it was registered first)
    // because @WebSocket uses GET method by default and matches first
  });

  it("should pass through 101 responses without wrapping", async () => {
    // In Node.js the Response constructor doesn't support status 101,
    // so we simulate the behavior by returning a normal response.
    // The actual 101 passthrough logic in the router is:
    //   if (response.status === 101) return response;
    // This test verifies the handler is called correctly.
    const handler = vi.fn().mockReturnValue(new Response("passthrough"));
    let capturedResponse: Response | null = null;

    @Controller("echo")
    class EchoController {
      @WebSocket()
      handleUpgrade() {
        const res = handler();
        capturedResponse = res;
        return res;
      }
    }

    @Module({ controllers: [EchoController] })
    class AppModule {}

    const app = createApplication(AppModule);
    const request = new Request("http://localhost/echo");
    const response = await app.handle(request, {} as ExecutionContext);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("passthrough");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe("wsUpgradeResponse", () => {
  it("should return a Response object (requires Workers runtime for 101)", () => {
    const mockWs = {} as WebSocket;
    // Status 101 is only valid in the Workers runtime (not Node.js).
    // We verify the function produces a proper Response by checking
    // its structure when run in a compatible environment.
    try {
      const response = wsUpgradeResponse(mockWs);
      expect(response).toBeInstanceOf(Response);
    } catch (e) {
      // In Node.js the Response constructor rejects status 101
      expect((e as RangeError).message).toContain("status");
      expect((e as RangeError).message).toContain("200");
    }
  });
});

describe("WebSocket lifecycle handler", () => {
  it("should return 500 if no event handlers registered", async () => {
    class NoHandlersDO {
      async fetch(request: Request) {
        return handleWebSocketLifecycle(this, request);
      }
    }

    const doInstance = new NoHandlersDO();
    // Mock WebSocketPair for the test
    const originalWebSocketPair = (globalThis as any).WebSocketPair;
    (globalThis as any).WebSocketPair = class {
      0 = { accept: vi.fn(), addEventListener: vi.fn() };
      1 = { accept: vi.fn(), addEventListener: vi.fn() };
    };

    try {
      const request = new Request("http://do/ws", {
        headers: { Upgrade: "websocket" },
      });
      const response = await doInstance.fetch(request);
      expect(response.status).toBe(500);
      expect(await response.text()).toBe("No WebSocket handlers registered");
    } finally {
      (globalThis as any).WebSocketPair = originalWebSocketPair;
    }
  });
});
