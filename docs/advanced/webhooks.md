# Webhooks

ts-broadcasting can fire HTTP webhooks when channel events occur, enabling integration with external services.

## Setup

```ts
const server = new BroadcastServer({
  // ...
  webhooks: {
    enabled: true,
    retryAttempts: 3,
    retryDelay: 1000,
    timeout: 5000,
    secret: 'webhook-signing-secret',
    endpoints: [
      {
        url: 'https://api.example.com/webhooks/broadcasting',
        events: ['connection', 'disconnection', 'subscribe', 'broadcast'],
        headers: { 'X-Custom-Header': 'value' },
        method: 'POST',
      },
    ],
  },
})
```

## Configuration

```ts
interface WebhookConfig {
  enabled?: boolean
  endpoints?: WebhookEndpoint[]
  retryAttempts?: number   // Retry count on failure (default: 3)
  retryDelay?: number      // Delay between retries in ms (default: 1000)
  timeout?: number         // HTTP request timeout in ms (default: 5000)
  secret?: string          // Signing secret for webhook verification
}

interface WebhookEndpoint {
  url: string
  events: WebhookEvent[]
  headers?: Record<string, string>
  method?: 'POST' | 'PUT'  // Default: 'POST'
}
```

## Supported Events

| Event | Fired When |
|-------|------------|
| `connection` | Client connects |
| `disconnection` | Client disconnects |
| `subscribe` | Client subscribes to a channel |
| `unsubscribe` | Client unsubscribes from a channel |
| `broadcast` | Message is broadcast to a channel |
| `presence_join` | Member joins a presence channel |
| `presence_leave` | Member leaves a presence channel |
| `client_event` | Client sends a whisper event |

## Registering Endpoints at Runtime

```ts
server.webhooks?.register({
  url: 'https://api.example.com/webhooks/orders',
  events: ['broadcast'],
  headers: { Authorization: 'Bearer token' },
})
```

## Firing Webhooks Manually

```ts
await server.webhooks?.fire('broadcast', {
  channel: 'orders',
  event: 'OrderCreated',
  data: { id: 1 },
})
```

## Webhook Payload

Each webhook receives a JSON payload:

```json
{
  "event": "subscribe",
  "timestamp": 1234567890,
  "data": {
    "socketId": "uuid",
    "channel": "private-orders.123",
    "channelData": {}
  }
}
```

## Next Steps

- [Metrics](/advanced/metrics) - Prometheus monitoring
- [Queues](/advanced/queues) - Background job queuing
