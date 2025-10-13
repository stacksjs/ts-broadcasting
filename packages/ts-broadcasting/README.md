# ts-broadcasting

A high-performance, Laravel-inspired broadcasting system for TypeScript, built on Bun's native WebSocket APIs. Enables real-time communication between your server and clients with minimal overhead and maximum performance.

## Features

- 🚀 **Built on Bun** - Leverages Bun's native WebSocket implementation for maximum performance
- 🔒 **Channel Authorization** - Flexible authorization system for private and presence channels
- 👥 **Presence Channels** - Track who's online in real-time
- 📡 **Pub/Sub** - Efficient broadcasting to multiple subscribers
- 🎯 **Type-Safe** - Full TypeScript support with comprehensive types
- ⚙️ **Configurable** - Flexible configuration system using bunfig
- 🛠️ **CLI Included** - Start and manage your broadcasting server from the command line
- 🔌 **Multiple Drivers** - Support for Bun, Reverb, Pusher, and Ably
- 💪 **Laravel-Compatible** - Familiar API for Laravel developers

## Installation

```bash
bun add ts-broadcasting
```

## Quick Start

### 1. Start the Server

```bash
# Using CLI
bunx broadcast start

# Or programmatically
import { BroadcastServer, config } from 'ts-broadcasting'

const server = new BroadcastServer(config)
await server.start()
```

### 2. Configure Channel Authorization

```typescript
import { BroadcastServer, config } from 'ts-broadcasting'

const server = new BroadcastServer(config)

// Authorize private channels
server.channels.channel('private-orders.{orderId}', (ws, data) => {
  // Check if user owns this order
  return ws.data.user?.id === getOrderUserId(orderId)
})

// Authorize presence channels with user info
server.channels.channel('presence-chat.{roomId}', (ws, data) => {
  return {
    id: ws.data.user?.id,
    info: {
      name: ws.data.user?.name,
      avatar: ws.data.user?.avatar,
    },
  }
})

await server.start()
```

### 3. Broadcast Events

```typescript
import type { BroadcastEvent } from 'ts-broadcasting'
import { AnonymousEvent, Broadcaster, BroadcastServer, config } from 'ts-broadcasting'

// Method 1: Using BroadcastEvent interface
class OrderShipped implements BroadcastEvent {
  constructor(private order: Order) {}

  shouldBroadcast(): boolean {
    return true
  }

  broadcastOn(): string {
    return `private-orders.${this.order.id}`
  }

  broadcastAs(): string {
    return 'OrderShipped'
  }

  broadcastWith(): Record<string, unknown> {
    return {
      orderId: this.order.id,
      trackingNumber: this.order.trackingNumber,
    }
  }
}

// Broadcast the event
const server = new BroadcastServer(config)
await server.start()

const broadcaster = new Broadcaster(server, config)
await broadcaster.broadcast(new OrderShipped(order))

// Method 2: Direct broadcast
broadcaster.send('announcements', 'SystemMessage', {
  message: 'Scheduled maintenance tonight',
  type: 'warning',
})

new AnonymousEvent('notifications')
  .as('NewNotification')
  .with({ title: 'Welcome!', body: 'Thanks for joining' })
  .send(broadcaster)
```

### 4. Client-Side Usage

```html
<!DOCTYPE html>
<html>
<body>
  <script>
    const ws = new WebSocket('ws://localhost:6001/ws')

    ws.onopen = () => {
      console.log('Connected')

      // Subscribe to public channel
      ws.send(JSON.stringify({
        event: 'subscribe',
        channel: 'announcements'
      }))

      // Subscribe to private channel
      ws.send(JSON.stringify({
        event: 'subscribe',
        channel: 'private-user.123'
      }))

      // Subscribe to presence channel
      ws.send(JSON.stringify({
        event: 'subscribe',
        channel: 'presence-chat.room1',
        channel_data: {
          user_id: 123,
          user_info: { name: 'John' }
        }
      }))
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data)

      switch(message.event) {
        case 'connection_established':
          console.log('Socket ID:', message.data.socket_id)
          break

        case 'subscription_succeeded':
          console.log('Subscribed to:', message.channel)
          break

        case 'OrderShipped':
          console.log('Order shipped:', message.data)
          break

        case 'member_added':
          console.log('User joined:', message.data)
          break
      }
    }
  </script>
</body>
</html>
```

## Configuration

Create a `broadcast.config.ts` or `realtime.config.ts` file:

