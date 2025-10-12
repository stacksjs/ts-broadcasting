import type { BroadcastConfig } from './types'
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

// eslint-disable-next-line antfu/no-top-level-await
export const config: BroadcastConfig = await loadConfig({
  name: 'broadcast',
  alias: 'realtime',
  defaultConfig,
})
