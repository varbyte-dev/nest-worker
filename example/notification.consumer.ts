import { Controller, QueueConsumer } from "../src/index";

@Controller()
export class NotificationConsumer {
  @QueueConsumer("notifications", { batchSize: 5, maxRetries: 3 })
  async handle(batch: MessageBatch) {
    for (const msg of batch.messages) {
      const { type, userId, email } = msg.body as any;
      console.log(`Processing ${type} for ${email}`);
      // TODO: send email, update DB, etc.
    }
  }
}
