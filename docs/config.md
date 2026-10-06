# Configuration

ts-broadcasting is configured via a `broadcast.config.ts` (or `realtime.config.ts`) file in your project root. Configuration is loaded automatically via `bunfig`.

## Basic Configuration

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
        maxPayloadLength: 16 * 1024 * 1024, // 16 MB
        backpressureLimit: 1024 * 1024, // 1 MB
        closeOnBackpressureLimit: false,
        sendPings: true,
        publishToSelf: false,
        perMessageDeflate: true,
      },
    },
  },
}

export default config
```

## BroadcastConfig Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `verbose` | `boolean` | `false` | Enable verbose logging |
| `driver` | `string` | `'bun'` | Default driver: `'bun'`, `'reverb'`, `'pusher'`, `'ably'`, `'log'`, `'null'` |
| `default` | `string` | `'bun'` | Default connection name to use |
| `connections` | `object` | — | Connection configurations (see below) |

## Connection Options

Each connection in the `connections` object can have these options:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `driver` | `string` | — | Connection driver (required) |
| `host` | `string` | `'0.0.0.0'` | Host to bind to |
| `port` | `number` | `6001` | Port to listen on |
| `scheme` | `string` | `'ws'` | Protocol: `'ws'`, `'wss'`, `'http'`, `'https'` |
| `key` | `string` | — | Application key |
| `secret` | `string` | — | Application secret |
| `appId` | `string` | — | Application ID |
| `cluster` | `string` | — | Cluster name (Pusher) |
| `encrypted` | `boolean` | `false` | Use encrypted connection |
| `useTLS` | `boolean` | `false` | Use TLS |
| `options` | `object` | — | WebSocket-specific options |

## WebSocket Options

The `options` object within a connection config:

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `idleTimeout` | `number` | `120` | Seconds before idle connection is closed |
| `maxPayloadLength` | `number` | `16777216` | Maximum message size in bytes (16 MB) |
| `backpressureLimit` | `number` | `1048576` | Backpressure limit in bytes (1 MB) |
| `closeOnBackpressureLimit` | `boolean` | `false` | Close connection when backpressure limit hit |
| `sendPings` | `boolean` | `true` | Send ping frames to keep connections alive |
| `publishToSelf` | `boolean` | `false` | Whether publishers receive their own messages |
| `perMessageDeflate` | `boolean \| object` | `true` | Enable per-message compression |

A server built with `host`/`port` instead of `connections` takes the same
options as `websocket`; a named connection's `options` win over it:

```ts
const server = new BroadcastServer({
  host: '0.0.0.0',
  port: 6001,
  websocket: {
    idleTimeout: 60,               // with sendPings, a socket that answers no ping for this long is closed
    sendPings: true,
    backpressureLimit: 1024 * 1024,
    closeOnBackpressureLimit: true, // drop a consumer that falls 1 MB behind
  },
})
```

These are the server's dead-socket and slow-consumer controls. Bun pings an
idle socket and closes it if nothing (not even a pong) arrives within the idle
timeout, which Bun rounds up to a multiple of 4 seconds.

## Broadcast Hooks

Every broadcast, from whichever API (`server.broadcast()`, the broadcaster,
the `Broadcast` facade, queued jobs, Redis-relayed messages), runs the
broadcast hooks before its frame is serialized, including when no local socket
is subscribed. A hook may return extra top-level fields for the frame:

```ts
let seq = 0
const server = new BroadcastServer({
  // ...
  beforeBroadcast: ({ channel, event, data }) => ({ seq: ++seq }),
})

// or, at any time; returns a function that removes the hook
const remove = server.addBroadcastHook(({ channel }) => {
  metrics.count(channel)
})
```

Clients receive `{ seq, event, channel, data }`. A hook cannot overwrite
`event`, `channel` or `data`, and a hook that throws is logged and skipped.

## Excluding Sockets

`server.broadcast(channel, event, data, exclude)` takes one socket ID or an
array of them - the IDs clients receive in `connection_established`, not user
IDs. `Broadcast.toOthers(socketId)` and `broadcaster.send(..., exclude)` pass
it through.

## Server Configuration

When creating a `BroadcastServer`, the config extends `BroadcastConfig` with additional options:

```ts
import type { ServerConfig } from 'ts-broadcasting'

