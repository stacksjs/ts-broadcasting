# Message Persistence

ts-broadcasting can persist broadcast messages for replay and history purposes.

## Setup

```ts
const server = new BroadcastServer({
  // ...
  persistence: {
    enabled: true,
    ttl: 3600000,       // Message TTL in ms (1 hour)
    maxMessages: 1000,  // Max messages per channel
    excludeEvents: [],  // Events to exclude from persistence
  },
})
```

## Configuration

```ts
interface PersistenceConfig {
  enabled?: boolean
  ttl?: number           // Time-to-live in milliseconds
  maxMessages?: number   // Maximum messages stored per channel
  excludeEvents?: string[] // Event names to exclude
}
```

## Storing Messages

Messages are stored automatically when persistence is enabled. The server stores messages after they are broadcast.

## Retrieving History

```ts
// Get message history for a channel
const messages = await server.persistence?.getHistory('orders')

// Get messages since a timestamp
const recent = await server.persistence?.getHistory('orders', Date.now() - 60000)

// Get messages with a limit
const last10 = await server.persistence?.getHistory('orders', undefined, 10)
```

### Message Format

```ts
interface PersistedMessage {
  channel: string
  event: string
  data: unknown
  socketId?: string
  timestamp: number
}
```

## Manual Storage

```ts
await server.persistence?.store('orders', 'OrderCreated', {
  id: 1,
  total: 99.99,
}, socketId)
```

## Clearing History

```ts
// Clear history for a specific channel
await server.persistence?.clear('orders')
```

## Use Cases

- **Message replay**: New subscribers can catch up on missed events
- **Audit logging**: Keep a record of all broadcast events
- **Debugging**: Review recent messages for troubleshooting

## Next Steps

- [Middleware](/features/middleware) - Auth and rate limiting
- [Events](/guide/events) - Broadcasting events
