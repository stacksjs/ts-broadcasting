# Lifecycle Hooks

ts-broadcasting provides channel lifecycle hooks that let you react to channel creation, subscription, and destruction events.

## Overview

The `ChannelLifecycleManager` is always initialized on the server. It fires events at key points in a channel's lifecycle.

## Events

| Event | Fired When |
|-------|------------|
| `created` | A channel is created (first subscriber) |
| `subscribed` | A client subscribes to a channel |
| `unsubscribed` | A client unsubscribes from a channel |
| `empty` | A channel has no remaining subscribers |
| `destroyed` | A channel is removed |

## Listening for Events

```ts
const lifecycle = server.lifecycle!

lifecycle.on('created', (data) => {
  console.log(`Channel ${data.channel} created by ${data.socketId}`)
})

lifecycle.on('subscribed', (data) => {
  console.log(`Socket subscribed to ${data.channel}, total: ${data.subscriberCount}`)
})

lifecycle.on('unsubscribed', (data) => {
  console.log(`Socket unsubscribed from ${data.channel}`)
})

lifecycle.on('empty', (data) => {
  console.log(`Channel ${data.channel} is now empty`)
})

lifecycle.on('destroyed', (data) => {
  console.log(`Channel ${data.channel} destroyed`)
})

// Listen to all events
lifecycle.on('all', (data) => {
  console.log(`Lifecycle event: ${data.event} on ${data.channel}`)
})
```

## Removing Listeners

```ts
const handler = (data) => console.log(data)

lifecycle.on('created', handler)
lifecycle.off('created', handler)
```

## Use Cases

- **Analytics**: Track channel creation and subscription patterns
- **Resource cleanup**: Clean up resources when channels are destroyed
- **Logging**: Log channel lifecycle events for debugging
- **Notifications**: Notify admins when specific channels are created
- **Auto-scaling**: Monitor channel counts to trigger scaling events

## Next Steps

- [Channels](/guide/channels) - Channel types
- [Metrics](/advanced/metrics) - Monitoring
