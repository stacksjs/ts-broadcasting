/**
 * Middleware and Hooks System
 *
 * Provides authentication, rate limiting, validation, and monitoring capabilities
 */

import type { ServerWebSocket } from 'bun'
import type { User, WebSocketData } from './types'
import process from 'node:process'

// ==================== Authentication ====================

export interface AuthConfig {
  enabled?: boolean
  cookie?: {
    name?: string
    secure?: boolean
  }
  jwt?: {
    secret?: string
    algorithm?: 'HS256' | 'HS384' | 'HS512'
  }
  session?: {
    key?: string
  }
}

export type AuthCallback = (req: Request) => Promise<User | null> | User | null

export class AuthenticationManager {
  private callback: AuthCallback | null = null
  private config: Required<AuthConfig>

  constructor(config: AuthConfig = {}) {
    this.config = {
      enabled: config.enabled ?? true,
      cookie: {
        name: config.cookie?.name || 'auth_token',
        secure: config.cookie?.secure ?? true,
      },
      jwt: {
        secret: config.jwt?.secret || process.env.JWT_SECRET || '',
        algorithm: config.jwt?.algorithm || 'HS256',
      },
      session: {
        key: config.session?.key || 'session_id',
      },
    }
  }

  /**
   * Register authentication callback
   */
  authenticate(callback: AuthCallback): void {
    this.callback = callback
  }

  /**
   * Authenticate a request
   */
  async authenticateRequest(req: Request): Promise<User | null> {
    if (!this.config.enabled) {
      return null
    }

    if (this.callback) {
      return await this.callback(req)
    }

    // Default authentication from cookies
    const cookie = req.headers.get('cookie')
    if (cookie) {
      const cookies = this.parseCookies(cookie)
      const token = cookies[this.config.cookie.name as string]

      if (token) {
        // Verify JWT or session token
        return this.verifyToken(token)
      }
    }

    // Try Authorization header
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice(7)
      return this.verifyToken(token)
    }

    return null
  }

  /**
   * Parse cookies from header
   */
  private parseCookies(cookieHeader: string): Record<string, string> {
    const cookies: Record<string, string> = {}

    for (const cookie of cookieHeader.split(';')) {
      const [name, ...rest] = cookie.split('=')
      cookies[name.trim()] = rest.join('=').trim()
    }

    return cookies
  }

  /**
   * Verify token (JWT or session)
   */
  private async verifyToken(token: string): Promise<User | null> {
    // This is a placeholder - implement actual JWT/session verification
    // You would integrate with your auth system here
    try {
      // Example: decode JWT
      const parts = token.split('.')
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]))
        return {
          id: payload.sub || payload.id,
          ...payload,
        }
      }
    }
    catch (error) {
      console.error('Error verifying token:', error)
    }

    return null
  }
}

// ==================== Rate Limiting ====================

export interface RateLimitConfig {
  max: number // Maximum number of messages
  window: number // Time window in milliseconds
  perChannel?: boolean // Rate limit per channel
  perUser?: boolean // Rate limit per user
}

interface RateLimitEntry {
  count: number
  resetAt: number
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map()
  private config: Required<RateLimitConfig>
  private cleanupTimer: Timer

  constructor(config: RateLimitConfig) {
    this.config = {
      max: config.max || 100,
      window: config.window || 60000, // 1 minute default
      perChannel: config.perChannel ?? false,
      perUser: config.perUser ?? false,
    }

    // Cleanup expired entries every minute
    this.cleanupTimer = setInterval(() => this.cleanup(), 60000)
  }

  /**
   * Check if request should be rate limited
   */
  check(ws: ServerWebSocket<WebSocketData>, channel?: string): boolean {
    const key = this.getKey(ws, channel)
    const now = Date.now()
    const entry = this.limits.get(key)

    if (!entry || entry.resetAt < now) {
      // Create new entry
      this.limits.set(key, {
        count: 1,
        resetAt: now + this.config.window,
      })
      return false
    }

    // Check if limit exceeded
    if (entry.count >= this.config.max) {
      return true // Rate limited
    }

    // Increment counter
    entry.count++
    return false
  }

  /**
   * Get remaining requests for a key
   */
  getRemaining(ws: ServerWebSocket<WebSocketData>, channel?: string): number {
    const key = this.getKey(ws, channel)
    const entry = this.limits.get(key)

    if (!entry || entry.resetAt < Date.now()) {
      return this.config.max
    }

    return Math.max(0, this.config.max - entry.count)
  }

  /**
   * Get reset time for a key
   */
  getResetAt(ws: ServerWebSocket<WebSocketData>, channel?: string): number {
    const key = this.getKey(ws, channel)
    const entry = this.limits.get(key)
    return entry?.resetAt || Date.now()
  }

