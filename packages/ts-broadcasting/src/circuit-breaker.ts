/**
 * Circuit Breaker Pattern
 *
 * Prevents cascading failures by temporarily blocking requests to failing services
 */

export interface CircuitBreakerConfig {
  /**
   * Number of failures before opening the circuit
   */
  failureThreshold?: number

  /**
   * Time window for counting failures (ms)
   */
  failureWindow?: number

  /**
   * Time to wait before attempting to close the circuit (ms)
   */
  resetTimeout?: number

  /**
   * Number of successful requests needed to close the circuit
   */
  successThreshold?: number

  /**
   * Timeout for operations (ms)
   */
  timeout?: number
}

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerStats {
  state: CircuitState
  failures: number
  successes: number
  totalRequests: number
  lastFailureTime: number | null
  lastSuccessTime: number | null
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED'
  private failures = 0
  private successes = 0
  private totalRequests = 0
  private lastFailureTime: number | null = null
  private lastSuccessTime: number | null = null
  private resetTimer: Timer | null = null
  private failureTimestamps: number[] = []

  private config: Required<CircuitBreakerConfig>

  constructor(
    private name: string,
    config?: CircuitBreakerConfig,
  ) {
    this.config = {
      failureThreshold: config?.failureThreshold ?? 5,
      failureWindow: config?.failureWindow ?? 60000, // 1 minute
      resetTimeout: config?.resetTimeout ?? 60000, // 1 minute
      successThreshold: config?.successThreshold ?? 2,
      timeout: config?.timeout ?? 30000, // 30 seconds
    }
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      throw new CircuitBreakerError(`Circuit breaker is OPEN for ${this.name}`)
    }

    this.totalRequests++

    try {
      // Execute with timeout
      const result = await this.executeWithTimeout(fn)

      this.onSuccess()
      return result
    }
    catch (error) {
      this.onFailure()
      throw error
    }
  }

  /**
   * Execute function with timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${this.config.timeout}ms`))
        }, this.config.timeout)
      }),
    ])
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failures = 0
    this.successes++
    this.lastSuccessTime = Date.now()

    if (this.state === 'HALF_OPEN') {
      if (this.successes >= this.config.successThreshold) {
        this.close()
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++
    this.lastFailureTime = Date.now()
    this.failureTimestamps.push(Date.now())

    // Clean old failure timestamps
    this.cleanOldFailures()

    // Check if we should open the circuit
    if (this.failureTimestamps.length >= this.config.failureThreshold) {
      this.open()
    }
  }

  /**
   * Remove failure timestamps outside the failure window
   */
  private cleanOldFailures(): void {
    const cutoff = Date.now() - this.config.failureWindow
    this.failureTimestamps = this.failureTimestamps.filter(ts => ts > cutoff)
  }

  /**
   * Open the circuit
   */
  private open(): void {
    this.state = 'OPEN'
    this.successes = 0

    console.warn(`Circuit breaker OPENED for ${this.name}`)

    // Schedule automatic transition to HALF_OPEN
    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
    }

    this.resetTimer = setTimeout(() => {
      this.halfOpen()
    }, this.config.resetTimeout)
  }

  /**
   * Transition to half-open state
   */
  private halfOpen(): void {
    this.state = 'HALF_OPEN'
    this.successes = 0
    this.failures = 0
    this.failureTimestamps = []

    console.warn(`Circuit breaker HALF_OPEN for ${this.name}`)
  }

  /**
   * Close the circuit
   */
  private close(): void {
    this.state = 'CLOSED'
    this.failures = 0
    this.successes = 0
    this.failureTimestamps = []

    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
      this.resetTimer = null
    }

    console.log(`Circuit breaker CLOSED for ${this.name}`)
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.close()
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === 'OPEN'
  }

  /**
   * Get statistics
   */
  getStats(): CircuitBreakerStats {
    this.cleanOldFailures()

    return {
      state: this.state,
      failures: this.failureTimestamps.length,
      successes: this.successes,
      totalRequests: this.totalRequests,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    }
  }

  /**
   * Cleanup timers
   */
  destroy(): void {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer)
      this.resetTimer = null
    }
  }
}

/**
 * Circuit Breaker Error
 */
export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CircuitBreakerError'
  }
}

/**
 * Circuit Breaker Manager
 *
 * Manages multiple circuit breakers for different services
 */
export class CircuitBreakerManager {
  private breakers: Map<string, CircuitBreaker> = new Map()
  private defaultConfig?: CircuitBreakerConfig

  constructor(defaultConfig?: CircuitBreakerConfig) {
    this.defaultConfig = defaultConfig
  }

  /**
   * Get or create a circuit breaker
   */
  getBreaker(name: string, config?: CircuitBreakerConfig): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, config || this.defaultConfig))
    }

    return this.breakers.get(name)!
  }

  /**
   * Execute through a named circuit breaker
   */
  async execute<T>(name: string, fn: () => Promise<T>, config?: CircuitBreakerConfig): Promise<T> {
    const breaker = this.getBreaker(name, config)
    return breaker.execute(fn)
  }

  /**
   * Get all circuit breaker stats
   */
  getStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {}

    for (const [name, breaker] of this.breakers) {
      stats[name] = breaker.getStats()
    }

    return stats
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset()
    }
  }

  /**
   * Cleanup all circuit breakers
   */
  destroy(): void {
    for (const breaker of this.breakers.values()) {
      breaker.destroy()
    }

    this.breakers.clear()
  }
}
