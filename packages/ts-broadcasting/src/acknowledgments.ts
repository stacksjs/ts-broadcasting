/**
 * Message Acknowledgments
 *
 * Delivery confirmation for critical messages
 */

export interface AckConfig {
  enabled?: boolean
  timeout?: number // Timeout for waiting for ack in ms
  retryAttempts?: number
}

export interface PendingAck {
  messageId: string
  channel: string
  event: string
  data: unknown
  socketId: string
  timestamp: number
  attempts: number
  resolve: (value: boolean) => void
  reject: (reason: Error) => void
}

export class AcknowledgmentManager {
  private config: Required<AckConfig>
  private pendingAcks: Map<string, PendingAck> = new Map()
  private timeouts: Map<string, Timer> = new Map()

  constructor(config: AckConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      timeout: config.timeout ?? 5000,
      retryAttempts: config.retryAttempts ?? 3,
    }
  }

  /**
   * Check if acknowledgments are enabled
   */
  isEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * Register a message awaiting acknowledgment
   */
  register(
    messageId: string,
    channel: string,
    event: string,
    data: unknown,
    socketId: string,
  ): Promise<boolean> {
    if (!this.config.enabled) {
      return Promise.resolve(true)
    }

    return new Promise((resolve, reject) => {
      const pending: PendingAck = {
        messageId,
        channel,
        event,
        data,
        socketId,
        timestamp: Date.now(),
        attempts: 1,
        resolve,
        reject,
      }

      this.pendingAcks.set(messageId, pending)

      // Set timeout
      const timeoutId = setTimeout(() => {
        this.handleTimeout(messageId)
      }, this.config.timeout)

      this.timeouts.set(messageId, timeoutId)
    })
  }

  /**
   * Acknowledge a message
   */
  acknowledge(messageId: string): boolean {
    const pending = this.pendingAcks.get(messageId)
    if (!pending) {
      return false
    }

    // Clear timeout
    const timeoutId = this.timeouts.get(messageId)
    if (timeoutId) {
      clearTimeout(timeoutId)
      this.timeouts.delete(messageId)
    }

    // Resolve promise
    pending.resolve(true)
    this.pendingAcks.delete(messageId)

    return true
  }

  /**
   * Handle acknowledgment timeout
   */
  private handleTimeout(messageId: string): void {
    const pending = this.pendingAcks.get(messageId)
    if (!pending) {
      return
    }

    if (pending.attempts < this.config.retryAttempts) {
      // Retry
      pending.attempts++
      pending.timestamp = Date.now()

      const timeoutId = setTimeout(() => {
        this.handleTimeout(messageId)
      }, this.config.timeout)

      this.timeouts.set(messageId, timeoutId)
    }
    else {
      // Give up
      pending.reject(new Error(`Message acknowledgment timeout after ${pending.attempts} attempts`))
      this.pendingAcks.delete(messageId)
      this.timeouts.delete(messageId)
    }
  }

  /**
   * Get pending acknowledgments
   */
  getPending(): PendingAck[] {
    return Array.from(this.pendingAcks.values())
  }

  /**
   * Get pending acknowledgment by ID
   */
  getPendingById(messageId: string): PendingAck | undefined {
    return this.pendingAcks.get(messageId)
  }

  /**
   * Clear all pending acknowledgments
   */
  clear(): void {
    // Clear all timeouts
    for (const timeoutId of this.timeouts.values()) {
      clearTimeout(timeoutId)
    }

    // Reject all pending
    for (const pending of this.pendingAcks.values()) {
      pending.reject(new Error('Acknowledgment cleared'))
    }

    this.pendingAcks.clear()
    this.timeouts.clear()
  }

  /**
   * Get statistics
   */
  getStats(): { pending: number, oldest?: number } {
    if (this.pendingAcks.size === 0) {
      return { pending: 0 }
    }

    const timestamps = Array.from(this.pendingAcks.values()).map(p => p.timestamp)
    const oldest = Math.min(...timestamps)

    return {
      pending: this.pendingAcks.size,
      oldest,
    }
  }
}
