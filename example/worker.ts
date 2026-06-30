import "reflect-metadata";
import {
  Module,
  createApplication,
  cors,
  logger,
  devRateLimit,
} from "../src/index";
import type { SwaggerOptions } from "../src/index";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

// ─── App Module ───────────────────────────────────────────────────

@Module({
  controllers: [UsersController],
  providers: [UsersService],
})
class AppModule {}

// ─── Bootstrap ───────────────────────────────────────────────────

const app = createApplication(AppModule);

app
  .use(logger())
  .use(cors({ origin: "*", credentials: false }))
  .use(devRateLimit({ windowMs: 60_000, max: 10 }))
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

export default app.handler;
