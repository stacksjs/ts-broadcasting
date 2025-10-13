/**
 * Message Deduplication
 *
 * Prevents duplicate messages from being broadcasted
 */

import type { RedisAdapter } from './redis-adapter'

export interface DeduplicationConfig {
  /**
   * Enable deduplication
   */
  enabled?: boolean

  /**
   * TTL for message IDs in seconds
   */
  ttl?: number

  /**
   * Maximum number of message IDs to store in memory (if not using Redis)
   */
  maxSize?: number

  /**
   * Hash function to use for generating message IDs
   */
  hashFunction?: (channel: string, event: string, data: unknown) => string
}

export class MessageDeduplicator {
  private config: Required<DeduplicationConfig>
  private redis?: RedisAdapter
  private seenMessages: Map<string, number> = new Map() // messageId -> timestamp
  private cleanupInterval: Timer | null = null

  constructor(config?: DeduplicationConfig, redis?: RedisAdapter) {
    this.config = {
      enabled: config?.enabled ?? true,
      ttl: config?.ttl ?? 60, // 1 minute default
      maxSize: config?.maxSize ?? 10000,
      hashFunction: config?.hashFunction || this.defaultHashFunction,
    }

    this.redis = redis

    if (this.config.enabled && !redis) {
      // Start cleanup interval for in-memory storage
      this.startCleanup()
    }
  }

  /**
   * Default hash function for message IDs
   */
  private defaultHashFunction(channel: string, event: string, data: unknown): string {
    // Create a simple hash from channel + event + data
    const str = `${channel}:${event}:${JSON.stringify(data)}`
    return this.simpleHash(str)
  }

  /**
   * Simple string hash function
   */
  private simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    return hash.toString(36)
  }

  /**
   * Check if a message has been seen recently
   */
  async isDuplicate(channel: string, event: string, data: unknown, messageId?: string): Promise<boolean> {
    if (!this.config.enabled) {
      return false
    }

    // Generate or use provided message ID
    const id = messageId || this.config.hashFunction(channel, event, data)

    if (this.redis) {
      return this.checkRedis(id)
    }

    return this.checkMemory(id)
  }

  /**
   * Check for duplicate using Redis
   */
  private async checkRedis(messageId: string): Promise<boolean> {
    if (!this.redis) {
      return false
    }

    const key = `dedup:${messageId}`

    try {
      const exists = await this.redis.client?.exists(key)

      if (exists) {
        return true // Duplicate
      }

      // Mark as seen
      await this.redis.client?.setex(key, this.config.ttl, '1')
      return false
    }
    catch (error) {
      console.error('Redis deduplication error:', error)
      // Fallback to memory
      return this.checkMemory(messageId)
    }
  }

  /**
   * Check for duplicate using in-memory storage
   */
  private checkMemory(messageId: string): boolean {
    const now = Date.now()
    const timestamp = this.seenMessages.get(messageId)

    if (timestamp) {
      // Check if still within TTL
      if (now - timestamp < this.config.ttl * 1000) {
        return true // Duplicate
      }

      // Expired, remove it
      this.seenMessages.delete(messageId)
    }

    // Mark as seen
    this.seenMessages.set(messageId, now)

    // Enforce max size (LRU-ish)
    if (this.seenMessages.size > this.config.maxSize) {
      // Remove oldest entries
      const entries = Array.from(this.seenMessages.entries())
      entries.sort((a, b) => a[1] - b[1])
      const toRemove = entries.slice(0, entries.length - this.config.maxSize)

      for (const [key] of toRemove) {
        this.seenMessages.delete(key)
      }
    }

    return false
  }

  /**
   * Start cleanup interval for in-memory storage
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60000) // Cleanup every minute
  }

  /**
   * Cleanup expired entries from in-memory storage
   */
  private cleanup(): void {
    const now = Date.now()
    const ttlMs = this.config.ttl * 1000

    for (const [messageId, timestamp] of this.seenMessages.entries()) {
      if (now - timestamp > ttlMs) {
        this.seenMessages.delete(messageId)
      }
    }
  }

  /**
   * Clear all cached message IDs
   */
  async clear(): Promise<void> {
    if (this.redis) {
      try {
        const keys = await this.redis.client?.keys('dedup:*')
        if (keys && keys.length > 0) {
          await this.redis.client?.del(...keys)
        }
      }
      catch (error) {
        console.error('Error clearing Redis deduplication cache:', error)
      }
    }

    this.seenMessages.clear()
  }

  /**
   * Get statistics
   */
  getStats(): {
    enabled: boolean
    cacheSize: number
    ttl: number
    usingRedis: boolean
  } {
    return {
      enabled: this.config.enabled,
      cacheSize: this.seenMessages.size,
      ttl: this.config.ttl,
      usingRedis: !!this.redis,
    }
  }

  /**
   * Stop cleanup and release resources
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }
}
