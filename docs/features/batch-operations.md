# Batch Operations

ts-broadcasting supports batch subscribe and unsubscribe operations for efficient multi-channel management.

## Setup

```ts
const server = new BroadcastServer({
  // ...
  batch: {
    enabled: true,
    maxBatchSize: 50,
    debounceMs: 100,
  },
})
```

## Configuration

```ts
interface BatchConfig {
  enabled?: boolean
  maxBatchSize?: number   // Max channels per batch (default: 50)
  debounceMs?: number     // Debounce window in ms
}
```

## Client-Side Usage

### Batch Subscribe

```ts
const result = await client.batchSubscribe([
  'channel-1',
  'private-channel-2',
  'presence-channel-3',
])

console.log(result.succeeded) // ['channel-1', 'private-channel-2', ...]
console.log(result.failed)    // { 'presence-channel-3': 'Unauthorized' }
```

### Batch Unsubscribe

```ts
const result = await client.batchUnsubscribe([
  'channel-1',
  'private-channel-2',
])

console.log(result.succeeded)
console.log(result.failed)
```

### Size Limits

Batch operations are limited by `maxBatchSize`:

```ts
// This throws an error if batch is larger than maxBatchSize
try {
  await client.batchSubscribe(tooManyChannels)
}
catch (error) {
  console.error(error.message) // 'Batch size exceeds maximum: 100 > 50'
}
```

## Server-Side Processing

The server handles batch operations atomically and returns results for each channel:

```ts
// Server receives:
// { event: 'batch_subscribe', channels: [...], messageId: 'uuid' }

// Server responds:
// { event: 'batch_subscribe_result', messageId: 'uuid', data: { succeeded: [...], failed: {...} } }
```

## Client Configuration

```ts
const client = new BroadcastClient({
  // ...
  batch: {
    enabled: true,       // Default: true
    maxBatchSize: 50,    // Default: 50
  },
})
```

## Next Steps

- [Channels](/guide/channels) - Channel types
- [Events](/guide/events) - Event broadcasting
