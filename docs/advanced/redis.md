# Redis Adapter

The Redis adapter enables horizontal scaling by distributing broadcasts across multiple server instances via Redis pub/sub.

## Setup

```ts
import { BroadcastServer } from 'ts-broadcasting'

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
// Redis connects automatically on server.start()
```

## Configuration

```ts
interface RedisConfig {
  host?: string      // Default: 'localhost'
  port?: number      // Default: 6379
  password?: string  // Redis password
  database?: number  // Database number (default: 0)
  url?: string       // Redis URL (alternative to host/port)
  keyPrefix?: string // Key prefix (default: 'broadcast:')
}
```

## How It Works

When Redis is enabled:

1. **Broadcasting**: When a message is broadcast on one server, it's also published to Redis
2. **Receiving**: All connected servers subscribe to Redis and relay messages to their local clients
3. **Connection tracking**: Connection metadata is stored in Redis for cross-server awareness
4. **Presence channels**: Presence member data is synchronized across servers via Redis

```
┌──────────┐    publish    ┌─────────┐    subscribe   ┌──────────┐
│ Server 1 │──────────────►│  Redis  │◄───────────────│ Server 2 │
│ (clients)│◄──────────────│  Pub/Sub│───────────────►│ (clients)│
└──────────┘    subscribe  └─────────┘    publish     └──────────┘
```

## Using the RedisAdapter Directly

```ts
import { RedisAdapter } from 'ts-broadcasting'

const redis = new RedisAdapter({
  host: 'localhost',
  port: 6379,
})

await redis.connect()

// Broadcast via Redis
await redis.broadcast('channel', 'EventName', { data: 'value' })

// Listen for messages from other servers
redis.onMessage((message) => {
  console.log('From another server:', message)
})

// Store connection metadata
await redis.storeConnection('socket-id', { user: { id: 1 } })

// Retrieve connection metadata
const data = await redis.getConnection('socket-id')

// Health check
const healthy = await redis.healthCheck()

// Cleanup
redis.close()
```

## Cross-Server Statistics

```ts
const stats = await server.getStats()
// With Redis enabled, stats include:
// {
//   connections: 42,          // Local connections
//   channels: 15,             // Local channels
//   totalConnections: 120,    // All servers combined
//   totalChannels: 45,        // All servers combined
//   redisHealthy: true,
//   serverId: 'uuid',
//   uptime: 3600,
// }
```

## Health Check

The `/health` endpoint includes Redis status:

```json
{
  "status": "ok",
  "redis": true
}
```

## Next Steps

- [Encryption](/advanced/encryption) - End-to-end encryption
- [Metrics](/advanced/metrics) - Prometheus monitoring
