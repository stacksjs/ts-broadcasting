<p align="center"><img src="https://github.com/stacksjs/ts-broadcasting/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of this repo"></p>

# ts-broadcasting

A high-performance, real-time WebSocket broadcasting system for TypeScript, built on Bun. Inspired by Laravel's broadcasting system, it provides a type-safe, feature-rich solution for real-time communication with support for public, private, and presence channels.

## Features

- **Built on Bun** - Leverages Bun's native WebSocket implementation for maximum performance
- **Channel Authorization** - Flexible authorization for private and presence channels with pattern matching
- **Presence Channels** - Track who's online in real-time with custom member data
- **Laravel Echo Compatible** - Drop-in replacement client API for Laravel Echo
- **Type-Safe** - Full TypeScript support with generics throughout
- **Vue & Svelte** - First-class framework integrations with composables and stores
- **Redis Scaling** - Horizontal scaling via Redis pub/sub adapter
- **End-to-End Encryption** - AES-256-GCM encryption for sensitive channels
- **Queued Broadcasting** - Background job queuing with delayed and recurring broadcasts
- **Webhooks** - HTTP webhook notifications on channel events
- **Prometheus Metrics** - Built-in `/metrics` endpoint for observability
- **Message Persistence** - Store and replay message history
- **Rate Limiting & Auth** - Built-in middleware for security
- **CLI** - Command-line interface for server management
- **Circuit Breaker** - Failure handling for external service resilience
- **Load Management** - Backpressure handling, connection limits, and load shedding

## Install

```bash
bun add ts-broadcasting
```

