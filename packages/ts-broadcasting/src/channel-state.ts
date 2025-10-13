/**
 * Channel State Management
 *
 * Store and manage state data per channel
 */

export interface ChannelStateConfig {
  enabled?: boolean
  ttl?: number // Time to live in seconds
  maxSize?: number // Max state size in bytes
}

export interface ChannelNamespaceConfig {
  enabled?: boolean
  separator?: string // Default: ':'
  validateNamespace?: (namespace: string) => boolean
}

export class ChannelStateManager {
  private config: Required<ChannelStateConfig>
  private state: Map<string, Map<string, unknown>> = new Map()

  constructor(config: ChannelStateConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      ttl: config.ttl ?? 3600,
      maxSize: config.maxSize ?? 1024 * 1024, // 1MB
    }
  }

  /**
   * Set state for a channel
   */
  set(channel: string, key: string, value: unknown): void {
    if (!this.config.enabled) {
      return
    }

    if (!this.state.has(channel)) {
      this.state.set(channel, new Map())
    }

    const channelState = this.state.get(channel)!

    // Check size limit
    const size = JSON.stringify(value).length
    if (size > this.config.maxSize) {
      throw new Error(`State value exceeds max size: ${size} > ${this.config.maxSize}`)
    }

    channelState.set(key, value)
  }

  /**
   * Get state for a channel
   */
  get(channel: string, key: string): unknown {
    return this.state.get(channel)?.get(key)
  }

  /**
   * Get all state for a channel
   */
  getAll(channel: string): Record<string, unknown> {
    const channelState = this.state.get(channel)
    if (!channelState) {
      return {}
    }

    return Object.fromEntries(channelState)
  }

  /**
   * Delete state key for a channel
   */
  delete(channel: string, key: string): void {
    this.state.get(channel)?.delete(key)
  }

  /**
   * Clear all state for a channel
   */
  clear(channel: string): void {
    this.state.delete(channel)
  }

  /**
   * Check if channel has state
   */
  has(channel: string, key?: string): boolean {
    if (key) {
      return this.state.get(channel)?.has(key) ?? false
    }
    return this.state.has(channel)
  }

  /**
   * Get size of channel state
   */
  getSize(channel: string): number {
    const channelState = this.state.get(channel)
    if (!channelState) {
      return 0
    }

    return JSON.stringify(Object.fromEntries(channelState)).length
  }
}

export class ChannelNamespaceManager {
  private config: Required<ChannelNamespaceConfig>

  constructor(config: ChannelNamespaceConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      separator: config.separator || ':',
      validateNamespace: config.validateNamespace || (() => true),
    }
  }

  /**
   * Parse namespace from channel name
   */
  parse(channel: string): { namespace?: string, channel: string } {
    if (!this.config.enabled) {
      return { channel }
    }

    const parts = channel.split(this.config.separator)
    if (parts.length > 1) {
      // Last part is the channel name, everything before is the namespace
      const channelName = parts[parts.length - 1]
      const namespace = parts.slice(0, -1).join(this.config.separator)

      if (this.config.validateNamespace(namespace)) {
        return { namespace, channel: channelName }
      }
    }

    return { channel }
  }

  /**
   * Format channel name with namespace
   */
  format(namespace: string, channel: string): string {
    if (!this.config.enabled) {
      return channel
    }

    return `${namespace}${this.config.separator}${channel}`
  }

  /**
   * Check if channel belongs to namespace
   */
  belongsTo(channel: string, namespace: string): boolean {
    const parsed = this.parse(channel)
    return parsed.namespace === namespace
  }

  /**
   * Get all channels in a namespace
   */
  getChannelsInNamespace(channels: string[], namespace: string): string[] {
    return channels.filter(channel => this.belongsTo(channel, namespace))
  }
}
