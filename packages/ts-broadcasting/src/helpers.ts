/**
 * Broadcasting Helper Utilities
 *
 * Convenient helper functions for common broadcasting patterns
 */

import type { Broadcaster } from './broadcaster'
import type { BroadcastServer } from './server'

export class BroadcastHelpers {
  private server: BroadcastServer
  private broadcaster: Broadcaster

  constructor(server: BroadcastServer, broadcaster: Broadcaster) {
    this.server = server
    this.broadcaster = broadcaster
  }

  /**
   * Broadcast to a specific user's private channel
   */
  toUser<TData = unknown>(userId: string | number, event: string, data: TData): void {
    this.broadcaster.send(`private-user.${userId}`, event, data)
  }

  /**
   * Broadcast to multiple users
   */
  toUsers<TData = unknown>(userIds: Array<string | number>, event: string, data: TData): void {
    const channels = userIds.map(id => `private-user.${id}`)
    this.broadcaster.send(channels, event, data)
  }

  /**
   * Broadcast to all users except specific ones
   */
  exceptUsers<TData = unknown>(userIds: Array<string | number>, channel: string, event: string, data: TData): void {
    // Get all subscribers
    const allSubscribers = this.server.channels.getSubscribers(channel)

    // Filter out excluded users
    const excludeChannels = new Set(userIds.map(id => `private-user.${id}`))

    for (const socketId of allSubscribers) {
      // Check if this socket belongs to an excluded user
      const shouldExclude = Array.from(excludeChannels).some(ch =>
        this.server.channels.getChannel(ch).subscribers.has(socketId),
      )

      if (!shouldExclude) {
        this.broadcaster.send(channel, event, data)
        break // Just need to broadcast once to the channel
      }
    }
  }

  /**
   * Broadcast to all connected users
   */
  toAll<TData = unknown>(event: string, data: TData): void {
    this.broadcaster.send('broadcast', event, data)
  }

  /**
   * Broadcast to users in a specific role
   */
  toRole<TData = unknown>(role: string, event: string, data: TData): void {
    this.broadcaster.send(`role.${role}`, event, data)
  }

  /**
   * Broadcast notification to user
   */
  notify(userId: string | number, notification: {
    title: string
    body: string
    type?: 'info' | 'success' | 'warning' | 'error'
    data?: unknown
  }): void {
    this.toUser(userId, 'notification', notification)
  }

  /**
   * Broadcast notifications to multiple users
   */
  notifyUsers(userIds: Array<string | number>, notification: {
    title: string
    body: string
    type?: 'info' | 'success' | 'warning' | 'error'
    data?: unknown
  }): void {
    this.toUsers(userIds, 'notification', notification)
  }

  /**
   * Send a system message to all users
   */
  systemMessage(message: string, type: 'info' | 'warning' | 'error' = 'info'): void {
    this.toAll('system.message', { message, type, timestamp: Date.now() })
  }

  /**
   * Broadcast model update
   */
  modelUpdated<TData = unknown>(model: string, id: string | number, data: TData): void {
    this.broadcaster.send(`model.${model}.${id}`, 'updated', data)
  }

  /**
   * Broadcast model created
   */
  modelCreated<TData = unknown>(model: string, data: TData): void {
    this.broadcaster.send(`model.${model}`, 'created', data)
  }

  /**
   * Broadcast model deleted
   */
  modelDeleted(model: string, id: string | number): void {
    this.broadcaster.send(`model.${model}.${id}`, 'deleted', { id })
  }

  /**
   * Get connection count for a user
   */
  getUserConnectionCount(userId: string | number): number {
    return this.server.channels.getSubscriberCount(`private-user.${userId}`)
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string | number): boolean {
    return this.getUserConnectionCount(userId) > 0
  }

  /**
   * Get all online users in a presence channel
   */
  getOnlineUsers(channelName: string): any[] {
    const channel = channelName.startsWith('presence-') ? channelName : `presence-${channelName}`
    const members = this.server.channels.getPresenceMembers(channel)

    if (!members) {
      return []
    }

    return Array.from(members.values())
  }

  /**
   * Get user count in a presence channel
   */
  getPresenceCount(channelName: string): number {
    const channel = channelName.startsWith('presence-') ? channelName : `presence-${channelName}`
    return this.server.channels.getSubscriberCount(channel)
  }
}

/**
 * Create global helper instance
 */
export function createHelpers(server: BroadcastServer, broadcaster: Broadcaster): BroadcastHelpers {
  return new BroadcastHelpers(server, broadcaster)
}
