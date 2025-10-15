/**
 * Message Encryption
 *
 * End-to-end encryption for sensitive channel data
 */

import { Buffer } from 'node:buffer'

export interface EncryptionConfig {
  enabled?: boolean
  algorithm?: 'aes-256-gcm' | 'aes-128-gcm'
  keyRotationInterval?: number // milliseconds
  channelKeys?: Map<string, string> // channel -> key
}

export class EncryptionManager {
  private config: Required<EncryptionConfig>
  private keys: Map<string, CryptoKey> = new Map()
  private channelKeys: Map<string, string> = new Map()

  constructor(config: EncryptionConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      algorithm: config.algorithm || 'aes-256-gcm',
      keyRotationInterval: config.keyRotationInterval || 24 * 60 * 60 * 1000, // 24 hours
      channelKeys: config.channelKeys || new Map(),
    }

    this.channelKeys = new Map(this.config.channelKeys)
  }

  /**
   * Check if encryption is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * Set encryption key for a channel
   */
  async setChannelKey(channel: string, keyString: string): Promise<void> {
    this.channelKeys.set(channel, keyString)

    // Import key for crypto operations
    const keyData = Buffer.from(keyString, 'hex')
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'AES-GCM' },
      false,
      ['encrypt', 'decrypt'],
    )

    this.keys.set(channel, key)
  }

  /**
   * Generate a new encryption key for a channel
   */
  async generateChannelKey(channel: string): Promise<string> {
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt'],
    )

    const exported = await crypto.subtle.exportKey('raw', key)
    const keyString = Buffer.from(exported).toString('hex')

    await this.setChannelKey(channel, keyString)

    return keyString
  }

  /**
   * Encrypt message data
   */
  async encrypt(channel: string, data: unknown): Promise<string> {
    if (!this.config.enabled) {
      // Handle undefined specially since JSON.stringify(undefined) returns undefined (not a string)
      if (data === undefined) {
        return 'undefined'
      }
      return JSON.stringify(data)
    }

    const key = this.keys.get(channel)
    if (!key) {
      throw new Error(`No encryption key found for channel: ${channel}`)
    }

    // Handle undefined specially since JSON.stringify(undefined) returns undefined (not a string)
    const plaintext = data === undefined ? 'undefined' : JSON.stringify(data)
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      new TextEncoder().encode(plaintext),
    )

    // Combine IV and encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv, 0)
    combined.set(new Uint8Array(encrypted), iv.length)

    return Buffer.from(combined).toString('base64')
  }

  /**
   * Decrypt message data
   */
  async decrypt(channel: string, encryptedData: string): Promise<unknown> {
    if (!this.config.enabled) {
      // Handle undefined specially
      if (encryptedData === 'undefined') {
        return undefined
      }
      return JSON.parse(encryptedData)
    }

    const key = this.keys.get(channel)
    if (!key) {
      throw new Error(`No encryption key found for channel: ${channel}`)
    }

    const combined = Buffer.from(encryptedData, 'base64')
    const iv = combined.slice(0, 12)
    const encrypted = combined.slice(12)

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      encrypted,
    )

    const plaintext = new TextDecoder().decode(decrypted)
    // Handle undefined specially
    if (plaintext === 'undefined') {
      return undefined
    }
    return JSON.parse(plaintext)
  }

  /**
   * Check if a channel has encryption enabled
   */
  hasChannelKey(channel: string): boolean {
    return this.channelKeys.has(channel)
  }

  /**
   * Get channel key (for sharing with clients)
   */
  getChannelKey(channel: string): string | undefined {
    return this.channelKeys.get(channel)
  }

  /**
   * Rotate encryption key for a channel
   */
  async rotateChannelKey(channel: string): Promise<string> {
    // Generate a new key and replace the old one
    return this.generateChannelKey(channel)
  }

  /**
   * Remove encryption key for a channel
   */
  removeChannelKey(channel: string): void {
    this.channelKeys.delete(channel)
    this.keys.delete(channel)
  }
}