> [!NOTE]
> ts-broadcasting requires [Bun](https://bun.sh) as its runtime.

## Quick Start

### Server

```ts
import { BroadcastServer } from 'ts-broadcasting'

const server = new BroadcastServer({
  driver: 'bun',
  connections: {
    bun: {
      driver: 'bun',
      host: '0.0.0.0',
      port: 6001,
    },
  },
})

// Authorize private channels
server.channels.channel('private-user.{userId}', (ws, params) => {
  return ws.data.user?.id === params?.userId
})

// Authorize presence channels
server.channels.channel('presence-chat.{roomId}', (ws) => {
  return {
    id: ws.data.user?.id,
    info: { name: ws.data.user?.name },
  }
})

await server.start()
```

### Broadcasting Events

```ts
// Direct broadcasting
server.broadcast('notifications', 'NewNotification', {
  title: 'Hello',
  body: 'World',
})

// Using the Broadcaster
server.broadcaster.send('orders', 'OrderCreated', { id: 1, total: 99.99 })

// Exclude sender
server.broadcaster.toOthers(socketId).send('chat', 'NewMessage', { text: 'Hi' })

// Using event objects
import { createEvent } from 'ts-broadcasting'

const event = createEvent('private-orders.123', 'OrderShipped', {
  orderId: 123,
  trackingNumber: 'ABC123',
})

await server.broadcaster.broadcast(event)

// Fluent anonymous events
import { AnonymousEvent } from 'ts-broadcasting'

new AnonymousEvent('notifications')
  .as('SystemAlert')
  .with({ type: 'maintenance', message: 'Restart in 5 minutes' })
  .send(server.broadcaster)
```

### Facade API (Laravel-style)

```ts
import { Broadcast, broadcast, broadcastToUser, channel } from 'ts-broadcasting'

Broadcast.setServer(server)

// Define channel authorization
channel('private-orders.{orderId}', (socket, params) => {
  return socket.data.user?.id === getOrderOwnerId(params?.orderId)
})

// Broadcast events
Broadcast.send('orders', 'OrderCreated', { id: 1 })
Broadcast.private('user.123', 'NotificationReceived', { message: 'Hello!' })
Broadcast.presence('chat.room1', 'NewMessage', { text: 'Hi!' })
Broadcast.toUser(123, 'Notification', { title: 'Welcome' })
Broadcast.toUsers([1, 2, 3], 'Announcement', { message: 'Hello everyone!' })

// Helper functions
await broadcast(new OrderShipped(order))
broadcast('orders', 'OrderCreated', { id: 1 })
broadcastToUser(123, 'Notification', { title: 'Welcome' })
```

### Client (Browser)

```ts
import { BroadcastClient } from 'ts-broadcasting'

const client = new BroadcastClient({
  broadcaster: 'bun',
  host: 'localhost',
  port: 6001,
  scheme: 'ws',
  autoConnect: true,
})

// Public channel
client.channel('announcements')
  .listen('NewAnnouncement', (data) => {
    console.log('Announcement:', data)
  })

// Private channel
client.private('orders.123')
  .listen('OrderShipped', (data) => {
    console.log('Order shipped:', data)
  })

// Presence channel
const presence = client.join('chat.room1')
presence.here((members) => console.log('Online:', members))
presence.joining((member) => console.log('Joined:', member))
presence.leaving((member) => console.log('Left:', member))
presence.listen('NewMessage', (data) => console.log('Message:', data))

// Client events (whisper)
client.private('chat.room1').whisper('typing', { typing: true })
```

### Vue 3 Integration

```ts
import { useBroadcast, useChannel, usePresence } from 'ts-broadcasting/vue'

const { client, isConnected } = useBroadcast({
  broadcaster: 'bun',
  host: 'localhost',
  port: 6001,
})

const { isSubscribed } = useChannel(client, 'announcements', {
  NewAnnouncement: (data) => console.log(data),
})

const { members, memberCount } = usePresence(client, 'chat.room1', {
  NewMessage: (data) => console.log(data),
})
```

## Configuration

ts-broadcasting loads configuration via `bunfig` from a `broadcast.config.ts` (or `realtime.config.ts`) file:

```ts
// broadcast.config.ts
import type { BroadcastConfig } from 'ts-broadcasting'

const config: BroadcastConfig = {
  verbose: false,
  driver: 'bun',
  default: 'bun',

  connections: {
    bun: {
      driver: 'bun',
      host: '0.0.0.0',
      port: 6001,
      scheme: 'ws',
      options: {
        idleTimeout: 120,
        maxPayloadLength: 16 * 1024 * 1024,
        backpressureLimit: 1024 * 1024,
        sendPings: true,
        publishToSelf: false,
        perMessageDeflate: true,
      },
    },

    reverb: {
      driver: 'reverb',
      host: '127.0.0.1',
      port: 8080,
      scheme: 'ws',
      key: process.env.REVERB*APP*KEY,
      secret: process.env.REVERB*APP*SECRET,
      appId: process.env.REVERB*APP*ID,
    },

    pusher: {
      driver: 'pusher',
      key: process.env.PUSHER*APP*KEY,
      secret: process.env.PUSHER*APP*SECRET,
      appId: process.env.PUSHER*APP*ID,
      cluster: process.env.PUSHER*APP*CLUSTER || 'mt1',
      useTLS: true,
    },
  },
}

export default config
```

### Server Configuration

The `ServerConfig` extends `BroadcastConfig` with additional options for advanced features:

```ts
import type { ServerConfig } from 'ts-broadcasting'

const serverConfig: ServerConfig = {
  // Base config
  driver: 'bun',
  verbose: true,

  // Redis for horizontal scaling
  redis: {
    host: 'localhost',
    port: 6379,
  },

  // Authentication
  auth: {
    enabled: true,
    jwt: { secret: 'your-jwt-secret', algorithm: 'HS256' },
  },

  // Rate limiting
  rateLimit: {
    max: 100,
    window: 60000,
  },

  // End-to-end encryption
  encryption: {
    enabled: true,
    algorithm: 'aes-256-gcm',
  },

  // Webhooks
  webhooks: {
    enabled: true,
    endpoints: [{
      url: 'https://api.example.com/webhooks',
      events: ['connection', 'subscribe', 'broadcast'],
    }],
  },

  // Message persistence
  persistence: {
    enabled: true,
    ttl: 3600000,
    maxMessages: 1000,
  },

  // Presence heartbeat
  heartbeat: {
    enabled: true,
    interval: 30000,
    timeout: 60000,
  },

  // Load management
  loadManagement: {
    maxConnections: 10000,
    maxChannelsPerConnection: 100,
    shedLoadAt: 90,
  },

  // Queue system
  queue: {
    enabled: true,
    defaultQueue: 'broadcasts',
    retry: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
  },
}
```

## CLI

```bash
# Start the server
broadcast start
broadcast start --host 0.0.0.0 --port 6001 --verbose

# Show server statistics
broadcast stats
broadcast stats --watch --interval 2

# Show current configuration
broadcast config

# Show version
broadcast version
```

## HTTP Endpoints

The server exposes these HTTP endpoints:

| Endpoint | Description |
|----------|-------------|
| `/health` | Health check (returns `{ status: 'ok', redis: ... }`) |
| `/stats` | Server statistics (connections, channels, uptime, metrics) |
| `/metrics` | Prometheus-format metrics for monitoring |
| `/app`, `/ws` | WebSocket upgrade endpoints |

## Channel Types

| Type | Prefix | Auth Required | Tracks Members |
|------|--------|--------------|----------------|
| Public | *(none)* | No | No |
| Private | `private-` | Yes | No |
| Presence | `presence-` | Yes | Yes |

## Documentation

For full documentation, visit [ts-broadcasting.netlify.app](https://ts-broadcasting.netlify.app).

- [Getting Started](/docs/guide/getting-started.md) - Server and client setup
- [Channels](/docs/guide/channels.md) - Channel types and authorization
- [Events](/docs/guide/events.md) - Broadcasting and listening to events
- [Laravel Echo](/docs/guide/echo.md) - Echo compatibility and migration
- [Configuration](/docs/config.md) - Full configuration reference
- [Advanced Features](/docs/advanced/) - Redis, encryption, queues, metrics, and more

## Testing

```bash
bun test
```

## Changelog

Please see our [releases](https://github.com/stacksjs/ts-broadcasting/releases) page for more information on what has changed recently.

## Contributing

Please review the [Contributing Guide](https://github.com/stacksjs/contributing) for details.

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/stacks/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://stacksjs.com/discord)

## Postcardware

Stacks OSS will always stay open-source, and we do love to receive postcards from wherever Stacks is used! We also publish them on our website. And thank you, Spatie.

Our address: Stacks.js, 12665 Village Ln #2306, Playa Vista, CA 90094

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## Credits

- [Chris Breuer](https://github.com/chrisbbreuer)
- [All Contributors](https://github.com/stacksjs/ts-broadcasting/graphs/contributors)

## License

The MIT License (MIT). Please see [LICENSE](https://github.com/stacksjs/ts-broadcasting/tree/main/LICENSE.md) for more information.

Made with 💙
