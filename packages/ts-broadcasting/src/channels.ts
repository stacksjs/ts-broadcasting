import type { ServerWebSocket } from 'bun'
import type {
  Channel,
  ChannelAuthorizationCallback,
  ChannelAuthorizationClass,
  ChannelType,
  PresenceChannel,
  PresenceMember,
  WebSocketData,
} from './types'

export class ChannelManager {
  private channels: Map<string, Channel> = new Map()
  private authorizers: Map<string, ChannelAuthorizationCallback | ChannelAuthorizationClass> = new Map()

  /**
   * Register a channel authorization callback
   */
  channel(
    channelPattern: string,
    callback: ChannelAuthorizationCallback | ChannelAuthorizationClass,
  ): this {
    this.authorizers.set(channelPattern, callback)
    return this
  }

  /**
   * Get or create a channel
   */
  getChannel(channelName: string): Channel {
    if (!this.channels.has(channelName)) {
      const type = this.getChannelType(channelName)
      const channel: Channel = {
        name: channelName,
        type,
        subscribers: new Set(),
      }

      if (type === 'presence') {
        (channel as PresenceChannel).members = new Map()
      }

      this.channels.set(channelName, channel)
    }

    return this.channels.get(channelName)!
  }

  /**
   * Determine channel type from name
   */
  getChannelType(channelName: string): ChannelType {
    if (channelName.startsWith('presence-')) {
      return 'presence'
    }
    if (channelName.startsWith('private-')) {
      return 'private'
    }
    return 'public'
  }

  /**
   * Subscribe a socket to a channel
   */
  async subscribe(
    ws: ServerWebSocket<WebSocketData>,
    channelName: string,
    channelData?: unknown,
  ): Promise<boolean | PresenceMember> {
    const channel = this.getChannel(channelName)

    // Check authorization for private/presence channels
    if (channel.type !== 'public') {
      const authorized = await this.authorize(ws, channelName, channelData)
      if (!authorized) {
        return false
      }

      // For presence channels, store member info
      if (channel.type === 'presence' && typeof authorized === 'object') {
        const presenceChannel = channel as PresenceChannel
        presenceChannel.members.set(ws.data.socketId, authorized)
      }
    }

    // Subscribe to channel
    channel.subscribers.add(ws.data.socketId)
    ws.data.channels.add(channelName)
    ws.subscribe(channelName)

    return true
  }

  /**
   * Unsubscribe a socket from a channel
   */
  unsubscribe(ws: ServerWebSocket<WebSocketData>, channelName: string): void {
    const channel = this.channels.get(channelName)
    if (!channel) {
      return
    }

    channel.subscribers.delete(ws.data.socketId)
    ws.data.channels.delete(channelName)
    ws.unsubscribe(channelName)

    // Remove from presence channel members
    if (channel.type === 'presence') {
      const presenceChannel = channel as PresenceChannel
      presenceChannel.members.delete(ws.data.socketId)
    }

    // Clean up empty channels
    if (channel.subscribers.size === 0) {
      this.channels.delete(channelName)
    }
  }

  /**
   * Unsubscribe a socket from all channels
   */
  unsubscribeAll(ws: ServerWebSocket<WebSocketData>): void {
    const channels = Array.from(ws.data.channels)
    for (const channelName of channels) {
      this.unsubscribe(ws, channelName)
    }
  }

  /**
   * Authorize a socket for a channel
   */
  async authorize(
    ws: ServerWebSocket<WebSocketData>,
    channelName: string,
    channelData?: unknown,
  ): Promise<boolean | PresenceMember> {
    // Find matching authorizer
    for (const [pattern, authorizer] of this.authorizers) {
      const regex = this.patternToRegex(pattern)
      if (regex.test(channelName)) {
        // Execute authorizer
        if (typeof authorizer === 'function') {
          return await authorizer(ws, channelData)
        }
        else {
          return await authorizer.join(ws, channelData)
        }
      }
    }

    // No authorizer found - deny access
    return false
  }

  /**
   * Convert channel pattern to regex
   * Supports wildcards like "orders.{orderId}"
   */
  private patternToRegex(pattern: string): RegExp {
    const escaped = pattern
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\{[^}]+\\\}/g, '[^.]+')

    return new RegExp(`^${escaped}$`)
  }

  /**
   * Get all subscribers for a channel
   */
  getSubscribers(channelName: string): Set<string> {
    return this.channels.get(channelName)?.subscribers || new Set()
  }

  /**
   * Get presence members for a channel
   */
  getPresenceMembers(channelName: string): Map<string, PresenceMember> | null {
    const channel = this.channels.get(channelName)
    if (channel?.type === 'presence') {
      return (channel as PresenceChannel).members
    }
    return null
  }

  /**
   * Get subscriber count for a channel
   */
  getSubscriberCount(channelName: string): number {
    return this.channels.get(channelName)?.subscribers.size || 0
  }

  /**
   * Check if a channel exists
   */
  hasChannel(channelName: string): boolean {
    return this.channels.has(channelName)
  }

  /**
   * Get all channel names
   */
  getChannelNames(): string[] {
    return Array.from(this.channels.keys())
  }

  /**
   * Get total channel count
   */
  getChannelCount(): number {
    return this.channels.size
  }
}
