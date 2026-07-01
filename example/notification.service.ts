import { Injectable, QueueProducer, QueueProducerType } from "../src/index";

@Injectable()
export class NotificationService {
  @QueueProducer("QUEUE")
  declare queue: QueueProducerType;

  async sendWelcome(userId: string, email: string) {
    await this.queue.send({ type: "welcome", userId, email });
  }

  async sendBulk(users: Array<{ userId: string; email: string }>) {
    await this.queue.sendBatch(
      users.map((u) => ({ body: { type: "welcome", ...u } }))
    );
  }
}
