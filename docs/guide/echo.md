# Laravel Echo Compatibility

ts-broadcasting provides Laravel Echo compatible APIs for easy migration from Pusher or Laravel Echo Server.

## Overview

The client SDK is designed to be a drop-in replacement for Laravel Echo:

```ts
// Before: Laravel Echo + Pusher
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

window.Pusher = Pusher
window.Echo = new Echo({
  broadcaster: 'pusher',
  key: 'your-app-key',
  cluster: 'mt1',
  encrypted: true,
})

// After: ts-broadcasting (same channel API)
import { Echo } from 'ts-broadcasting'

window.Echo = new Echo({
  broadcaster: 'bun',
  host: 'localhost',
  port: 6001,
  scheme: 'ws',
})
```

The `Echo` export is an alias for `BroadcastClient`. All channel subscription code remains identical.

## Echo Client API

### Creating Instance

```ts
import { Echo } from 'ts-broadcasting'
// or
import { BroadcastClient as Echo } from 'ts-broadcasting'

const echo = new Echo({
  broadcaster: 'bun',
  host: 'localhost',
  port: 6001,
  scheme: 'ws',
})
```

### Public Channels

```ts
echo.channel('news')
  .listen('ArticlePublished', (e) => {
    console.log(e.title)
  })
```

### Private Channels

```ts
echo.private('user.123')
  .listen('NotificationReceived', (e) => {
    console.log(e.notification)
  })
```

### Presence Channels

```ts
echo.join('chat.room.1')
  .here((users) => {
    this.users = users
  })
  .joining((user) => {
    this.users.push(user)
  })
  .leaving((user) => {
    this.users = this.users.filter(u => u.id !== user.id)
  })
  .listen('MessageSent', (e) => {
    this.messages.push(e.message)
  })
```

### Client Events (Whisper)

```ts
// Send
echo.private('chat.room.1').whisper('typing', { typing: true })

// Listen
echo.private('chat.room.1').listenForWhisper('typing', (e) => {
  console.log('User typing:', e)
})
```

### Leaving Channels

```ts
echo.leave('news')
echo.leave('user.123')
echo.leave('chat.room.1')
echo.leaveAll()
```

### Connection Management

```ts
// Check connection
echo.isConnected()

// Get socket ID
echo.socketId()

// Disconnect
echo.disconnect()

// Reconnect
echo.connect()

// Connection events
echo.connector.on('connect', () => console.log('Connected'))
echo.connector.on('disconnect', () => console.log('Disconnected'))
echo.connector.on('error', (e) => console.error(e))
```

## Server Integration

### With Laravel

Configure your Laravel app to broadcast to ts-broadcasting. Since ts-broadcasting speaks the Pusher protocol, use the Pusher driver:

```php
// config/broadcasting.php
'connections' => [
    'ts-broadcasting' => [
        'driver' => 'pusher',
        'key' => env('BROADCASTING_KEY'),
        'secret' => env('BROADCASTING_SECRET'),
        'app_id' => env('BROADCASTING_APP_ID'),
        'options' => [
            'host' => env('BROADCASTING_HOST', 'localhost'),
            'port' => env('BROADCASTING_PORT', 6001),
            'scheme' => 'http',
        ],
    ],
],
```

```env
BROADCAST_DRIVER=ts-broadcasting
BROADCASTING_KEY=your-app-key
BROADCASTING_SECRET=your-app-secret
BROADCASTING_APP_ID=your-app-id
BROADCASTING_HOST=localhost
BROADCASTING_PORT=6001
```

### Broadcasting from Laravel

```php
// app/Events/OrderShipped.php
class OrderShipped implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public $order;

    public function __construct(Order $order)
    {
        $this->order = $order;
    }

    public function broadcastOn()
    {
        return new PrivateChannel('order.'.$this->order->id);
    }

    public function broadcastAs()
    {
        return 'OrderShipped';
    }
}

// Dispatch event
event(new OrderShipped($order));
```

### Channel Authorization in Laravel

```php
// routes/channels.php
Broadcast::channel('order.{orderId}', function ($user, $orderId) {
    return $user->orders->contains($orderId);
});

Broadcast::channel('chat.{roomId}', function ($user, $roomId) {
    if ($user->canJoinRoom($roomId)) {
        return [
            'id' => $user->id,
            'name' => $user->name,
        ];
    }
});
```

## Client Authentication

### Auth Endpoint

Configure authentication for private/presence channels:

```ts
const echo = new Echo({
  broadcaster: 'bun',
  host: 'localhost',
  port: 6001,
  auth: {
    endpoint: '/broadcasting/auth',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  },
})
```

### Laravel Auth Endpoint

```php
// routes/api.php
Route::post('/broadcasting/auth', function (Request $request) {
    return Broadcast::auth($request);
})->middleware('auth:sanctum');
```

