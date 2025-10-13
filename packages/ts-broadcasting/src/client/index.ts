/**
 * Client-side Broadcasting SDK
 *
 * A TypeScript/JavaScript client library for connecting to the broadcasting server
 * Similar to Laravel Echo but optimized for our Bun-based broadcasting system
 */

export interface EchoConfig {
  broadcaster: 'bun' | 'reverb' | 'pusher' | 'ably'
  host?: string
  port?: number
  scheme?: 'ws' | 'wss'
  key?: string
  cluster?: string
  encrypted?: boolean
  auth?: {
    headers?: Record<string, string>
    endpoint?: string
  }
  autoConnect?: boolean
  reconnect?: boolean
  reconnectDelay?: number
  maxReconnectAttempts?: number
}

export type EventCallback<T = any> = (data: T) => void

export interface ChannelCallbacks {
  subscription_succeeded?: (data: any) => void
  subscription_error?: (error: any) => void
  [event: string]: EventCallback | undefined
}

export interface PresenceChannelCallbacks extends ChannelCallbacks {
  here?: (members: any[]) => void
  joining?: (member: any) => void
  leaving?: (member: any) => void
  error?: (error: any) => void
}

export class Echo {
  private ws: WebSocket | null = null
  private config: Required<EchoConfig>
  private channels: Map<string, ChannelInstance> = new Map()
  private socketId: string | null = null
  private reconnectAttempts = 0
  private reconnectTimer: Timer | null = null
  private messageQueue: string[] = []

  constructor(config: EchoConfig) {
    this.config = {
      broadcaster: config.broadcaster || 'bun',
      host: config.host || 'localhost',
      port: config.port || 6001,
      scheme: config.scheme || 'ws',
      key: config.key || '',
      cluster: config.cluster || '',
      encrypted: config.encrypted ?? false,
      auth: config.auth || {},
      autoConnect: config.autoConnect ?? true,
      reconnect: config.reconnect ?? true,
      reconnectDelay: config.reconnectDelay || 1000,
      maxReconnectAttempts: config.maxReconnectAttempts || 10,
    }

    if (this.config.autoConnect) {
      this.connect()
    }
  }

  /**
   * Connect to the WebSocket server
   */
  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    const url = `${this.config.scheme}://${this.config.host}:${this.config.port}/ws`
    this.ws = new WebSocket(url)

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      // Flush message queue
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift()
        if (message) {
          this.ws?.send(message)
        }
      }
    }

    this.ws.onmessage = (event) => {
      this.handleMessage(event.data)
    }

    this.ws.onclose = () => {
      this.socketId = null
      if (this.config.reconnect && this.reconnectAttempts < this.config.maxReconnectAttempts) {
        this.reconnectAttempts++
        const delay = Math.min(this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000)
        this.reconnectTimer = setTimeout(() => this.connect(), delay)
      }
    }

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }

  /**
   * Disconnect from the WebSocket server
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.channels.clear()
    this.socketId = null
  }

  /**
   * Listen on a public channel
   */
  channel<T = any>(channelName: string): PublicChannel<T> {
    if (!this.channels.has(channelName)) {
      const channel = new PublicChannel<T>(this, channelName)
      this.channels.set(channelName, channel)
      channel.subscribe()
    }

    return this.channels.get(channelName) as PublicChannel<T>
  }

  /**
   * Listen on a private channel
   */
  private<T = any>(channelName: string): PrivateChannel<T> {
    const fullName = channelName.startsWith('private-') ? channelName : `private-${channelName}`

    if (!this.channels.has(fullName)) {
      const channel = new PrivateChannel<T>(this, fullName)
      this.channels.set(fullName, channel)
      channel.subscribe()
    }

    return this.channels.get(fullName) as PrivateChannel<T>
  }

  /**
   * Join a presence channel
   */
  join<T = any>(channelName: string): PresenceChannel<T> {
    const fullName = channelName.startsWith('presence-') ? channelName : `presence-${channelName}`

    if (!this.channels.has(fullName)) {
      const channel = new PresenceChannel<T>(this, fullName)
      this.channels.set(fullName, channel)
      channel.subscribe()
    }

    return this.channels.get(fullName) as PresenceChannel<T>
  }

  /**
   * Leave a channel
   */
  leave(channelName: string): void {
    const channel = this.channels.get(channelName)
    if (channel) {
      channel.unsubscribe()
      this.channels.delete(channelName)
    }
  }

  /**
   * Leave all channels
   */
  leaveAll(): void {
    for (const channel of this.channels.values()) {
      channel.unsubscribe()
    }
    this.channels.clear()
  }

  /**
   * Get the socket ID
   */
  getSocketId(): string | null {
    return this.socketId
  }

  /**
   * Send a message to the server
   */
  send(message: object): void {
    const data = JSON.stringify(message)

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    }
    else {
      // Queue message for later
      this.messageQueue.push(data)
    }
  }

  /**
   * Handle incoming messages from server
   */
  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data)

      // Handle connection established
      if (message.event === 'connection_established') {
        this.socketId = message.data.socket_id
        return
      }

      // Route message to appropriate channel
      if (message.channel) {
        const channel = this.channels.get(message.channel)
        if (channel) {
          channel.handleEvent(message.event, message.data)
        }
      }
    }
    catch (error) {
      console.error('Error parsing message:', error)
    }
  }
}

