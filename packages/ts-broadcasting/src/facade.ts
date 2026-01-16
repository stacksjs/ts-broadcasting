/**
 * Broadcast Facade
 *
 * Laravel-style facade for broadcasting. Provides a clean, static API
 * for common broadcasting operations.
 */

import type { BroadcastTo, Broadcaster } from './broadcaster'
import type { ChannelManager } from './channels'
import type { BroadcastServer } from './server'
import type { BroadcastEvent, ChannelAuthorizationCallback } from './types'

// Global server instance
let serverInstance: BroadcastServer | null = null

/**
 * Channel authorization callback type
 * Re-exported from types for convenience
 */
export type ChannelAuthCallback = ChannelAuthorizationCallback

/**
 * Broadcast Facade - Laravel-style static API
 *
 * @example
 * // Set up the server instance first
 * Broadcast.setServer(server)
 *
 * // Define channel authorization
 * Broadcast.channel('private-orders.{orderId}', (socket, { orderId }) => {
 *   return socket.data.user?.id === getOrderOwnerId(orderId)
 * })
 *
 * // Broadcast events
 * Broadcast.send('orders', 'OrderCreated', { id: 1 })
 *
 * // Or use event classes
 * Broadcast.event(new OrderShipped(order))
 */
export class Broadcast {
  /**
   * Set the global server instance
   */
  static setServer(server: BroadcastServer): void {
    serverInstance = server
  }

  /**
   * Get the global server instance
   */
  static getServer(): BroadcastServer | null {
    return serverInstance
  }

  /**
   * Get the broadcaster instance
   */
  static get broadcaster(): Broadcaster {
    if (!serverInstance) {
      throw new Error('Broadcast server not initialized. Call Broadcast.setServer() first.')
    }
    return serverInstance.broadcaster
  }

  /**
   * Get the channel manager
   */
  static get channels(): ChannelManager {
    if (!serverInstance) {
      throw new Error('Broadcast server not initialized. Call Broadcast.setServer() first.')
    }
    return serverInstance.channels
  }

  /**
   * Define channel authorization
   *
   * @example
   * Broadcast.channel('private-orders.{orderId}', (socket, { orderId }) => {
   *   return socket.data.user?.id === getOrderOwnerId(orderId)
   * })
   *
   * Broadcast.channel('presence-chat.{roomId}', (socket, { roomId }) => {
   *   return {
   *     id: socket.data.user.id,
   *     info: { name: socket.data.user.name }
   *   }
   * })
   */
  static channel(pattern: string, callback: ChannelAuthCallback): typeof Broadcast {
    if (!serverInstance) {
      throw new Error('Broadcast server not initialized. Call Broadcast.setServer() first.')
    }
    serverInstance.channels.channel(pattern, callback)
    return Broadcast
  }

  /**
   * Broadcast an event class
   *
   * @example
   * await Broadcast.event(new OrderShipped(order))
   */
  static async event(event: BroadcastEvent): Promise<void> {
    return Broadcast.broadcaster.broadcast(event)
  }

  /**
   * Send a broadcast directly to channel(s)
   *
   * @example
   * Broadcast.send('orders', 'OrderCreated', { id: 1, total: 99.99 })
   * Broadcast.send(['orders', 'admin-orders'], 'OrderCreated', data)
   */
  static send<TData = unknown>(channels: string | string[], event: string, data: TData): void {
    Broadcast.broadcaster.send(channels, event, data)
  }

  /**
   * Broadcast to a private channel
   *
   * @example
   * Broadcast.private('orders.123', 'OrderUpdated', { status: 'shipped' })
   */
  static private<TData = unknown>(channel: string, event: string, data: TData): void {
    const channelName = channel.startsWith('private-') ? channel : `private-${channel}`
    Broadcast.send(channelName, event, data)
  }

  /**
   * Broadcast to a presence channel
   *
   * @example
   * Broadcast.presence('chat.room1', 'NewMessage', { text: 'Hello' })
   */
  static presence<TData = unknown>(channel: string, event: string, data: TData): void {
    const channelName = channel.startsWith('presence-') ? channel : `presence-${channel}`
    Broadcast.send(channelName, event, data)
  }

  /**
   * Broadcast to a specific user
   *
   * @example
   * Broadcast.toUser(123, 'NotificationReceived', { message: 'Hello!' })
   */
  static toUser<TData = unknown>(userId: string | number, event: string, data: TData): void {
    Broadcast.private(`user.${userId}`, event, data)
  }

  /**
   * Broadcast to multiple users
   *
   * @example
   * Broadcast.toUsers([1, 2, 3], 'Announcement', { message: 'Hello everyone!' })
   */
  static toUsers<TData = unknown>(userIds: Array<string | number>, event: string, data: TData): void {
    const channels = userIds.map(id => `private-user.${id}`)
    Broadcast.send(channels, event, data)
  }

  /**
   * Broadcast to others (exclude sender)
   *
   * @example
   * Broadcast.toOthers(socketId).send('chat', 'UserTyping', { user: 'John' })
   */
  static toOthers(socketId: string): BroadcastTo {
    return Broadcast.broadcaster.toOthers(socketId)
  }

  /**
   * Get connection count
   */
  static getConnectionCount(): number {
    if (!serverInstance) return 0
    return serverInstance.getConnectionCount()
  }

  /**
   * Get subscriber count for a channel
   */
  static getSubscriberCount(channel: string): number {
    if (!serverInstance) return 0
    return serverInstance.getSubscriberCount(channel)
  }
}

/**
 * Global broadcast helper function
 *
 * @example
 * // Broadcast an event class
 * await broadcast(new OrderShipped(order))
 *
 * // Broadcast directly with channel, event, data
 * broadcast('orders', 'OrderCreated', { id: 1 })
 *
 * // Broadcast to private channel
 * broadcast('private-orders.123', 'OrderUpdated', { status: 'shipped' })
 */
export function broadcast(event: BroadcastEvent): Promise<void>
export function broadcast<TData = unknown>(channel: string, event: string, data?: TData): void
export function broadcast<TData = unknown>(
  eventOrChannel: BroadcastEvent | string,
  event?: string,
  data?: TData,
): Promise<void> | void {
  // If first arg is a BroadcastEvent
  if (typeof eventOrChannel === 'object' && 'broadcastOn' in eventOrChannel) {
    return Broadcast.event(eventOrChannel)
  }

  // Otherwise it's channel, event, data
  if (typeof eventOrChannel === 'string' && event) {
    Broadcast.send(eventOrChannel, event, data)
  }
}

/**
 * Broadcast to a specific user
 *
 * @example
 * broadcastToUser(123, 'NotificationReceived', { message: 'Hello!' })
 */
export function broadcastToUser<TData = unknown>(userId: string | number, event: string, data: TData): void {
  Broadcast.toUser(userId, event, data)
}

/**
 * Broadcast to multiple users
 *
 * @example
 * broadcastToUsers([1, 2, 3], 'Announcement', { message: 'Hello everyone!' })
 */
export function broadcastToUsers<TData = unknown>(userIds: Array<string | number>, event: string, data: TData): void {
  Broadcast.toUsers(userIds, event, data)
}

/**
 * Define channel authorization (can be used outside of class context)
 *
 * @example
 * // In routes/channels.ts
 * channel('private-orders.{orderId}', (socket, { orderId }) => {
 *   return socket.data.user?.id === getOrderOwnerId(orderId)
 * })
 */
export function channel(pattern: string, callback: ChannelAuthCallback): void {
  Broadcast.channel(pattern, callback)
}
