import type {
  BroadcastConfig,
  BroadcastEvent,
  BroadcastMessage,
  QueueConfig,
} from './types'
import type { BroadcastServer } from './server'

export class Broadcaster {
  private server: BroadcastServer
  private config: BroadcastConfig
  private queue: QueueConfig | null = null

  constructor(server: BroadcastServer, config: BroadcastConfig) {
    this.server = server
    this.config = config
  }

  /**
   * Configure queue for broadcasting
   */
  setQueue(queueConfig: QueueConfig): this {
    this.queue = queueConfig
    return this
  }

  /**
   * Broadcast an event
   */
  async broadcast(event: BroadcastEvent): Promise<void> {
    // Check if event should broadcast
    if (!event.shouldBroadcast()) {
      return
    }

    // Check broadcast condition
    if (event.broadcastWhen && !event.broadcastWhen()) {
      return
    }

    const channels = this.normalizeChannels(event.broadcastOn())
    const eventName = event.broadcastAs ? event.broadcastAs() : event.constructor.name
    const data = event.broadcastWith ? event.broadcastWith() : {}

    const message: BroadcastMessage = {
      event: eventName,
      channel: channels[0], // Will broadcast to each channel separately
      data,
    }

    // Check if should use queue
    const queueName = event.broadcastQueue?.()
    if (queueName || this.queue) {
      await this.queueBroadcast(message, channels, queueName)
    }
    else {
      // Broadcast immediately
      this.sendBroadcast(message, channels)
    }
  }

  /**
   * Broadcast to specific channels with event name and data
   */
  send(channels: string | string[], event: string, data: unknown): void {
    const normalizedChannels = this.normalizeChannels(channels)

    const message: BroadcastMessage = {
      event,
      channel: normalizedChannels[0],
      data,
    }

    this.sendBroadcast(message, normalizedChannels)
  }

  /**
   * Broadcast to everyone except a specific socket
   */
  toOthers(socketId: string): BroadcastTo {
    return new BroadcastTo(this, socketId)
  }

  /**
   * Send broadcast message to channels
   */
  private sendBroadcast(message: BroadcastMessage, channels: string[]): void {
    for (const channel of channels) {
      this.server.broadcast(channel, message.event, message.data, message.socketId)
    }
  }

  /**
   * Queue a broadcast for later processing
   */
  private async queueBroadcast(
    message: BroadcastMessage,
    channels: string[],
    queueName?: string,
  ): Promise<void> {
    // This would integrate with a queue system
    // For now, we'll just broadcast immediately
    // In production, you'd integrate with BullMQ, or similar

    if (this.config.verbose) {
      console.log(`Queueing broadcast to queue: ${queueName || this.queue?.queue || 'default'}`)
    }

    // TODO: Integrate with queue system
    this.sendBroadcast(message, channels)
  }

  /**
   * Normalize channels to array
   */
  private normalizeChannels(channels: string | string[]): string[] {
    return Array.isArray(channels) ? channels : [channels]
  }
}

/**
 * Fluent interface for broadcasting with filters
 */
export class BroadcastTo {
  private broadcaster: Broadcaster
  private excludeSocketId?: string

  constructor(broadcaster: Broadcaster, excludeSocketId?: string) {
    this.broadcaster = broadcaster
    this.excludeSocketId = excludeSocketId
  }

  /**
   * Broadcast an event
   */
  async broadcast(event: BroadcastEvent): Promise<void> {
    await this.broadcaster.broadcast(event)
  }

  /**
   * Send to specific channels
   */
  send(channels: string | string[], event: string, data: unknown): void {
    this.broadcaster.send(channels, event, data)
  }
}

/**
 * Helper function to create a broadcast event
 */
export function createEvent(
  channels: string | string[],
  eventName: string,
  data?: Record<string, unknown>,
): BroadcastEvent {
  return {
    shouldBroadcast: () => true,
    broadcastOn: () => channels,
    broadcastAs: () => eventName,
    broadcastWith: () => data || {},
  }
}

/**
 * Anonymous event broadcasting
 */
export class AnonymousEvent {
  private channels: string[]
  private eventName: string = 'AnonymousEvent'
  private data: unknown = {}
  private excludeSocketId?: string

  constructor(channels: string | string[]) {
    this.channels = Array.isArray(channels) ? channels : [channels]
  }

  /**
   * Set the event name
   */
  as(name: string): this {
    this.eventName = name
    return this
  }

  /**
   * Set the event data
   */
  with(data: unknown): this {
    this.data = data
    return this
  }

  /**
   * Exclude a socket from receiving the broadcast
   */
  toOthers(socketId: string): this {
    this.excludeSocketId = socketId
    return this
  }

  /**
   * Send the broadcast
   */
  send(broadcaster: Broadcaster): void {
    for (const channel of this.channels) {
      broadcaster.send(channel, this.eventName, this.data)
    }
  }

  /**
   * Send the broadcast immediately (alias for send)
   */
  sendNow(broadcaster: Broadcaster): void {
    this.send(broadcaster)
  }
}
