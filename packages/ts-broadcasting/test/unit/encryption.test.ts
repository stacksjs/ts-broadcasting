/**
 * Unit Tests: EncryptionManager
 *
 * Tests for end-to-end encryption functionality
 */

import { describe, expect, it, beforeEach } from 'bun:test'
import { EncryptionManager } from '../../src/encryption'

describe('EncryptionManager', () => {
  let manager: EncryptionManager

  beforeEach(() => {
    manager = new EncryptionManager({
      enabled: true,
      algorithm: 'AES-GCM',
    })
  })

  describe('Key Management', () => {
    it('should generate encryption key for a channel', async () => {
      const key = await manager.generateChannelKey('test-channel')

      expect(key).toBeDefined()
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
    })

    it('should store and retrieve channel keys', async () => {
      const key = await manager.generateChannelKey('test-channel')
      manager.setChannelKey('test-channel', key)

      const retrievedKey = manager.getChannelKey('test-channel')
      expect(retrievedKey).toBe(key)
    })

    it('should generate different keys for different channels', async () => {
      const key1 = await manager.generateChannelKey('channel-1')
      const key2 = await manager.generateChannelKey('channel-2')

      expect(key1).not.toBe(key2)
    })

    it('should return undefined for non-existent channel keys', () => {
      const key = manager.getChannelKey('non-existent')
      expect(key).toBeUndefined()
    })

    it('should rotate channel key', async () => {
      const oldKey = await manager.generateChannelKey('test-channel')
      manager.setChannelKey('test-channel', oldKey)

      const newKey = await manager.rotateChannelKey('test-channel')

      expect(newKey).toBeDefined()
      expect(newKey).not.toBe(oldKey)
      expect(manager.getChannelKey('test-channel')).toBe(newKey)
    })
  })

  describe('Encryption and Decryption', () => {
    beforeEach(async () => {
      const key = await manager.generateChannelKey('secure-channel')
      manager.setChannelKey('secure-channel', key)
    })

    it('should encrypt data', async () => {
      const data = { message: 'Hello, World!', timestamp: Date.now() }
      const encrypted = await manager.encrypt('secure-channel', data)

      expect(encrypted).toBeDefined()
      expect(typeof encrypted).toBe('string')
      expect(encrypted).not.toContain('Hello, World!')
    })

    it('should decrypt encrypted data', async () => {
      const originalData = { message: 'Secret message', timestamp: Date.now() }
      const encrypted = await manager.encrypt('secure-channel', originalData)
      const decrypted = await manager.decrypt('secure-channel', encrypted)

      expect(decrypted).toEqual(originalData)
    })

    it('should handle string data', async () => {
      const originalData = 'Simple string message'
      const encrypted = await manager.encrypt('secure-channel', originalData)
      const decrypted = await manager.decrypt('secure-channel', encrypted)

      expect(decrypted).toBe(originalData)
    })

    it('should handle complex nested objects', async () => {
      const originalData = {
        user: {
          id: 123,
          name: 'John Doe',
          preferences: {
            theme: 'dark',
            notifications: true,
          },
        },
        items: [1, 2, 3, 4, 5],
        metadata: {
          timestamp: Date.now(),
          version: '1.0.0',
        },
      }

      const encrypted = await manager.encrypt('secure-channel', originalData)
      const decrypted = await manager.decrypt('secure-channel', encrypted)

      expect(decrypted).toEqual(originalData)
    })

    it('should handle arrays', async () => {
      const originalData = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3, name: 'Item 3' },
      ]

      const encrypted = await manager.encrypt('secure-channel', originalData)
      const decrypted = await manager.decrypt('secure-channel', encrypted)

      expect(decrypted).toEqual(originalData)
    })

    it('should produce different ciphertext for same data', async () => {
      const data = { message: 'Test message' }

      const encrypted1 = await manager.encrypt('secure-channel', data)
      const encrypted2 = await manager.encrypt('secure-channel', data)

      // Different due to random IV
      expect(encrypted1).not.toBe(encrypted2)

      // But both decrypt to same value
      const decrypted1 = await manager.decrypt('secure-channel', encrypted1)
      const decrypted2 = await manager.decrypt('secure-channel', encrypted2)

      expect(decrypted1).toEqual(data)
      expect(decrypted2).toEqual(data)
    })

    it('should fail to decrypt with wrong key', async () => {
      const data = { message: 'Secret' }
      const encrypted = await manager.encrypt('secure-channel', data)

      // Generate different key for same channel
      const newKey = await manager.generateChannelKey('secure-channel')
      manager.setChannelKey('secure-channel', newKey)

      await expect(
        manager.decrypt('secure-channel', encrypted),
      ).rejects.toThrow()
    })

    it('should fail to decrypt tampered data', async () => {
      const data = { message: 'Secret' }
      const encrypted = await manager.encrypt('secure-channel', data)

      // Tamper with encrypted data
      const tamperedData = encrypted.slice(0, -5) + 'XXXXX'

      await expect(
        manager.decrypt('secure-channel', tamperedData),
      ).rejects.toThrow()
    })
  })

  describe('Error Handling', () => {
    it('should throw error when encrypting without key', async () => {
      await expect(
        manager.encrypt('no-key-channel', { data: 'test' }),
      ).rejects.toThrow()
    })

    it('should throw error when decrypting without key', async () => {
      await expect(
        manager.decrypt('no-key-channel', 'encrypted-data'),
      ).rejects.toThrow()
    })

    it('should throw error when decrypting invalid base64', async () => {
      const key = await manager.generateChannelKey('test-channel')
      manager.setChannelKey('test-channel', key)

      await expect(
        manager.decrypt('test-channel', 'not-valid-base64!!!'),
      ).rejects.toThrow()
    })
  })

  describe('Edge Cases', () => {
    beforeEach(async () => {
      const key = await manager.generateChannelKey('test-channel')
      manager.setChannelKey('test-channel', key)
    })

    it('should handle null values', async () => {
      const encrypted = await manager.encrypt('test-channel', null)
      const decrypted = await manager.decrypt('test-channel', encrypted)

      expect(decrypted).toBeNull()
    })

    it('should handle undefined values', async () => {
      const encrypted = await manager.encrypt('test-channel', undefined)
      const decrypted = await manager.decrypt('test-channel', encrypted)

      expect(decrypted).toBeUndefined()
    })

    it('should handle empty objects', async () => {
      const encrypted = await manager.encrypt('test-channel', {})
      const decrypted = await manager.decrypt('test-channel', encrypted)

      expect(decrypted).toEqual({})
    })

    it('should handle empty arrays', async () => {
      const encrypted = await manager.encrypt('test-channel', [])
      const decrypted = await manager.decrypt('test-channel', encrypted)

      expect(decrypted).toEqual([])
    })

    it('should handle boolean values', async () => {
      const encrypted1 = await manager.encrypt('test-channel', true)
      const encrypted2 = await manager.encrypt('test-channel', false)

      const decrypted1 = await manager.decrypt('test-channel', encrypted1)
      const decrypted2 = await manager.decrypt('test-channel', encrypted2)

      expect(decrypted1).toBe(true)
      expect(decrypted2).toBe(false)
    })

    it('should handle numbers', async () => {
      const testNumbers = [0, 42, -100, 3.14159, Number.MAX_SAFE_INTEGER]

      for (const num of testNumbers) {
        const encrypted = await manager.encrypt('test-channel', num)
        const decrypted = await manager.decrypt('test-channel', encrypted)
        expect(decrypted).toBe(num)
      }
    })
  })

  describe('Disabled Encryption', () => {
    beforeEach(() => {
      manager = new EncryptionManager({ enabled: false })
    })

    it('should not encrypt when disabled', async () => {
      const data = { message: 'Test' }
      const result = await manager.encrypt('channel', data)

      // Should return JSON string when disabled
      expect(result).toBe(JSON.stringify(data))
    })

    it('should not decrypt when disabled', async () => {
      const data = { message: 'Test' }
      const jsonString = JSON.stringify(data)
      const result = await manager.decrypt('channel', jsonString)

      expect(result).toEqual(data)
    })
  })
})
