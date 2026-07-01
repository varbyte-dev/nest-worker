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
    (cls) => app.container.resolveController(cls),
    [NotificationConsumer],
  ),
  scheduled: createScheduledHandler(
    (cls) => app.container.resolveController(cls),
    [HealthScheduledController],
  ),
};
