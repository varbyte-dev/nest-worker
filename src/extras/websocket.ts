/**
 * WebSocket and Durable Objects support for nest-worker.
 *
 * Provides decorators and utilities for handling WebSocket connections
 * and Durable Object stateful actors at the edge.
 *
 * @module websocket
 */

// ─── Metadata keys ───────────────────────────────────────────────
const WS_HANDLER_KEY = "__ws_handler__";
const WS_EVENTS_KEY = "__ws_events__";
const DO_CLASS_KEY = "__durable_object__";

// ─── Durable Object ──────────────────────────────────────────────

/**
 * Marks a class as a Durable Object.
 *
 * The class constructor receives `(state: DurableObjectState, env: Record<string, unknown>)`
 * from the Workers runtime. Use `@OnOpen`, `@OnMessage`, `@OnClose` to handle
 * WebSocket lifecycle events within the Durable Object.
 *
 * @example
 * ```ts
 * @DurableObject()
 * class ChatRoom {
 *   private sessions: WebSocket[] = [];
 *
 *   @OnOpen()
 *   onOpen(connection: WebSocket) {
 *     this.sessions.push(connection);
 *   }
 *
 *   @OnMessage()
 *   onMessage(connection: WebSocket, message: string | ArrayBuffer) {
 *     for (const session of this.sessions) {
 *       session.send(message);
 *     }
 *   }
 *
 *   @OnClose()
 *   onClose(connection: WebSocket) {
 *     this.sessions = this.sessions.filter(s => s !== connection);
 *   }
 * }
 * ```
 */
export function DurableObject(): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(DO_CLASS_KEY, true, target);
  };
}

/**
 * Checks if a class is decorated with @DurableObject.
 */
export function isDurableObjectClass(target: any): boolean {
  return Reflect.getMetadata(DO_CLASS_KEY, target) === true;
}

// ─── WebSocket route decorator ───────────────────────────────────

/**
 * Marks a controller method as a WebSocket upgrade handler.
 *
 * The method receives the original `Request` and should return a Response
 * with `status: 101` and a `webSocket` property, typically using `WebSocketPair`.
 *
 * @example
 * ```ts
 * @Controller('ws')
 * class WsController {
 *   @WebSocket()
 *   handleUpgrade(req: Request) {
 *     const [client, server] = new WebSocketPair();
 *     server.accept();
 *     server.addEventListener('message', (event) => {
 *       server.send(`Echo: ${event.data}`);
 *     });
 *     return new Response(null, { status: 101, webSocket: client });
 *   }
 * }
 * ```
 */
export function WebSocket(path: string = ""): MethodDecorator {
  return (target, propertyKey) => {
    const routes = Reflect.getMetadata("__routes__", target.constructor) || [];
    routes.push({
      method: "GET" as const,
      path: path.replace(/^\//, ""),
      handlerName: String(propertyKey),
      isWebSocket: true,
    });
    Reflect.defineMetadata("__routes__", routes, target.constructor);
    Reflect.defineMetadata(
      `${WS_HANDLER_KEY}:${String(propertyKey)}`,
      true,
      target.constructor,
    );
  };
}

// ─── WebSocket lifecycle decorators (for Durable Objects) ─────────

type WsEventType = "open" | "message" | "close" | "error";

interface WsEventMetadata {
  type: WsEventType;
  handlerName: string;
}

/**
 * Marks a method to handle new WebSocket connections.
 *
 * Only valid inside a `@DurableObject()` class.
 * The method receives the `WebSocket` connection as its first argument.
 */
export function OnOpen(): MethodDecorator {
  return createWsEventDecorator("open");
}

/**
 * Marks a method to handle incoming WebSocket messages.
 *
 * Only valid inside a `@DurableObject()` class.
 * The method receives `(connection: WebSocket, message: string | ArrayBuffer)`.
 */
export function OnMessage(): MethodDecorator {
  return createWsEventDecorator("message");
}

/**
 * Marks a method to handle WebSocket connection close.
 *
 * Only valid inside a `@DurableObject()` class.
 * The method receives `(connection: WebSocket, code: number, reason: string)`.
 */
export function OnClose(): MethodDecorator {
  return createWsEventDecorator("close");
}

function createWsEventDecorator(type: WsEventType): MethodDecorator {
  return (target, propertyKey) => {
    const events: WsEventMetadata[] =
      Reflect.getMetadata(WS_EVENTS_KEY, target.constructor) || [];
    events.push({ type, handlerName: String(propertyKey) });
    Reflect.defineMetadata(WS_EVENTS_KEY, events, target.constructor);
  };
}

/**
 * Returns the WebSocket event handlers registered on a class.
 */
export function getWsEvents(target: any): WsEventMetadata[] {
  return Reflect.getMetadata(WS_EVENTS_KEY, target) || [];
}

/**
 * Returns true if the route definition is a WebSocket handler.
 */
export function isWebSocketRoute(route: any): boolean {
  return route.isWebSocket === true;
}

/**
 * Creates a WebSocket upgrade response.
 *
 * @example
 * ```ts
 * const [client, server] = new WebSocketPair();
 * server.accept();
 * return wsUpgradeResponse(client);
 * ```
 */
export function wsUpgradeResponse(webSocket: WebSocket): Response {
  return new Response(null, {
    status: 101,
    webSocket,
  });
}

/**
 * Wraps a Durable Object class to handle WebSocket connections
 * using the @OnOpen / @OnMessage / @OnClose lifecycle decorators.
 *
 * Call this from the DO's `fetch()` method:
 *
 * @example
 * ```ts
 * @DurableObject()
 * class ChatRoom {
 *   async fetch(request: Request) {
 *     return handleWebSocketLifecycle(this, request);
 *   }
 * }
 * ```
 */
export async function handleWebSocketLifecycle(
  instance: any,
  request: Request,
): Promise<Response> {
  const events = getWsEvents(instance.constructor);
  if (!events.length) {
    return new Response("No WebSocket handlers registered", { status: 500 });
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();

  const openHandler = events.find((e) => e.type === "open");
  const messageHandler = events.find((e) => e.type === "message");
  const closeHandler = events.find((e) => e.type === "close");

  if (openHandler) {
    try {
      await instance[openHandler.handlerName](server);
    } catch (err) {
      console.error("[nest-worker] WebSocket onOpen error:", err);
    }
  }

  server.addEventListener("message", async (event: MessageEvent) => {
    if (messageHandler) {
      try {
        await instance[messageHandler.handlerName](server, event.data);
      } catch (err) {
        console.error("[nest-worker] WebSocket onMessage error:", err);
      }
    }
  });

  server.addEventListener("close", async (event: CloseEvent) => {
    if (closeHandler) {
      try {
        await instance[closeHandler.handlerName](
          server,
          event.code,
          event.reason,
        );
      } catch (err) {
        console.error("[nest-worker] WebSocket onClose error:", err);
      }
    }
  });

  return new Response(null, { status: 101, webSocket: client });
}
