<p align="center"><img src="https://github.com/stacksjs/ts-broadcasting/blob/main/.github/art/cover.jpg?raw=true" alt="Social Card of this repo"></p>

# Introduction

ts-broadcasting is a high-performance, real-time WebSocket broadcasting system for TypeScript, built on Bun. It brings Laravel-style broadcasting to the TypeScript ecosystem with a clean, type-safe API.

## Why ts-broadcasting

Real-time communication is a core requirement for modern applications: live chat, notifications, collaborative editing, dashboards, and more. While solutions like Pusher and Ably exist, they come with per-message pricing and vendor lock-in. Self-hosted alternatives like Laravel Echo Server are Node.js-based and lack TypeScript-first design.

ts-broadcasting solves this by providing:

- **A self-hosted WebSocket server** built on Bun's native WebSocket implementation for maximum performance
- **A familiar API** inspired by Laravel Broadcasting and Echo, making migration straightforward
- **Full TypeScript support** with generics and type safety throughout
- **Production-ready features** including Redis scaling, encryption, rate limiting, metrics, and more

## Core Concepts

### Channels

Channels are the fundamental unit of broadcasting. Events are broadcast to channels, and clients subscribe to channels to receive events.

| Type | Prefix | Description |
|------|--------|-------------|
| **Public** | _(none)_ | Open to all subscribers, no authentication required |
| **Private** | `private-` | Require authorization before subscribing |
| **Presence** | `presence-` | Like private channels, but also track online members |

### Events

Events are the messages broadcast to channels. They have a name and data payload:

```ts
server.broadcaster.send('orders', 'OrderShipped', {
  orderId: 123,
  trackingNumber: 'ABC123',
})
```

### Authorization

Private and presence channels require authorization. You define authorization callbacks that determine whether a user can subscribe:

```ts
server.channels.channel('private-orders.{orderId}', (ws, params) => {
  return ws.data.user?.id === getOrderOwnerId(params?.orderId)
})
```

### Client SDK

The client SDK connects to the server and provides a clean API for subscribing to channels and listening for events:

```ts
const client = new BroadcastClient({
  broadcaster: 'bun',
  host: 'localhost',
  port: 6001,
})

client.channel('orders').listen('OrderShipped', (data) => {
  console.log('Shipped:', data)
})
```

## Architecture

```
┌─────────────┐     WebSocket      ┌──────────────────┐
│   Browser    │◄──────────────────►│  BroadcastServer  │
│   Client     │                    │   (Bun WebSocket) │
└─────────────┘                    ├──────────────────┤
                                   │  ChannelManager   │
┌─────────────┐     WebSocket      │  Broadcaster      │
│   Vue App   │◄──────────────────►│  Middleware        │
│   (composable)                   │  (Auth, Rate Limit)│
└─────────────┘                    ├──────────────────┤
                                   │  Optional:        │
┌─────────────┐     HTTP API       │  - Redis Adapter  │
│  Your Server│────────────────────►│  - Encryption     │
│  (Laravel,  │  broadcast events  │  - Persistence    │
│   etc.)     │                    │  - Webhooks       │
└─────────────┘                    │  - Queue Manager  │
                                   │  - Metrics        │
                                   └──────────────────┘
```

## Supported Drivers

ts-broadcasting supports multiple connection drivers:

| Driver | Description |
|--------|-------------|
| `bun` | Native Bun WebSocket server (default, highest performance) |
| `reverb` | Laravel Reverb compatible connection |
| `pusher` | Pusher protocol compatible connection |
| `ably` | Ably compatible connection |
| `log` | Logs broadcasts to console (development/debugging) |
| `null` | Discards broadcasts (testing) |

## Next Steps

- [Install](/install) - Get started with installation
- [Getting Started](/guide/getting-started) - Set up your server and client
- [Channels](/guide/channels) - Learn about channel types and authorization
- [Events](/guide/events) - Broadcasting and listening to events
- [Configuration](/config) - Full configuration reference

## Community

For help, discussion about best practices, or any other conversation that would benefit from being searchable:

[Discussions on GitHub](https://github.com/stacksjs/stacks/discussions)

For casual chit-chat with others using this package:

[Join the Stacks Discord Server](https://discord.gg/stacksjs)

## Sponsors

We would like to extend our thanks to the following sponsors for funding Stacks development. If you are interested in becoming a sponsor, please reach out to us.

- [JetBrains](https://www.jetbrains.com/)
- [The Solana Foundation](https://solana.com/)

## Credits

- [Chris Breuer](https://github.com/chrisbbreuer)
- [All Contributors](https://github.com/stacksjs/ts-broadcasting/graphs/contributors)

## License

The MIT License (MIT). Please see [LICENSE](https://github.com/stacksjs/ts-broadcasting/tree/main/LICENSE.md) for more information.

Made with 💙
