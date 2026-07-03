import "reflect-metadata";
import {
  Module,
  createApplication,
  cors,
  logger,
  devRateLimit,
  createQueueHandler,
  createScheduledHandler,
  serveStaticAssets,
} from "../src/index";
import type { SwaggerOptions } from "../src/index";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { WsController } from "./ws.controller";
import { ChatRoom } from "./chat-room";
import { NotificationService } from "./notification.service";
import { NotificationConsumer } from "./notification.consumer";
import { HealthScheduledController } from "./health.scheduled";
import { AssetsController } from "./assets.controller";

// ─── Example Plugin ───────────────────────────────────────────────

import type { NestWorkerPlugin } from "../src/index";

/**
 * Example plugin that logs lifecycle events.
 * Plugins can register providers, middleware, or modify the app.
 */
const loggingPlugin: NestWorkerPlugin = {
  name: "example-logger",
  onBeforeInit(container) {
    console.log("[plugin] onBeforeInit: container ready to register providers");
  },
  onAfterInit(app) {
    console.log(
      "[plugin] onAfterInit: app initialized with",
      app.container.getControllers().length,
      "controllers",
    );
  },
};

// ─── App Module ───────────────────────────────────────────────────

@Module({
  controllers: [
    UsersController,
    WsController,
    NotificationConsumer,
    HealthScheduledController,
    AssetsController,
  ],
  providers: [UsersService, NotificationService, ChatRoom],
  plugins: [loggingPlugin],
})
class AppModule {}

// ─── Bootstrap ───────────────────────────────────────────────────

const app = createApplication(AppModule);

app
  .use(logger())
  .use(cors({ origin: "*", credentials: false }))
  .use(devRateLimit({ windowMs: 60_000, max: 10 }))
  .use(
    serveStaticAssets({
      root: "/public",
      index: "index.html",
    }),
  )
  .useSwagger({
    title: "Users API",
    version: "1.0.0",
    description: "API for managing users",
    auth: {
      username: "admin",
      password: "swagger-secret", // Use env var in production
    },
    servers: [{ url: "https://api.example.com", description: "Production" }],
  } satisfies SwaggerOptions);

// ─── Cloudflare Worker export ─────────────────────────────────────

export default {
  fetch: app.handler,
  queue: createQueueHandler(
    (cls: any) => app.container.resolveController(cls),
    [NotificationConsumer],
  ),
  scheduled: createScheduledHandler(
    (cls: any) => app.container.resolveController(cls),
    [HealthScheduledController],
  ),
};