## Vue 3 Integration

### Built-in Composables

ts-broadcasting provides Vue 3 composables out of the box:

```ts
import { useBroadcast, useChannel, usePrivateChannel, usePresence } from 'ts-broadcasting/vue'

// Create client
const { client, isConnected, socketId } = useBroadcast({
  broadcaster: 'bun',
  host: 'localhost',
  port: 6001,
})

// Public channel
const { channel, isSubscribed, data } = useChannel(
  client,
  'announcements',
  {
    NewAnnouncement: (data) => console.log('Announcement:', data),
  },
)

// Private channel
const { whisper } = usePrivateChannel(
  client,
  'orders.123',
  {
    OrderShipped: (data) => console.log('Shipped:', data),
  },
)

// Presence channel
const { members, memberCount } = usePresence(
  client,
  'chat.room1',
  {
    NewMessage: (data) => console.log('Message:', data),
  },
)
```

All composables automatically clean up on component unmount and support reactive channel names via `Ref<string>`.

### Custom Vue Composable

```ts
import { Echo } from 'ts-broadcasting'
import { ref, onMounted, onUnmounted } from 'vue'

const echo = ref<Echo | null>(null)

export function useEcho() {
  onMounted(() => {
    echo.value = new Echo({
      broadcaster: 'bun',
      host: 'localhost',
      port: 6001,
    })
  })

  onUnmounted(() => {
    echo.value?.disconnect()
  })

  return { echo }
}
```

## React Integration

### React Hook

```tsx
import { useEffect, useState } from 'react'
import { Echo } from 'ts-broadcasting'

const echo = new Echo({
  broadcaster: 'bun',
  host: 'localhost',
  port: 6001,
})

export function useChannel<T>(
  channelName: string,
  eventName: string,
): T | null {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    const channel = echo.channel(channelName)
    channel.listen(eventName, (eventData: T) => {
      setData(eventData)
    })

    return () => {
      echo.leave(channelName)
    }
  }, [channelName, eventName])

  return data
}

// Usage
function NotificationsList() {
  const notification = useChannel<Notification>('notifications', 'NewNotification')

  useEffect(() => {
    if (notification) {
      showToast(notification.message)
    }
  }, [notification])

  return <div>...</div>
}
```

### Presence Hook

```tsx
import { useEffect, useState } from 'react'

export function usePresence<T>(channelName: string) {
  const [members, setMembers] = useState<T[]>([])

  useEffect(() => {
    const channel = echo.join(channelName)

    channel
      .here((users: T[]) => setMembers(users))
      .joining((user: T) => setMembers(prev => [...prev, user]))
      .leaving((user: T) => setMembers(prev => prev.filter(u => u !== user)))

    return () => {
      echo.leave(channelName)
    }
  }, [channelName])

  return { members }
}
```

## Svelte Integration

```svelte
<script>
  import { Echo } from 'ts-broadcasting'
  import { readable } from 'svelte/store'

  const echo = new Echo({
    broadcaster: 'bun',
    host: 'localhost',
    port: 6001,
  })

  function createChannelStore(channelName, eventName) {
    return readable(null, (set) => {
      const channel = echo.channel(channelName)
      channel.listen(eventName, set)

      return () => {
        echo.leave(channelName)
      }
    })
  }

  const notifications = createChannelStore('notifications', 'NewNotification')
</script>

{#if $notifications}
  <div>{$notifications.message}</div>
{/if}
```

## Migration from Pusher

### Before (Pusher + Laravel Echo)

```ts
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

window.Pusher = Pusher
window.Echo = new Echo({
  broadcaster: 'pusher',
  key: process.env.PUSHER_APP_KEY,
  cluster: process.env.PUSHER_APP_CLUSTER,
  encrypted: true,
})
```

### After (ts-broadcasting)

```ts
import { Echo } from 'ts-broadcasting'

window.Echo = new Echo({
  broadcaster: 'bun',
  host: process.env.BROADCAST_HOST || 'localhost',
  port: Number(process.env.BROADCAST_PORT) || 6001,
  scheme: 'ws',
})
```

Your existing channel subscription code works without changes:

```ts
// This code is identical for both Pusher and ts-broadcasting
window.Echo.channel('orders')
  .listen('OrderShipped', (e) => {
    console.log(e.order)
  })

window.Echo.private('user.123')
  .listen('NotificationReceived', (e) => {
    console.log(e.notification)
  })

window.Echo.join('chat.room.1')
  .here((users) => { /_ ... _/ })
  .joining((user) => { /_ ... _/ })
  .leaving((user) => { /_ ... _/ })
```

## Next Steps

- [Getting Started](/guide/getting-started) - Server setup
- [Channels](/guide/channels) - Channel types
- [Events](/guide/events) - Broadcasting events
