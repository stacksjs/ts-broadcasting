/**
 * Unit Tests: ChannelState and ChannelNamespace
 *
 * Tests for channel state management and namespacing
 */

import { describe, expect, it, beforeEach } from 'bun:test'
import { ChannelStateManager, ChannelNamespaceManager } from '../../src/channel-state'

describe('ChannelStateManager', () => {
  let manager: ChannelStateManager

  beforeEach(() => {
    manager = new ChannelStateManager({ maxSize: 1024 * 10 }) // 10KB
  })

  describe('State Management', () => {
    it('should set and get state values', () => {
      manager.set('test-channel', 'key1', 'value1')

      expect(manager.get('test-channel', 'key1')).toBe('value1')
    })

    it('should handle multiple keys per channel', () => {
      manager.set('test-channel', 'key1', 'value1')
      manager.set('test-channel', 'key2', 'value2')
      manager.set('test-channel', 'key3', 'value3')

      expect(manager.get('test-channel', 'key1')).toBe('value1')
      expect(manager.get('test-channel', 'key2')).toBe('value2')
      expect(manager.get('test-channel', 'key3')).toBe('value3')
    })

    it('should return undefined for non-existent keys', () => {
      expect(manager.get('test-channel', 'non-existent')).toBeUndefined()
    })

    it('should handle multiple channels independently', () => {
      manager.set('channel-1', 'key', 'value1')
      manager.set('channel-2', 'key', 'value2')

      expect(manager.get('channel-1', 'key')).toBe('value1')
      expect(manager.get('channel-2', 'key')).toBe('value2')
    })

    it('should update existing values', () => {
      manager.set('test-channel', 'key', 'old-value')
      manager.set('test-channel', 'key', 'new-value')

      expect(manager.get('test-channel', 'key')).toBe('new-value')
    })
  })

  describe('Get All State', () => {
    beforeEach(() => {
      manager.set('test-channel', 'key1', 'value1')
      manager.set('test-channel', 'key2', { nested: 'object' })
      manager.set('test-channel', 'key3', [1, 2, 3])
    })

    it('should return all state for a channel', () => {
      const state = manager.getAll('test-channel')

      expect(state).toEqual({
        key1: 'value1',
        key2: { nested: 'object' },
        key3: [1, 2, 3],
      })
    })

    it('should return empty object for channels without state', () => {
      const state = manager.getAll('empty-channel')

      expect(state).toEqual({})
    })
  })

  describe('Delete State', () => {
    beforeEach(() => {
      manager.set('test-channel', 'key1', 'value1')
      manager.set('test-channel', 'key2', 'value2')
    })

    it('should delete specific keys', () => {
      manager.delete('test-channel', 'key1')

      expect(manager.get('test-channel', 'key1')).toBeUndefined()
      expect(manager.get('test-channel', 'key2')).toBe('value2')
    })

    it('should clear all state for a channel', () => {
      manager.clear('test-channel')

      expect(manager.getAll('test-channel')).toEqual({})
    })
  })

  describe('Complex Data Types', () => {
    it('should store objects', () => {
      const obj = { user: { id: 123, name: 'John' }, roles: ['admin'] }
      manager.set('test-channel', 'data', obj)

      expect(manager.get('test-channel', 'data')).toEqual(obj)
    })

    it('should store arrays', () => {
      const arr = [1, 2, { nested: true }, 'string']
      manager.set('test-channel', 'data', arr)

      expect(manager.get('test-channel', 'data')).toEqual(arr)
    })

    it('should store null', () => {
      manager.set('test-channel', 'data', null)

      expect(manager.get('test-channel', 'data')).toBeNull()
    })

    it('should store boolean values', () => {
      manager.set('test-channel', 'flag1', true)
      manager.set('test-channel', 'flag2', false)

      expect(manager.get('test-channel', 'flag1')).toBe(true)
      expect(manager.get('test-channel', 'flag2')).toBe(false)
    })

    it('should store numbers', () => {
      manager.set('test-channel', 'count', 42)
      manager.set('test-channel', 'pi', 3.14159)

      expect(manager.get('test-channel', 'count')).toBe(42)
      expect(manager.get('test-channel', 'pi')).toBe(3.14159)
    })
  })

  describe('Size Limits', () => {
    it('should enforce max state size', () => {
      manager = new ChannelStateManager({ maxSize: 100 }) // 100 bytes

      const largeValue = 'x'.repeat(200)

      expect(() => {
        manager.set('test-channel', 'large', largeValue)
      }).toThrow()
    })

    it('should allow state within size limit', () => {
      manager = new ChannelStateManager({ maxSize: 1000 })

      const smallValue = 'x'.repeat(50)

      expect(() => {
        manager.set('test-channel', 'small', smallValue)
      }).not.toThrow()
    })
  })
})

