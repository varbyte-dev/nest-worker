import { Controller, Scheduled } from "../src/index";

@Controller()
export class HealthScheduledController {
  @Scheduled({ cron: "*/5 * * * *", name: "health-check" })
  async healthCheck() {
    console.log("Health check executed:", new Date().toISOString());
    // TODO: verify DB, external services, etc.
  }
}
