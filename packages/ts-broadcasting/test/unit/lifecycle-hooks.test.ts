/**
 * Unit Tests: ChannelLifecycleManager
 *
 * Tests for channel lifecycle hooks and events
 */

import type { ChannelLifecycleEvent } from '../../src/lifecycle-hooks'
import { beforeEach, describe, expect, it } from 'bun:test'
import { ChannelLifecycleManager } from '../../src/lifecycle-hooks'

describe('ChannelLifecycleManager', () => {
  let manager: ChannelLifecycleManager

  beforeEach(() => {
    manager = new ChannelLifecycleManager()
  })

  describe('Hook Registration', () => {
    it('should register lifecycle hooks', () => {
      const callback = () => {}

      expect(() => {
        manager.on('created', callback)
      }).not.toThrow()
    })

    it('should register multiple hooks for same event', () => {
      const callback1 = () => {}
      const callback2 = () => {}

      manager.on('created', callback1)
      manager.on('created', callback2)

      // Both should be registered (tested via firing)
    })

    it('should register hooks for different events', () => {
      const events: ChannelLifecycleEvent[] = ['created', 'subscribed', 'unsubscribed', 'empty', 'destroyed']

      events.forEach((event) => {
        expect(() => {
          manager.on(event, () => {})
        }).not.toThrow()
      })
    })

    it('should register "all" event hook', () => {
      expect(() => {
        manager.on('all', () => {})
      }).not.toThrow()
    })
  })

  describe('Hook Removal', () => {
    it('should remove specific hook', async () => {
      let called = false
      const callback = () => {
        called = true
      }

      manager.on('created', callback)
      manager.off('created', callback)

      await manager.channelCreated('test-channel')

      expect(called).toBe(false)
    })

    it('should not affect other hooks when removing', async () => {
      let call1 = false
      let call2 = false

      const callback1 = () => {
        call1 = true
      }
      const callback2 = () => {
        call2 = true
      }

      manager.on('created', callback1)
      manager.on('created', callback2)
      manager.off('created', callback1)

      await manager.channelCreated('test-channel')

      expect(call1).toBe(false)
      expect(call2).toBe(true)
    })
  })

  describe('Channel Created Event', () => {
    it('should fire created hook', async () => {
      let hookData: any = null

      manager.on('created', (data) => {
        hookData = data
      })

      await manager.channelCreated('test-channel', 'socket-123')

      expect(hookData).not.toBeNull()
      expect(hookData.channel).toBe('test-channel')
      expect(hookData.event).toBe('created')
      expect(hookData.socketId).toBe('socket-123')
      expect(hookData.timestamp).toBeDefined()
    })

    it('should work without socket ID', async () => {
      let hookData: any = null

      manager.on('created', (data) => {
        hookData = data
      })

      await manager.channelCreated('test-channel')

      expect(hookData.socketId).toBeUndefined()
    })
  })

  describe('Channel Subscribed Event', () => {
    it('should fire subscribed hook', async () => {
      let hookData: any = null

      manager.on('subscribed', (data) => {
        hookData = data
      })

      await manager.channelSubscribed('test-channel', 'socket-123', 5)

      expect(hookData).not.toBeNull()
      expect(hookData.channel).toBe('test-channel')
      expect(hookData.event).toBe('subscribed')
      expect(hookData.socketId).toBe('socket-123')
      expect(hookData.subscriberCount).toBe(5)
    })
  })

  describe('Channel Unsubscribed Event', () => {
    it('should fire unsubscribed hook', async () => {
      let hookData: any = null

      manager.on('unsubscribed', (data) => {
        hookData = data
      })

      await manager.channelUnsubscribed('test-channel', 'socket-123', 3)

      expect(hookData).not.toBeNull()
      expect(hookData.channel).toBe('test-channel')
      expect(hookData.event).toBe('unsubscribed')
      expect(hookData.socketId).toBe('socket-123')
      expect(hookData.subscriberCount).toBe(3)
    })
  })

  describe('Channel Empty Event', () => {
    it('should fire empty hook', async () => {
      let hookData: any = null

      manager.on('empty', (data) => {
        hookData = data
      })

      await manager.channelEmpty('test-channel')

      expect(hookData).not.toBeNull()
      expect(hookData.channel).toBe('test-channel')
      expect(hookData.event).toBe('empty')
      expect(hookData.subscriberCount).toBe(0)
    })
  })

  describe('Channel Destroyed Event', () => {
    it('should fire destroyed hook', async () => {
      let hookData: any = null

      manager.on('destroyed', (data) => {
        hookData = data
      })

      await manager.channelDestroyed('test-channel')

      expect(hookData).not.toBeNull()
      expect(hookData.channel).toBe('test-channel')
      expect(hookData.event).toBe('destroyed')
    })
  })

  describe('All Events Hook', () => {
    it('should fire for all lifecycle events', async () => {
      const events: string[] = []

      manager.on('all', (data) => {
        events.push(data.event)
      })

      await manager.channelCreated('test-channel')
      await manager.channelSubscribed('test-channel', 'socket', 1)
      await manager.channelUnsubscribed('test-channel', 'socket', 0)
      await manager.channelEmpty('test-channel')
      await manager.channelDestroyed('test-channel')

      expect(events).toEqual(['created', 'subscribed', 'unsubscribed', 'empty', 'destroyed'])
    })

    it('should fire both specific and all hooks', async () => {
      let specificCalled = false
      let allCalled = false

      manager.on('created', () => {
        specificCalled = true
      })
      manager.on('all', () => {
        allCalled = true
      })

      await manager.channelCreated('test-channel')

      expect(specificCalled).toBe(true)
      expect(allCalled).toBe(true)
    })
  })

  describe('Async Hooks', () => {
    it('should support async callbacks', async () => {
      let result = ''

      manager.on('created', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        result += 'async'
      })

      await manager.channelCreated('test-channel')

      expect(result).toBe('async')
    })

    it('should wait for all async hooks to complete', async () => {
      const results: string[] = []

      manager.on('created', async () => {
        await new Promise(resolve => setTimeout(resolve, 20))
        results.push('hook1')
      })

      manager.on('created', async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
        results.push('hook2')
      })

      await manager.channelCreated('test-channel')

      expect(results.length).toBe(2)
      expect(results).toContain('hook1')
      expect(results).toContain('hook2')
    })
  })

  describe('Error Handling', () => {
    it('should handle errors in hooks gracefully', async () => {
      let called = false

      manager.on('created', () => {
        throw new Error('Hook error')
      })

      manager.on('created', () => {
        called = true
      })

      // Should not throw - errors are caught and logged
      await manager.channelCreated('test-channel')

      // Second hook should still be called
      expect(called).toBe(true)
    })

    it('should handle async errors', async () => {
      let called = false

      manager.on('created', async () => {
        throw new Error('Async error')
      })

      manager.on('created', () => {
        called = true
      })

      // Should not throw - errors are caught and logged
      await manager.channelCreated('test-channel')

      expect(called).toBe(true)
    })
  })

  describe('Multiple Channels', () => {
    it('should fire hooks for different channels', async () => {
      const channels: string[] = []

      manager.on('created', (data) => {
        channels.push(data.channel)
      })

      await manager.channelCreated('channel-1')
      await manager.channelCreated('channel-2')
      await manager.channelCreated('channel-3')

      expect(channels).toEqual(['channel-1', 'channel-2', 'channel-3'])
    })
  })

  describe('Hook Data', () => {
    it('should include timestamp in hook data', async () => {
      let timestamp = 0

      manager.on('created', (data) => {
        timestamp = data.timestamp
      })

      const beforeTime = Date.now()
      await manager.channelCreated('test-channel')
      const afterTime = Date.now()

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime)
      expect(timestamp).toBeLessThanOrEqual(afterTime)
    })

    it('should include custom data when provided', async () => {
      let hookData: any = null

      manager.on('created', (data) => {
        hookData = data
      })

      await manager.fire({
        channel: 'test-channel',
        event: 'created',
        timestamp: Date.now(),
        data: { custom: 'data' },
      })

      expect(hookData.data).toEqual({ custom: 'data' })
    })
  })

  describe('Edge Cases', () => {
    it('should handle hooks with no callbacks', async () => {
      // Should not throw even with no callbacks registered
      await manager.channelCreated('test-channel')
    })

    it('should handle rapid-fire events', async () => {
      let count = 0

      manager.on('created', () => {
        count++
      })

      const promises = Array.from({ length: 100 }, (_, i) =>
        manager.channelCreated(`channel-${i}`))

      await Promise.all(promises)

      expect(count).toBe(100)
    })

    it('should handle very long channel names', async () => {
      let receivedChannel = ''

      manager.on('created', (data) => {
        receivedChannel = data.channel
      })

      const longName = 'a'.repeat(1000)
      await manager.channelCreated(longName)

      expect(receivedChannel).toBe(longName)
    })
  })
})
