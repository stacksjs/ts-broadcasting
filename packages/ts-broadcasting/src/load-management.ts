/**
 * Load Management
 *
 * Backpressure handling and load shedding
 */

import process from 'node:process'

export interface LoadConfig {
  maxConnections?: number
  maxChannelsPerConnection?: number
  maxGlobalChannels?: number
  shedLoadAt?: number // Percentage (0-100)
  backpressureThreshold?: number // bytes
}

export interface LoadStats {
  connections: number
  channels: number
  averageChannelsPerConnection: number
  memoryUsage: number
  isOverloaded: boolean
}

export class LoadManager {
  private config: Required<LoadConfig>
  private connectionCount = 0
  private channelCount = 0
  private channelsPerConnection: Map<string, number> = new Map()

  constructor(config: LoadConfig = {}) {
    this.config = {
      maxConnections: config.maxConnections ?? 10000,
      maxChannelsPerConnection: config.maxChannelsPerConnection ?? 100,
      maxGlobalChannels: config.maxGlobalChannels ?? 50000,
      shedLoadAt: config.shedLoadAt ?? 90, // Start shedding at 90%
      backpressureThreshold: config.backpressureThreshold ?? 1024 * 1024, // 1MB
    }
  }

  /**
   * Check if can accept new connection
   */
  canAcceptConnection(): boolean {
    return this.connectionCount < this.config.maxConnections
  }

  /**
   * Check if should shed load
   */
  shouldShedLoad(): boolean {
    const connectionUsage = (this.connectionCount / this.config.maxConnections) * 100
    const channelUsage = (this.channelCount / this.config.maxGlobalChannels) * 100

    return connectionUsage >= this.config.shedLoadAt || channelUsage >= this.config.shedLoadAt
  }

  /**
   * Register new connection
   */
  registerConnection(socketId: string): void {
    this.connectionCount++
    this.channelsPerConnection.set(socketId, 0)
  }

  /**
   * Unregister connection
   */
  unregisterConnection(socketId: string): void {
    this.connectionCount = Math.max(0, this.connectionCount - 1)

    const channels = this.channelsPerConnection.get(socketId) || 0
    this.channelCount = Math.max(0, this.channelCount - channels)

    this.channelsPerConnection.delete(socketId)
  }

  /**
   * Check if connection can subscribe to channel
   */
  canSubscribe(socketId: string): boolean {
    const current = this.channelsPerConnection.get(socketId) || 0

    if (current >= this.config.maxChannelsPerConnection) {
      return false
    }

    if (this.channelCount >= this.config.maxGlobalChannels) {
      return false
    }

    return true
  }

  /**
   * Register channel subscription
   */
  registerSubscription(socketId: string): void {
    const current = this.channelsPerConnection.get(socketId) || 0
    this.channelsPerConnection.set(socketId, current + 1)
    this.channelCount++
  }

  /**
   * Unregister channel subscription
   */
  unregisterSubscription(socketId: string): void {
    const current = this.channelsPerConnection.get(socketId) || 0
    if (current > 0) {
      this.channelsPerConnection.set(socketId, current - 1)
      this.channelCount = Math.max(0, this.channelCount - 1)
    }
  }

  /**
   * Check if should apply backpressure
   */
  shouldApplyBackpressure(bufferedAmount: number): boolean {
    return bufferedAmount > this.config.backpressureThreshold
  }

  /**
   * Get load statistics
   */
  getStats(): LoadStats {
    const totalChannels = Array.from(this.channelsPerConnection.values()).reduce(
      (sum, count) => sum + count,
      0,
    )

    const averageChannelsPerConnection
      = this.connectionCount > 0 ? totalChannels / this.connectionCount : 0

    return {
      connections: this.connectionCount,
      channels: this.channelCount,
      averageChannelsPerConnection,
      memoryUsage: process.memoryUsage().heapUsed,
      isOverloaded: this.shouldShedLoad(),
    }
  }

  /**
   * Get connection usage percentage
   */
  getConnectionUsage(): number {
    return (this.connectionCount / this.config.maxConnections) * 100
  }

  /**
   * Get channel usage percentage
   */
  getChannelUsage(): number {
    return (this.channelCount / this.config.maxGlobalChannels) * 100
  }
}
