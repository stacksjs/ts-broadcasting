/**
 * Svelte Stores for Broadcasting Client
 *
 * Svelte stores for easy integration with the broadcasting system
 */

import type { EventCallback } from './index'
import { derived, writable } from 'svelte/store'
import { BroadcastClient } from './index'

export interface UseBroadcastOptions {
  broadcaster: 'bun' | 'reverb' | 'pusher' | 'ably'
  host?: string
  port?: number
  scheme?: 'ws' | 'wss'
  key?: string
  cluster?: string
  auth?: {
    headers?: Record<string, string>
    endpoint?: string
  }
  autoConnect?: boolean
}

/**
 * Create a broadcast client store
 */
export function createBroadcastStore(options: UseBroadcastOptions) {
  const client = new BroadcastClient(options)
  const isConnected = writable(false)
  const socketId = writable<string | null>(null)

  // Setup connection listeners
  client.connector.on('connect', () => {
    isConnected.set(true)
    socketId.set(client.socketId())
  })

  client.connector.on('disconnect', () => {
    isConnected.set(false)
    socketId.set(null)
  })

  return {
    client,
    isConnected,
    socketId,
    connect: () => client.connect(),
    disconnect: () => client.disconnect(),
  }
}

/**
 * Create a channel store
 */
export function createChannelStore<T = any>(
  client: BroadcastClient,
  channelName: string,
  eventHandlers?: Record<string, EventCallback<T>>,
) {
  const isSubscribed = writable(false)
  const data = writable<T | null>(null)

  const channel = client.channel<T>(channelName)

  // Setup event handlers
  if (eventHandlers) {
    for (const [event, handler] of Object.entries(eventHandlers)) {
      channel.listen(event, handler)
    }
  }

  // Listen for subscription success
  channel.listen('subscription_succeeded', () => {
    isSubscribed.set(true)
  })

  // Listen for subscription error
  channel.listen('subscription_error', () => {
    isSubscribed.set(false)
  })

  return {
    channel,
    isSubscribed,
    data,
    send: (event: string, sendData: T) => {
      channel.trigger?.(event, sendData)
    },
    unsubscribe: () => {
      channel.unsubscribe()
      isSubscribed.set(false)
    },
  }
}

/**
 * Create a private channel store
 */
export function createPrivateChannelStore<T = any>(
  client: BroadcastClient,
  channelName: string,
  eventHandlers?: Record<string, EventCallback<T>>,
) {
  const isSubscribed = writable(false)

  const channel = client.private<T>(channelName)

  // Setup event handlers
  if (eventHandlers) {
    for (const [event, handler] of Object.entries(eventHandlers)) {
      channel.listen(event, handler)
    }
  }

  // Listen for subscription success
  channel.listen('subscription_succeeded', () => {
    isSubscribed.set(true)
  })

  // Listen for subscription error
  channel.listen('subscription_error', () => {
    isSubscribed.set(false)
  })

  return {
    channel,
    isSubscribed,
    whisper: (event: string, whisperData: T) => {
      channel.whisper(event, whisperData)
    },
    unsubscribe: () => {
      channel.unsubscribe()
      isSubscribed.set(false)
    },
  }
}

/**
 * Create a presence channel store
 */
export function createPresenceStore<T = any>(
  client: BroadcastClient,
  channelName: string,
  eventHandlers?: Record<string, EventCallback<T>>,
) {
  const isSubscribed = writable(false)
  const members = writable<any[]>([])

  const channel = client.join<T>(channelName)

  // Setup event handlers
  if (eventHandlers) {
    for (const [event, handler] of Object.entries(eventHandlers)) {
      channel.listen(event, handler)
    }
  }

  // Listen for initial members
  channel.here((initialMembers: any[]) => {
    members.set(initialMembers)
    isSubscribed.set(true)
  })

  // Listen for new members
  channel.joining((member: any) => {
    members.update(m => [...m, member])
  })

  // Listen for members leaving
  channel.leaving((member: any) => {
    members.update(m => m.filter(mbr => mbr.id !== member.id))
  })

  // Listen for subscription error
  channel.listen('subscription_error', () => {
    isSubscribed.set(false)
  })

  // Derived member count
  const memberCount = derived(members, $members => $members.length)

  return {
    channel,
    isSubscribed,
    members,
    memberCount,
    whisper: (event: string, whisperData: T) => {
      channel.whisper(event, whisperData)
    },
    unsubscribe: () => {
      channel.unsubscribe()
      isSubscribed.set(false)
      members.set([])
    },
  }
}
