# Getting Started

ts-broadcasting is a real-time WebSocket broadcasting library for TypeScript built on Bun.

## Installation

::: code-group

```sh [bun]
bun add ts-broadcasting
```

```sh [npm]
npm install ts-broadcasting
```

```sh [pnpm]
pnpm add ts-broadcasting
```

:::

## Server Setup

### Basic Server

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
console.log('Broadcasting server running on ws://0.0.0.0:6001')
```

### Server Configuration

The `ServerConfig` extends `BroadcastConfig` with optional advanced features:

```ts
import type { ServerConfig } from 'ts-broadcasting'

const config: ServerConfig = {
  // Base
  driver: 'bun',
  verbose: true,

  connections: {
    bun: {
      driver: 'bun',
      host: '0.0.0.0',
      port: 6001,
      scheme: 'ws',
      options: {
        idleTimeout: 120,          // Seconds
        maxPayloadLength: 16 * 1024 * 1024, // 16 MB
        backpressureLimit: 1024 * 1024,     // 1 MB
        sendPings: true,
        publishToSelf: false,
        perMessageDeflate: true,
      },
    },
  },

  // Optional features (only initialized if configured)
  redis: { host: 'localhost', port: 6379 },
  auth: { enabled: true, jwt: { secret: 'your-secret' } },
  rateLimit: { max: 100, window: 60000 },
  encryption: { enabled: true, algorithm: 'aes-256-gcm' },
  persistence: { enabled: true, ttl: 3600000 },
  heartbeat: { enabled: true, interval: 30000, timeout: 60000 },
  loadManagement: { maxConnections: 10000, shedLoadAt: 90 },
}
```

### With Redis Adapter

For horizontal scaling across multiple server instances:

```ts
const server = new BroadcastServer({
  driver: 'bun',
  connections: {
    bun: { driver: 'bun', host: '0.0.0.0', port: 6001 },
  },
  redis: {
    host: 'localhost',
    port: 6379,
    password: undefined,
    database: 0,
    keyPrefix: 'broadcast:',
  },
})

await server.start()
```

Redis is connected automatically on `server.start()` and handles cross-server message delivery via pub/sub.

## Client Setup

### Browser Client

```ts
import { BroadcastClient } from 'ts-broadcasting'

const client = new BroadcastClient({
  broadcaster: 'bun',
  host: 'localhost',
  port: 6001,
  scheme: 'ws',        // 'ws' or 'wss'
  autoConnect: true,    // Connect immediately (default: true)
  reconnect: true,      // Auto-reconnect on disconnect (default: true)
  maxReconnectAttempts: 10,
})

// Subscribe to a public channel
client.channel('notifications')
  .listen('NewNotification', (data) => {
    console.log(data)
  })
```

### Client Configuration

```ts
interface BroadcastClientConfig {
  broadcaster: 'bun' | 'reverb' | 'pusher' | 'ably'
  host?: string           // Default: 'localhost'
  port?: number           // Default: 6001
  scheme?: 'ws' | 'wss'  // Default: 'ws'
  key?: string
  cluster?: string
  encrypted?: boolean

  // Authentication for private/presence channels
  auth?: {
    headers?: Record<string, string>
    endpoint?: string
  }

  // Connection behavior
  autoConnect?: boolean          // Default: true
  reconnect?: boolean            // Default: true
  reconnectDelay?: number        // Default: 1000ms (exponential backoff)
  maxReconnectAttempts?: number  // Default: 10

  // Advanced features
  encryption?: { enabled?: boolean, keys?: Record<string, string> }
  acknowledgments?: { enabled?: boolean, timeout?: number }
  batch?: { enabled?: boolean, maxBatchSize?: number }
  heartbeat?: { enabled?: boolean, interval?: number }
  offlineQueue?: { enabled?: boolean, maxSize?: number }
}
```

### Connection Events

```ts
client.connector.on('connect', () => {
  console.log('Connected, socket ID:', client.socketId())
})

