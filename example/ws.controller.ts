import { Controller, WebSocket, wsUpgradeResponse } from "../src/index";

@Controller("ws")
export class WsController {
  @WebSocket("/echo")
  handleEcho() {
    const [client, server] = new WebSocketPair();
    server.accept();

    server.addEventListener("message", (event) => {
      server.send(`Echo: ${event.data}`);
    });

    server.addEventListener("close", () => {
      console.log("WebSocket connection closed");
    });

    return wsUpgradeResponse(client);
  }
}
