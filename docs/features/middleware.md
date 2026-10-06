# Middleware

ts-broadcasting includes built-in middleware for authentication, rate limiting, message validation, security, and monitoring.

## Authentication

### Setup

```ts
const server = new BroadcastServer({
  // ...
  auth: {
    enabled: true,
    jwt: {
      secret: 'your-jwt-secret',
      algorithm: 'HS256', // HS256, HS384, HS512
    },
  },
})
```

### Custom Authentication

```ts
server.auth?.authenticate(async (req) => {
  const token = req.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null

  const user = await verifyToken(token)
  return user ? { id: user.id, name: user.name, role: user.role } : null
})
```

### Configuration

```ts
interface AuthConfig {
  enabled?: boolean
  required?: boolean // refuse (401) upgrades without an authenticated user
  cookie?: {
    name?: string
    secure?: boolean
  }
  jwt?: {
    secret?: string
    algorithm?: 'HS256' | 'HS384' | 'HS512'
  }
  session?: {
    key?: string
  }
}
```

Authentication runs during the WebSocket upgrade request. Authenticated user data is attached to `ws.data.user` and available in channel authorization callbacks.

By itself, `auth` only identifies users: a request it cannot authenticate is
still upgraded, as an anonymous socket that can join public channels. Set
`required: true` to refuse those upgrades with a 401.

### Connection Authorization

`authorizeConnection` decides whether an upgrade on `/app` or `/ws` goes
through at all. It runs after `auth`, receives the user `auth` resolved (or
`null`), and runs before the socket exists:

```ts
const server = new BroadcastServer({
  // ...
  authorizeConnection: async (req, user) => {
    const token = new URL(req.url).searchParams.get('token')
    const session = token ? await sessions.find(token) : null
    if (!session)
      return { ok: false, status: 401, message: 'Unauthorized' }

    // Accept, and set what channel authorizers see as socket.data.user /
    // socket.data.data.
    return { ok: true, user: { id: session.userId }, data: { tenant: session.tenant } }
  },
})
```

It may return `true` / `false`, or `{ ok: false, status?, message? }` to pick the
refusal's status, or `{ ok: true, user?, data? }`. It fails closed: returning
nothing refuses with a 401, and throwing refuses with a 500 (the error is
logged, never sent to the client).

## Rate Limiting

### Setup

```ts
const server = new BroadcastServer({
  // ...
  rateLimit: {
    max: 100,          // Max messages per window
    window: 60000,     // Window in milliseconds (1 minute)
    perChannel: false,  // Rate limit per channel
    perUser: false,     // Rate limit per user
  },
})
```

### How It Works

When a client exceeds the rate limit, they receive an error response:

```json
{
  "event": "error",
  "data": {
    "type": "RateLimitExceeded",
    "error": "Too many requests",
    "retryAfter": 1234567890
  }
}
```

### Configuration

```ts
interface RateLimitConfig {
  max: number          // Maximum messages per window
  window: number       // Time window in milliseconds
  perChannel?: boolean // Rate limit per channel (default: false)
  perUser?: boolean    // Rate limit per user (default: false)
}
```

## Message Validation

The server automatically validates incoming messages for:

- Valid JSON format
- Presence of required `event` field (string)
- Valid `channel` field type (string, if present)
- Event name length (max 100 characters)
- Event name format (alphanumeric, dots, hyphens, underscores)

Invalid messages receive an error response:

```json
{
  "event": "error",
  "data": {
    "type": "ValidationError",
    "error": "Missing or invalid event name"
  }
}
```

### Custom Validators

```ts
server.validator?.addValidator((message) => {
  // Return true if valid, or an error string
  if (message.data && JSON.stringify(message.data).length > 65536) {
    return 'Data payload too large'
  }
  return true
})
```

## Security

### Setup

```ts
const server = new BroadcastServer({
  // ...
  security: {
    // Security options for message size and content sanitization
  },
})
```

### Features

- **Message size checking**: Rejects messages exceeding maximum size
- **Content sanitization**: Sanitizes message data to prevent injection attacks

Oversized messages receive:

```json
{
  "event": "error",
  "data": {
    "type": "PayloadTooLarge",
    "error": "Message size exceeds maximum allowed"
  }
}
```

## Monitoring

The `MonitoringManager` is always initialized and tracks server events internally:

```ts
// Access metrics
const metrics = server.monitoring?.getMetrics()

// The monitoring manager emits events for:
// - connection / disconnection
// - subscribe / unsubscribe
// - message / broadcast
// - error
```

Metrics are exposed via the `/metrics` Prometheus endpoint and the `/stats` JSON endpoint, both off unless enabled with `endpoints: { metrics: true, stats: true }` (see [Metrics](/advanced/metrics)).

## Next Steps

- [Persistence](/features/persistence) - Message history
- [Events](/guide/events) - Broadcasting events
