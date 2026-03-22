# Events

Broadcasting and listening to real-time events with ts-broadcasting.

## Broadcasting Events

### Simple Broadcasting

```typescript
import { Broadcaster } from 'ts-broadcasting'

const broadcaster = new Broadcaster(server)

// Broadcast to single channel
broadcaster.send('notifications', 'NewNotification', {
  title: 'Order Shipped',
  message: 'Your order #123 has been shipped',
})

// Broadcast to multiple channels
broadcaster.send(
  ['orders', 'admin-dashboard'],
  'OrderUpdated',
  { orderId: 123, status: 'shipped' },
)
```

### Using Event Objects

```typescript
import { createEvent } from 'ts-broadcasting'

const event = createEvent(
  'private-user.123',  // Channel
  'OrderShipped',      // Event name
  {                    // Data
    orderId: 456,
    trackingNumber: 'ABC123',
    estimatedDelivery: '2024-01-15',
  },
)

await broadcaster.broadcast(event)
```

### Broadcast to Others

Exclude the sender from receiving the broadcast:

```typescript
// In a message handler
server.on('message', (ws, message) => {
  if (message.event === 'typing') {
    // Broadcast to everyone except sender
    broadcaster.toOthers(ws.data.socketId)
      .send('chat.general', 'UserTyping', {
        userId: ws.data.userId,
        userName: ws.data.userName,
      })
  }
})
```

### Anonymous Events

```typescript
import { AnonymousEvent } from 'ts-broadcasting'

new AnonymousEvent('notifications')
  .as('SystemAlert')
  .with({
    type: 'maintenance',
    message: 'Server will restart in 5 minutes',
  })
  .send(broadcaster)
```

## Listening for Events

### Basic Listening

```typescript
// Client-side
const channel = client.channel('notifications')

channel.listen('NewNotification', (data) => {
  console.log('Notification:', data)
})
```

### Multiple Event Listeners

```typescript
const channel = client.channel('orders')

channel
  .listen('OrderCreated', handleOrderCreated)
  .listen('OrderUpdated', handleOrderUpdated)
  .listen('OrderCanceled', handleOrderCanceled)
```

### Stop Listening

```typescript
// Stop listening to specific event
channel.stopListening('OrderCreated')

// Leave channel entirely
client.leave('orders')
```

## Event Acknowledgments

Ensure events are received:

```typescript
import { AcknowledgmentManager } from 'ts-broadcasting'

const ackManager = new AcknowledgmentManager({
  timeout: 5000,  // 5 seconds to acknowledge
  retries: 3,     // Retry 3 times
})

// Send with acknowledgment
const result = await ackManager.sendWithAck(
  broadcaster,
  'critical-events',
  'PaymentProcessed',
  { orderId: 123, amount: 99.99 },
)

if (result.acknowledged) {
  console.log('Event received by client')
}
else {
  console.log('Event delivery failed')
}
```

## Batch Operations

Send multiple events efficiently:

```typescript
import { BatchOperations } from 'ts-broadcasting'

const batch = new BatchOperations(broadcaster)

// Queue events
batch.add('channel-1', 'Event1', { data: 1 })
batch.add('channel-2', 'Event2', { data: 2 })
batch.add('channel-3', 'Event3', { data: 3 })

// Send all at once
await batch.flush()
```

## Queue Manager

Queue broadcasts for reliable delivery:

```typescript
import { BroadcastQueueManager, BroadcastJob } from 'ts-broadcasting'

const queue = new BroadcastQueueManager({
  driver: 'redis',
  redis: { host: 'localhost', port: 6379 },
})

// Queue a broadcast
await queue.push(new BroadcastJob({
  channels: ['notifications'],
  event: 'NewNotification',
  data: { message: 'Hello' },
}))

// Delayed broadcast
await queue.push(new DelayedBroadcastJob({
  channels: ['reminders'],
  event: 'Reminder',
  data: { message: 'Don\'t forget!' },
  delay: 60000, // 1 minute delay
}))

// Recurring broadcast
await queue.push(new RecurringBroadcastJob({
  channels: ['heartbeat'],
  event: 'Ping',
  data: { timestamp: Date.now() },
  interval: 30000, // Every 30 seconds
}))
```

## Message Deduplication

Prevent duplicate message processing:

```typescript
import { MessageDeduplicator } from 'ts-broadcasting'

const deduplicator = new MessageDeduplicator({
  ttl: 60000, // Keep message IDs for 1 minute
})

// Check before processing
const messageId = 'unique-message-id'
if (!deduplicator.isDuplicate(messageId)) {
  deduplicator.mark(messageId)
  // Process message
}
```

## Webhooks

Trigger webhooks on events:

```typescript
import { WebhookManager } from 'ts-broadcasting'

const webhooks = new WebhookManager()

// Register webhook
webhooks.register('order-events', {
  url: 'https://api.example.com/webhooks/orders',
  events: ['OrderCreated', 'OrderShipped', 'OrderDelivered'],
  secret: 'webhook-secret',
})

// Trigger webhook on broadcast
server.on('broadcast', (channel, event, data) => {
  webhooks.trigger(event, data)
})
```

## Encryption

Encrypt sensitive broadcasts:

```typescript
import { EncryptionManager } from 'ts-broadcasting'

const encryption = new EncryptionManager({
  key: 'your-encryption-key',
  algorithm: 'aes-256-gcm',
})

// Encrypt data before broadcasting
const encryptedData = encryption.encrypt({
  creditCard: '4111111111111111',
  cvv: '123',
})

broadcaster.send('private-payment.123', 'PaymentData', encryptedData)

// Client decrypts on receive
channel.listen('PaymentData', (encryptedData) => {
  const data = encryption.decrypt(encryptedData)
  console.log(data.creditCard)
})
```

## Lifecycle Hooks

Hook into broadcast lifecycle:

```typescript
import { LifecycleHooks } from 'ts-broadcasting'

const hooks = new LifecycleHooks()

// Before broadcast
hooks.beforeBroadcast(async (channel, event, data) => {
  console.log(`Broadcasting ${event} to ${channel}`)
  // Modify data if needed
  return { ...data, timestamp: Date.now() }
})

// After broadcast
hooks.afterBroadcast(async (channel, event, data, result) => {
  console.log(`Broadcast complete: ${result.recipientCount} received`)
})

// On error
hooks.onError(async (error, channel, event) => {
  console.error(`Broadcast failed: ${error.message}`)
})

server.use(hooks)
```

## Event Types

### Typed Events with TypeScript

```typescript
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

// Type-safe broadcasting
function broadcastOrderUpdate(order: OrderEvent) {
  broadcaster.send('orders', 'OrderUpdated', order)
}

// Type-safe listening
channel.listen<ChatMessage>('NewMessage', (data) => {
  console.log(`${data.userId}: ${data.message}`)
})
```

## Client Events

Allow clients to trigger events:

```typescript
// Server: Enable client events for channel
server.channel('presence-chat.{roomId}', async (ws, params) => {
  return {
    id: ws.data.userId,
    name: ws.data.userName,
    canBroadcast: true, // Allow client events
  }
})

// Client: Trigger event
channel.trigger('typing', { userId: currentUserId })
```

## Next Steps

- [Channels](/guide/channels) - Channel types
- [Laravel Echo](/guide/echo) - Echo compatibility