const serverConfig: ServerConfig = {
  // Base broadcast config
  driver: 'bun',
  verbose: true,
  connections: { /* ... */ },

  // Redis for horizontal scaling
  redis: {
    host: 'localhost',
    port: 6379,
    password: undefined,
    database: 0,
    keyPrefix: 'broadcast:',
  },

  // Authentication
  auth: {
    enabled: true,
    jwt: {
      secret: 'your-jwt-secret',
      algorithm: 'HS256', // HS256, HS384, HS512
    },
  },

  // Rate limiting
  rateLimit: {
    max: 100,         // Max messages per window
    window: 60000,    // Window in milliseconds
    perChannel: false, // Rate limit per channel
    perUser: false,    // Rate limit per user
  },

  // Security
  security: {
    // Message size and content validation
  },

  // End-to-end encryption
  encryption: {
    enabled: true,
    algorithm: 'aes-256-gcm', // or 'aes-128-gcm'
    keyRotationInterval: 86400000, // 24 hours
  },

  // Webhooks
  webhooks: {
    enabled: true,
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 5000,
    secret: 'webhook-secret',
    endpoints: [
      {
        url: 'https://api.example.com/webhooks',
        events: ['connection', 'disconnection', 'subscribe', 'unsubscribe', 'broadcast'],
        headers: { 'X-Custom': 'value' },
        method: 'POST',
      },
    ],
  },

  // Message persistence
  persistence: {
    enabled: true,
    ttl: 3600000,       // Message TTL in ms (1 hour)
    maxMessages: 1000,  // Max messages per channel
    excludeEvents: [],  // Events to exclude from persistence
  },

  // Presence heartbeat
  heartbeat: {
    enabled: true,
    interval: 30000,  // Check interval in ms
    timeout: 60000,   // User timeout in ms
  },

  // Message acknowledgments
  acknowledgments: {
    enabled: true,
    timeout: 5000,       // Ack timeout in ms
    retryAttempts: 3,
  },

  // Batch operations
  batch: {
    enabled: true,
    maxBatchSize: 50,
    debounceMs: 100,
  },

  // Load management
  loadManagement: {
    maxConnections: 10000,
    maxChannelsPerConnection: 100,
    maxGlobalChannels: 50000,
    shedLoadAt: 90,            // Percentage (0-100)
    backpressureThreshold: 1048576,
  },

  // Queue system
  queue: {
    enabled: true,
    connection: 'redis',
    defaultQueue: 'broadcasts',
    retry: {
      attempts: 3,
      backoff: {
        type: 'exponential', // 'fixed' or 'exponential'
        delay: 1000,
      },
    },
    deadLetter: {
      enabled: true,
      maxRetries: 5,
    },
  },

  // Debug mode
  debug: false,
}
```

## Environment Variables

Connection configs can reference environment variables for secrets:

```ts
connections: {
  reverb: {
    driver: 'reverb',
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
  },
  ably: {
    driver: 'ably',
    key: process.env.ABLY_KEY,
  },
}
```

## Programmatic Configuration

You can also configure directly when creating the server:

```ts
import { BroadcastServer } from 'ts-broadcasting'

const server = new BroadcastServer({
  driver: 'bun',
  verbose: true,
  connections: {
    bun: {
      driver: 'bun',
      host: '0.0.0.0',
      port: 6001,
    },
  },
  redis: { host: 'localhost', port: 6379 },
  auth: { enabled: true, jwt: { secret: 'my-secret' } },
})
```

## Loading Configuration

Configuration is loaded lazily via `bunfig`:

```ts
import { getConfig } from 'ts-broadcasting'

// Async config loading (reads broadcast.config.ts)
const config = await getConfig()

// Synchronous access to defaults
import { config } from 'ts-broadcasting'
```

## Next Steps

- [Getting Started](/guide/getting-started) - Set up your server
- [Advanced Features](/advanced/redis) - Redis, encryption, and more
