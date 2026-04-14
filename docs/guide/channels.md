# Channels

ts-broadcasting supports three types of channels: public, private, and presence.

## Channel Types

### Public Channels

Anyone can subscribe without authentication:

```ts
// Client-side
const channel = client.channel('news')

channel.listen('ArticlePublished', (data) => {
  console.log('New article:', data.title)
})
```

### Private Channels

Require authorization before subscribing. Channel names must be prefixed with `private-`:

```ts
// Server-side authorization
server.channels.channel('private-user.{userId}', (ws, params) => {
  return ws.data.user?.id === params?.userId
})

// Client-side (prefix added automatically)
const channel = client.private('user.123')

channel.listen('MessageReceived', (data) => {
  console.log('Private message:', data)
})
```

### Presence Channels

Track online users and their data. Channel names must be prefixed with `presence-`:

```ts
// Server-side authorization (return member data or false)
server.channels.channel('presence-chat.{roomId}', (ws, params) => {
  if (!ws.data.user) return false

  return {
    id: ws.data.user.id,
    info: {
      name: ws.data.user.name,
      avatar: ws.data.user.avatar,
    },
  }
})

// Client-side (prefix added automatically)
const channel = client.join('chat.general')

// Get current members
channel.here((members) => {
  console.log('Online users:', members)
})

// Member joined
channel.joining((member) => {
  console.log(`${member.info.name} joined`)
})

// Member left
channel.leaving((member) => {
  console.log(`${member.info.name} left`)
})

// Listen for events
channel.listen('NewMessage', (data) => {
  console.log('Message:', data)
})
```

## Channel Manager

### Server-Side Channel Management

```ts
// Register authorization callback
server.channels.channel('private-orders.{orderId}', async (ws, params) => {
  const order = await getOrder(params?.orderId)
  return order.userId === ws.data.user?.id
})

// Get channel info
const subscribers = server.channels.getSubscribers('private-orders.123')
console.log(`${subscribers.size} users subscribed`)

// Get presence members
const members = server.channels.getPresenceMembers('presence-chat.general')
if (members) {
  console.log('Members:', Array.from(members.values()))
}

// Check if channel exists
if (server.channels.hasChannel('notifications')) {
  console.log('Channel active')
}

// Get all channel names
const allChannels = server.channels.getChannelNames()

// Get channel count
const count = server.channels.getChannelCount()

// Get channel type
const type = server.channels.getChannelType('private-orders.123') // 'private'
```

## Authorization Patterns

### Simple Authorization

```ts
// Allow all authenticated users
server.channels.channel('private-dashboard', (ws) => {
  return ws.data.user !== undefined
})
```

### Parameter-Based Authorization

```ts
// Channel pattern with parameters
server.channels.channel('private-team.{teamId}', async (ws, params) => {
  const userTeams = await getUserTeams(ws.data.user?.id)
  return userTeams.includes(params?.teamId)
})
```

### Role-Based Authorization

```ts
server.channels.channel('private-admin', (ws) => {
  return ws.data.user?.role === 'admin'
})

server.channels.channel('private-moderator.{section}', async (ws, params) => {
  const permissions = await getUserPermissions(ws.data.user?.id)
  return permissions.canModerate(params?.section)
})
```

### Class-Based Authorization

```ts
class OrderChannelAuthorizer {
  async join(ws, params) {
    const order = await Order.find(params?.orderId)
    if (!order) return false

    // Check ownership
    if (order.userId === ws.data.user?.id) return true

    // Check if admin
    if (ws.data.user?.role === 'admin') return true

    return false
  }
}

server.channels.channel('private-order.{orderId}', new OrderChannelAuthorizer())
```

## Subscribing and Unsubscribing

### Client-Side

```ts
// Subscribe to channel
const channel = client.channel('notifications')

// Listen for events
channel.listen('NewNotification', handleNotification)

// Stop listening for specific event
channel.stopListening('NewNotification')

// Leave channel entirely
client.leave('notifications')

// Leave all channels
client.leaveAll()
```

### Server-Side Management

```ts
// Unsubscribe socket from channel
server.channels.unsubscribe(ws, 'private-orders.123')

// Unsubscribe socket from all channels
server.channels.unsubscribeAll(ws)
```

## Wildcard Channel Parameters

Match dynamic channel segments with parameters:

```ts
// Match any user channel
server.channels.channel('private-user.{userId}', (ws, params) => {
  return ws.data.user?.id === params?.userId
})

// Match nested channels
server.channels.channel('private-team.{teamId}.chat.{chatId}', async (ws, params) => {
  const { teamId, chatId } = params || {}
  return await canAccessTeamChat(ws.data.user?.id, teamId, chatId)
})
```

## Presence Channel Features

### Getting All Members

```ts
// Client-side
channel.here((members) => {
  members.forEach((member) => {
    console.log(`${member.info.name} is online`)
  })
})
```

### Member Events

```ts
channel.joining((member) => {
  showNotification(`${member.info.name} joined the chat`)
})

channel.leaving((member) => {
  showNotification(`${member.info.name} left the chat`)
})
```

### Custom Member Data

```ts
// Server-side: Return custom data
server.channels.channel('presence-game.{gameId}', (ws, params) => {
  const player = getPlayer(ws.data.user?.id)
  return {
    id: player.id,
    info: {
      name: player.name,
      avatar: player.avatar,
      score: player.score,
      team: player.team,
    },
  }
})

// Client-side: Access custom data
channel.here((members) => {
  const teams = {
    red: members.filter(m => m.info.team === 'red'),
    blue: members.filter(m => m.info.team === 'blue'),
  }
  updateTeamLists(teams)
})
```

### Programmatic Member Access

```ts
// Get all current members (client-side)
const members = presenceChannel.getMembers()

// Get a specific member
const member = presenceChannel.getMember('user-123')
```

## Channel State

### Server-Side State Management

```ts
// The channel state manager is always initialized
const state = server.channelState!

// Set channel state
state.set('game.123', 'status', 'active')
state.set('game.123', 'round', 1)

// Get channel state
const status = state.get('game.123', 'status')

// Get all state for a channel
const allState = state.getAll('game.123')

// Check if state exists
if (state.has('game.123', 'status')) {
  // ...
}

// Delete specific key
state.delete('game.123', 'round')

// Clear all state for a channel
state.clear('game.123')
```

## Heartbeat

Keep presence channels up-to-date with automatic heartbeat monitoring:

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

When enabled, inactive users are automatically removed from presence channels. The client SDK sends presence heartbeats automatically when subscribed to presence channels.

## Lifecycle Hooks

```ts
// The lifecycle manager is always initialized
const lifecycle = server.lifecycle!

lifecycle.on('created', (data) => {
  console.log(`Channel ${data.channel} created`)
})

lifecycle.on('subscribed', (data) => {
  console.log(`Socket subscribed to ${data.channel}`)
})

lifecycle.on('unsubscribed', (data) => {
  console.log(`Socket unsubscribed from ${data.channel}`)
})

lifecycle.on('destroyed', (data) => {
  console.log(`Channel ${data.channel} destroyed (no subscribers)`)
})
```

## Next Steps

- [Events](/guide/events) - Broadcasting events
- [Laravel Echo](/guide/echo) - Echo compatibility
- [Advanced Features](/advanced/redis) - Redis, encryption, and more
