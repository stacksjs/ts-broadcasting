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

export class BroadcastServer {
  private server?: BunServer
  private connections: Map<string, ServerWebSocket<WebSocketData>> = new Map()
  public channels: ChannelManager
  private config: BroadcastConfig

  constructor(config: BroadcastConfig) {
    this.config = config
    this.channels = new ChannelManager()
  }

  /**
   * Start the WebSocket server
   */
  async start(): Promise<void> {
    const connectionConfig = this.config.connections?.[this.config.default || 'bun']
    if (!connectionConfig) {
      throw new Error('No connection configuration found')
    }

    const host = connectionConfig.host || '0.0.0.0'
    const port = connectionConfig.port || 6001

    this.server = Bun.serve({
      hostname: host,
      port,

      fetch: (req, server) => {
        const url = new URL(req.url)

        // Health check endpoint
        if (url.pathname === '/health') {
          return new Response('OK', {
            headers: { 'Content-Type': 'text/plain' },
          })
        }

        // Stats endpoint
        if (url.pathname === '/stats') {
          return Response.json({
            connections: this.connections.size,
            channels: this.channels.getChannelCount(),
            uptime: process.uptime(),
          })
        }

        // WebSocket upgrade
        if (url.pathname === '/app' || url.pathname === '/ws') {
          const success = server.upgrade(req, {
            data: {
              id: crypto.randomUUID(),
              socketId: crypto.randomUUID(),
              channels: new Set<string>(),
              connectedAt: Date.now(),
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
  }

  /**
   * Stop the WebSocket server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.stop()
      this.connections.clear()

      if (this.config.verbose) {
        console.log('Broadcasting server stopped')
      }
    }
  }

  /**
   * Handle WebSocket connection open
   */
  private handleOpen(ws: ServerWebSocket<WebSocketData>): void {
    this.connections.set(ws.data.socketId, ws)

    // Send connection established message
    this.send(ws, {
      event: 'connection_established',
      data: {
        socket_id: ws.data.socketId,
        activity_timeout: this.config.connections?.[this.config.default || 'bun']?.options?.idleTimeout || 120,
      },
    })

    if (this.config.verbose) {
      console.log(`WebSocket connected: ${ws.data.socketId}`)
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private async handleMessage(ws: ServerWebSocket<WebSocketData>, message: string | Buffer): Promise<void> {
    try {
      const data = typeof message === 'string' ? message : message.toString()
      const parsed = JSON.parse(data)

      switch (parsed.event) {
        case 'subscribe':
          await this.handleSubscribe(ws, parsed as SubscribeMessage)
          break

        case 'unsubscribe':
          await this.handleUnsubscribe(ws, parsed as UnsubscribeMessage)
          break

        case 'ping':
          this.send(ws, { event: 'pong' })
          break

        default:
          // Client events (whisper)
          if (parsed.event.startsWith('client-')) {
            await this.handleClientEvent(ws, parsed as ClientEventMessage)
          }
          break
      }
    }
    catch (error) {
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

    this.channels.unsubscribe(ws, channel)

    // Notify other members if presence channel
    if (channelType === 'presence' && memberInfo) {
      this.broadcast(channel, 'member_removed', memberInfo, ws.data.socketId)
    }

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

    if (this.config.verbose) {
      console.log(`WebSocket closed: ${ws.data.socketId} (${code}: ${reason})`)
    }
  }

  /**
   * Handle WebSocket error
   */
  private handleError(ws: ServerWebSocket<WebSocketData>, error: Error): void {
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
}
