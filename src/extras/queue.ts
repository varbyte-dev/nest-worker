/**
 * Queue Producer/Consumer support for nest-worker.
 *
 * Integrates Cloudflare Queues with decorators for producing and
 * consuming messages at the edge.
 *
 * @module queue
 */

import type { InjectionToken } from "../core/types";

// ─── Types ─────────────────────────────────────────────────────────────

export interface QueueProducerType {
  /**
   * Send a message to the queue.
   */
  send(message: any, options?: { delaySeconds?: number }): Promise<void>;

  /**
   * Send a batch of messages to the queue.
   */
  sendBatch(messages: any[]): Promise<void>;
}

export interface QueueConsumerOptions {
  /** Maximum number of messages per batch (default: 5). */
  batchSize?: number;
  /** Maximum number of retries per message (default: 3). */
  maxRetries?: number;
  /** Maximum concurrent consumers (default: 1). */
  maxConcurrency?: number;
}

export interface QueueBindingDefinition {
  /** The binding name in wrangler.toml */
  binding: string;
  /** The queue name */
  queueName: string;
}

// ─── Metadata keys ─────────────────────────────────────────────────────

const QUEUE_PRODUCER_KEY = "__queue_producer__";
const QUEUE_CONSUMER_KEY = "__queue_consumer__";
const QUEUE_BINDING_KEY = "__queue_binding__";

// ─── Runtime env context ───────────────────────────────────────────────

/**
 * In Workers, env is per-request but the isolate is single-threaded,
 * so a module-level variable is safe once set before each handler call.
 */
let currentEnv: Record<string, unknown> = {};

/**
 * Set the env for the current request context.
 * Called by the application before dispatching.
 * @internal
 */
export function _setQueueEnv(env: Record<string, unknown>) {
  currentEnv = env;
}

/**
 * Clear the env after the request completes.
 * @internal
 */
export function _clearQueueEnv() {
  currentEnv = {};
}

// ─── Exception ─────────────────────────────────────────────────────────

export class QueueBindingNotFoundError extends Error {
  constructor(bindingName: string) {
    super(
      `Queue binding "${bindingName}" not found in env. ` +
        `Make sure it is defined in wrangler.toml under [[queues.producers]] or [[queues.consumers]].`,
    );
    this.name = "QueueBindingNotFoundError";
  }
}

// ─── Producer Decorator ────────────────────────────────────────────────

/**
 * Marks a property as a Queue producer.
 *
 * The decorated property becomes a `QueueProducer` with `send()` and
 * `sendBatch()` methods. The underlying queue binding is resolved from
 * `env` at runtime.
 *
 * @param bindingName - Env binding name (default: `"QUEUE"`)
 *
 * @example
 * ```ts
 * class NotificationService {
 *   @QueueProducer()
 *   private sendQueue!: QueueProducer;
 *
 *   async sendWelcome(user: User) {
 *     await this.sendQueue.send({ type: "welcome", userId: user.id });
 *   }
 * }
 * ```
 */
export function QueueProducer(bindingName?: string): PropertyDecorator {
  return (target, propertyKey) => {
    const binding = bindingName ?? "QUEUE";
    const key = String(propertyKey);

    // Store metadata for introspection / CLI generation
    const producers: Array<{ propertyKey: string; binding: string }> =
      Reflect.getMetadata(QUEUE_PRODUCER_KEY, target.constructor) || [];
    producers.push({ propertyKey: key, binding });
    Reflect.defineMetadata(QUEUE_PRODUCER_KEY, producers, target.constructor);

    // Store the binding name keyed by property
    Reflect.defineMetadata(
      `${QUEUE_BINDING_KEY}:${key}`,
      binding,
      target.constructor,
    );

    // Per-instance cached producers to avoid re-creating on every access
    const values = new WeakMap<any, QueueProducerType>();

    // Define a getter/setter on the **prototype**.
    // Users MUST declare the field with `declare` (no field initializer):
    //   @QueueProducer()
    //   declare queue: QueueProducerType;
    //
    // Using `declare` prevents TS from emitting an own-property initializer
    // (Object.defineProperty(this, "queue", { value: undefined }))
    // which would shadow this prototype accessor.
    Object.defineProperty(target, key, {
      get() {
        // Check if a value was explicitly set (useful for tests)
        if (values.has(this)) {
          return values.get(this)!;
        }

        const env: Record<string, unknown> = currentEnv;
        const queue = env[binding] as
          { send: Function; sendBatch: Function } | undefined;
        if (!queue?.send) {
          throw new QueueBindingNotFoundError(binding);
        }

        const producer: QueueProducerType = {
          send: (message: any, opts?: { delaySeconds?: number }) =>
            opts ? queue.send(message, opts) : queue.send(message),
          sendBatch: (messages: any[]) => queue.sendBatch(messages),
        };

        // Cache the producer so the same instance always gets the same object
        values.set(this, producer);
        return producer;
      },
      set(value: any) {
        if (value === undefined) {
          // Class field initialisation sets undefined → ignore it.
          // The WeakMap already returns undefined for unset entries.
          return;
        }
        values.set(this, value);
      },
      enumerable: true,
      configurable: true,
    });
  };
}

