# Events

Broadcasting and listening to real-time events with ts-broadcasting.

## Broadcasting Events

### Simple Broadcasting

```ts
// Broadcast to a single channel
server.broadcaster.send('notifications', 'NewNotification', {
  title: 'Order Shipped',
  message: 'Your order #123 has been shipped',
})

// Broadcast to multiple channels
server.broadcaster.send(
  ['orders', 'admin-dashboard'],
  'OrderUpdated',
  { orderId: 123, status: 'shipped' },
)
```

### Using Event Objects

Event objects implement the `BroadcastEvent` interface:

```ts
import type { BroadcastEvent } from 'ts-broadcasting'

class OrderShipped implements BroadcastEvent {
  constructor(private order: { id: number, trackingNumber: string }) {}

  shouldBroadcast() { return true }
  broadcastOn() { return `private-orders.${this.order.id}` }
  broadcastAs() { return 'OrderShipped' }
  broadcastWith() {
    return {
      orderId: this.order.id,
      trackingNumber: this.order.trackingNumber,
    }
  }
}

await server.broadcaster.broadcast(new OrderShipped(order))
```

The `BroadcastEvent` interface supports:

| Method | Required | Description |
|--------|----------|-------------|
| `shouldBroadcast()` | Yes | Return `true` to broadcast, `false` to skip |
| `broadcastOn()` | Yes | Channel name(s) to broadcast to |
| `broadcastAs()` | No | Custom event name (defaults to class name) |
| `broadcastWith()` | No | Custom event data (defaults to `{}`) |
| `broadcastWhen()` | No | Additional condition check |
| `broadcastQueue()` | No | Queue name for deferred broadcasting |
| `broadcastConnection()` | No | Specific connection to use |

### Using `createEvent` Helper

```ts
import { createEvent } from 'ts-broadcasting'

const event = createEvent(
  'private-user.123',
  'OrderShipped',
  {
    orderId: 456,
    trackingNumber: 'ABC123',
    estimatedDelivery: '2025-01-15',
  },
)

await server.broadcaster.broadcast(event)
```

### Broadcast to Others

Exclude the sender from receiving the broadcast:

```ts
server.broadcaster.toOthers(ws.data.socketId)
  .send('chat.general', 'UserTyping', {
    userId: ws.data.user?.id,
    userName: ws.data.user?.name,
  })
```

### Anonymous Events

Fluent API for building and sending events:

```ts
import { AnonymousEvent } from 'ts-broadcasting'

new AnonymousEvent('notifications')
  .as('SystemAlert')
  .with({
    type: 'maintenance',
    message: 'Server will restart in 5 minutes',
  })
  .send(server.broadcaster)

// Exclude sender
new AnonymousEvent('chat.room1')
  .as('NewMessage')
  .with({ text: 'Hello!' })
  .toOthers(socketId)
  .send(server.broadcaster)
```

## Listening for Events

### Basic Listening

```ts
// Client-side
const channel = client.channel('notifications')

channel.listen('NewNotification', (data) => {
  console.log('Notification:', data)
})
```

### Multiple Event Listeners

```ts
const channel = client.channel('orders')

channel
  .listen('OrderCreated', handleOrderCreated)
  .listen('OrderUpdated', handleOrderUpdated)
  .listen('OrderCanceled', handleOrderCanceled)
```

### Stop Listening

```ts
// Stop listening to specific event
channel.stopListening('OrderCreated')

// Stop listening to specific callback
channel.stopListening('OrderCreated', specificHandler)

// Leave channel entirely
client.leave('orders')
```

### Subscription Events

```ts
channel.subscribed(() => {
  console.log('Successfully subscribed')
})

channel.error((error) => {
  console.error('Subscription failed:', error)
})
```

## Event Acknowledgments

Ensure events are received by enabling acknowledgments:

```ts
// Server config
const server = new BroadcastServer({
  // ...
  acknowledgments: {
    enabled: true,
    timeout: 5000,      // 5 seconds to acknowledge
    retryAttempts: 3,
  },
})

// Client with acknowledgments
const client = new BroadcastClient({
  // ...
  acknowledgments: {
    enabled: true,
    timeout: 5000,
  },
})

// Send with acknowledgment
const acked = await client.sendWithAck(
  { event: 'critical-event', channel: 'payments', data: { amount: 99.99 } },
  true, // requireAck
)
```

## Batch Operations

Subscribe to multiple channels efficiently:

```ts
// Client-side batch subscribe
const result = await client.batchSubscribe([
  'channel-1',
  'channel-2',
  'channel-3',
])
// result: { succeeded: ['channel-1', ...], failed: { ... } }

// Batch unsubscribe
await client.batchUnsubscribe(['channel-1', 'channel-2'])
```

Server-side batch config:

```ts
const server = new BroadcastServer({
  // ...
  batch: {
    enabled: true,
    maxBatchSize: 50,
    debounceMs: 100,
  },
})
```

## Queue Manager

Queue broadcasts for reliable delivery:

