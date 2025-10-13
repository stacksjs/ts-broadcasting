/**
 * Batch Operations
 *
 * Batch subscribe, unsubscribe, and broadcast operations
 */

import type { ServerWebSocket } from 'bun'
import type { WebSocketData } from './types'
import type { ChannelManager } from './channels'

export interface BatchConfig {
  enabled?: boolean
  maxBatchSize?: number
  debounceMs?: number
}

export interface BatchSubscribeRequest {
  channels: string[]
  channelData?: Record<string, unknown>
}

export interface BatchSubscribeResult {
  succeeded: string[]
  failed: Record<string, string> // channel -> error
}

export interface BatchBroadcastRequest {
  channels: string[]
  event: string
  data: unknown
  excludeSocketId?: string
}

export class BatchOperationsManager {
  private config: Required<BatchConfig>
  private channelManager: ChannelManager

  constructor(config: BatchConfig = {}, channelManager: ChannelManager) {
    this.config = {
      enabled: config.enabled ?? true,
      maxBatchSize: config.maxBatchSize ?? 50,
      debounceMs: config.debounceMs ?? 0,
    }

    this.channelManager = channelManager
  }

  /**
   * Batch subscribe to multiple channels
   */
  async batchSubscribe(
    ws: ServerWebSocket<WebSocketData>,
    request: BatchSubscribeRequest,
  ): Promise<BatchSubscribeResult> {
    if (!this.config.enabled) {
      throw new Error('Batch operations are disabled')
    }

    const { channels, channelData } = request

    if (channels.length > this.config.maxBatchSize) {
      throw new Error(`Batch size exceeds maximum: ${channels.length} > ${this.config.maxBatchSize}`)
    }

    const result: BatchSubscribeResult = {
      succeeded: [],
      failed: {},
    }

    // Subscribe to all channels
    for (const channel of channels) {
      try {
        const data = channelData?.[channel]
        const success = await this.channelManager.subscribe(ws, channel, data)

        if (success) {
          result.succeeded.push(channel)
        }
        else {
          result.failed[channel] = 'Authorization failed'
        }
      }
      catch (error) {
        result.failed[channel] = error instanceof Error ? error.message : 'Unknown error'
      }
    }

    return result
  }

  /**
   * Batch unsubscribe from multiple channels
   */
  batchUnsubscribe(
    ws: ServerWebSocket<WebSocketData>,
    channels: string[],
  ): { succeeded: string[], failed: Record<string, string> } {
    if (!this.config.enabled) {
      throw new Error('Batch operations are disabled')
    }

    if (channels.length > this.config.maxBatchSize) {
      throw new Error(`Batch size exceeds maximum: ${channels.length} > ${this.config.maxBatchSize}`)
    }

    const result = {
      succeeded: [] as string[],
      failed: {} as Record<string, string>,
    }

    for (const channel of channels) {
      try {
        this.channelManager.unsubscribe(ws, channel)
        result.succeeded.push(channel)
      }
      catch (error) {
        result.failed[channel] = error instanceof Error ? error.message : 'Unknown error'
      }
    }

    return result
  }

  /**
   * Batch broadcast to multiple channels
   */
  batchBroadcast(
    broadcast: (channel: string, event: string, data: unknown, excludeSocketId?: string) => void,
    request: BatchBroadcastRequest,
  ): { succeeded: string[], failed: Record<string, string> } {
    if (!this.config.enabled) {
      throw new Error('Batch operations are disabled')
    }

    const { channels, event, data, excludeSocketId } = request

    if (channels.length > this.config.maxBatchSize) {
      throw new Error(`Batch size exceeds maximum: ${channels.length} > ${this.config.maxBatchSize}`)
    }

    const result = {
      succeeded: [] as string[],
      failed: {} as Record<string, string>,
    }

    for (const channel of channels) {
      try {
        broadcast(channel, event, data, excludeSocketId)
        result.succeeded.push(channel)
      }
      catch (error) {
        result.failed[channel] = error instanceof Error ? error.message : 'Unknown error'
      }
    }

    return result
  }
}