// ─── Consumer Decorator ────────────────────────────────────────────────

/**
 * Marks a method as a Queue consumer handler.
 *
 * The method receives a `MessageBatch` (or `Message[]`) when messages
 * are delivered from the named queue.
 *
 * @param queueName - Name of the queue to consume from (matches
 *                    `[[queues.consumers]]` in `wrangler.toml`).
 * @param options   - Consumer behaviour tuning.
 *
 * @example
 * ```ts
 * class NotificationConsumer {
 *   @QueueConsumer("send-queue", { batchSize: 10 })
 *   async handleMessage(batch: MessageBatch) {
 *     for (const msg of batch.messages) {
 *       await this.emailService.send(msg.body);
 *     }
 *   }
 * }
 * ```
 */
export function QueueConsumer(
  queueName: string,
  options?: QueueConsumerOptions,
): MethodDecorator {
  return (target, propertyKey) => {
    const consumers = getQueueConsumers(target.constructor);
    // Replace if already registered for this queue
    const filtered = consumers.filter((c) => c.queueName !== queueName);
    filtered.push({
      queueName,
      handlerName: String(propertyKey),
      options,
    });
    Reflect.defineMetadata(QUEUE_CONSUMER_KEY, filtered, target.constructor);
  };
}

// ─── Introspection helpers ─────────────────────────────────────────────

/**
 * Returns the list of queue producer bindings registered on a class.
 */
export function getQueueProducerBindings(
  target: any,
): Array<{ propertyKey: string; binding: string }> {
  return Reflect.getMetadata(QUEUE_PRODUCER_KEY, target) || [];
}

/**
 * Returns the list of queue consumer handlers registered on a class.
 */
export function getQueueConsumers(target: any): Array<{
  queueName: string;
  handlerName: string;
  options?: QueueConsumerOptions;
}> {
  return Reflect.getMetadata(QUEUE_CONSUMER_KEY, target) || [];
}

// ─── Application integration ───────────────────────────────────────────

/**
 * Builds a `queue` handler that can be exported from the Worker entry-point.
 *
 * Scans all registered controllers for `@QueueConsumer()` decorators and
 * dispatches incoming queue batches to the matching handler.
 *
 * @param resolveController - Function that resolves a controller class to
 *                            its instance (typically `container.resolveController`).
 * @param controllers       - Array of registered controller classes.
 *
 * @example
 * ```ts
 * // worker.ts
 * import { createApplication, createQueueHandler } from "@varbyte/nest-worker";
 *
 * const app = createApplication(AppModule);
 *
 * export default {
 *   fetch: app.handler.fetch,
 *   queue: createQueueHandler(app.container.resolveController, app.container.getControllers()),
 * };
 * ```
 */
export function createQueueHandler(
  resolveController: (ctrlClass: any) => any,
  controllers: any[],
): (batch: any, env: any, ctx: any) => Promise<void> {
  // Build handler map: queueName → { controllerClass, handlerName, options }
  const handlerMap = new Map<
    string,
    {
      controllerClass: any;
      handlerName: string;
      options?: QueueConsumerOptions;
    }
  >();

  for (const ctrlClass of controllers) {
    const consumers = getQueueConsumers(ctrlClass);
    for (const consumer of consumers) {
      // First registration wins; duplicates for same queue are ignored
      if (!handlerMap.has(consumer.queueName)) {
        handlerMap.set(consumer.queueName, {
          controllerClass: ctrlClass,
          handlerName: consumer.handlerName,
          options: consumer.options,
        });
      }
    }
  }

  return async (batch: any, env: any, ctx: any) => {
    _setQueueEnv(env);
    try {
      // Workers sets batch.queue to the queue name
      const queueName: string = batch.queue;
      const entry = handlerMap.get(queueName);

      if (!entry) {
        console.error(
          `[nest-worker] No @QueueConsumer handler registered for queue "${queueName}". ` +
            `Available: ${[...handlerMap.keys()].join(", ") || "(none)"}`,
        );
        return;
      }

      const instance = resolveController(entry.controllerClass);
      await instance[entry.handlerName](batch);
    } catch (err) {
      console.error("[nest-worker] Queue consumer error:", err);
    } finally {
      _clearQueueEnv();
    }
  };
}
