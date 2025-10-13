/**
 * Broadcasting Server
 *
 * A high-performance WebSocket broadcasting server with optional advanced features:
 * - Redis horizontal scaling
 * - Authentication
 * - Rate limiting
 * - Monitoring and metrics
 * - Message validation
 * - Security features
 */

import type { Server as BunServer, ServerWebSocket } from 'bun'
import type {
  BroadcastConfig,
  ClientEventMessage,
  PresenceChannelData,
  SubscribeMessage,
  UnsubscribeMessage,
  WebSocketData,
} from './types'
import { ChannelManager } from './channels'
import { Broadcaster } from './broadcaster'
import { BroadcastHelpers } from './helpers'
import { RedisAdapter, type RedisConfig } from './redis-adapter'
import {
  AuthenticationManager,
  MessageValidationManager,
  MonitoringManager,
  RateLimiter,
  SecurityManager,
  type AuthConfig,
  type RateLimitConfig,
  type SecurityConfig,
} from './middleware'

export interface ServerConfig extends BroadcastConfig {
  redis?: RedisConfig
  auth?: AuthConfig
  rateLimit?: RateLimitConfig
  security?: SecurityConfig
  debug?: boolean
}

export class BroadcastServer {
  private server?: BunServer
  private connections: Map<string, ServerWebSocket<WebSocketData>> = new Map()
  private config: ServerConfig

  // Core features
  public channels: ChannelManager
  public broadcaster: Broadcaster
  public helpers: BroadcastHelpers

  // Optional features (only initialized if configured)
  public redis?: RedisAdapter
  public auth?: AuthenticationManager
  public rateLimit?: RateLimiter
  public monitoring?: MonitoringManager
  public validator?: MessageValidationManager
  public security?: SecurityManager

  constructor(config: ServerConfig) {
    this.config = config
    this.channels = new ChannelManager()
    this.broadcaster = new Broadcaster(this, config)
    this.helpers = new BroadcastHelpers(this, this.broadcaster)

    // Initialize optional features based on configuration
    if (config.auth) {
      this.auth = new AuthenticationManager(config.auth)
    }

    if (config.rateLimit) {
      this.rateLimit = new RateLimiter(config.rateLimit)
    }

    if (config.security) {
      this.security = new SecurityManager(config.security)
    }

    // Always initialize monitoring and validation (lightweight)
    this.monitoring = new MonitoringManager()
    this.validator = new MessageValidationManager()

    // Setup default validators
    this.setupDefaultValidators()
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    // Connect to Redis if configured
    if (this.config.redis) {
      this.redis = new RedisAdapter(this.config.redis)
      await this.redis.connect()

      // Handle Redis messages for horizontal scaling
      this.redis.onMessage((message) => {
        if (message.type === 'broadcast') {
          // Broadcast to local subscribers (excluding the originating socket)
          this.broadcast(message.channel, message.event, message.data, message.socketId)
        }
      })

      if (this.config.verbose) {
        console.log('Connected to Redis for horizontal scaling')
      }
    }

    const connectionConfig = this.config.connections?.[this.config.default || 'bun']
    if (!connectionConfig) {
      throw new Error('No connection configuration found')
    }

    const host = connectionConfig.host || '0.0.0.0'
    const port = connectionConfig.port || 6001

    this.server = Bun.serve({
      hostname: host,
      port,

      fetch: async (req, server) => {
        const url = new URL(req.url)

        // Health check endpoint
        if (url.pathname === '/health') {
          const health = {
            status: 'ok',
            redis: this.redis ? await this.redis.healthCheck() : null,
          }
          return Response.json(health)
        }

        // Stats endpoint
        if (url.pathname === '/stats') {
          return Response.json(await this.getStats())
        }

        // WebSocket upgrade
        if (url.pathname === '/app' || url.pathname === '/ws') {
          // Authenticate if enabled
          let user = null
          if (this.auth) {
            user = await this.auth.authenticateRequest(req)
          }

          const success = server.upgrade(req, {
            data: {
              id: crypto.randomUUID(),
              socketId: crypto.randomUUID(),
              channels: new Set<string>(),
              connectedAt: Date.now(),
              user,
            } satisfies WebSocketData,
          })

          if (success) {
            return undefined
          }

          return new Response('WebSocket upgrade failed', { status: 400 })
        }

        return new Response('Not found', { status: 404 })
      },

      websocket: {
        open: (ws: ServerWebSocket<WebSocketData>) => {
          this.handleOpen(ws)
        },

        message: (ws: ServerWebSocket<WebSocketData>, message: string | Buffer) => {
          this.handleMessage(ws, message)
        },

        close: (ws: ServerWebSocket<WebSocketData>, code: number, reason: string) => {
          this.handleClose(ws, code, reason)
        },

        error: (ws: ServerWebSocket<WebSocketData>, error: Error) => {
          this.handleError(ws, error)
        },

        drain: (ws: ServerWebSocket<WebSocketData>) => {
          this.handleDrain(ws)
        },

        // Apply connection options
        idleTimeout: connectionConfig.options?.idleTimeout,
        maxPayloadLength: connectionConfig.options?.maxPayloadLength,
        backpressureLimit: connectionConfig.options?.backpressureLimit,
        closeOnBackpressureLimit: connectionConfig.options?.closeOnBackpressureLimit,
        sendPings: connectionConfig.options?.sendPings,
        perMessageDeflate: connectionConfig.options?.perMessageDeflate,
      },
    })

    if (this.config.verbose) {
      console.log(`Broadcasting server started on ${host}:${port}`)
    }

    // Emit server start metric
    this.monitoring?.emit({
      type: 'connection',
      timestamp: Date.now(),
      socketId: 'server',
      data: { event: 'server_start' },
    })
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    // Cleanup rate limiter
    if (this.rateLimit) {
      this.rateLimit.stop()
    }

    // Disconnect from Redis
    if (this.redis) {
      this.redis.close()
    }

    if (this.server) {
      this.server.stop()
      this.connections.clear()

      if (this.config.verbose) {
        console.log('Broadcasting server stopped')
      }
    }

    // Emit server stop metric
    this.monitoring?.emit({
      type: 'disconnection',
      timestamp: Date.now(),
      socketId: 'server',
      data: { event: 'server_stop' },
    })
  }

