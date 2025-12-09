import type { BroadcastConfig } from './types'
import process from 'node:process'
import { loadConfig } from 'bunfig'

export const defaultConfig: BroadcastConfig = {
  verbose: false,
  driver: 'bun',
  default: 'bun',

  connections: {
    bun: {
      driver: 'bun',
      host: '0.0.0.0',
      port: 6001,
      scheme: 'ws',
      options: {
        idleTimeout: 120,
        maxPayloadLength: 16 * 1024 * 1024, // 16 MB
        backpressureLimit: 1024 * 1024, // 1 MB
        closeOnBackpressureLimit: false,
        sendPings: true,
        publishToSelf: false,
        perMessageDeflate: true,
      },
    },

    reverb: {
      driver: 'reverb',
      host: '127.0.0.1',
      port: 8080,
      scheme: 'ws',
      key: process.env.REVERB_APP_KEY,
      secret: process.env.REVERB_APP_SECRET,
      appId: process.env.REVERB_APP_ID,
      options: {
        idleTimeout: 120,
        maxPayloadLength: 16 * 1024 * 1024,
      },
    },

    pusher: {
      driver: 'pusher',
      key: process.env.PUSHER_APP_KEY,
      secret: process.env.PUSHER_APP_SECRET,
      appId: process.env.PUSHER_APP_ID,
      cluster: process.env.PUSHER_APP_CLUSTER || 'mt1',
      useTLS: true,
    },

    ably: {
      driver: 'ably',
      key: process.env.ABLY_KEY,
    },

    log: {
      driver: 'log',
    },

    null: {
      driver: 'null',
    },
  },
}

// Lazy-loaded config to avoid top-level await (enables bun --compile)
let _config: BroadcastConfig | null = null

export async function getConfig(): Promise<BroadcastConfig> {
  if (!_config) {
    _config = await loadConfig({
  name: 'broadcast',
  alias: 'realtime',
  defaultConfig,
})
  }
  return _config
}

// For backwards compatibility - synchronous access with default fallback
export const config: BroadcastConfig = defaultConfig
