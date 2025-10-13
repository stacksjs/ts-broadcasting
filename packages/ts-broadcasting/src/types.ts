import type { Server as BunServer, ServerWebSocket } from 'bun'

// Core configuration
export interface BroadcastConfig {
  verbose?: boolean
  driver?: 'bun' | 'reverb' | 'pusher' | 'ably' | 'log' | 'null'
  connections?: {
    [key: string]: ConnectionConfig
  }
  default?: string
}

// Connection configurations for different drivers
export interface ConnectionConfig {
  driver: 'bun' | 'reverb' | 'pusher' | 'ably' | 'log' | 'null'
  host?: string
  port?: number
  scheme?: 'http' | 'https' | 'ws' | 'wss'
  key?: string
  secret?: string
  appId?: string
  cluster?: string
  encrypted?: boolean
  useTLS?: boolean
  options?: ConnectionOptions
}

export interface ConnectionOptions {
  idleTimeout?: number
  maxPayloadLength?: number
  backpressureLimit?: number
  closeOnBackpressureLimit?: boolean
  sendPings?: boolean
  publishToSelf?: boolean
  perMessageDeflate?: boolean | CompressionOptions
}

export interface CompressionOptions {
  compress?: boolean | Compressor
  decompress?: boolean | Compressor
}

export type Compressor =
  | 'disable'
  | 'shared'
  | 'dedicated'
  | '3KB'
  | '4KB'
  | '8KB'
  | '16KB'
  | '32KB'
  | '64KB'
  | '128KB'
  | '256KB'

// WebSocket server types
export interface BroadcastServer {
  server: BunServer
  start(): Promise<void>
  stop(): Promise<void>
  broadcast(channel: string, event: string, data: unknown): void
  getConnectionCount(): number
  getSubscriberCount(channel: string): number
}

export interface WebSocketData {
  id: string
  user?: User
  channels: Set<string>
  socketId: string
  connectedAt: number
  data?: Record<string, unknown>
}

export interface User {
  id: string | number
  [key: string]: unknown
}

// Channel types
export type ChannelType = 'public' | 'private' | 'presence'

export interface Channel {
  name: string
  type: ChannelType
  subscribers: Set<string>
}

export interface PrivateChannel extends Channel {
  type: 'private'
}

export interface PresenceChannel extends Channel {
  type: 'presence'
  members: Map<string, PresenceMember>
}

export interface PresenceMember {
  id: string | number
  info: Record<string, unknown>
}

// Authorization
export interface ChannelAuthorizationCallback {
  (socket: ServerWebSocket<WebSocketData>, params?: Record<string, string>): boolean | PresenceMember | Promise<boolean | PresenceMember>
}

export interface ChannelAuthorizationClass {
  join(socket: ServerWebSocket<WebSocketData>, params?: Record<string, string>): boolean | PresenceMember | Promise<boolean | PresenceMember>
}

// Events
export interface BroadcastEvent {
  shouldBroadcast(): boolean
  broadcastOn(): string | string[]
  broadcastAs?(): string
  broadcastWith?(): Record<string, unknown>
  broadcastWhen?(): boolean
  broadcastQueue?(): string
  broadcastConnection?(): string
}

export interface BroadcastMessage {
  event: string
  channel: string
  data: unknown
  socketId?: string
}

// Queue support
export interface QueueConfig {
  connection?: string
  queue?: string
  delay?: number
  tries?: number
  timeout?: number
}

// Server handlers
export interface WebSocketHandlers {
  message?: (ws: ServerWebSocket<WebSocketData>, message: string | ArrayBuffer | Uint8Array) => void | Promise<void>
  open?: (ws: ServerWebSocket<WebSocketData>) => void | Promise<void>
  close?: (ws: ServerWebSocket<WebSocketData>, code: number, reason: string) => void | Promise<void>
  error?: (ws: ServerWebSocket<WebSocketData>, error: Error) => void | Promise<void>
  drain?: (ws: ServerWebSocket<WebSocketData>) => void | Promise<void>
}

// HTTP request types for upgrade
export interface UpgradeOptions {
  headers?: Record<string, string> | Headers
  data?: Partial<WebSocketData>
}

// Client messages
export interface ClientMessage {
  event: string
  channel?: string
  data?: unknown
  auth?: string
}

export interface SubscribeMessage extends ClientMessage {
  event: 'subscribe'
  channel: string
  auth?: string
  channel_data?: unknown
}

export interface UnsubscribeMessage extends ClientMessage {
  event: 'unsubscribe'
  channel: string
}

export interface ClientEventMessage extends ClientMessage {
  event: string
  channel: string
  data: unknown
}

// Server responses
export interface ServerMessage {
  event: string
  channel?: string
  data?: unknown
}

export interface SubscriptionSucceeded extends ServerMessage {
  event: 'subscription_succeeded'
  channel: string
}

export interface SubscriptionError extends ServerMessage {
  event: 'subscription_error'
  channel: string
  data: {
    type: string
    error: string
    status: number
  }
}

// Presence channel specific
export interface PresenceChannelData {
  presence: {
    ids: Array<string | number>
    hash: Record<string | number, PresenceMember>
    count: number
  }
}

export interface MemberAddedMessage extends ServerMessage {
  event: 'member_added'
  channel: string
  data: PresenceMember
}

export interface MemberRemovedMessage extends ServerMessage {
  event: 'member_removed'
  channel: string
  data: PresenceMember
}
