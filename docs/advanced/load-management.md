# Load Management

ts-broadcasting includes built-in load management to handle high-traffic scenarios with connection limits, subscription limits, backpressure handling, and load shedding.

## Setup

```ts
const server = new BroadcastServer({
  // ...
  loadManagement: {
    maxConnections: 10000,
    maxChannelsPerConnection: 100,
    maxGlobalChannels: 50000,
    shedLoadAt: 90,                // Start shedding at 90% capacity
    backpressureThreshold: 1048576, // 1 MB
  },
})
```

## Configuration

```ts
interface LoadConfig {
  maxConnections?: number            // Max concurrent connections
  maxChannelsPerConnection?: number  // Max channels per client
  maxGlobalChannels?: number         // Max total channels across all clients
  shedLoadAt?: number                // Load percentage to start shedding (0-100)
  backpressureThreshold?: number     // Backpressure limit in bytes
}
```

## How It Works

### Connection Limits

When `maxConnections` is reached, new connections receive a `1008` close code ("Server at capacity"):

```ts
// Checked on every new WebSocket connection
if (server.loadManager && !server.loadManager.canAcceptConnection()) {
  ws.close(1008, 'Server at capacity')
}
```

### Subscription Limits

Each connection has a maximum number of channels it can subscribe to:

```ts
// Checked on every subscribe request
if (server.loadManager && !server.loadManager.canSubscribe(socketId)) {
  // Returns subscription_error with status 429
}
```

### Load Shedding

When the server reaches the `shedLoadAt` percentage of capacity, new connections are rejected to protect existing clients:

```ts
if (server.loadManager?.shouldShedLoad()) {
  ws.close(1008, 'Server load too high')
}
```

### Backpressure

Monitor WebSocket buffer levels to prevent memory overflow:

```ts
server.loadManager?.shouldApplyBackpressure(bufferedAmount)
```

## Checking Load Status

```ts
const stats = server.loadManager?.getStats()
// {
//   activeConnections: 5000,
//   maxConnections: 10000,
//   loadPercentage: 50,
//   isShedding: false,
// }
```

## Connection Options

WebSocket-level backpressure is also configurable via connection options:

```ts
connections: {
  bun: {
    driver: 'bun',
    options: {
      backpressureLimit: 1024 * 1024,     // 1 MB
      closeOnBackpressureLimit: false,     // Don't close, just buffer
      maxPayloadLength: 16 * 1024 * 1024, // 16 MB max message
    },
  },
}
```

## Next Steps

- [Circuit Breaker](/advanced/circuit-breaker) - Failure handling
- [Metrics](/advanced/metrics) - Monitoring
