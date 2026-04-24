# Usage

There are two main ways to use ts-broadcasting: as a **server**for hosting WebSocket connections and broadcasting events, and as a**client** for subscribing to channels and listening for events.

## Server

### Starting the Server

```ts
import { BroadcastServer } from 'ts-broadcasting'

const server = new BroadcastServer({
  driver: 'bun',
  connections: {
    bun: {
      driver: 'bun',
      host: '0.0.0.0',
      port: 6001,
      scheme: 'ws',
    },
  },
})

await server.start()
```

### Defining Channel Authorization

```ts
// Private channels - return true/false
server.channels.channel('private-user.{userId}', (ws, params) => {
  return ws.data.user?.id === params?.userId
})

// Presence channels - return member data or false
server.channels.channel('presence-chat.{roomId}', (ws, params) => {
  return {
    id: ws.data.user?.id,
    info: { name: ws.data.user?.name, avatar: ws.data.user?.avatar },
  }
})
```

### Broadcasting Events

```ts
// Direct broadcast
server.broadcast('channel-name', 'EventName', { key: 'value' })

// Using the Broadcaster class
server.broadcaster.send('orders', 'OrderCreated', { id: 1 })
server.broadcaster.send(['orders', 'admin'], 'OrderCreated', { id: 1 })

// Exclude sender
server.broadcaster.toOthers(socketId).send('chat', 'NewMessage', { text: 'Hello' })
```

### Using Event Objects

```ts
import { createEvent } from 'ts-broadcasting'

const event = createEvent('private-orders.123', 'OrderShipped', {
  orderId: 123,
  trackingNumber: 'ABC123',
})

await server.broadcaster.broadcast(event)
```

### Using the Facade

```ts
import { Broadcast, broadcast, channel } from 'ts-broadcasting'

Broadcast.setServer(server)

channel('private-orders.{orderId}', (socket, params) => {
  return socket.data.user?.id === getOrderOwnerId(params?.orderId)
})

Broadcast.send('orders', 'OrderCreated', { id: 1 })
Broadcast.private('user.123', 'Notification', { message: 'Hello!' })
Broadcast.toUser(123, 'Notification', { title: 'Welcome' })

// Or using the helper function
broadcast('orders', 'OrderCreated', { id: 1 })
```

### Using the Helpers

```ts
// Broadcast to specific users
server.helpers.toUser(123, 'Notification', { title: 'Welcome' })
server.helpers.toUsers([1, 2, 3], 'Announcement', { message: 'Hello!' })

// Broadcast to all connected clients
server.helpers.toAll('SystemMessage', { text: 'Maintenance in 5 minutes' })

// Model events
server.helpers.modelCreated('Order', { id: 1, total: 99.99 })
server.helpers.modelUpdated('Order', 1, { status: 'shipped' })
server.helpers.modelDeleted('Order', 1)

// System messages
server.helpers.systemMessage('Server restarting', 'warning')

// Check user status
server.helpers.isUserOnline(123) // boolean
server.helpers.getUserConnectionCount(123) // number
```

## Client

### Browser Client

```ts
import { BroadcastClient } from 'ts-broadcasting'

const client = new BroadcastClient({
  broadcaster: 'bun',
  host: 'localhost',
  port: 6001,
  scheme: 'ws',
  autoConnect: true,
  reconnect: true,
  maxReconnectAttempts: 10,
})

// Connection events
client.connector.on('connect', () => console.log('Connected'))
client.connector.on('disconnect', () => console.log('Disconnected'))
client.connector.on('error', (error) => console.error('Error:', error))
```

### Channel Subscriptions

```ts
// Public channel
client.channel('news')
  .listen('ArticlePublished', (data) => {
    console.log('New article:', data.title)
  })

// Private channel
client.private('user.123')
  .listen('MessageReceived', (data) => {
    console.log('Private message:', data)
  })

// Presence channel
client.join('chat.room1')
  .here((members) => console.log('Online:', members))
  .joining((member) => console.log('Joined:', member))
  .leaving((member) => console.log('Left:', member))
  .listen('NewMessage', (data) => console.log('Message:', data))
```

### Client Events (Whisper)

```ts
// Send client events on private/presence channels
client.private('chat.room1').whisper('typing', { typing: true })

// Listen for whispered events
client.private('chat.room1').listenForWhisper('typing', (data) => {
  console.log('User typing:', data)
})
```

### Leaving Channels

```ts
client.leave('news')
client.leaveAll()
```

### Batch Operations

```ts
// Subscribe to multiple channels at once
const result = await client.batchSubscribe([
  'channel-1',
  'channel-2',
  'channel-3',
])

// Unsubscribe from multiple channels
await client.batchUnsubscribe(['channel-1', 'channel-2'])
```

## CLI

```bash
# Start the broadcasting server
broadcast start
broadcast start --host 0.0.0.0 --port 6001 --verbose
broadcast start --connection reverb

# View server statistics
broadcast stats
broadcast stats --watch --interval 2

# View current configuration
broadcast config

# View version
broadcast version
```

## Testing

```bash
bun test
```

## Next Steps

- [Channels](/guide/channels) - Channel types and authorization patterns
- [Events](/guide/events) - Event broadcasting in depth
- [Configuration](/config) - Full configuration reference
- [Advanced Features](/advanced/redis) - Redis, encryption, and more
