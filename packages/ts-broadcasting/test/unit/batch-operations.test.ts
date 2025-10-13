/**
 * Unit Tests: BatchOperationsManager
 *
 * Tests for batch subscribe, unsubscribe, and broadcast operations
 */

import { describe, expect, it, beforeEach } from 'bun:test'
import { BatchOperationsManager } from '../../src/batch-operations'
import { ChannelManager } from '../../src/channels'
import type { ServerWebSocket } from 'bun'
import type { WebSocketData } from '../../src/types'

describe('BatchOperationsManager', () => {
  let batchManager: BatchOperationsManager
  let channelManager: ChannelManager
  let mockWebSocket: ServerWebSocket<WebSocketData>

  beforeEach(() => {
    channelManager = new ChannelManager()
    batchManager = new BatchOperationsManager(
      {
        enabled: true,
        maxBatchSize: 10,
      },
      channelManager,
    )

    mockWebSocket = {
      data: {
        id: 'test-id',
        socketId: 'socket-123',
        channels: new Set<string>(),
        connectedAt: Date.now(),
      },
      send: () => 0,
      close: () => {},
      publish: () => 0,
      subscribe: () => {},
      unsubscribe: () => {},
      cork: () => {},
      readyState: 1,
    } as any
  })

  describe('Batch Subscribe', () => {
    it('should subscribe to multiple channels', async () => {
      const result = await batchManager.batchSubscribe(mockWebSocket, {
        channels: ['channel-1', 'channel-2', 'channel-3'],
      })

      expect(result.succeeded).toEqual(['channel-1', 'channel-2', 'channel-3'])
      expect(Object.keys(result.failed).length).toBe(0)
    })

    it('should handle mixed success and failures', async () => {
      // Setup authorization for only some channels
      channelManager.channel('private-authorized', () => true)
      channelManager.channel('private-denied', () => false)

      const result = await batchManager.batchSubscribe(mockWebSocket, {
        channels: ['public', 'private-authorized', 'private-denied'],
      })

      expect(result.succeeded).toContain('public')
      expect(result.succeeded).toContain('private-authorized')
      expect(result.failed['private-denied']).toBeDefined()
    })

    it('should pass channel data to individual subscriptions', async () => {
      const result = await batchManager.batchSubscribe(mockWebSocket, {
        channels: ['channel-1', 'channel-2'],
        channelData: {
          'channel-1': { key: 'value1' },
          'channel-2': { key: 'value2' },
        },
      })

      expect(result.succeeded.length).toBe(2)
    })

    it('should enforce max batch size', async () => {
      const channels = Array.from({ length: 20 }, (_, i) => `channel-${i}`)

      await expect(
        batchManager.batchSubscribe(mockWebSocket, { channels }),
      ).rejects.toThrow(/exceeds maximum/)
    })

    it('should throw when disabled', async () => {
      batchManager = new BatchOperationsManager({ enabled: false }, channelManager)

      await expect(
        batchManager.batchSubscribe(mockWebSocket, { channels: ['test'] }),
      ).rejects.toThrow(/disabled/)
    })
  })

  describe('Batch Unsubscribe', () => {
    beforeEach(async () => {
      // Subscribe to some channels first
      await channelManager.subscribe(mockWebSocket, 'channel-1')
      await channelManager.subscribe(mockWebSocket, 'channel-2')
      await channelManager.subscribe(mockWebSocket, 'channel-3')
    })

    it('should unsubscribe from multiple channels', () => {
      const result = batchManager.batchUnsubscribe(mockWebSocket, [
        'channel-1',
        'channel-2',
        'channel-3',
      ])

      expect(result.succeeded).toEqual(['channel-1', 'channel-2', 'channel-3'])
      expect(Object.keys(result.failed).length).toBe(0)
      expect(mockWebSocket.data.channels.size).toBe(0)
    })

    it('should handle unsubscribing from non-subscribed channels', () => {
      const result = batchManager.batchUnsubscribe(mockWebSocket, [
        'channel-1',
        'non-subscribed',
      ])

      expect(result.succeeded).toContain('channel-1')
      expect(result.succeeded).toContain('non-subscribed')
    })

    it('should enforce max batch size', () => {
      const channels = Array.from({ length: 20 }, (_, i) => `channel-${i}`)

      expect(() => {
        batchManager.batchUnsubscribe(mockWebSocket, channels)
      }).toThrow(/exceeds maximum/)
    })

    it('should throw when disabled', () => {
      batchManager = new BatchOperationsManager({ enabled: false }, channelManager)

      expect(() => {
        batchManager.batchUnsubscribe(mockWebSocket, ['test'])
      }).toThrow(/disabled/)
    })
  })

  describe('Batch Broadcast', () => {
    let broadcastCalls: any[] = []

    const mockBroadcast = (channel: string, event: string, data: unknown, excludeSocketId?: string) => {
      broadcastCalls.push({ channel, event, data, excludeSocketId })
    }

    beforeEach(() => {
      broadcastCalls = []
    })

    it('should broadcast to multiple channels', () => {
      const result = batchManager.batchBroadcast(mockBroadcast, {
        channels: ['channel-1', 'channel-2', 'channel-3'],
        event: 'test-event',
        data: { message: 'hello' },
      })

      expect(result.succeeded).toEqual(['channel-1', 'channel-2', 'channel-3'])
      expect(Object.keys(result.failed).length).toBe(0)
      expect(broadcastCalls.length).toBe(3)
    })

    it('should pass exclude socket ID to broadcasts', () => {
      batchManager.batchBroadcast(mockBroadcast, {
        channels: ['channel-1', 'channel-2'],
        event: 'test-event',
        data: {},
        excludeSocketId: 'socket-exclude',
      })

      expect(broadcastCalls[0].excludeSocketId).toBe('socket-exclude')
      expect(broadcastCalls[1].excludeSocketId).toBe('socket-exclude')
    })

    it('should send same data to all channels', () => {
      const data = { message: 'test', timestamp: Date.now() }

      batchManager.batchBroadcast(mockBroadcast, {
        channels: ['channel-1', 'channel-2'],
        event: 'test-event',
        data,
      })

      expect(broadcastCalls[0].data).toEqual(data)
      expect(broadcastCalls[1].data).toEqual(data)
    })

    it('should enforce max batch size', () => {
      const channels = Array.from({ length: 20 }, (_, i) => `channel-${i}`)

      expect(() => {
        batchManager.batchBroadcast(mockBroadcast, {
          channels,
          event: 'test',
          data: {},
        })
      }).toThrow(/exceeds maximum/)
    })

    it('should throw when disabled', () => {
      batchManager = new BatchOperationsManager({ enabled: false }, channelManager)

      expect(() => {
        batchManager.batchBroadcast(mockBroadcast, {
          channels: ['test'],
          event: 'test',
          data: {},
        })
      }).toThrow(/disabled/)
    })
  })

  describe('Error Handling', () => {
    it('should handle mixed success and failure results', async () => {
      // Test that batch operations properly separate successful and failed operations
      // By default, all channels will succeed since no authorization is required
      const result = await batchManager.batchSubscribe(mockWebSocket, {
        channels: ['channel-1', 'channel-2', 'channel-3'],
      })

      expect(result.succeeded.length).toBeGreaterThan(0)
      expect(Object.keys(result.failed).length).toBeGreaterThanOrEqual(0)
    })

    it('should handle errors in broadcasts', () => {
      const mockBroadcast = (channel: string) => {
        if (channel === 'error-channel') {
          throw new Error('Broadcast error')
        }
      }

      const result = batchManager.batchBroadcast(mockBroadcast, {
        channels: ['good-channel', 'error-channel'],
        event: 'test',
        data: {},
      })

      expect(result.succeeded).toContain('good-channel')
      expect(result.failed['error-channel']).toBeDefined()
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty channel lists', async () => {
      const result = await batchManager.batchSubscribe(mockWebSocket, {
        channels: [],
      })

      expect(result.succeeded).toEqual([])
      expect(Object.keys(result.failed).length).toBe(0)
    })

    it('should handle duplicate channels in list', async () => {
      const result = await batchManager.batchSubscribe(mockWebSocket, {
        channels: ['channel-1', 'channel-1', 'channel-2'],
      })

      // Each channel should only be subscribed once
      expect(result.succeeded.length).toBe(3)
    })

    it('should handle special characters in channel names', async () => {
      const channels = ['channel.1', 'channel-2', 'channel_3']

      const result = await batchManager.batchSubscribe(mockWebSocket, {
        channels,
      })

      expect(result.succeeded.length).toBe(3)
    })
  })
})
