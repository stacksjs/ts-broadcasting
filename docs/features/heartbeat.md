# Presence Heartbeat

The presence heartbeat feature monitors active presence channel members and automatically removes inactive users.

## Setup

```ts
const server = new BroadcastServer({
  // ...
  heartbeat: {
    enabled: true,
    interval: 30000, // Check every 30 seconds
    timeout: 60000,  // Remove after 60 seconds of inactivity
  },
})
```

## Configuration

```ts
interface HeartbeatConfig {
  enabled?: boolean
  interval?: number  // Check interval in ms (default: 30000)
  timeout?: number   // User timeout in ms (default: 60000)
  requireClientHeartbeat?: boolean
}
```

## How It Works

1. **Server-side**: The heartbeat manager periodically checks all presence channel members
2. **Client-side**: The client SDK automatically sends `presence_heartbeat` events when subscribed to presence channels (every 30 seconds)
3. **Removal**: Members who haven't sent a heartbeat within the `timeout` period are automatically removed
4. **Notification**: When a member is removed, a `member_removed` event is broadcast to remaining channel subscribers

## Client-Side Heartbeat

The `PresenceChannel` class in the client SDK automatically sends heartbeats:

```ts
// Heartbeats are sent automatically when joining a presence channel
const channel = client.join('chat.room1')

// The client sends { event: 'presence_heartbeat', channel: 'presence-chat.room1' }
// every 30 seconds while subscribed
```

## Removal Callback

The server handles user removal when heartbeats timeout:

```ts
// Automatically configured by the server
server.presenceHeartbeat?.onUserRemove((channel, socketId, user) => {
  // A member_removed event is broadcast to the channel
  console.log(`Removed inactive user ${socketId} from ${channel}`)
})
```

## Manual Heartbeat

You can also manually trigger a heartbeat for a specific member:

```ts
server.presenceHeartbeat?.heartbeat('presence-chat.room1', socketId, userData)
```

## Lifecycle

```
Client joins presence channel
  → Server registers member with heartbeat manager
  → Client sends heartbeat every 30s
  → Server resets timeout on each heartbeat

Client stops sending heartbeats (disconnect, crash, etc.)
  → After timeout period, server removes member
  → member_removed event broadcast to channel
  → Remaining members are notified
```

## Next Steps

- [Channels](/guide/channels) - Presence channels
- [Events](/guide/events) - Event lifecycle
