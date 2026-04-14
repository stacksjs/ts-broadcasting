# Getting Started

ts-broadcasting is a real-time broadcasting library for TypeScript with WebSocket support.

## Installation

::: code-group

```sh [npm]
npm install ts-broadcasting
```

```sh [pnpm]
pnpm add ts-broadcasting
```

```sh [bun]
bun add ts-broadcasting
```

:::

## Server Setup

### Basic Server

```typescript
import { BroadcastServer } from 'ts-broadcasting'

const server = new BroadcastServer({
  port: 6001,
  host: 'localhost',
  appId: 'my-app',
  appKey: 'my-app-key',
  appSecret: 'my-app-secret',
})

await server.start()
console.log('Server running on ws://localhost:6001')
```

### Server Configuration

```typescript
interface ServerConfig {
  // Network
  port: number                    // WebSocket port
  host: string                    // Host address

  // Authentication
  appId: string                   // Application ID
  appKey: string                  // Client app key
  appSecret: string               // Server secret

  // TLS (optional)
  ssl?: {
    cert: string                  // Certificate path
    key: string                   // Private key path
  }

  // Features
  enableEncryption?: boolean      // Enable E2E encryption
  enableMetrics?: boolean         // Enable Prometheus metrics
  metricsPort?: number           // Metrics endpoint port

  // Limits
  maxConnections?: number         // Max concurrent connections
  maxChannelsPerConnection?: number // Max channels per client

  // Persistence
  persistence?: {
    enabled: boolean
    driver: 'memory' | 'redis'
    redis?: RedisConfig
  }

  // Logging
  verbose?: boolean               // Enable debug logging
}
```

### With Redis Adapter

```typescript
import { BroadcastServer, RedisAdapter } from 'ts-broadcasting'

const redis = new RedisAdapter({
  host: 'localhost',
  port: 6379,
})

const server = new BroadcastServer({
  port: 6001,
  appId: 'my-app',
  appKey: 'my-app-key',
  appSecret: 'my-app-secret',
  persistence: {
    enabled: true,
    driver: 'redis',
    redis: { host: 'localhost', port: 6379 },
  },
})
```

## Client Setup

### Browser Client

```typescript
import { BroadcastClient } from 'ts-broadcasting'

const client = new BroadcastClient({
  host: 'localhost',
  port: 6001,
  appKey: 'my-app-key',
  encrypted: false, // Use true for wss://
})

// Connect
await client.connect()

// Subscribe to channel
client.channel('notifications')
  .listen('NewNotification', (data) => {
    console.log(data)
  })
```

### Client Configuration

```typescript
interface ClientConfig {
  host: string                    // Server host
  port: number                    // Server port
  appKey: string                  // Application key

  // Connection
  encrypted?: boolean             // Use WSS (true) or WS (false)
  cluster?: string                // Cluster name
  forceTLS?: boolean              // Force TLS connection

  // Authentication
  authEndpoint?: string           // Auth endpoint for private channels
  auth?: {
    headers?: Record<string, string>
  }

  // Reconnection
  enabledTransports?: string[]
  disabledTransports?: string[]
}
```

## Channel Authorization

### Authorizing Private Channels

```typescript
// Server-side
server.channel('private-user.{userId}', async (ws, params) => {
  // Check if user can access this channel
  const requestingUserId = ws.data.userId
  const channelUserId = params.userId

  return requestingUserId === channelUserId
})
```

### Authorizing Presence Channels

```typescript
// Server-side
server.channel('presence-chat.{roomId}', async (ws, params) => {
  // Return user data for presence
  // Return false to deny access
  return {
    id: ws.data.userId,
    name: ws.data.userName,
    avatar: ws.data.avatar,
  }
})
```

## Broadcasting Events

### From Server

```typescript
import { Broadcaster } from 'ts-broadcasting'

const broadcaster = new Broadcaster(server)

// Broadcast to channel
broadcaster.send('notifications', 'NewNotification', {
  title: 'Hello',
  body: 'World',
})

// Broadcast to multiple channels
broadcaster.send(
  ['channel-1', 'channel-2'],
  'EventName',
  { data: 'value' },
)

// Broadcast to others (exclude sender)
broadcaster.toOthers(socketId).send('chat', 'NewMessage', {
  text: 'Hello',
})
```

### Using Events

```typescript
import { createEvent, Broadcaster } from 'ts-broadcasting'

const event = createEvent('orders', 'OrderCreated', {
  orderId: 123,
  total: 99.99,
})

const broadcaster = new Broadcaster(server)
await broadcaster.broadcast(event)
```

## Middleware

### Rate Limiting

```typescript
import { BroadcastServer, RateLimiter } from 'ts-broadcasting'

const server = new BroadcastServer({ /* config */ })

// Apply rate limiting
const rateLimiter = new RateLimiter({
  maxRequests: 100,
  windowMs: 60000, // 1 minute
})

server.use(rateLimiter)
```

### Authentication

```typescript
import { AuthenticationManager } from 'ts-broadcasting'

const auth = new AuthenticationManager({
  validateToken: async (token) => {
    // Validate JWT or session token
    const user = await verifyToken(token)
    return user ? { userId: user.id, userName: user.name } : null
  },
})

server.use(auth)
```

### Custom Middleware

```typescript
server.use({
  async handle(ws, message, next) {
    console.log('Received:', message)

    // Modify or validate message
    if (!message.event) {
      return // Drop message
    }

    await next()
  },
})
```

## Metrics

### Prometheus Metrics

```typescript
import { BroadcastServer, PrometheusExporter } from 'ts-broadcasting'

const server = new BroadcastServer({
  port: 6001,
  enableMetrics: true,
  metricsPort: 9090,
})

// Custom metrics endpoint
const exporter = new PrometheusExporter(server)

// Access metrics at http://localhost:9090/metrics
```

Available metrics:

- `broadcasting*connections*total` - Total connections
- `broadcasting*channels*total` - Active channels
- `broadcasting*messages*total` - Messages sent
- `broadcasting*errors*total` - Errors

## Error Handling

```typescript
// Server-side
server.on('error', (error) => {
  console.error('Broadcast error:', error)
})

server.on('connection:error', (ws, error) => {
  console.error(`Connection ${ws.data.socketId} error:`, error)
})

// Client-side
client.on('error', (error) => {
  console.error('Client error:', error)
})

client.on('disconnected', () => {
  console.log('Disconnected from server')
})
```

## Next Steps

- [Channels](/guide/channels) - Channel types and authorization
- [Events](/guide/events) - Broadcasting and listening
- [Laravel Echo](/guide/echo) - Echo compatibility