```ts
import { BroadcastJob, DelayedBroadcastJob, RecurringBroadcastJob } from 'ts-broadcasting'

// Enable queue in server config
const server = new BroadcastServer({
  // ...
  queue: {
    enabled: true,
    defaultQueue: 'broadcasts',
    retry: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    },
    deadLetter: { enabled: true, maxRetries: 5 },
  },
})

// Queue a broadcast
await server.queueManager?.queueBroadcast(
  ['notifications'],
  'NewNotification',
  { message: 'Hello' },
)

// Delayed broadcast
await server.queueManager?.scheduleDelayedBroadcast(
  ['reminders'],
  'Reminder',
  { message: 'Don\'t forget!' },
  60000, // 1 minute delay
)

// Recurring broadcast
await server.queueManager?.scheduleRecurringBroadcast(
  ['heartbeat'],
  'Ping',
  async () => ({ timestamp: Date.now() }),
  '*/30 * * * * *', // Every 30 seconds
)
```

Events can also specify a queue via the `broadcastQueue()` method:

```ts
class OrderShipped implements BroadcastEvent {
  shouldBroadcast() { return true }
  broadcastOn() { return 'orders' }
  broadcastQueue() { return 'high-priority' }
  // ...
}
```

## Message Deduplication

Prevent duplicate message processing:

```ts
import { MessageDeduplicator } from 'ts-broadcasting'

const deduplicator = new MessageDeduplicator({
  enabled: true,
  ttl: 60000,     // Keep IDs for 1 minute
  maxSize: 10000, // Max tracked messages
})

// Check before processing
const isDuplicate = await deduplicator.isDuplicate('channel', 'event', data, messageId)
if (!isDuplicate) {
  // Process message
}
```

## Webhooks

Trigger HTTP webhooks on broadcast events:

```ts
const server = new BroadcastServer({
  // ...
  webhooks: {
    enabled: true,
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 5000,
    secret: 'webhook-secret',
    endpoints: [
      {
        url: 'https://api.example.com/webhooks/broadcasting',
        events: ['connection', 'disconnection', 'subscribe', 'unsubscribe', 'broadcast'],
        headers: { 'X-Custom-Header': 'value' },
        method: 'POST',
      },
    ],
  },
})

// Register additional endpoints at runtime
server.webhooks?.register({
  url: 'https://api.example.com/webhooks/orders',
  events: ['broadcast'],
})
```

Supported webhook events: `connection`, `disconnection`, `subscribe`, `unsubscribe`, `broadcast`, `presence*join`, `presence*leave`, `client_event`.

## Encryption

Encrypt sensitive broadcasts with AES-256-GCM:

```ts
// Server-side
const server = new BroadcastServer({
  // ...
  encryption: {
    enabled: true,
    algorithm: 'aes-256-gcm',
    keyRotationInterval: 86400000, // 24 hours
  },
})

// Set channel-specific encryption keys
await server.encryption?.generateChannelKey('private-payments')

// Encrypt data
const encrypted = await server.encryption?.encrypt('private-payments', sensitiveData)

// Decrypt data
const decrypted = await server.encryption?.decrypt('private-payments', encrypted)
```

Client-side encryption:

```ts
const client = new BroadcastClient({
  // ...
  encryption: {
    enabled: true,
    keys: {
      'private-payments': 'your-channel-key',
    },
  },
})
```

## Lifecycle Hooks

Hook into broadcast lifecycle events:

```ts
const lifecycle = server.lifecycle!

lifecycle.on('created', (data) => {
  console.log(`Channel ${data.channel} created by ${data.socketId}`)
})

lifecycle.on('subscribed', (data) => {
  console.log(`Subscribed to ${data.channel}, ${data.subscriberCount} total`)
})

lifecycle.on('unsubscribed', (data) => {
  console.log(`Unsubscribed from ${data.channel}`)
})

lifecycle.on('empty', (data) => {
  console.log(`Channel ${data.channel} has no subscribers`)
})

lifecycle.on('destroyed', (data) => {
  console.log(`Channel ${data.channel} destroyed`)
})
```

## Typed Events

### TypeScript Generics

```ts
interface OrderEvent {
  orderId: number
  status: 'pending' | 'shipped' | 'delivered'
  timestamp: Date
}

interface ChatMessage {
  userId: string
  message: string
  room: string
}

// Type-safe listening
client.channel<ChatMessage>('chat')
  .listen('NewMessage', (data) => {
    // data is typed as ChatMessage
    console.log(`${data.userId}: ${data.message}`)
  })
```

## Client Events (Whisper)

Clients can send events directly to other subscribers on private/presence channels:

```ts
// Send a client event (automatically prefixed with 'client-')
client.private('chat.room1').whisper('typing', { typing: true })

// Listen for whispered events
client.private('chat.room1').listenForWhisper('typing', (data) => {
  console.log('User is typing:', data)
})
```

Client events are only allowed on private and presence channels. They are broadcast to other subscribers but not to the sender.

## Next Steps

- [Channels](/guide/channels) - Channel types
- [Laravel Echo](/guide/echo) - Echo compatibility
- [Advanced Features](/advanced/redis) - Redis, metrics, and more
