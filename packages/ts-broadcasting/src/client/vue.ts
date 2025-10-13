/**
 * Vue Composables for Broadcasting Client
 *
 * Vue 3 composables for easy integration with the broadcasting system
 */

import type { EventCallback } from './index'
import type { Ref } from 'vue'
import { onUnmounted, ref, watch } from 'vue'
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
 * Use broadcast client composable
 */
export function useBroadcast(options: UseBroadcastOptions) {
  const client = new BroadcastClient(options)
  const isConnected = ref(false)
  const socketId = ref<string | null>(null)

  // Setup connection listeners
  client.connector.on('connect', () => {
    isConnected.value = true
    socketId.value = client.socketId()
  })

  client.connector.on('disconnect', () => {
    isConnected.value = false
    socketId.value = null
  })

  // Cleanup on unmount
  onUnmounted(() => {
    client.disconnect()
  })

  const connect = () => {
    client.connect()
  }

  const disconnect = () => {
    client.disconnect()
  }

  return {
    client,
    isConnected,
    socketId,
    connect,
    disconnect,
  }
}

/**
 * Use channel composable
 */
export function useChannel<T = any>(
  client: BroadcastClient | Ref<BroadcastClient>,
  channelName: string | Ref<string>,
  eventHandlers?: Record<string, EventCallback<T>>,
) {
  const isSubscribed = ref(false)
  const data = ref<T | null>(null)
  let channel: any = null

  const getClient = () => {
    return typeof client === 'object' && 'value' in client ? client.value : client
  }

  const getChannelName = () => {
    return typeof channelName === 'object' && 'value' in channelName ? channelName.value : channelName
  }

  const subscribe = () => {
    const broadcastClient = getClient()
    const name = getChannelName()

    channel = broadcastClient.channel<T>(name)

    // Setup event handlers
    if (eventHandlers) {
      for (const [event, handler] of Object.entries(eventHandlers)) {
        channel.listen(event, handler)
      }
    }

    // Listen for subscription success
    channel.listen('subscription_succeeded', () => {
      isSubscribed.value = true
    })

    // Listen for subscription error
    channel.listen('subscription_error', () => {
      isSubscribed.value = false
    })
  }

  const unsubscribe = () => {
    if (channel) {
      channel.unsubscribe()
      channel = null
      isSubscribed.value = false
    }
  }

  // Watch for channel name changes
  if (typeof channelName === 'object' && 'value' in channelName) {
    watch(channelName, () => {
      unsubscribe()
      subscribe()
    })
  }

  // Initial subscription
  subscribe()

  // Cleanup on unmount
  onUnmounted(() => {
    unsubscribe()
  })

  const send = (event: string, sendData: T) => {
    if (channel) {
      channel.trigger(event, sendData)
    }
  }

  return {
    channel,
    isSubscribed,
    data,
    send,
    unsubscribe,
  }
}

/**
 * Use private channel composable
 */
export function usePrivateChannel<T = any>(
  client: BroadcastClient | Ref<BroadcastClient>,
  channelName: string | Ref<string>,
  eventHandlers?: Record<string, EventCallback<T>>,
) {
  const isSubscribed = ref(false)
  let channel: any = null

  const getClient = () => {
    return typeof client === 'object' && 'value' in client ? client.value : client
  }

  const getChannelName = () => {
    return typeof channelName === 'object' && 'value' in channelName ? channelName.value : channelName
  }

  const subscribe = () => {
    const broadcastClient = getClient()
    const name = getChannelName()

    channel = broadcastClient.private<T>(name)

    // Setup event handlers
    if (eventHandlers) {
      for (const [event, handler] of Object.entries(eventHandlers)) {
        channel.listen(event, handler)
      }
    }

    // Listen for subscription success
    channel.listen('subscription_succeeded', () => {
      isSubscribed.value = true
    })

    // Listen for subscription error
    channel.listen('subscription_error', () => {
      isSubscribed.value = false
    })
  }

  const unsubscribe = () => {
    if (channel) {
      channel.unsubscribe()
      channel = null
      isSubscribed.value = false
    }
  }

  // Watch for channel name changes
  if (typeof channelName === 'object' && 'value' in channelName) {
    watch(channelName, () => {
      unsubscribe()
      subscribe()
    })
  }

  // Initial subscription
  subscribe()

  // Cleanup on unmount
  onUnmounted(() => {
    unsubscribe()
  })

  const whisper = (event: string, whisperData: T) => {
    if (channel) {
      channel.whisper(event, whisperData)
    }
  }

  return {
    channel,
    isSubscribed,
    whisper,
    unsubscribe,
  }
}

/**
 * Use presence channel composable
 */
export function usePresence<T = any>(
  client: BroadcastClient | Ref<BroadcastClient>,
  channelName: string | Ref<string>,
  eventHandlers?: Record<string, EventCallback<T>>,
) {
  const isSubscribed = ref(false)
  const members = ref<any[]>([])
  let channel: any = null

  const getClient = () => {
    return typeof client === 'object' && 'value' in client ? client.value : client
  }

  const getChannelName = () => {
    return typeof channelName === 'object' && 'value' in channelName ? channelName.value : channelName
  }

  const subscribe = () => {
    const broadcastClient = getClient()
    const name = getChannelName()

    channel = broadcastClient.join<T>(name)

    // Setup event handlers
    if (eventHandlers) {
      for (const [event, handler] of Object.entries(eventHandlers)) {
        channel.listen(event, handler)
      }
    }

    // Listen for initial members
    channel.here((initialMembers: any[]) => {
      members.value = initialMembers
      isSubscribed.value = true
    })

    // Listen for new members
    channel.joining((member: any) => {
      members.value = [...members.value, member]
    })

    // Listen for members leaving
    channel.leaving((member: any) => {
      members.value = members.value.filter(m => m.id !== member.id)
    })

    // Listen for subscription error
    channel.listen('subscription_error', () => {
      isSubscribed.value = false
    })
  }

  const unsubscribe = () => {
    if (channel) {
      channel.unsubscribe()
      channel = null
      isSubscribed.value = false
      members.value = []
    }
  }

  // Watch for channel name changes
  if (typeof channelName === 'object' && 'value' in channelName) {
    watch(channelName, () => {
      unsubscribe()
      subscribe()
    })
  }

  // Initial subscription
  subscribe()

  // Cleanup on unmount
  onUnmounted(() => {
    unsubscribe()
  })

  const whisper = (event: string, whisperData: T) => {
    if (channel) {
      channel.whisper(event, whisperData)
    }
  }

  return {
    channel,
    isSubscribed,
    members,
    memberCount: ref(members.value.length),
    whisper,
    unsubscribe,
  }
}
