# Message Deduplication

ts-broadcasting includes a message deduplication system to prevent duplicate message processing.

## Usage

```ts
import { MessageDeduplicator } from 'ts-broadcasting'

const deduplicator = new MessageDeduplicator({
  enabled: true,
  ttl: 60000,      // Keep message IDs for 1 minute
  maxSize: 10000,  // Max tracked messages
})
```

## Configuration

```ts
interface DeduplicationConfig {
  enabled?: boolean
  ttl?: number           // Time-to-live for tracked messages in ms
  maxSize?: number       // Maximum number of tracked messages
  hashFunction?: (channel: string, event: string, data: unknown) => string
}
```

## Checking for Duplicates

```ts
const isDuplicate = await deduplicator.isDuplicate(
  'orders',         // channel
  'OrderCreated',   // event
  { id: 1 },        // data
  'message-uuid',   // optional message ID
)

if (!isDuplicate) {
  // Process the message
}
```

## Custom Hash Function

Provide a custom hash function to control how duplicate detection works:

```ts
const deduplicator = new MessageDeduplicator({
  enabled: true,
  hashFunction: (channel, event, data) => {
    // Custom deduplication logic
    return `${channel}:${event}:${JSON.stringify(data)}`
  },
})
```

## Monitoring

```ts
const stats = deduplicator.getStats()
// {
//   totalChecked: 1000,
//   duplicatesFound: 5,
//   currentSize: 500,
// }
```

## Cleanup

```ts
// Clear all tracked messages
await deduplicator.clear()

// Stop the automatic cleanup timer
deduplicator.stop()
```

## Next Steps

- [Events](/guide/events) - Event broadcasting
- [Persistence](/features/persistence) - Message history
