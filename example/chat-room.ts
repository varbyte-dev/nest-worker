import {
  DurableObject,
  OnOpen,
  OnMessage,
  OnClose,
  handleWebSocketLifecycle,
} from "../src/index";

interface Env {
  CHAT_ROOM: DurableObjectNamespace;
}

@DurableObject()
export class ChatRoom {
  private sessions: WebSocket[] = [];
  private state: DurableObjectState;

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    return handleWebSocketLifecycle(this, request);
  }

  @OnOpen()
  onOpen(connection: WebSocket) {
    this.sessions.push(connection);
    connection.send(
      JSON.stringify({
        type: "system",
        message: `Welcome! ${this.sessions.length} user(s) connected.`,
      })
    );
  }

  @OnMessage()
  onMessage(connection: WebSocket, message: string | ArrayBuffer) {
    for (const session of this.sessions) {
      if (session !== connection) {
        session.send(message);
      }
    }
  }

  @OnClose()
  onClose(connection: WebSocket) {
    this.sessions = this.sessions.filter((s) => s !== connection);
  }
}