```typescript
import type { BroadcastConfig } from 'ts-broadcasting'

export default {
  verbose: true,
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
        maxPayloadLength: 16 * 1024 * 1024, // 16 MB
        backpressureLimit: 1024 * 1024, // 1 MB
        sendPings: true,
        perMessageDeflate: true,
      },
    },

    reverb: {
      driver: 'reverb',
      host: process.env.REVERB_HOST || '127.0.0.1',
      port: Number.parseInt(process.env.REVERB_PORT || '8080'),
      key: process.env.REVERB_APP_KEY,
      secret: process.env.REVERB_APP_SECRET,
      appId: process.env.REVERB_APP_ID,
    },

    pusher: {
      driver: 'pusher',
      key: process.env.PUSHER_APP_KEY,
      secret: process.env.PUSHER_APP_SECRET,
      appId: process.env.PUSHER_APP_ID,
      cluster: process.env.PUSHER_APP_CLUSTER || 'mt1',
      useTLS: true,
    },
  },
} satisfies BroadcastConfig
```

## CLI Commands

```bash
# Start the server
broadcast start

# Start with custom options
broadcast start --host 0.0.0.0 --port 6001 --verbose

# Show server statistics
broadcast stats

# Watch stats in real-time
broadcast stats --watch --interval 2

# Show configuration
broadcast config

# Show version
broadcast version
```

## Channel Types

### Public Channels

Anyone can subscribe without authorization:

```typescript
// Server
server.broadcast('announcements', 'NewAnnouncement', data)

// Client
ws.send(JSON.stringify({
  event: 'subscribe',
  channel: 'announcements'
}))
```

### Private Channels

Require authorization, prefixed with `private-`:

```typescript
// Server - define authorization
server.channels.channel('private-orders.{orderId}', (ws, data) => {
  return ws.data.user?.id === getOrderOwnerId(orderId)
})

// Client
ws.send(JSON.stringify({
  event: 'subscribe',
  channel: 'private-orders.123'
}))
```

### Presence Channels

Track online users, prefixed with `presence-`:

```typescript
// Server - return user info
server.channels.channel('presence-chat.{roomId}', (ws, data) => {
  return {
    id: ws.data.user.id,
    info: {
      name: ws.data.user.name,
      status: 'online',
    },
  }
})

// Client
ws.send(JSON.stringify({
  event: 'subscribe',
  channel: 'presence-chat.room1',
  channel_data: {
    user_id: 123,
    user_info: { name: 'John' }
  }
}))
```

## Advanced Usage

### Channel Pattern Matching

Use wildcards in channel names:

```typescript
// Match any order ID
server.channels.channel('private-orders.{orderId}', (ws) => {
  // orderId is extracted from channel name
  return true
})

// Match any user's private channel
server.channels.channel('private-user.{userId}', (ws) => {
  return ws.data.user?.id === userId
})
```

### Broadcasting to Others

Exclude the sender from receiving the broadcast:

```typescript
broadcaster.toOthers(socketId).send(
  'presence-chat.room1',
  'UserTyping',
  { user: 'John' },
)
```

### Client Events (Whisper)

Send messages directly between clients on private channels:

```typescript
// Client sends
ws.send(JSON.stringify({
  event: 'client-typing',
  channel: 'presence-chat.room1',
  data: { typing: true }
}))

// Other clients receive
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.event === 'client-typing') {
    console.log('Someone is typing...')
  }
}
```

### Compression

Enable per-message compression for large payloads:

```typescript
const config = {
  connections: {
    bun: {
      options: {
        perMessageDeflate: {
          compress: true,
          decompress: true,
        },
      },
    },
  },
}
```

## Performance

Built on Bun's native WebSocket implementation, ts-broadcasting delivers exceptional performance:

- **7x faster** than Node.js + `ws` for simple chatrooms
- **Native compression** for efficient data transfer
- **Zero-copy** message passing where possible
- **Efficient pub/sub** using Bun's built-in publish method

## API Reference

### BroadcastServer

```typescript
class BroadcastServer {
  constructor(config: BroadcastConfig)

  async start(): Promise<void>
  async stop(): Promise<void>

  broadcast(channel: string, event: string, data: unknown): void
  getConnectionCount(): number
  getSubscriberCount(channel: string): number

  channels: ChannelManager
}
```

### ChannelManager

```typescript
class ChannelManager {
  channel(pattern: string, callback: ChannelAuthorizationCallback): this

  async subscribe(ws: ServerWebSocket, channelName: string, data?: unknown): Promise<boolean>
  unsubscribe(ws: ServerWebSocket, channelName: string): void

  getSubscribers(channelName: string): Set<string>
  getPresenceMembers(channelName: string): Map<string, PresenceMember>
  getSubscriberCount(channelName: string): number
}
```

### Broadcaster

```typescript
class Broadcaster {
  async broadcast(event: BroadcastEvent): Promise<void>
  send(channels: string | string[], event: string, data: unknown): void
  toOthers(socketId: string): BroadcastTo
}
```

## Examples

Check the `examples/` directory for complete examples:

- `basic-server.ts` - Simple server setup
- `broadcasting-events.ts` - Event broadcasting patterns
- `client-example.html` - Browser client implementation

## Contributing

Contributions are welcome! Please read our contributing guidelines.

## License

MIT

## Credits

Inspired by Laravel's broadcasting system, built with Bun's high-performance APIs.
