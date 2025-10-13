/**
 * Message Persistence
 *
 * Store and retrieve message history
 */

import type { RedisAdapter } from './redis-adapter'

export interface PersistenceConfig {
  enabled?: boolean
  ttl?: number // Time to live in seconds
  maxMessages?: number // Max messages per channel
  excludeEvents?: string[] // Events to exclude from persistence
}

export interface PersistedMessage {
  id: string
  event: string
  data: unknown
  timestamp: number
  socketId?: string
}

export class PersistenceManager {
  private config: Required<PersistenceConfig>
  private redis?: RedisAdapter
  private inMemoryStore: Map<string, PersistedMessage[]> = new Map()

  constructor(config: PersistenceConfig = {}, redis?: RedisAdapter) {
    this.config = {
      enabled: config.enabled ?? false,
      ttl: config.ttl ?? 3600, // 1 hour default
      maxMessages: config.maxMessages ?? 100,
      excludeEvents: config.excludeEvents || ['ping', 'pong'],
    }

    this.redis = redis
  }

  /**
   * Store a message
   */
  async store(channel: string, event: string, data: unknown, socketId?: string): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    // Skip excluded events
    if (this.config.excludeEvents.includes(event)) {
      return
    }

    const message: PersistedMessage = {
      id: crypto.randomUUID(),
      event,
      data,
      timestamp: Date.now(),
      socketId,
    }

    if (this.redis) {
      await this.storeInRedis(channel, message)
    }
    else {
      this.storeInMemory(channel, message)
    }
  }

  /**
   * Retrieve message history for a channel
   */
  async getHistory(channel: string, since?: number, limit?: number): Promise<PersistedMessage[]> {
    if (!this.config.enabled) {
      return []
    }

    if (this.redis) {
      return this.getHistoryFromRedis(channel, since, limit)
    }

    return this.getHistoryFromMemory(channel, since, limit)
  }

  /**
   * Clear history for a channel
   */
  async clear(channel: string): Promise<void> {
    if (this.redis) {
      const key = this.getRedisKey(channel)
      const client = this.redis as any
      if (client.publisher) {
        await client.publisher.del(key)
      }
    }
    else {
      this.inMemoryStore.delete(channel)
    }
  }

  /**
   * Store message in Redis
   */
  private async storeInRedis(channel: string, message: PersistedMessage): Promise<void> {
    if (!this.redis) {
      return
    }

    const key = this.getRedisKey(channel)
    const value = JSON.stringify(message)

    const client = this.redis as any
    if (!client.publisher) {
      return
    }

    // Add to sorted set with timestamp as score
    await client.publisher.zadd(key, message.timestamp, value)

    // Trim to max messages
    const removeCount = -this.config.maxMessages - 1
    await client.publisher.send('ZREMRANGEBYRANK', [key, '0', removeCount.toString()])

    // Set TTL
    await client.publisher.expire(key, this.config.ttl)
  }

  /**
   * Get history from Redis
   */
  private async getHistoryFromRedis(
    channel: string,
    since?: number,
    limit?: number,
  ): Promise<PersistedMessage[]> {
    if (!this.redis) {
      return []
    }

    const key = this.getRedisKey(channel)
    const minScore = since?.toString() || '-inf'
    const maxScore = '+inf'
    const count = limit || this.config.maxMessages

    const client = this.redis as any
    if (!client.publisher) {
      return []
    }

    const results = (await client.publisher.send('ZRANGEBYSCORE', [
      key,
      minScore,
      maxScore,
      'LIMIT',
      '0',
      count.toString(),
    ])) as string[]

    return results.map(msg => JSON.parse(msg))
  }

  /**
   * Store message in memory
   */
  private storeInMemory(channel: string, message: PersistedMessage): void {
    if (!this.inMemoryStore.has(channel)) {
      this.inMemoryStore.set(channel, [])
    }

    const messages = this.inMemoryStore.get(channel)!
    messages.push(message)

    // Trim to max messages
    if (messages.length > this.config.maxMessages) {
      messages.shift()
    }

    // Clean up old messages based on TTL
    const cutoff = Date.now() - this.config.ttl * 1000
    const filtered = messages.filter(m => m.timestamp > cutoff)
    this.inMemoryStore.set(channel, filtered)
  }

  /**
   * Get history from memory
   */
  private getHistoryFromMemory(
    channel: string,
    since?: number,
    limit?: number,
  ): PersistedMessage[] {
    const messages = this.inMemoryStore.get(channel) || []

    let filtered = messages
    if (since !== undefined) {
      filtered = messages.filter(m => m.timestamp >= since)
    }

    if (limit) {
      filtered = filtered.slice(0, limit)
    }

    return filtered
  }

  /**
   * Get Redis key for channel
   */
  private getRedisKey(channel: string): string {
    return `history:${channel}`
  }

  /**
   * Get statistics about stored messages
   */
  async getStats(): Promise<{ totalChannels: number, totalMessages: number, channels: Record<string, number> }> {
    if (this.redis) {
      const client = this.redis as any
      if (!client.publisher) {
        return {
          totalChannels: 0,
          totalMessages: 0,
          channels: {},
        }
      }

      // Get all history keys
      const keys = (await client.publisher.send('KEYS', ['history:*'])) as string[]
      let totalMessages = 0
      const channels: Record<string, number> = {}

      for (const key of keys) {
        const count = await client.publisher.send('ZCARD', [key])
        const channelName = key.replace('history:', '')
        const messageCount = Number(count)
        channels[channelName] = messageCount
        totalMessages += messageCount
      }

      return {
        totalChannels: keys.length,
        totalMessages,
        channels,
      }
    }

    let totalMessages = 0
    const channels: Record<string, number> = {}

    for (const [channel, messages] of this.inMemoryStore.entries()) {
      channels[channel] = messages.length
      totalMessages += messages.length
    }

    return {
      totalChannels: this.inMemoryStore.size,
      totalMessages,
      channels,
    }
  }
}
