# Laravel Echo Compatibility

ts-broadcasting provides Laravel Echo compatible APIs for easy migration.

## Overview

The client SDK is designed to be a drop-in replacement for Laravel Echo:

```typescript
// Laravel Echo
import Echo from 'laravel-echo'
import Pusher from 'pusher-js'

window.Pusher = Pusher
window.Echo = new Echo({
  broadcaster: 'pusher',
  key: 'your-app-key',
  // ...
})

// ts-broadcasting (compatible API)
import { Echo } from 'ts-broadcasting'

window.Echo = new Echo({
  host: 'localhost',
  port: 6001,
  appKey: 'your-app-key',
})
```

## Echo Client API

### Creating Instance

```typescript
import { Echo } from 'ts-broadcasting'
// or
import { BroadcastClient as Echo } from 'ts-broadcasting'

const echo = new Echo({
  host: 'localhost',
  port: 6001,
  appKey: 'your-app-key',
  encrypted: false,
})
```

### Public Channels

```typescript
echo.channel('news')
  .listen('ArticlePublished', (e) => {
    console.log(e.article.title)
  })
```

### Private Channels

```typescript
echo.private('user.123')
  .listen('NotificationReceived', (e) => {
    console.log(e.notification)
  })
```

### Presence Channels

```typescript
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

### Leaving Channels

```typescript
echo.leave('news')
echo.leave('user.123')
echo.leave('chat.room.1')
```

## Server Integration

### With Laravel

Configure your Laravel app to use ts-broadcasting as the WebSocket server:

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

Configure authentication endpoint for private/presence channels:

```typescript
const echo = new Echo({
  host: 'localhost',
  port: 6001,
  appKey: 'your-app-key',
  authEndpoint: '/broadcasting/auth',
  auth: {
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

## Vue Integration

### Vue 3 Composable

```typescript
// composables/useEcho.ts
import { Echo } from 'ts-broadcasting'
import { ref, onMounted, onUnmounted } from 'vue'

const echo = ref<Echo | null>(null)

export function useEcho() {
  onMounted(() => {
    echo.value = new Echo({
      host: 'localhost',
      port: 6001,
      appKey: 'your-app-key',
    })
  })

  onUnmounted(() => {
    echo.value?.disconnect()
  })

  return { echo }
}

// In component
const { echo } = useEcho()

echo.value?.channel('notifications')
  .listen('NewNotification', handleNotification)
```

### Vue 2 Plugin

```typescript
// plugins/echo.js
import { Echo } from 'ts-broadcasting'

export default {
  install(Vue, options) {
    Vue.prototype.$echo = new Echo(options)
  },
}

// main.js
Vue.use(EchoPlugin, {
  host: 'localhost',
  port: 6001,
  appKey: 'your-app-key',
})

// In component
this.$echo.channel('notifications')
  .listen('NewNotification', this.handleNotification)
```

## React Integration

### React Hook

```typescript
// hooks/useChannel.ts
import { useEffect, useState } from 'react'
import { Echo } from 'ts-broadcasting'

const echo = new Echo({
  host: 'localhost',
  port: 6001,
  appKey: 'your-app-key',
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

// In component
function NotificationsList() {
  const notification = useChannel<Notification>(
    'notifications',
    'NewNotification',
  )

  useEffect(() => {
    if (notification) {
      showToast(notification.message)
    }
  }, [notification])

  return <div>...</div>
}
```

### Presence Channel Hook

```typescript
// hooks/usePresence.ts
import { useEffect, useState } from 'react'
import { Echo } from 'ts-broadcasting'

interface PresenceState<T> {
  members: T[]
  joined: T | null
  left: T | null
}

export function usePresence<T>(channelName: string): PresenceState<T> {
  const [members, setMembers] = useState<T[]>([])
  const [joined, setJoined] = useState<T | null>(null)
  const [left, setLeft] = useState<T | null>(null)

  useEffect(() => {
    const channel = echo.join(channelName)

    channel
      .here((users: T[]) => setMembers(users))
      .joining((user: T) => {
        setJoined(user)
        setMembers((prev) => [...prev, user])
      })
      .leaving((user: T) => {
        setLeft(user)
        setMembers((prev) => prev.filter((u) => u !== user))
      })

    return () => {
      echo.leave(channelName)
    }
  }, [channelName])

  return { members, joined, left }
}
```

## Svelte Integration

```typescript
// stores/echo.ts
import { Echo } from 'ts-broadcasting'
import { readable } from 'svelte/store'

const echo = new Echo({
  host: 'localhost',
  port: 6001,
  appKey: 'your-app-key',
})

export function createChannelStore(channelName, eventName) {
  return readable(null, (set) => {
    const channel = echo.channel(channelName)
    channel.listen(eventName, set)

    return () => {
      echo.leave(channelName)
    }
  })
}

// In component
<script>
  import { createChannelStore } from './stores/echo'

  const notifications = createChannelStore('notifications', 'NewNotification')
</script>

{#if $notifications}
  <div>{$notifications.message}</div>
{/if}
```

## Migration from Pusher

### Before (Pusher + Laravel Echo)

```typescript
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

```typescript
import { Echo } from 'ts-broadcasting'

window.Echo = new Echo({
  host: process.env.BROADCAST_HOST,
  port: process.env.BROADCAST_PORT,
  appKey: process.env.BROADCAST_KEY,
  encrypted: process.env.BROADCAST_ENCRYPTED === 'true',
})
```

The channel API remains identical, so your existing channel subscriptions work without changes.

## Next Steps

- [Getting Started](/guide/getting-started) - Server setup
- [Channels](/guide/channels) - Channel types
- [Events](/guide/events) - Broadcasting events
