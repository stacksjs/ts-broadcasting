/**
 * Webhooks System
 *
 * Fire HTTP webhooks on specific events
 */

import { Buffer } from 'node:buffer'

export interface WebhookConfig {
  enabled?: boolean
  endpoints?: WebhookEndpoint[]
  retryAttempts?: number
  retryDelay?: number
  timeout?: number
  secret?: string // For HMAC signature verification
}

export interface WebhookEndpoint {
  url: string
  events: WebhookEvent[]
  headers?: Record<string, string>
  method?: 'POST' | 'PUT'
}

export type WebhookEvent =
  | 'connection'
  | 'disconnection'
  | 'subscribe'
  | 'unsubscribe'
  | 'broadcast'
  | 'presence_join'
  | 'presence_leave'
  | 'client_event'

export interface WebhookPayload {
  event: WebhookEvent
  timestamp: number
  data: unknown
  signature?: string
}

export class WebhookManager {
  private config: Required<WebhookConfig>
  private endpoints: WebhookEndpoint[]

  constructor(config: WebhookConfig = {}) {
    this.config = {
      enabled: config.enabled ?? false,
      endpoints: config.endpoints || [],
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      timeout: config.timeout ?? 5000,
      secret: config.secret || '',
    }

    this.endpoints = this.config.endpoints
  }

  /**
   * Register a webhook endpoint
   */
  register(endpoint: WebhookEndpoint): void {
    this.endpoints.push(endpoint)
  }

  /**
   * Fire a webhook event
   */
  async fire(event: WebhookEvent, data: unknown): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    const payload: WebhookPayload = {
      event,
      timestamp: Date.now(),
      data,
    }

    // Add HMAC signature if secret is configured
    if (this.config.secret) {
      payload.signature = await this.generateSignature(payload)
    }

    // Fire to all matching endpoints
    const promises = this.endpoints
      .filter(endpoint => endpoint.events.includes(event))
      .map(endpoint => this.sendWebhook(endpoint, payload))

    await Promise.allSettled(promises)
  }

  /**
   * Send webhook to endpoint with retry logic
   */
  private async sendWebhook(
    endpoint: WebhookEndpoint,
    payload: WebhookPayload,
    attempt = 1,
  ): Promise<void> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), this.config.timeout)

      const response = await fetch(endpoint.url, {
        method: endpoint.method || 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ts-broadcasting/1.0',
          'X-Webhook-Signature': payload.signature || '',
          ...endpoint.headers,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      // Don't retry on 4xx errors (client errors)
      const shouldRetry = !response.ok && response.status >= 500
      if (shouldRetry && attempt <= this.config.retryAttempts) {
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt))
        return this.sendWebhook(endpoint, payload, attempt + 1)
      }
    }
    catch {
      if (attempt <= this.config.retryAttempts) {
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelay * attempt))
        return this.sendWebhook(endpoint, payload, attempt + 1)
      }

      // Silent fail - don't throw errors from webhooks
    }
  }

  /**
   * Generate HMAC signature for webhook payload
   */
  private async generateSignature(payload: WebhookPayload): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(JSON.stringify(payload))
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.config.secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )

    const signature = await crypto.subtle.sign('HMAC', key, data)
    return Buffer.from(signature).toString('hex')
  }

  /**
   * Verify webhook signature
   */
  async verifySignature(payload: WebhookPayload, signature: string): Promise<boolean> {
    if (!this.config.secret) {
      return true
    }

    const expected = await this.generateSignature(payload)
    return signature === expected
  }
}
