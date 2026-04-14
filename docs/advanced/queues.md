# Queue Manager

ts-broadcasting supports background job queuing for broadcast operations, including delayed and recurring broadcasts.

## Setup

```ts
const server = new BroadcastServer({
  // ...
  queue: {
    enabled: true,
    connection: 'redis',
    defaultQueue: 'broadcasts',
    retry: {
      attempts: 3,
      backoff: {
        type: 'exponential', // 'fixed' or 'exponential'
        delay: 1000,         // Base delay in ms
      },
    },
    deadLetter: {
      enabled: true,
      maxRetries: 5,
    },
  },
})
```

## Queue Configuration

```ts
interface QueueConfig {
  enabled?: boolean
  connection?: string      // Queue connection (e.g., 'redis')
  defaultQueue?: string    // Default queue name
  retry?: {
    attempts?: number      // Max retry attempts
    backoff?: {
      type: 'fixed' | 'exponential'
      delay: number        // Base delay in ms
    }
  }
  deadLetter?: {
    enabled?: boolean
    maxRetries?: number    // Max retries before dead letter
  }
}
```

## Queuing Broadcasts

### Basic Queue

```ts
await server.queueManager?.queueBroadcast(
  ['notifications'],
  'NewNotification',
  { message: 'Hello' },
)
```

### Delayed Broadcasts

Send a broadcast after a specified delay:

```ts
await server.queueManager?.scheduleDelayedBroadcast(
  ['reminders'],
  'Reminder',
  { message: 'Meeting in 5 minutes' },
  300000, // 5 minute delay
)
```

### Recurring Broadcasts

Schedule broadcasts on a cron schedule:

```ts
await server.queueManager?.scheduleRecurringBroadcast(
  ['heartbeat'],
  'ServerPing',
  async () => ({
    timestamp: Date.now(),
    status: 'healthy',
  }),
  '*/30 * * * * *', // Every 30 seconds
)
```

## Job Classes

### BroadcastJob

```ts
import { BroadcastJob } from 'ts-broadcasting'

const job = new BroadcastJob(
  'notifications',  // channel
  'NewNotification', // event
  { message: 'Hello' }, // data
  excludeSocketId,  // optional
)
```

### DelayedBroadcastJob

```ts
import { DelayedBroadcastJob } from 'ts-broadcasting'

const job = new DelayedBroadcastJob(
  'reminders',
  'Reminder',
  { message: 'Don\'t forget!' },
  60000, // delay in ms
)
```

### RecurringBroadcastJob

```ts
import { RecurringBroadcastJob } from 'ts-broadcasting'

const job = new RecurringBroadcastJob(
  'metrics',
  'MetricsUpdate',
  async () => ({ cpu: getCpuUsage(), memory: getMemoryUsage() }),
  '0 * * * *', // Every hour
)
```

## Event-Level Queuing

Events can specify their queue via the `broadcastQueue()` method:

```ts
class OrderShipped implements BroadcastEvent {
  shouldBroadcast() { return true }
  broadcastOn() { return 'orders' }
  broadcastAs() { return 'OrderShipped' }
  broadcastQueue() { return 'high-priority' }
  broadcastWith() { return { orderId: this.order.id } }
}
```

## Job Monitoring

```ts
const counts = await server.queueManager?.getJobCounts()
// { waiting: 5, active: 2, completed: 100, failed: 3, delayed: 1 }
```

## Retry and Dead Letter

Failed jobs are automatically retried based on the configured backoff strategy:

- **Fixed backoff**: Retries at a constant interval
- **Exponential backoff**: Doubles the delay on each retry (1s, 2s, 4s, 8s...)

Jobs that exceed `maxRetries` are moved to the dead letter queue for manual inspection.

```ts
// Retry a specific job
await server.queueManager?.retryJob('job-id')
```

## Next Steps

- [Metrics](/advanced/metrics) - Prometheus monitoring
- [Load Management](/advanced/load-management) - Connection and load control
