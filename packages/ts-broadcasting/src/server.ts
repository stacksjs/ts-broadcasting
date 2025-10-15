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
import type { Buffer } from 'node:buffer'
import type { AckConfig } from './acknowledgments'
import type { BatchConfig } from './batch-operations'
import type { EncryptionConfig } from './encryption'
import type { LoadConfig } from './load-management'
import type { AuthConfig, RateLimitConfig, SecurityConfig } from './middleware'
import type { PersistenceConfig } from './persistence'
import type { HeartbeatConfig } from './presence-heartbeat'
import type { RedisConfig } from './redis-adapter'
import type {
  BroadcastConfig,
  ClientEventMessage,
  PresenceChannelData,
  SubscribeMessage,
  UnsubscribeMessage,
  WebSocketData,
} from './types'
import type { WebhookConfig } from './webhooks'
import process from 'node:process'
import { AcknowledgmentManager } from './acknowledgments'
import { BatchOperationsManager } from './batch-operations'
import { Broadcaster } from './broadcaster'
import { ChannelNamespaceManager, ChannelStateManager } from './channel-state'
import { ChannelManager } from './channels'
import { EncryptionManager } from './encryption'
import { BroadcastHelpers } from './helpers'
import { ChannelLifecycleManager } from './lifecycle-hooks'
import { LoadManager } from './load-management'
import {

  AuthenticationManager,
  MessageValidationManager,
  MonitoringManager,

  RateLimiter,

  SecurityManager,
} from './middleware'
import { PersistenceManager } from './persistence'
import { PresenceHeartbeatManager } from './presence-heartbeat'
import { RedisAdapter } from './redis-adapter'
import { WebhookManager } from './webhooks'

export interface ServerConfig extends BroadcastConfig {
  redis?: RedisConfig
  auth?: AuthConfig
  rateLimit?: RateLimitConfig
  security?: SecurityConfig
  debug?: boolean
  // New advanced features
  encryption?: EncryptionConfig
  webhooks?: WebhookConfig
  persistence?: PersistenceConfig
  heartbeat?: HeartbeatConfig
  acknowledgments?: AckConfig
  batch?: BatchConfig
  loadManagement?: LoadConfig
  queue?: {
    enabled?: boolean
    connection?: string
    defaultQueue?: string
    retry?: {
      attempts?: number
      backoff?: {
        type: 'fixed' | 'exponential'
        delay: number
      }
    }
    deadLetter?: {
      enabled?: boolean
      maxRetries?: number
    }
  }
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

  // New advanced features
  public encryption?: EncryptionManager
  public webhooks?: WebhookManager
  public persistence?: PersistenceManager
  public channelState?: ChannelStateManager
  public namespace?: ChannelNamespaceManager
  public presenceHeartbeat?: PresenceHeartbeatManager
  public acknowledgments?: AcknowledgmentManager
  public batchOps?: BatchOperationsManager
  public lifecycle?: ChannelLifecycleManager
  public loadManager?: LoadManager
  public queueManager?: any // Will be typed as BroadcastQueueManager

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

    // Initialize new advanced features
    if (config.encryption) {
      this.encryption = new EncryptionManager(config.encryption)
    }

    if (config.webhooks) {
      this.webhooks = new WebhookManager(config.webhooks)
    }

    if (config.persistence) {
      this.persistence = new PersistenceManager(config.persistence)
    }

    // Always initialize state and namespace managers (lightweight)
    this.channelState = new ChannelStateManager()
    this.namespace = new ChannelNamespaceManager()

    if (config.heartbeat) {
      this.presenceHeartbeat = new PresenceHeartbeatManager(config.heartbeat)
    }

    if (config.acknowledgments) {
      this.acknowledgments = new AcknowledgmentManager(config.acknowledgments)
    }

    if (config.batch) {
      this.batchOps = new BatchOperationsManager(config.batch, this.channels)
    }

    // Always initialize lifecycle hooks
    this.lifecycle = new ChannelLifecycleManager()

    if (config.loadManagement) {
      this.loadManager = new LoadManager(config.loadManagement)
    }

    // Initialize queue manager if configured
    if (config.queue?.enabled) {
      // Queue manager will be lazy-loaded on first use to avoid import issues
      this.initializeQueueManager()
    }

    // Setup presence heartbeat removal callback
    if (this.presenceHeartbeat) {
      this.presenceHeartbeat.onUserRemove((channel, socketId, user) => {
        // Remove member from presence channel
        this.broadcast(channel, 'member_removed', { id: socketId, user }, socketId)
        if (this.config.verbose) {
          console.warn(`Removed inactive user ${socketId} from ${channel}`)
        }
      })
    }

