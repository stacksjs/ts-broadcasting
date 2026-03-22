# Channels

ts-broadcasting supports three types of channels: public, private, and presence.

## Channel Types

### Public Channels

Anyone can subscribe without authentication:

```typescript
// Client-side
const channel = client.channel('news')

channel.listen('ArticlePublished', (data) => {
  console.log('New article:', data.title)
})
```

### Private Channels

Require authentication before subscribing:

```typescript
// Server-side authorization
server.channel('private-user.{userId}', async (ws, params) => {
  // Return true to allow, false to deny
  return ws.data.userId === params.userId
})

// Client-side
const channel = client.private('user.123')

channel.listen('MessageReceived', (data) => {
  console.log('Private message:', data)
})
```

### Presence Channels

Track online users and their data:

```typescript
// Server-side authorization
server.channel('presence-chat.{roomId}', async (ws, params) => {
  // Return user data for presence, or false to deny
  return {
    id: ws.data.userId,
    name: ws.data.userName,
    avatar: ws.data.avatar,
  }
})

// Client-side
const channel = client.join('chat.general')

// Get current members
channel.here((members) => {
  console.log('Online users:', members)
})

// Member joined
channel.joining((member) => {
  console.log(`${member.name} joined`)
})

// Member left
channel.leaving((member) => {
  console.log(`${member.name} left`)
})

// Listen for events
channel.listen('NewMessage', (data) => {
  console.log('Message:', data)
})
```

## Channel Manager

### Server-Side Channel Management

```typescript
import { ChannelManager } from 'ts-broadcasting'

const channels = new ChannelManager()

// Register authorization callback
channels.channel('private-orders.{orderId}', async (ws, params) => {
  const order = await getOrder(params.orderId)
  return order.userId === ws.data.userId
})

// Get channel info
const subscribers = channels.getSubscribers('private-orders.123')
console.log(`${subscribers.size} users subscribed`)

// Get presence members
const members = channels.getPresenceMembers('presence-chat.general')
console.log('Members:', Array.from(members.values()))

// Check if channel exists
if (channels.hasChannel('notifications')) {
  console.log('Channel active')
}

// Get all channel names
const allChannels = channels.getChannelNames()
console.log('Active channels:', allChannels)

// Get channel count
const count = channels.getChannelCount()
console.log(`${count} active channels`)
```

## Authorization Patterns

### Simple Authorization

```typescript
// Allow all authenticated users
server.channel('private-dashboard', async (ws) => {
  return ws.data.userId !== undefined
})
```

### Parameter-Based Authorization

```typescript
// Channel pattern with parameters
server.channel('private-team.{teamId}', async (ws, params) => {
  const teamId = params.teamId
  const userTeams = await getUserTeams(ws.data.userId)
  return userTeams.includes(teamId)
})
```

### Role-Based Authorization

```typescript
server.channel('private-admin', async (ws) => {
  return ws.data.role === 'admin'
})

server.channel('private-moderator.{section}', async (ws, params) => {
  const permissions = await getUserPermissions(ws.data.userId)
  return permissions.canModerate(params.section)
})
```

### Class-Based Authorization

```typescript
class OrderChannelAuthorizer {
  async join(ws, params) {
    const order = await Order.find(params.orderId)

    if (!order) {
      return false
    }

    // Check ownership
    if (order.userId === ws.data.userId) {
      return true
    }

    // Check if admin
    if (ws.data.role === 'admin') {
      return true
    }

    return false
  }
}

server.channel('private-order.{orderId}', new OrderChannelAuthorizer())
```

## Subscribing and Unsubscribing

### Client-Side

```typescript
// Subscribe to channel
const channel = client.channel('notifications')

// Listen for events
channel.listen('NewNotification', handleNotification)

// Stop listening for specific event
channel.stopListening('NewNotification')

// Unsubscribe from channel
client.leave('notifications')
```

### Server-Side Management

```typescript
// Unsubscribe socket from channel
channels.unsubscribe(ws, 'private-orders.123')

// Unsubscribe socket from all channels
channels.unsubscribeAll(ws)
```

## Wildcard Channels

Match multiple channel patterns:

```typescript
// Match any user channel
server.channel('private-user.{userId}', async (ws, params) => {
  return ws.data.userId === params.userId
})

// Match nested channels
server.channel('private-team.{teamId}.chat.{chatId}', async (ws, params) => {
  const { teamId, chatId } = params
  return await canAccessTeamChat(ws.data.userId, teamId, chatId)
})
```

## Presence Channel Features

### Getting All Members

```typescript
// Client-side
channel.here((members) => {
  members.forEach(member => {
    console.log(`${member.name} is online`)
  })
})
```

### Member Events

```typescript
// When someone joins
channel.joining((member) => {
  showNotification(`${member.name} joined the chat`)
})

// When someone leaves
channel.leaving((member) => {
  showNotification(`${member.name} left the chat`)
})
```

### Custom Member Data

```typescript
// Server-side: Return custom data
server.channel('presence-game.{gameId}', async (ws, params) => {
  const player = await getPlayer(ws.data.userId)

  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar,
    score: player.score,
    team: player.team,
  }
})

// Client-side: Access custom data
channel.here((members) => {
  const teams = {
    red: members.filter(m => m.team === 'red'),
    blue: members.filter(m => m.team === 'blue'),
  }
  updateTeamLists(teams)
})
```

## Channel State

### Server-Side State Management

```typescript
import { ChannelStateManager } from 'ts-broadcasting'

const state = new ChannelStateManager()

// Set channel state
state.set('game.123', {
  status: 'active',
  round: 1,
  players: [],
})

// Get channel state
const gameState = state.get('game.123')

// Update state
state.update('game.123', {
  round: 2,
})

// Clear state
state.clear('game.123')
```

## Heartbeat

Keep presence channels up-to-date:

```typescript
import { PresenceHeartbeat } from 'ts-broadcasting'

const heartbeat = new PresenceHeartbeat({
  interval: 30000, // 30 seconds
  timeout: 60000,  // 60 seconds without heartbeat = disconnect
})

// Apply to server
server.use(heartbeat)
```

## Next Steps

- [Events](/guide/events) - Broadcasting events
- [Laravel Echo](/guide/echo) - Echo compatibility
