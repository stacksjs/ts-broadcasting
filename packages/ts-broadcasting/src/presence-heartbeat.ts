/**
 * Presence Heartbeat System
 *
 * Auto-remove inactive users from presence channels
 */

export interface HeartbeatConfig {
  enabled?: boolean
  interval?: number // Check interval in ms
  timeout?: number // User timeout in ms
  requireClientHeartbeat?: boolean
}

export interface PresenceUser {
  socketId: string
  lastSeen: number
  data: unknown
}

export class PresenceHeartbeatManager {
  private config: Required<HeartbeatConfig>
  private presenceUsers: Map<string, Map<string, PresenceUser>> = new Map() // channel -> users
  private heartbeatTimer?: Timer
  private onRemove?: (channel: string, socketId: string, user: unknown) => void

  constructor(config: HeartbeatConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      interval: config.interval ?? 30000, // 30 seconds
      timeout: config.timeout ?? 60000, // 60 seconds
      requireClientHeartbeat: config.requireClientHeartbeat ?? true,
    }
  }

  /**
   * Start heartbeat monitoring
   */
  start(): void {
    if (!this.config.enabled) {
      return
    }

    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats()
    }, this.config.interval)
  }

  /**
   * Stop heartbeat monitoring
   */
  stop(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
    }
  }

  /**
   * Register removal callback
   */
  onUserRemove(callback: (channel: string, socketId: string, user: unknown) => void): void {
    this.onRemove = callback
  }

  /**
   * Update user heartbeat
   */
  heartbeat(channel: string, socketId: string, data?: unknown): void {
    if (!this.config.enabled) {
      return
    }

    if (!this.presenceUsers.has(channel)) {
      this.presenceUsers.set(channel, new Map())
    }

    const users = this.presenceUsers.get(channel)!
    const existing = users.get(socketId)

    users.set(socketId, {
      socketId,
      lastSeen: Date.now(),
      data: data || existing?.data,
    })
  }

  /**
   * Remove user from presence tracking
   */
  remove(channel: string, socketId: string): void {
    const users = this.presenceUsers.get(channel)
    if (users) {
      users.delete(socketId)

      if (users.size === 0) {
        this.presenceUsers.delete(channel)
      }
    }
  }

  /**
   * Check for inactive users
   */
  private checkHeartbeats(): void {
    const now = Date.now()
    const timeout = this.config.timeout

    for (const [channel, users] of this.presenceUsers.entries()) {
      const toRemove: string[] = []

      for (const [socketId, user] of users.entries()) {
        if (now - user.lastSeen > timeout) {
          toRemove.push(socketId)
        }
      }

      // Remove inactive users
      for (const socketId of toRemove) {
        const user = users.get(socketId)
        users.delete(socketId)

        if (this.onRemove && user) {
          this.onRemove(channel, socketId, user.data)
        }
      }

      // Clean up empty channels
      if (users.size === 0) {
        this.presenceUsers.delete(channel)
      }
    }
  }

  /**
   * Get active users for a channel
   */
  getActiveUsers(channel: string): PresenceUser[] {
    const users = this.presenceUsers.get(channel)
    if (!users) {
      return []
    }

    return Array.from(users.values())
  }

  /**
   * Check if user is active
   */
  isActive(channel: string, socketId: string): boolean {
    const user = this.presenceUsers.get(channel)?.get(socketId)
    if (!user) {
      return false
    }

    return Date.now() - user.lastSeen < this.config.timeout
  }

  /**
   * Get statistics
   */
  getStats(): { channels: number, totalUsers: number } {
    let totalUsers = 0

    for (const users of this.presenceUsers.values()) {
      totalUsers += users.size
    }

    return {
      channels: this.presenceUsers.size,
      totalUsers,
    }
  }
}
