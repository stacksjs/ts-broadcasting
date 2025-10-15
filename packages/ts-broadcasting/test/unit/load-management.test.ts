/**
 * Unit Tests: LoadManager
 *
 * Tests for load management, backpressure, and load shedding
 */

import { beforeEach, describe, expect, it } from 'bun:test'
import { LoadManager } from '../../src/load-management'

describe('LoadManager', () => {
  let manager: LoadManager

  beforeEach(() => {
    manager = new LoadManager({
      maxConnections: 100,
      maxChannelsPerConnection: 10,
      maxGlobalChannels: 500,
      shedLoadAt: 90,
      backpressureThreshold: 1024 * 1024, // 1MB
    })
  })

  describe('Connection Management', () => {
    it('should accept connections within limit', () => {
      expect(manager.canAcceptConnection()).toBe(true)
    })

    it('should register connections', () => {
      manager.registerConnection('socket-1')
      manager.registerConnection('socket-2')
      manager.registerConnection('socket-3')

      const stats = manager.getStats()
      expect(stats.connections).toBe(3)
    })

    it('should reject connections at capacity', () => {
      // Fill to capacity
      for (let i = 0; i < 100; i++) {
        manager.registerConnection(`socket-${i}`)
      }

      expect(manager.canAcceptConnection()).toBe(false)
    })

    it('should unregister connections', () => {
      manager.registerConnection('socket-1')
      manager.registerConnection('socket-2')
      manager.unregisterConnection('socket-1')

      const stats = manager.getStats()
      expect(stats.connections).toBe(1)
    })

    it('should not go below zero connections', () => {
      manager.unregisterConnection('non-existent')

      const stats = manager.getStats()
      expect(stats.connections).toBe(0)
    })

    it('should clean up channels when unregistering connection', () => {
      manager.registerConnection('socket-1')
      manager.registerSubscription('socket-1')
      manager.registerSubscription('socket-1')

      manager.unregisterConnection('socket-1')

      const stats = manager.getStats()
      expect(stats.channels).toBe(0)
    })
  })

  describe('Subscription Management', () => {
    beforeEach(() => {
      manager.registerConnection('socket-1')
    })

    it('should allow subscriptions within limit', () => {
      expect(manager.canSubscribe('socket-1')).toBe(true)
    })

    it('should register subscriptions', () => {
      manager.registerSubscription('socket-1')
      manager.registerSubscription('socket-1')

      const stats = manager.getStats()
      expect(stats.channels).toBe(2)
    })

    it('should reject subscriptions at per-connection limit', () => {
      // Fill to per-connection limit
      for (let i = 0; i < 10; i++) {
        manager.registerSubscription('socket-1')
      }

      expect(manager.canSubscribe('socket-1')).toBe(false)
    })

    it('should reject subscriptions at global limit', () => {
      // Register many connections and fill global capacity
      for (let i = 0; i < 50; i++) {
        manager.registerConnection(`socket-${i}`)
        for (let j = 0; j < 10; j++) {
          manager.registerSubscription(`socket-${i}`)
        }
      }

      manager.registerConnection('new-socket')
      expect(manager.canSubscribe('new-socket')).toBe(false)
    })

    it('should unregister subscriptions', () => {
      manager.registerSubscription('socket-1')
      manager.registerSubscription('socket-1')
      manager.unregisterSubscription('socket-1')

      const stats = manager.getStats()
      expect(stats.channels).toBe(1)
    })

    it('should not go below zero channels', () => {
      manager.unregisterSubscription('socket-1')

      const stats = manager.getStats()
      expect(stats.channels).toBe(0)
    })

    it('should track channels per connection', () => {
      manager.registerConnection('socket-2')

      manager.registerSubscription('socket-1')
      manager.registerSubscription('socket-1')
      manager.registerSubscription('socket-2')

      const stats = manager.getStats()
      expect(stats.averageChannelsPerConnection).toBe(1.5) // (2 + 1) / 2
    })
  })

  describe('Load Shedding', () => {
    it('should not shed load when below threshold', () => {
      // Fill to 50% of capacity
      for (let i = 0; i < 50; i++) {
        manager.registerConnection(`socket-${i}`)
      }

      expect(manager.shouldShedLoad()).toBe(false)
    })

    it('should shed load when connection threshold reached', () => {
      // Fill to 90% of connection capacity
      for (let i = 0; i < 90; i++) {
        manager.registerConnection(`socket-${i}`)
      }

      expect(manager.shouldShedLoad()).toBe(true)
    })

    it('should shed load when channel threshold reached', () => {
      // Fill to 90% of global channel capacity
      for (let i = 0; i < 45; i++) {
        manager.registerConnection(`socket-${i}`)
        for (let j = 0; j < 10; j++) {
          manager.registerSubscription(`socket-${i}`)
        }
      }

      expect(manager.shouldShedLoad()).toBe(true)
    })

    it('should use configured shed threshold', () => {
      manager = new LoadManager({
        maxConnections: 100,
        shedLoadAt: 50, // 50% threshold
      })

      for (let i = 0; i < 50; i++) {
        manager.registerConnection(`socket-${i}`)
      }

      expect(manager.shouldShedLoad()).toBe(true)
    })
  })

  describe('Backpressure Detection', () => {
    it('should detect backpressure over threshold', () => {
      const bufferedAmount = 2 * 1024 * 1024 // 2MB

      expect(manager.shouldApplyBackpressure(bufferedAmount)).toBe(true)
    })

    it('should not detect backpressure under threshold', () => {
      const bufferedAmount = 512 * 1024 // 512KB

      expect(manager.shouldApplyBackpressure(bufferedAmount)).toBe(false)
    })

    it('should use configured backpressure threshold', () => {
      manager = new LoadManager({
        backpressureThreshold: 100 * 1024, // 100KB
      })

      expect(manager.shouldApplyBackpressure(200 * 1024)).toBe(true)
      expect(manager.shouldApplyBackpressure(50 * 1024)).toBe(false)
    })
  })

  describe('Usage Statistics', () => {
    it('should calculate connection usage percentage', () => {
      for (let i = 0; i < 50; i++) {
        manager.registerConnection(`socket-${i}`)
      }

      expect(manager.getConnectionUsage()).toBe(50)
    })

    it('should calculate channel usage percentage', () => {
      for (let i = 0; i < 10; i++) {
        manager.registerConnection(`socket-${i}`)
        for (let j = 0; j < 10; j++) {
          manager.registerSubscription(`socket-${i}`)
        }
      }

      // 10 connections * 10 channels = 100 channels
      // 100 / 500 max = 20%
      expect(manager.getChannelUsage()).toBe(20)
    })

    it('should return comprehensive stats', () => {
      manager.registerConnection('socket-1')
      manager.registerConnection('socket-2')
      manager.registerSubscription('socket-1')
      manager.registerSubscription('socket-1')
      manager.registerSubscription('socket-2')

      const stats = manager.getStats()

      expect(stats.connections).toBe(2)
      expect(stats.channels).toBe(3)
      expect(stats.averageChannelsPerConnection).toBe(1.5)
      expect(stats.memoryUsage).toBeGreaterThan(0)
      expect(stats.isOverloaded).toBe(false)
    })

    it('should mark as overloaded when shedding load', () => {
      // Fill to capacity
      for (let i = 0; i < 90; i++) {
        manager.registerConnection(`socket-${i}`)
      }

      const stats = manager.getStats()
      expect(stats.isOverloaded).toBe(true)
    })
  })

  describe('Edge Cases', () => {
    it('should handle zero connections gracefully', () => {
      const stats = manager.getStats()

      expect(stats.connections).toBe(0)
      expect(stats.channels).toBe(0)
      expect(stats.averageChannelsPerConnection).toBe(0)
    })

    it('should handle duplicate connection registrations', () => {
      manager.registerConnection('socket-1')
      manager.registerConnection('socket-1')

      const stats = manager.getStats()
      expect(stats.connections).toBe(2) // Treated as separate
    })

    it('should handle subscribing without connection', () => {
      // Should not throw
      expect(() => {
        manager.registerSubscription('non-existent')
      }).not.toThrow()

      const stats = manager.getStats()
      expect(stats.channels).toBe(1)
    })

    it('should handle very large numbers', () => {
      manager = new LoadManager({
        maxConnections: 1000000,
        maxGlobalChannels: 10000000,
      })

      for (let i = 0; i < 100; i++) {
        manager.registerConnection(`socket-${i}`)
      }

      expect(manager.getConnectionUsage()).toBeLessThan(1)
    })

    it('should handle concurrent operations', () => {
      Array.from({ length: 100 }, (_, i) => {
        manager.registerConnection(`socket-${i}`)
        manager.registerSubscription(`socket-${i}`)
        manager.registerSubscription(`socket-${i}`)
        return undefined
      })

      const stats = manager.getStats()
      expect(stats.connections).toBe(100)
      expect(stats.channels).toBe(200)
    })
  })

  describe('Default Configuration', () => {
    it('should use default values', () => {
      manager = new LoadManager()

      expect(manager.canAcceptConnection()).toBe(true)

      // Test default max connections (10000)
      for (let i = 0; i < 10000; i++) {
        manager.registerConnection(`socket-${i}`)
      }

      expect(manager.canAcceptConnection()).toBe(false)
    })
  })

  describe('Memory Tracking', () => {
    it('should track memory usage', () => {
      const stats = manager.getStats()

      expect(stats.memoryUsage).toBeDefined()
      expect(stats.memoryUsage).toBeGreaterThan(0)
    })
  })
})