  /**
   * Handle WebSocket connection open
   */
  private handleOpen(ws: ServerWebSocket<WebSocketData>): void {
    this.connections.set(ws.data.socketId, ws)

    // Store in Redis if configured
    if (this.redis) {
      this.redis.storeConnection(ws.data.socketId, {
        connectedAt: ws.data.connectedAt,
        channels: Array.from(ws.data.channels),
        user: ws.data.user,
      }).catch(error => console.error('Redis store connection error:', error))
    }

    // Send connection established message
    this.send(ws, {
      event: 'connection_established',
      data: {
        socket_id: ws.data.socketId,
        activity_timeout: this.config.connections?.[this.config.default || 'bun']?.options?.idleTimeout || 120,
      },
    })

    // Emit connection metric
    this.monitoring?.emit({
      type: 'connection',
      timestamp: Date.now(),
      socketId: ws.data.socketId,
    })

    if (this.config.verbose) {
      console.log(`WebSocket connected: ${ws.data.socketId}`)
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(ws: ServerWebSocket<WebSocketData>, message: string | Buffer): Promise<void> {
    // Check rate limit
    if (this.rateLimit && this.rateLimit.check(ws)) {
      this.send(ws, {
        event: 'error',
        data: {
          type: 'RateLimitExceeded',
          error: 'Too many requests',
          retryAfter: this.rateLimit.getResetAt(ws),
        },
      })
      return
    }

    // Check message size
    const messageStr = typeof message === 'string' ? message : message.toString()
    if (this.security && !this.security.checkSize(messageStr)) {
      this.send(ws, {
        event: 'error',
        data: {
          type: 'PayloadTooLarge',
          error: 'Message size exceeds maximum allowed',
        },
      })
      return
    }

    try {
      const data = JSON.parse(messageStr)

      // Validate message
      if (this.validator) {
        const validation = this.validator.validate(data)
        if (!validation.valid) {
          this.send(ws, {
            event: 'error',
            data: {
              type: 'ValidationError',
              error: validation.error,
            },
          })
          return
        }
      }

      // Sanitize data
      const sanitized = this.security ? this.security.sanitize(data) as any : data

      // Emit message metric
      this.monitoring?.emit({
        type: 'message',
        timestamp: Date.now(),
        socketId: ws.data.socketId,
        data: { event: sanitized.event },
      })

      // Handle the message
      switch (sanitized.event) {
        case 'subscribe':
          await this.handleSubscribe(ws, sanitized as SubscribeMessage)
          break

        case 'unsubscribe':
          await this.handleUnsubscribe(ws, sanitized as UnsubscribeMessage)
          break

        case 'ping':
          this.send(ws, { event: 'pong' })
          break

        default:
          // Client events (whisper)
          if (sanitized.event.startsWith('client-')) {
            await this.handleClientEvent(ws, sanitized as ClientEventMessage)
          }
          break
      }
    }
    catch (error) {
      this.monitoring?.emit({
        type: 'error',
        timestamp: Date.now(),
        socketId: ws.data.socketId,
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
      })

      if (this.config.verbose) {
        console.error('Error handling message:', error)
      }
    }
  }

  /**
   * Handle channel subscription
   */
  private async handleSubscribe(ws: ServerWebSocket<WebSocketData>, message: SubscribeMessage): Promise<void> {
    const { channel, channel_data } = message

    try {
      const result = await this.channels.subscribe(ws, channel, channel_data)

      if (!result) {
        // Subscription failed
        this.send(ws, {
          event: 'subscription_error',
          channel,
          data: {
            type: 'AuthError',
            error: 'Unauthorized',
            status: 401,
          },
        })
        return
      }

      // Store in Redis if configured
      if (this.redis) {
        await this.redis.storeChannel(channel, ws.data.socketId)

        const channelType = this.channels.getChannelType(channel)
        if (channelType === 'presence' && typeof result === 'object') {
          await this.redis.storePresenceMember(channel, ws.data.socketId, result)
        }
      }

      // Subscription succeeded
      const channelType = this.channels.getChannelType(channel)

      if (channelType === 'presence') {
        // Send presence data
        const members = this.channels.getPresenceMembers(channel)
        const presenceData: PresenceChannelData = {
          presence: {
            ids: Array.from(members?.keys() || []),
            hash: Object.fromEntries(members || []),
            count: members?.size || 0,
          },
        }

        this.send(ws, {
          event: 'subscription_succeeded',
          channel,
          data: presenceData,
        })

        // Notify other members
        if (typeof result === 'object') {
          this.broadcast(
            channel,
            'member_added',
            result,
            ws.data.socketId,
          )
        }
      }
      else {
        this.send(ws, {
          event: 'subscription_succeeded',
          channel,
        })
      }

      // Emit subscribe metric
      this.monitoring?.emit({
        type: 'subscribe',
        timestamp: Date.now(),
        socketId: ws.data.socketId,
        channel,
      })

      if (this.config.verbose) {
        console.log(`Socket ${ws.data.socketId} subscribed to ${channel}`)
      }
    }
    catch (error) {
      this.send(ws, {
        event: 'subscription_error',
        channel,
        data: {
          type: 'ServerError',
          error: error instanceof Error ? error.message : 'Internal server error',
          status: 500,
        },
      })
    }
  }

  /**
   * Handle channel unsubscription
   */
  private async handleUnsubscribe(ws: ServerWebSocket<WebSocketData>, message: UnsubscribeMessage): Promise<void> {
    const { channel } = message
    const channelType = this.channels.getChannelType(channel)

    // Get member info before unsubscribing (for presence channels)
    let memberInfo = null
    if (channelType === 'presence') {
      const members = this.channels.getPresenceMembers(channel)
      memberInfo = members?.get(ws.data.socketId)
    }

    // Remove from Redis if configured
    if (this.redis) {
      await this.redis.removeChannel(channel, ws.data.socketId)
      if (channelType === 'presence') {
        await this.redis.removePresenceMember(channel, ws.data.socketId)
      }
    }

    this.channels.unsubscribe(ws, channel)

    // Notify other members if presence channel
    if (channelType === 'presence' && memberInfo) {
      this.broadcast(channel, 'member_removed', memberInfo, ws.data.socketId)
    }

    // Emit unsubscribe metric
    this.monitoring?.emit({
      type: 'unsubscribe',
      timestamp: Date.now(),
      socketId: ws.data.socketId,
      channel,
    })

    if (this.config.verbose) {
      console.log(`Socket ${ws.data.socketId} unsubscribed from ${channel}`)
    }
  }

  /**
   * Handle client events (whisper)
   */
  private async handleClientEvent(ws: ServerWebSocket<WebSocketData>, message: ClientEventMessage): Promise<void> {
    const { event, channel, data } = message

    // Only allow client events on private/presence channels
    const channelType = this.channels.getChannelType(channel)
    if (channelType === 'public') {
      return
    }

    // Broadcast to other subscribers
    this.broadcast(channel, event, data, ws.data.socketId)
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(ws: ServerWebSocket<WebSocketData>, code: number, reason: string): void {
    // Unsubscribe from all channels
    this.channels.unsubscribeAll(ws)

    // Remove connection
    this.connections.delete(ws.data.socketId)

    // Remove from Redis if configured
    if (this.redis) {
      this.redis.removeConnection(ws.data.socketId).catch(error =>
        console.error('Redis remove connection error:', error),
      )
    }

    // Emit disconnection metric
    this.monitoring?.emit({
      type: 'disconnection',
      timestamp: Date.now(),
      socketId: ws.data.socketId,
      data: { code, reason },
    })

    if (this.config.verbose) {
      console.log(`WebSocket closed: ${ws.data.socketId} (${code}: ${reason})`)
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(ws: ServerWebSocket<WebSocketData>, error: Error): void {
    this.monitoring?.emit({
      type: 'error',
      timestamp: Date.now(),
      socketId: ws.data.socketId,
      data: { error: error.message },
    })

    if (this.config.verbose) {
      console.error(`WebSocket error for ${ws.data.socketId}:`, error)
    }
  }

  /**
   * Handle WebSocket drain
   */
  private handleDrain(ws: ServerWebSocket<WebSocketData>): void {
    // Socket is ready to receive more data
    if (this.config.verbose) {
      console.log(`WebSocket drained: ${ws.data.socketId}`)
    }
  }

  /**
   * Send a message to a specific WebSocket
   */
  private send(ws: ServerWebSocket<WebSocketData>, message: unknown): number {
    return ws.send(JSON.stringify(message))
  }

  /**
   * Broadcast a message to all subscribers of a channel
   */
  broadcast(channel: string, event: string, data: unknown, excludeSocketId?: string): void {
    const message = JSON.stringify({
      event,
      channel,
      data,
    })

    if (this.server) {
      // Use Bun's efficient publish method
      if (excludeSocketId) {
        // Send to all except one socket
        const subscribers = this.channels.getSubscribers(channel)
        for (const socketId of subscribers) {
          if (socketId !== excludeSocketId) {
            const ws = this.connections.get(socketId)
            if (ws) {
              ws.send(message)
            }
          }
        }
      }
      else {
        // Send to all subscribers
        this.server.publish(channel, message)
      }
    }

    // Broadcast to Redis for horizontal scaling
    if (this.redis) {
      this.redis.broadcast(channel, event, data, excludeSocketId).catch((error) => {
        console.error('Redis broadcast error:', error)
      })
    }

    // Emit broadcast metric
    this.monitoring?.emit({
      type: 'broadcast',
      timestamp: Date.now(),
      socketId: excludeSocketId || 'server',
      channel,
      data: { event, dataSize: JSON.stringify(data).length },
    })
  }

  /**
   * Get connection count
   */
  getConnectionCount(): number {
    return this.connections.size
  }

  /**
   * Get subscriber count for a channel
   */
  getSubscriberCount(channel: string): number {
    return this.channels.getSubscriberCount(channel)
  }

  /**
   * Get server statistics
   */
  async getStats(): Promise<Record<string, any>> {
    const baseStats = {
      connections: this.getConnectionCount(),
      channels: this.channels.getChannelCount(),
      uptime: process.uptime(),
    }

    if (this.redis) {
      const redisStats = {
        totalConnections: await this.redis.getTotalConnections(),
        totalChannels: await this.redis.getTotalChannels(),
        redisHealthy: await this.redis.healthCheck(),
        serverId: this.redis.getServerId(),
      }

      return {
        ...baseStats,
        ...redisStats,
        metrics: this.monitoring?.getMetrics() || {},
      }
    }

    return {
      ...baseStats,
      metrics: this.monitoring?.getMetrics() || {},
    }
  }

  /**
   * Setup default message validators
   */
  private setupDefaultValidators(): void {
    if (!this.validator) {
      return
    }

    // Validate message structure
    this.validator.addValidator((message: any) => {
      if (!message || typeof message !== 'object') {
        return 'Invalid message format'
      }

      if (!message.event || typeof message.event !== 'string') {
        return 'Missing or invalid event name'
      }

      if (message.channel && typeof message.channel !== 'string') {
        return 'Invalid channel name'
      }

      return true
    })

    // Validate event names
    this.validator.addValidator((message: any) => {
      const event = message.event
      if (event.length > 100) {
        return 'Event name too long'
      }

      if (!/^[a-zA-Z0-9._-]+$/.test(event)) {
        return 'Event name contains invalid characters'
      }

      return true
    })
  }
}
