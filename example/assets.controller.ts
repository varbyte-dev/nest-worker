import { Controller, ServeStatic } from "../src/index";

@Controller()
export class AssetsController {
  @ServeStatic({ root: "/public", index: "index.html" })
  serve() {
    return new Response("Not Found", { status: 404 });
  }
}
