import type { BroadcastServer } from './server'
import type {
  BroadcastConfig,
  BroadcastEvent,
  BroadcastMessage,
  QueueConfig,
} from './types'

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
    // Check if queue manager is available
    const queueManager = (this.server as any).queueManager

    if (queueManager && queueManager.isEnabled()) {
      if (this.config.verbose) {
        console.warn(`Queueing broadcast to queue: ${queueName || this.queue?.queue || 'default'}`)
      }

      // Use the queue manager to queue the broadcast
      await queueManager.queueBroadcast(channels, message.event, message.data, {
        excludeSocketId: message.socketId,
      })
    }
    else {
      // Fallback to immediate broadcast if queue is not available
      if (this.config.verbose) {
        console.warn('Queue not available, broadcasting immediately')
      }
      this.sendBroadcast(message, channels)
    }
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
  public readonly excludeSocketId?: string

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
  public readonly excludeSocketId?: string

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
  toOthers(socketId: string): AnonymousEvent {
    // Create new instance with excludeSocketId set
    const newEvent = new AnonymousEvent(this.channels)
    newEvent.eventName = this.eventName
    newEvent.data = this.data
    Object.defineProperty(newEvent, 'excludeSocketId', {
      value: socketId,
      writable: false,
      enumerable: true,
    })
    return newEvent
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
