import "reflect-metadata";
import {
  Module,
  createApplication,
  cors,
  logger,
  rateLimit,
} from "../src/index";
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
  .use(rateLimit({ windowMs: 60_000, max: 10 }));

// ─── Cloudflare Worker export ─────────────────────────────────────

export default app.handler;
