/**
 * Redis Adapter for Horizontal Scaling
 *
 * Enables multiple broadcasting servers to communicate via Redis Pub/Sub
 * Uses Bun's native Redis client for optimal performance
 */

import { RedisClient } from 'bun'
import process from 'node:process'

export interface RedisConfig {
  host?: string
  port?: number
  password?: string
  database?: number
  url?: string
  keyPrefix?: string
}

export interface RedisMessage {
  type: 'broadcast' | 'subscribe' | 'unsubscribe' | 'presence'
  channel: string
  event: string
  data: unknown
  socketId?: string
  serverId?: string
}

export class RedisAdapter {
  private publisher: RedisClient
  private subscriber: RedisClient
  private config: Required<RedisConfig>
  private serverId: string
  private messageHandlers: Set<(message: RedisMessage) => void> = new Set()

  constructor(config: RedisConfig) {
    this.serverId = crypto.randomUUID()

    this.config = {
      host: config.host || process.env.REDIS_HOST || 'localhost',
      port: config.port || Number.parseInt(process.env.REDIS_PORT || '6379'),
      password: config.password || process.env.REDIS_PASSWORD || '',
      database: config.database || Number.parseInt(process.env.REDIS_DB || '0'),
      url: config.url || process.env.REDIS_URL || '',
      keyPrefix: config.keyPrefix || 'broadcasting:',
    }

    // Create connection URL
    const url = this.config.url || this.buildRedisUrl()

    // Create publisher and subscriber clients
    this.publisher = new RedisClient(url || 'redis://localhost:6379')
    this.subscriber = new RedisClient(url || 'redis://localhost:6379')
  }