describe('ChannelNamespaceManager', () => {
  let manager: ChannelNamespaceManager

  beforeEach(() => {
    manager = new ChannelNamespaceManager({ enabled: true })
  })

  describe('Namespace Parsing', () => {
    it('should parse namespaced channel names', () => {
      const result = manager.parse('app1:users')

      expect(result).toEqual({
        namespace: 'app1',
        channel: 'users',
      })
    })

    it('should handle channels without namespace', () => {
      const result = manager.parse('users')

      expect(result).toEqual({
        namespace: undefined,
        channel: 'users',
      })
    })

    it('should handle nested namespaces', () => {
      const result = manager.parse('app1:feature:users')

      expect(result).toEqual({
        namespace: 'app1:feature',
        channel: 'users',
      })
    })

    it('should handle empty strings', () => {
      const result = manager.parse('')

      expect(result).toEqual({
        namespace: undefined,
        channel: '',
      })
    })
  })

  describe('Namespace Formatting', () => {
    it('should format namespace and channel', () => {
      const result = manager.format('app1', 'users')

      expect(result).toBe('app1:users')
    })

    it('should handle nested namespaces in formatting', () => {
      const result = manager.format('app1:feature', 'users')

      expect(result).toBe('app1:feature:users')
    })
  })

  describe('Namespace Checking', () => {
    it('should check if channel belongs to namespace', () => {
      expect(manager.belongsTo('app1:users', 'app1')).toBe(true)
      expect(manager.belongsTo('app1:users', 'app2')).toBe(false)
    })

    it('should handle nested namespaces in checking', () => {
      expect(manager.belongsTo('app1:feature:users', 'app1')).toBe(true)
      expect(manager.belongsTo('app1:feature:users', 'app1:feature')).toBe(true)
      expect(manager.belongsTo('app1:feature:users', 'app1:other')).toBe(false)
    })

    it('should return false for channels without namespace', () => {
      expect(manager.belongsTo('users', 'app1')).toBe(false)
    })
  })

  describe('List Channels by Namespace', () => {
    it('should list all channels in namespace', () => {
      const channels = [
        'app1:users',
        'app1:posts',
        'app2:users',
        'users',
      ]

      const app1Channels = manager.getChannelsInNamespace(channels, 'app1')

      expect(app1Channels).toEqual(['app1:users', 'app1:posts'])
    })

    it('should handle nested namespaces in listing', () => {
      const channels = [
        'app1:feature1:users',
        'app1:feature1:posts',
        'app1:feature2:users',
      ]

      const feature1Channels = manager.getChannelsInNamespace(channels, 'app1:feature1')

      expect(feature1Channels).toEqual([
        'app1:feature1:users',
        'app1:feature1:posts',
      ])
    })

    it('should return empty array when no channels match', () => {
      const channels = ['app1:users', 'app2:posts']

      const result = manager.getChannelsInNamespace(channels, 'app3')

      expect(result).toEqual([])
    })
  })

  describe('Edge Cases', () => {
    it('should handle colons in channel names', () => {
      const result = manager.parse('namespace:channel:with:colons')

      expect(result.namespace).toBe('namespace:channel:with')
      expect(result.channel).toBe('colons')
    })

    it('should handle very long namespace names', () => {
      const longNamespace = 'a'.repeat(1000)
      const formatted = manager.format(longNamespace, 'channel')

      expect(formatted).toBe(`${longNamespace}:channel`)
    })

    it('should handle special characters in namespaces', () => {
      const result = manager.parse('app-1_v2:users.admin')

      expect(result.namespace).toBe('app-1_v2')
      expect(result.channel).toBe('users.admin')
    })
  })
})
