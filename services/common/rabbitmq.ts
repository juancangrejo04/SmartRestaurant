// RabbitMQ Distributed Message Broker Client with Topic Exchange and DLQ
import amqp, { Channel, ChannelModel, ConsumeMessage } from 'amqplib';

export const TOPIC_EXCHANGE = 'smartrestaurant.events';
export const DLX_EXCHANGE = 'smartrestaurant.dlx';
export const DLQ_QUEUE = 'smartrestaurant.dlq';

const RABBITMQ_URL =
  process.env.RABBITMQ_URL ||
  'amqp://sr_rabbit:sr_rabbit_pass_2026@localhost:5672';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;
let isRabbitAvailable: boolean | null = null;

// In-Memory Fallback Queue Listeners for when RabbitMQ is offline/disconnected
type MessageHandler = (msg: { content: Buffer; properties: Record<string, any> }, parsed: any) => Promise<boolean>;
const localSubscribers: Map<string, { routingPatterns: string[]; handler: MessageHandler }[]> = new Map();
const publishedEventHistory: Array<{ routingKey: string; payload: any; timestamp: string }> = [];

export async function getRabbitChannel(): Promise<Channel | null> {
  if (channel) return channel;
  if (isRabbitAvailable === false) return null;

  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();

    // 1. Declare Topic Exchange
    await channel.assertExchange(TOPIC_EXCHANGE, 'topic', { durable: true });

    // 2. Declare Dead Letter Exchange & Queue
    await channel.assertExchange(DLX_EXCHANGE, 'fanout', { durable: true });
    await channel.assertQueue(DLQ_QUEUE, { durable: true });
    await channel.bindQueue(DLQ_QUEUE, DLX_EXCHANGE, '');

    connection.on('error', (err) => {
      console.warn('[RabbitMQ Connection Error]:', err.message);
      channel = null;
      connection = null;
    });

    isRabbitAvailable = true;
    console.log('[RabbitMQ Active]: Connected to Topic Exchange', TOPIC_EXCHANGE);
    return channel;
  } catch (err: any) {
    if (isRabbitAvailable === null) {
      console.warn(`[RabbitMQ Notice]: Broker not reachable at ${RABBITMQ_URL}. Using internal topic message bus.`);
      isRabbitAvailable = false;
    }
    return null;
  }
}

/**
 * Publish event to RabbitMQ Topic Exchange with Correlation ID
 */
export async function publishToExchange(
  routingKey: string,
  payload: any,
  correlationId?: string
): Promise<boolean> {
  const messageCorrelationId = correlationId || `corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const body = Buffer.from(JSON.stringify(payload));

  publishedEventHistory.unshift({
    routingKey,
    payload,
    timestamp: new Date().toISOString(),
  });
  if (publishedEventHistory.length > 100) publishedEventHistory.pop();

  const ch = await getRabbitChannel();

  if (ch) {
    try {
      ch.publish(TOPIC_EXCHANGE, routingKey, body, {
        persistent: true,
        correlationId: messageCorrelationId,
        headers: {
          'x-origin-service': payload.tenantId || 'smartrestaurant-service',
          'x-timestamp': new Date().toISOString(),
        },
      });
      return true;
    } catch (err: any) {
      console.error('[RabbitMQ Publish Error]:', err.message);
    }
  }

  // Fallback to local queue consumers matching routing patterns
  for (const [queueName, subscribers] of localSubscribers.entries()) {
    for (const sub of subscribers) {
      const matches = sub.routingPatterns.some((pattern) => matchesRoutingKey(pattern, routingKey));
      if (matches) {
        sub.handler(
          {
            content: body,
            properties: { correlationId: messageCorrelationId },
          },
          payload
        ).catch((err) => {
          console.warn(`[Local Consumer Error on ${queueName}]:`, err.message);
        });
      }
    }
  }

  return true;
}

/**
 * Match RabbitMQ topic routing patterns (e.g. "order.*", "*.*")
 */
function matchesRoutingKey(pattern: string, key: string): boolean {
  if (pattern === '#' || pattern === '*.*') return true;
  if (pattern === key) return true;
  const patternParts = pattern.split('.');
  const keyParts = key.split('.');
  if (patternParts.length !== keyParts.length) return false;

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '*') continue;
    if (patternParts[i] !== keyParts[i]) return false;
  }
  return true;
}

/**
 * Register a durable queue with dead-letter queue config and message consumer
 */
export async function subscribeToTopicQueue(
  queueName: string,
  routingKeys: string[],
  handler: (msg: { content: Buffer; properties: Record<string, any> }, parsed: any) => Promise<boolean>
): Promise<void> {
  // Register in local subscribers for fallback
  if (!localSubscribers.has(queueName)) {
    localSubscribers.set(queueName, []);
  }
  localSubscribers.get(queueName)!.push({ routingPatterns: routingKeys, handler });

  const ch = await getRabbitChannel();
  if (!ch) return;

  try {
    // Assert queue with DLX configuration
    await ch.assertQueue(queueName, {
      durable: true,
      deadLetterExchange: DLX_EXCHANGE,
    });

    for (const key of routingKeys) {
      await ch.bindQueue(queueName, TOPIC_EXCHANGE, key);
    }

    await ch.consume(queueName, async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      try {
        const parsed = JSON.parse(msg.content.toString());
        const ok = await handler(msg, parsed);
        if (ok) {
          ch.ack(msg);
        } else {
          // Reject and send to Dead Letter Queue
          ch.nack(msg, false, false);
        }
      } catch (err) {
        // Poison message: send to DLQ
        ch.nack(msg, false, false);
      }
    });

    console.log(`[RabbitMQ Queue Active]: ${queueName} bound to [${routingKeys.join(', ')}]`);
  } catch (err: any) {
    console.warn(`[RabbitMQ Subscription Notice]: Failed to subscribe queue ${queueName}:`, err.message);
  }
}

export function getEventBrokerHistory() {
  return [...publishedEventHistory];
}
