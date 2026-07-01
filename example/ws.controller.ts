import { Controller, WebSocket, wsUpgradeResponse } from "../src/index";

@Controller("ws")
export class WsController {
  @WebSocket("/echo")
  handleEcho() {
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    server.accept();

    server.addEventListener("message", (event: MessageEvent) => {
      server.send(`Echo: ${event.data}`);
    });

    server.addEventListener("close", () => {
      console.log("WebSocket connection closed");
    });

    return wsUpgradeResponse(client);
  }
}
