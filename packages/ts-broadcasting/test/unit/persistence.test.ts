/**
 * Unit Tests: PersistenceManager
 *
 * Tests for message persistence and history functionality
 */

import { describe, expect, it, beforeEach } from 'bun:test'
import { PersistenceManager } from '../../src/persistence'

describe('PersistenceManager', () => {
  describe('In-Memory Storage', () => {
    let manager: PersistenceManager

    beforeEach(() => {
      manager = new PersistenceManager({
        enabled: true,
        ttl: 3600,
        maxMessages: 100,
      })
    })

    describe('Message Storage', () => {
      it('should store messages', async () => {
        await manager.store('test-channel', 'message', { text: 'Hello' }, 'socket-123')

        const history = await manager.getHistory('test-channel')
        expect(history.length).toBe(1)
        expect(history[0].event).toBe('message')
        expect(history[0].data).toEqual({ text: 'Hello' })
        expect(history[0].socketId).toBe('socket-123')
      })

      it('should generate unique message IDs', async () => {
        await manager.store('test-channel', 'message', { text: 'Message 1' })
        await manager.store('test-channel', 'message', { text: 'Message 2' })

        const history = await manager.getHistory('test-channel')
        expect(history[0].id).not.toBe(history[1].id)
      })

      it('should store timestamps', async () => {
        const beforeTime = Date.now()
        await manager.store('test-channel', 'message', { text: 'Test' })
        const afterTime = Date.now()

        const history = await manager.getHistory('test-channel')
        expect(history[0].timestamp).toBeGreaterThanOrEqual(beforeTime)
        expect(history[0].timestamp).toBeLessThanOrEqual(afterTime)
      })

      it('should store messages in chronological order', async () => {
        await manager.store('test-channel', 'message', { text: 'First' })
        await new Promise(resolve => setTimeout(resolve, 10))
        await manager.store('test-channel', 'message', { text: 'Second' })
        await new Promise(resolve => setTimeout(resolve, 10))
        await manager.store('test-channel', 'message', { text: 'Third' })

        const history = await manager.getHistory('test-channel')
        expect(history.length).toBe(3)
        expect(history[0].data.text).toBe('First')
        expect(history[1].data.text).toBe('Second')
        expect(history[2].data.text).toBe('Third')
      })

      it('should handle multiple channels independently', async () => {
        await manager.store('channel-1', 'message', { text: 'Channel 1' })
        await manager.store('channel-2', 'message', { text: 'Channel 2' })

        const history1 = await manager.getHistory('channel-1')
        const history2 = await manager.getHistory('channel-2')

        expect(history1.length).toBe(1)
        expect(history2.length).toBe(1)
        expect(history1[0].data.text).toBe('Channel 1')
        expect(history2[0].data.text).toBe('Channel 2')
      })
    })

    describe('Message Retrieval', () => {
      beforeEach(async () => {
        // Store test messages
        await manager.store('test-channel', 'message', { num: 1 })
        await new Promise(resolve => setTimeout(resolve, 10))
        await manager.store('test-channel', 'message', { num: 2 })
        await new Promise(resolve => setTimeout(resolve, 10))
        await manager.store('test-channel', 'message', { num: 3 })
      })

      it('should retrieve all messages by default', async () => {
        const history = await manager.getHistory('test-channel')
        expect(history.length).toBe(3)
      })

      it('should filter messages by timestamp (since)', async () => {
        const messages = await manager.getHistory('test-channel')
        const middleTime = messages[1].timestamp

        const filtered = await manager.getHistory('test-channel', middleTime)
        expect(filtered.length).toBe(2) // messages 2 and 3
        expect(filtered[0].data.num).toBe(2)
        expect(filtered[1].data.num).toBe(3)
      })

      it('should limit number of messages', async () => {
        const history = await manager.getHistory('test-channel', undefined, 2)
        expect(history.length).toBe(2)
        expect(history[0].data.num).toBe(1)
        expect(history[1].data.num).toBe(2)
      })

      it('should combine timestamp filter and limit', async () => {
        const messages = await manager.getHistory('test-channel')
        const firstTime = messages[0].timestamp

        const filtered = await manager.getHistory('test-channel', firstTime, 2)
        expect(filtered.length).toBe(2)
        expect(filtered[0].data.num).toBe(1)
        expect(filtered[1].data.num).toBe(2)
      })

      it('should return empty array for non-existent channel', async () => {
        const history = await manager.getHistory('non-existent')
        expect(history).toEqual([])
      })
    })

    describe('Max Messages Limit', () => {
      beforeEach(() => {
        manager = new PersistenceManager({
          enabled: true,
          maxMessages: 5,
        })
      })

      it('should enforce max messages per channel', async () => {
        for (let i = 0; i < 10; i++) {
          await manager.store('test-channel', 'message', { num: i })
        }

        const history = await manager.getHistory('test-channel')
        expect(history.length).toBe(5)
        // Should keep the most recent messages
        expect(history[0].data.num).toBe(5)
        expect(history[4].data.num).toBe(9)
      })
    })

    describe('Channel Clearing', () => {
      beforeEach(async () => {
        await manager.store('test-channel', 'message', { text: 'Message 1' })
        await manager.store('test-channel', 'message', { text: 'Message 2' })
      })

      it('should clear channel history', async () => {
        await manager.clear('test-channel')

        const history = await manager.getHistory('test-channel')
        expect(history.length).toBe(0)
      })

      it('should not affect other channels when clearing', async () => {
        await manager.store('other-channel', 'message', { text: 'Other' })
        await manager.clear('test-channel')

        const history = await manager.getHistory('other-channel')
        expect(history.length).toBe(1)
      })
    })

    describe('Statistics', () => {
      beforeEach(async () => {
        await manager.store('channel-1', 'message', { text: 'Test 1' })
        await manager.store('channel-1', 'message', { text: 'Test 2' })
        await manager.store('channel-2', 'message', { text: 'Test 3' })
      })

      it('should return statistics', async () => {
        const stats = await manager.getStats()

        expect(stats.totalChannels).toBe(2)
        expect(stats.totalMessages).toBe(3)
        expect(stats.channels).toBeDefined()
        expect(stats.channels['channel-1']).toBe(2)
        expect(stats.channels['channel-2']).toBe(1)
      })

      it('should return zero stats when empty', async () => {
        manager = new PersistenceManager({ enabled: true })
        const stats = await manager.getStats()

        expect(stats.totalChannels).toBe(0)
        expect(stats.totalMessages).toBe(0)
      })
    })

    describe('Complex Data Types', () => {
      it('should store and retrieve complex objects', async () => {
        const complexData = {
          user: {
            id: 123,
            name: 'John Doe',
            roles: ['admin', 'user'],
          },
          metadata: {
            timestamp: Date.now(),
            version: '1.0.0',
          },
        }

        await manager.store('test-channel', 'complex', complexData)
        const history = await manager.getHistory('test-channel')

        expect(history[0].data).toEqual(complexData)
      })

      it('should store arrays', async () => {
        const arrayData = [1, 2, 3, 4, 5]

        await manager.store('test-channel', 'array', arrayData)
        const history = await manager.getHistory('test-channel')

        expect(history[0].data).toEqual(arrayData)
      })

      it('should store strings', async () => {
        await manager.store('test-channel', 'string', 'Simple string')
        const history = await manager.getHistory('test-channel')

        expect(history[0].data).toBe('Simple string')
      })

      it('should store null values', async () => {
        await manager.store('test-channel', 'null', null)
        const history = await manager.getHistory('test-channel')

        expect(history[0].data).toBeNull()
      })
    })

    describe('Edge Cases', () => {
      it('should handle empty event names', async () => {
        await manager.store('test-channel', '', { data: 'test' })
        const history = await manager.getHistory('test-channel')

        expect(history.length).toBe(1)
        expect(history[0].event).toBe('')
      })

      it('should handle messages without socket ID', async () => {
        await manager.store('test-channel', 'message', { text: 'Test' })
        const history = await manager.getHistory('test-channel')

        expect(history[0].socketId).toBeUndefined()
      })

      it('should handle concurrent stores', async () => {
        const promises = Array.from({ length: 10 }, (_, i) =>
          manager.store('test-channel', 'message', { num: i }),
        )

        await Promise.all(promises)
        const history = await manager.getHistory('test-channel')

        expect(history.length).toBe(10)
      })

      it('should handle very long channel names', async () => {
        const longName = 'a'.repeat(1000)
        await manager.store(longName, 'message', { text: 'Test' })
        const history = await manager.getHistory(longName)

        expect(history.length).toBe(1)
      })
    })
  })

  describe('Disabled Persistence', () => {
    let manager: PersistenceManager

    beforeEach(() => {
      manager = new PersistenceManager({ enabled: false })
    })

    it('should not store messages when disabled', async () => {
      await manager.store('test-channel', 'message', { text: 'Test' })
      const history = await manager.getHistory('test-channel')

      expect(history.length).toBe(0)
    })

    it('should return empty stats when disabled', async () => {
      const stats = await manager.getStats()

      expect(stats.totalChannels).toBe(0)
      expect(stats.totalMessages).toBe(0)
    })
  })
})