/**
 * Base channel class
 */
export abstract class ChannelInstance<T = any> {
  protected echo: Echo
  protected name: string
  protected callbacks: Map<string, Set<EventCallback<T>>> = new Map()
  protected subscribed = false

  constructor(echo: Echo, name: string) {
    this.echo = echo
    this.name = name
  }

  /**
   * Subscribe to the channel
   */
  subscribe(): void {
    if (this.subscribed) {
      return
    }

    this.echo.send({
      event: 'subscribe',
      channel: this.name,
    })

    this.subscribed = true
  }

  /**
   * Unsubscribe from the channel
   */
  unsubscribe(): void {
    if (!this.subscribed) {
      return
    }

    this.echo.send({
      event: 'unsubscribe',
      channel: this.name,
    })

    this.subscribed = false
    this.callbacks.clear()
  }

  /**
   * Listen for an event
   */
  listen(event: string, callback: EventCallback<T>): this {
    if (!this.callbacks.has(event)) {
      this.callbacks.set(event, new Set())
    }

    this.callbacks.get(event)!.add(callback)
    return this
  }

  /**
   * Stop listening for an event
   */
  stopListening(event: string, callback?: EventCallback<T>): this {
    if (!callback) {
      this.callbacks.delete(event)
    }
    else {
      const callbacks = this.callbacks.get(event)
      if (callbacks) {
        callbacks.delete(callback)
      }
    }

    return this
  }

  /**
   * Handle an event from the server
   */
  handleEvent(event: string, data: any): void {
    const callbacks = this.callbacks.get(event)
    if (callbacks) {
      for (const callback of callbacks) {
        callback(data)
      }
    }
  }

  /**
   * Get the channel name
   */
  getName(): string {
    return this.name
  }
}

/**
 * Public channel
 */
export class PublicChannel<T = any> extends ChannelInstance<T> {
  /**
   * Listen for subscription success
   */
  subscribed(callback: () => void): this {
    return this.listen('subscription_succeeded', callback as any)
  }

  /**
   * Listen for subscription error
   */
  error(callback: (error: any) => void): this {
    return this.listen('subscription_error', callback as any)
  }
}

/**
 * Private channel
 */
export class PrivateChannel<T = any> extends PublicChannel<T> {
  /**
   * Send a client event (whisper)
   */
  whisper(event: string, data: any): this {
    this.echo.send({
      event: `client-${event}`,
      channel: this.name,
      data,
    })

    return this
  }

  /**
   * Listen for whispered events
   */
  listenForWhisper(event: string, callback: EventCallback<T>): this {
    return this.listen(`client-${event}`, callback)
  }
}

/**
 * Presence channel
 */
export class PresenceChannel<T = any> extends PrivateChannel<T> {
  private members: Map<string, any> = new Map()

  /**
   * Handle subscription success with presence data
   */
  override handleEvent(event: string, data: any): void {
    if (event === 'subscription_succeeded' && data?.presence) {
      // Store initial members
      for (const [id, member] of Object.entries(data.presence.hash)) {
        this.members.set(id, member)
      }

      // Call here callbacks
      const callbacks = this.callbacks.get('here')
      if (callbacks) {
        const membersList = Array.from(this.members.values())
        for (const callback of callbacks) {
          callback(membersList)
        }
      }
    }
    else if (event === 'member_added') {
      this.members.set(data.id, data)

      const callbacks = this.callbacks.get('joining')
      if (callbacks) {
        for (const callback of callbacks) {
          callback(data)
        }
      }
    }
    else if (event === 'member_removed') {
      this.members.delete(data.id)

      const callbacks = this.callbacks.get('leaving')
      if (callbacks) {
        for (const callback of callbacks) {
          callback(data)
        }
      }
    }

    super.handleEvent(event, data)
  }

  /**
   * Listen for initial members
   */
  here(callback: (members: any[]) => void): this {
    return this.listen('here', callback as any)
  }

  /**
   * Listen for new members joining
   */
  joining(callback: (member: any) => void): this {
    return this.listen('joining', callback as any)
  }

  /**
   * Listen for members leaving
   */
  leaving(callback: (member: any) => void): this {
    return this.listen('leaving', callback as any)
  }

  /**
   * Get all current members
   */
  getMembers(): any[] {
    return Array.from(this.members.values())
  }

  /**
   * Get a specific member
   */
  getMember(id: string): any | null {
    return this.members.get(id) || null
  }
}

export default Echo