  /**
   * Generate rate limit key
   */
  private getKey(ws: ServerWebSocket<WebSocketData>, channel?: string): string {
    const parts: string[] = []

    if (this.config.perUser && ws.data.user) {
      parts.push(`user:${ws.data.user.id}`)
    }
    else {
      parts.push(`socket:${ws.data.socketId}`)
    }

    if (this.config.perChannel && channel) {
      parts.push(`channel:${channel}`)
    }

    return parts.join(':')
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now()

    for (const [key, entry] of this.limits.entries()) {
      if (entry.resetAt < now) {
        this.limits.delete(key)
      }
    }
  }

  /**
   * Clear all rate limits
   */
  clear(): void {
    this.limits.clear()
  }

  /**
   * Stop cleanup timer
   */
  stop(): void {
    clearInterval(this.cleanupTimer)
  }
}

// ==================== Message Validation ====================

export type MessageValidator = (message: unknown) => boolean | string

export class MessageValidationManager {
  private validators: Set<MessageValidator> = new Set()

  /**
   * Register a message validator
   */
  addValidator(validator: MessageValidator): void {
    this.validators.add(validator)
  }

  /**
   * Remove a validator
   */
  removeValidator(validator: MessageValidator): void {
    this.validators.delete(validator)
  }

  /**
   * Validate a message
   */
  validate(message: unknown): { valid: boolean, error?: string } {
    for (const validator of this.validators) {
      const result = validator(message)

      if (result === false) {
        return { valid: false, error: 'Validation failed' }
      }

      if (typeof result === 'string') {
        return { valid: false, error: result }
      }
    }

    return { valid: true }
  }
}

// ==================== Monitoring and Metrics ====================

export interface MetricEvent {
  type: 'connection' | 'disconnection' | 'message' | 'subscribe' | 'unsubscribe' | 'error' | 'broadcast'
  timestamp: number
  socketId: string
  channel?: string
  data?: unknown
}

export type MetricCallback = (event: MetricEvent) => void

export class MonitoringManager {
  private callbacks: Map<string, Set<MetricCallback>> = new Map()
  private metrics: Map<string, number> = new Map()

  /**
   * Register a monitoring callback
   */
  on(event: MetricEvent['type'] | 'all', callback: MetricCallback): void {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, new Set())
    }

    this.callbacks.get(event)!.add(callback)
  }

  /**
   * Remove a monitoring callback
   */
  off(event: MetricEvent['type'] | 'all', callback: MetricCallback): void {
    const callbacks = this.callbacks.get(event)
    if (callbacks) {
      callbacks.delete(callback)
    }
  }

  /**
   * Emit a metric event
   */
  emit(event: MetricEvent): void {
    // Increment metric counter
    this.incrementMetric(event.type)

    // Call type-specific callbacks
    const typeCallbacks = this.callbacks.get(event.type)
    if (typeCallbacks) {
      for (const callback of typeCallbacks) {
        callback(event)
      }
    }

    // Call 'all' callbacks
    const allCallbacks = this.callbacks.get('all')
    if (allCallbacks) {
      for (const callback of allCallbacks) {
        callback(event)
      }
    }
  }

  /**
   * Increment a metric counter
   */
  incrementMetric(metric: string, amount: number = 1): void {
    const current = this.metrics.get(metric) || 0
    this.metrics.set(metric, current + amount)
  }

  /**
   * Get a metric value
   */
  getMetric(metric: string): number {
    return this.metrics.get(metric) || 0
  }

  /**
   * Get all metrics
   */
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics)
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics.clear()
  }
}

// ==================== Security ====================

export interface SecurityConfig {
  cors?: {
    enabled?: boolean
    origins?: string[]
    credentials?: boolean
  }
  maxPayloadSize?: number
  sanitizeMessages?: boolean
}

export class SecurityManager {
  private config: Required<SecurityConfig>

  constructor(config: SecurityConfig = {}) {
    this.config = {
      cors: {
        enabled: config.cors?.enabled ?? true,
        origins: config.cors?.origins || ['*'],
        credentials: config.cors?.credentials ?? true,
      },
      maxPayloadSize: config.maxPayloadSize || 1024 * 1024, // 1 MB
      sanitizeMessages: config.sanitizeMessages ?? true,
    }
  }

  /**
   * Check CORS origin
   */
  checkOrigin(origin: string): boolean {
    if (!this.config.cors?.enabled) {
      return true
    }

    if (this.config.cors.origins?.includes('*')) {
      return true
    }

    return this.config.cors.origins?.includes(origin) ?? false
  }

  /**
   * Sanitize message data
   */
  sanitize(data: unknown): unknown {
    if (!this.config.sanitizeMessages) {
      return data
    }

    if (typeof data === 'string') {
      // Basic XSS prevention
      return data
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitize(item))
    }

    if (data && typeof data === 'object') {
      const sanitized: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(data)) {
        sanitized[key] = this.sanitize(value)
      }
      return sanitized
    }

    return data
  }

  /**
   * Check message size
   */
  checkSize(message: string): boolean {
    return message.length <= this.config.maxPayloadSize
  }
}