  /**
   * Build Redis URL from config
   */
  private buildRedisUrl(): string {
    const auth = this.config.password ? `:${this.config.password}@` : ''
    return `redis://${auth}${this.config.host}:${this.config.port}/${this.config.database}`
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<void> {
    await Promise.all([
      this.publisher.connect(),
      this.subscriber.connect(),
    ])

    // Subscribe to broadcasting channel
    await this.subscriber.subscribe(`${this.config.keyPrefix}channel`, (message) => {
      this.handleRedisMessage(message)
    })
  }

  /**
   * Disconnect from Redis
   */
  close(): void {
    this.publisher.close()
    this.subscriber.close()
  }

  /**
   * Broadcast a message to all servers
   */
  async broadcast(channel: string, event: string, data: unknown, excludeSocketId?: string): Promise<void> {
    const message: RedisMessage = {
      type: 'broadcast',
      channel,
      event,
      data,
      socketId: excludeSocketId,
      serverId: this.serverId,
    }

    await this.publisher.publish(
      `${this.config.keyPrefix}channel`,
      JSON.stringify(message),
    )
  }

  /**
   * Register a message handler
   */
  onMessage(handler: (message: RedisMessage) => void): void {
    this.messageHandlers.add(handler)
  }

  /**
   * Remove a message handler
   */
  offMessage(handler: (message: RedisMessage) => void): void {
    this.messageHandlers.delete(handler)
  }

  /**
   * Handle incoming Redis message
   */
  private handleRedisMessage(messageData: string): void {
    try {
      const message = JSON.parse(messageData) as RedisMessage

      // Ignore messages from this server
      if (message.serverId === this.serverId) {
        return
      }

      // Call all registered handlers
      for (const handler of this.messageHandlers) {
        handler(message)
      }
    }
    catch (error) {
      console.error('Error handling Redis message:', error)
    }
  }

  /**
   * Store channel information in Redis
   */
  async storeChannel(channel: string, socketId: string): Promise<void> {
    const key = `${this.config.keyPrefix}channels:${channel}`
    await this.publisher.sadd(key, socketId)
    await this.publisher.expire(key, 3600) // 1 hour TTL
  }

  /**
   * Remove channel information from Redis
   */
  async removeChannel(channel: string, socketId: string): Promise<void> {
    const key = `${this.config.keyPrefix}channels:${channel}`
    await this.publisher.srem(key, socketId)
  }

  /**
   * Get all subscribers for a channel across all servers
   */
  async getChannelSubscribers(channel: string): Promise<string[]> {
    const key = `${this.config.keyPrefix}channels:${channel}`
    const members = await this.publisher.smembers(key)
    return members
  }

  /**
   * Store presence member information
   */
  async storePresenceMember(channel: string, socketId: string, member: unknown): Promise<void> {
    const key = `${this.config.keyPrefix}presence:${channel}`
    await this.publisher.hmset(key, [socketId, JSON.stringify(member)])
    await this.publisher.expire(key, 3600) // 1 hour TTL
  }

  /**
   * Remove presence member
   */
  async removePresenceMember(channel: string, socketId: string): Promise<void> {
    const key = `${this.config.keyPrefix}presence:${channel}`
    // Use raw command for HDEL since it's not in the type definitions
    await this.publisher.send('HDEL', [key, socketId])
  }

  /**
   * Get all presence members for a channel
   */
  async getPresenceMembers(channel: string): Promise<Map<string, any>> {
    const key = `${this.config.keyPrefix}presence:${channel}`
    const data = await this.publisher.send('HGETALL', [key]) as string[]

    const members = new Map<string, any>()

    // HGETALL returns array of [key, value, key, value, ...]
    for (let i = 0; i < data.length; i += 2) {
      const socketId = data[i]
      const memberData = data[i + 1]

      try {
        members.set(socketId, JSON.parse(memberData))
      }
      catch {
        console.error(`Error parsing presence member data for ${socketId}`)
      }
    }

    return members
  }

  /**
   * Increment statistics counter
   */
  async incrementStat(stat: string): Promise<void> {
    const key = `${this.config.keyPrefix}stats:${stat}`
    await this.publisher.incr(key)
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<Record<string, number>> {
    const keys = await this.publisher.send('KEYS', [`${this.config.keyPrefix}stats:*`]) as string[]
    const stats: Record<string, number> = {}

    for (const key of keys) {
      const value = await this.publisher.get(key)
      const statName = key.replace(`${this.config.keyPrefix}stats:`, '')
      stats[statName] = Number.parseInt(value || '0')
    }

    return stats
  }

  /**
   * Store connection information
   */
  async storeConnection(socketId: string, data: unknown): Promise<void> {
    const key = `${this.config.keyPrefix}connections:${socketId}`
    await this.publisher.set(key, JSON.stringify(data))
    await this.publisher.expire(key, 7200) // 2 hours TTL
  }

  /**
   * Remove connection information
   */
  async removeConnection(socketId: string): Promise<void> {
    const key = `${this.config.keyPrefix}connections:${socketId}`
    await this.publisher.del(key)
  }

  /**
   * Get connection information
   */
  async getConnection(socketId: string): Promise<any | null> {
    const key = `${this.config.keyPrefix}connections:${socketId}`
    const data = await this.publisher.get(key)

    if (!data) {
      return null
    }

    try {
      return JSON.parse(data)
    }
    catch {
      console.error(`Error parsing connection data for ${socketId}`)
      return null
    }
  }

  /**
   * Get total connection count across all servers
   */
  async getTotalConnections(): Promise<number> {
    const keys = await this.publisher.send('KEYS', [`${this.config.keyPrefix}connections:*`]) as string[]
    return keys.length
  }

  /**
   * Get total channel count
   */
  async getTotalChannels(): Promise<number> {
    const keys = await this.publisher.send('KEYS', [`${this.config.keyPrefix}channels:*`]) as string[]
    return keys.length
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.publisher.send('PING', [])
      return true
    }
    catch {
      return false
    }
  }

  /**
   * Get server ID
   */
  getServerId(): string {
    return this.serverId
  }
}
