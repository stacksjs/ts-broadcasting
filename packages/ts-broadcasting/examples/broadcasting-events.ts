import { AnonymousEvent, Broadcaster, BroadcastServer, config, createEvent } from '../src'
import type { BroadcastEvent } from '../src'

// Example 1: Using BroadcastEvent interface
class OrderShipmentStatusUpdated implements BroadcastEvent {
  constructor(private order: { id: number, status: string }) {}

  shouldBroadcast(): boolean {
    return true
  }

  broadcastOn(): string | string[] {
    return `private-orders.${this.order.id}`
  }

  broadcastAs(): string {
    return 'OrderShipmentStatusUpdated'
  }

  broadcastWith(): Record<string, unknown> {
    return {
      order: this.order,
    }
  }

  broadcastWhen(): boolean {
    // Only broadcast if order value is significant
    return true
  }
}

// Example 2: Using createEvent helper
function createOrderEvent(orderId: number, status: string) {
  return createEvent(
    `private-orders.${orderId}`,
    'OrderStatusChanged',
    { orderId, status, timestamp: Date.now() },
  )
}

// Example 3: Using anonymous events
function broadcastAnonymousEvent(broadcaster: Broadcaster) {
  new AnonymousEvent('public-notifications')
    .as('SystemMessage')
    .with({ message: 'Server maintenance in 5 minutes', type: 'warning' })
    .send(broadcaster)
}

// Example usage
async function main() {
  const server = new BroadcastServer(config)
  await server.start()

  const broadcaster = new Broadcaster(server, config)

  // Broadcast using class-based event
  const order = { id: 123, status: 'shipped' }
  await broadcaster.broadcast(new OrderShipmentStatusUpdated(order))

  // Broadcast using helper
  const event = createOrderEvent(456, 'delivered')
  await broadcaster.broadcast(event)

  // Broadcast anonymous event
  broadcastAnonymousEvent(broadcaster)

  // Direct broadcast
  broadcaster.send('public-announcements', 'NewAnnouncement', {
    title: 'Welcome!',
    body: 'Check out our new features',
  })

  // Broadcast to all except sender
  broadcaster.toOthers('socket-id-123').send(
    'presence-chat.room1',
    'UserTyping',
    { user: 'John' },
  )
}

main().catch(console.error)