    // Setup default validators
    this.setupDefaultValidators()
  }

  /**
   * Initialize queue manager (lazy loaded)
   */
  private async initializeQueueManager(): Promise<void> {
    try {
      const { BroadcastQueueManager } = await import('./queue-manager')
      this.queueManager = new BroadcastQueueManager(this, this.config.queue)
      if (this.config.verbose) {
        console.warn('Queue manager initialized')
      }
    }
    catch (error) {
      console.error('Failed to initialize queue manager:', error)
    }
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    // Start presence heartbeat monitoring
    if (this.presenceHeartbeat) {
      this.presenceHeartbeat.start()
      if (this.config.verbose) {
        console.warn('Started presence heartbeat monitoring')
      }
    }

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
        console.warn('Connected to Redis for horizontal scaling')
      }
    }

    const connectionConfig = this.config.connections?.[this.config.default || 'bun']
    if (!connectionConfig) {
      throw new Error('No connection configuration found')
    }

    const host = connectionConfig.host || '0.0.0.0'
    const port = connectionConfig.port ?? 6001

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

        // Prometheus metrics endpoint
        if (url.pathname === '/metrics') {
          const { PrometheusExporter } = await import('./metrics/prometheus')
          const exporter = new PrometheusExporter(this)
          const metrics = await exporter.export()
          return new Response(metrics, {
            headers: {
              'Content-Type': 'text/plain; version=0.0.4',
            },
          })
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
              user: user ?? undefined,
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
      console.warn(`Broadcasting server started on ${host}:${port}`)
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

    // Stop presence heartbeat
    if (this.presenceHeartbeat) {
      this.presenceHeartbeat.stop()
    }

    // Clear pending acknowledgments
    if (this.acknowledgments) {
      this.acknowledgments.clear()
    }

    // Close queue manager
    if (this.queueManager) {
      await this.queueManager.close()
    }

    // Disconnect from Redis
    if (this.redis) {
      this.redis.close()
    }

    if (this.server) {
      this.server.stop()
      this.connections.clear()

      if (this.config.verbose) {
        console.warn('Broadcasting server stopped')
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
    // Check load limits
    if (this.loadManager && !this.loadManager.canAcceptConnection()) {
      ws.close(1008, 'Server at capacity')
      return
    }

    // Check if should shed load
    if (this.loadManager?.shouldShedLoad()) {
      ws.close(1008, 'Server load too high')
      return
    }

    // Register connection with load manager
    if (this.loadManager) {
      this.loadManager.registerConnection(ws.data.socketId)
    }

    this.connections.set(ws.data.socketId, ws)

    // Store in Redis if configured
    if (this.redis) {
      this.redis.storeConnection(ws.data.socketId, {
        connectedAt: ws.data.connectedAt,
        channels: Array.from(ws.data.channels),
        user: ws.data.user,
      }).catch(error => console.error('Redis store connection error:', error))
    }

    // Fire webhook
    if (this.webhooks) {
      this.webhooks.fire('connection', {
        socketId: ws.data.socketId,
        connectedAt: ws.data.connectedAt,
        user: ws.data.user,
      }).catch(error => console.error('Webhook error:', error))
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
      console.warn(`WebSocket connected: ${ws.data.socketId}`)
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

        case 'batch_subscribe':
          await this.handleBatchSubscribe(ws, sanitized)
          break

        case 'batch_unsubscribe':
          await this.handleBatchUnsubscribe(ws, sanitized)
          break

        case 'heartbeat':
        case 'presence_heartbeat':
          await this.handleHeartbeat(ws, sanitized)
          break

        case 'ping':
          this.send(ws, { event: 'pong' })
          break

        default:
          // Handle acknowledgment
          if (this.acknowledgments && sanitized.ack && sanitized.messageId) {
            // Send acknowledgment
            this.send(ws, {
              event: 'ack',
              messageId: sanitized.messageId,
            })
          }

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
      // Check if can subscribe (load management)
      if (this.loadManager && !this.loadManager.canSubscribe(ws.data.socketId)) {
        this.send(ws, {
          event: 'subscription_error',
          channel,
          data: {
            type: 'CapacityError',
            error: 'Subscription limit reached',
            status: 429,
          },
        })
        return
      }

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

      // Register subscription with load manager
      if (this.loadManager) {
        this.loadManager.registerSubscription(ws.data.socketId)
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

      // Fire lifecycle hook - channel created/subscribed
      if (this.lifecycle) {
        const isNewChannel = this.channels.getSubscriberCount(channel) === 1
        if (isNewChannel) {
          await this.lifecycle.channelCreated(channel, ws.data.socketId)
        }
        await this.lifecycle.channelSubscribed(channel, ws.data.socketId, this.channels.getSubscriberCount(channel))
      }

      if (channelType === 'presence') {
        // Register presence heartbeat
        if (this.presenceHeartbeat && typeof result === 'object') {
          this.presenceHeartbeat.heartbeat(channel, ws.data.socketId, result)
        }

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

      // Fire webhook
      if (this.webhooks) {
        this.webhooks.fire('subscribe', {
          socketId: ws.data.socketId,
          channel,
          channelData: channel_data,
        }).catch(error => console.error('Webhook error:', error))
      }

      // Emit subscribe metric
      this.monitoring?.emit({
        type: 'subscribe',
        timestamp: Date.now(),
        socketId: ws.data.socketId,
        channel,
      })

      if (this.config.verbose) {
        console.warn(`Socket ${ws.data.socketId} subscribed to ${channel}`)
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
      console.warn(`Socket ${ws.data.socketId} unsubscribed from ${channel}`)
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
    // Get presence channel member info before unsubscribing
    const presenceMemberInfo: Map<string, any> = new Map()
    for (const channelName of ws.data.channels) {
      const channelType = this.channels.getChannelType(channelName)
      if (channelType === 'presence') {
        const members = this.channels.getPresenceMembers(channelName)
        const memberInfo = members?.get(ws.data.socketId)
        if (memberInfo) {
          presenceMemberInfo.set(channelName, memberInfo)
        }
      }
    }

    // Unsubscribe from all channels
    this.channels.unsubscribeAll(ws)

    // Notify other members about presence channel departures
    for (const [channelName, memberInfo] of presenceMemberInfo) {
      this.broadcast(channelName, 'member_removed', memberInfo, ws.data.socketId)
    }

    // Unregister from load manager
    if (this.loadManager) {
      this.loadManager.unregisterConnection(ws.data.socketId)
    }

    // Remove connection
    this.connections.delete(ws.data.socketId)

    // Remove from Redis if configured
    if (this.redis) {
      this.redis.removeConnection(ws.data.socketId).catch(error =>
        console.error('Redis remove connection error:', error),
      )
    }

    // Fire webhook
    if (this.webhooks) {
      this.webhooks.fire('disconnection', {
        socketId: ws.data.socketId,
        code,
        reason,
      }).catch(error => console.error('Webhook error:', error))
    }

    // Emit disconnection metric
    this.monitoring?.emit({
      type: 'disconnection',
      timestamp: Date.now(),
      socketId: ws.data.socketId,
      data: { code, reason },
    })

    if (this.config.verbose) {
      console.warn(`WebSocket closed: ${ws.data.socketId} (${code}: ${reason})`)
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
      console.warn(`WebSocket drained: ${ws.data.socketId}`)
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
   * Handle batch subscribe
   */
  private async handleBatchSubscribe(ws: ServerWebSocket<WebSocketData>, message: any): Promise<void> {
    if (!this.batchOps) {
      this.send(ws, {
        event: 'error',
        data: {
          type: 'NotSupported',
          error: 'Batch operations are not enabled',
        },
      })
      return
    }

    try {
      const result = await this.batchOps.batchSubscribe(ws, {
        channels: message.channels,
        channelData: message.channelData,
      })

      this.send(ws, {
        event: 'batch_subscribe_result',
        messageId: message.messageId,
        data: result,
      })
    }
    catch (error) {
      this.send(ws, {
        event: 'error',
        data: {
          type: 'BatchError',
          error: error instanceof Error ? error.message : 'Batch subscribe failed',
        },
      })
    }
  }

  /**
   * Handle batch unsubscribe
   */
  private handleBatchUnsubscribe(ws: ServerWebSocket<WebSocketData>, message: any): void {
    if (!this.batchOps) {
      this.send(ws, {
        event: 'error',
        data: {
          type: 'NotSupported',
          error: 'Batch operations are not enabled',
        },
      })
      return
    }

    try {
      const result = this.batchOps.batchUnsubscribe(ws, message.channels)

      this.send(ws, {
        event: 'batch_unsubscribe_result',
        messageId: message.messageId,
        data: result,
      })
    }
    catch (error) {
      this.send(ws, {
        event: 'error',
        data: {
          type: 'BatchError',
          error: error instanceof Error ? error.message : 'Batch unsubscribe failed',
        },
      })
    }
  }

  /**
   * Handle heartbeat (presence channels)
   */
  private async handleHeartbeat(ws: ServerWebSocket<WebSocketData>, message: any): Promise<void> {
    if (!this.presenceHeartbeat) {
      return
    }

    // Update heartbeat for presence channel
    if (message.channel) {
      this.presenceHeartbeat.heartbeat(message.channel, ws.data.socketId)
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

      if (!/^[\w.-]+$/.test(event)) {
        return 'Event name contains invalid characters'
      }

      return true
    })
  }
}