client.connector.on('disconnect', () => {
  console.log('Disconnected from server')
})

client.connector.on('error', (error) => {
  console.error('Connection error:', error)
})
```

## Channel Authorization

### Authorizing Private Channels

```ts
// Server-side
server.channels.channel('private-user.{userId}', (ws, params) => {
  return ws.data.user?.id === params?.userId
})

// Supports async callbacks
server.channels.channel('private-team.{teamId}', async (ws, params) => {
  const teams = await getUserTeams(ws.data.user?.id)
  return teams.includes(params?.teamId)
})
```

### Authorizing Presence Channels

Return member data (object with `id` and `info`) to authorize, or `false` to deny:

```ts
server.channels.channel('presence-chat.{roomId}', (ws, params) => {
  if (!ws.data.user) return false

  return {
    id: ws.data.user.id,
    info: {
      name: ws.data.user.name,
      avatar: ws.data.user.avatar,
    },
  }
})
```

### Class-Based Authorization

```ts
class OrderChannelAuthorizer {
  async join(ws, params) {
    const order = await Order.find(params?.orderId)
    if (!order) return false
    return order.userId === ws.data.user?.id
  }
}

server.channels.channel('private-order.{orderId}', new OrderChannelAuthorizer())
```

## Broadcasting Events

### From Server

```ts
// Send to a channel
server.broadcaster.send('notifications', 'NewNotification', {
  title: 'Hello',
  body: 'World',
})

// Send to multiple channels
server.broadcaster.send(
  ['channel-1', 'channel-2'],
  'EventName',
  { data: 'value' },
)

// Broadcast to others (exclude sender)
server.broadcaster.toOthers(socketId).send('chat', 'NewMessage', {
  text: 'Hello',
})
```

### Using Event Objects

```ts
import { createEvent } from 'ts-broadcasting'

const event = createEvent('orders', 'OrderCreated', {
  orderId: 123,
  total: 99.99,
})

await server.broadcaster.broadcast(event)
```

### Using the Facade

```ts
import { Broadcast, broadcast, channel } from 'ts-broadcasting'

Broadcast.setServer(server)

// Define authorization
channel('private-orders.{orderId}', (socket, params) => {
  return socket.data.user?.id === getOrderOwnerId(params?.orderId)
})

// Broadcast
Broadcast.send('orders', 'OrderCreated', { id: 1 })
Broadcast.private('user.123', 'Notification', { message: 'Hello!' })
Broadcast.toUser(123, 'Alert', { title: 'Welcome' })

// Helper function
broadcast('orders', 'OrderCreated', { id: 1 })
```

## HTTP Endpoints

The server exposes these HTTP endpoints alongside WebSocket:

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with Redis status |
| `GET /stats` | Server statistics (connections, channels, uptime) |
| `GET /metrics` | Prometheus-format metrics |
| `/app`, `/ws` | WebSocket upgrade endpoints |

## Middleware

### Rate Limiting

```ts
const server = new BroadcastServer({
  // ...
  rateLimit: {
    max: 100,       // Max messages
    window: 60000,  // Per minute
  },
})
```

### Authentication

```ts
const server = new BroadcastServer({
  // ...
  auth: {
    enabled: true,
    jwt: {
      secret: 'your-jwt-secret',
      algorithm: 'HS256',
    },
  },
})

// Custom auth callback
server.auth?.authenticate(async (req) => {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  return await verifyToken(token)
})
```

## Metrics

### Prometheus Metrics

When enabled, metrics are available at `GET /metrics`:

```
broadcasting_connections_total
broadcasting_connections_active
broadcasting_channels_total
broadcasting_messages_total
broadcasting_messages_received_total
broadcasting_errors_total
broadcasting_uptime_seconds
broadcasting_memory_usage_bytes
```

## Next Steps

- [Channels](/guide/channels) - Channel types and authorization
- [Events](/guide/events) - Broadcasting and listening
- [Laravel Echo](/guide/echo) - Echo compatibility
- [Configuration](/config) - Full configuration reference
