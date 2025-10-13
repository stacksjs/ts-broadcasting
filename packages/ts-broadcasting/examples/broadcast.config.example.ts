import type { BroadcastConfig } from '../src'

/**
 * Broadcasting Configuration
 *
 * This file shows all available configuration options for the broadcasting system.
 * Copy this to `broadcast.config.ts` or `realtime.config.ts` and customize as needed.
 */
export default {
  // Enable verbose logging
  verbose: true,

  // Default driver to use
  driver: 'bun',

  // Default connection
  default: 'bun',

  // Available connections
  connections: {
    // Bun native WebSocket server
    bun: {
      driver: 'bun',
      host: process.env.BROADCAST_HOST || '0.0.0.0',
      port: Number.parseInt(process.env.BROADCAST_PORT || '6001'),
      scheme: 'ws', // or 'wss' for TLS

      options: {
        // How long to wait before closing idle connections (seconds)
        idleTimeout: 120,

        // Maximum message size (bytes)
        maxPayloadLength: 16 * 1024 * 1024, // 16 MB

        // Backpressure limit (bytes)
        backpressureLimit: 1024 * 1024, // 1 MB

        // Close connection if backpressure limit is reached
        closeOnBackpressureLimit: false,

        // Send periodic pings to keep connections alive
        sendPings: true,

        // Allow sockets to receive their own published messages
        publishToSelf: false,

        // Enable per-message compression
        perMessageDeflate: true,
        // Or fine-tune compression:
        // perMessageDeflate: {
        //   compress: true,  // or 'shared', 'dedicated', '16KB', etc.
        //   decompress: true,
        // },
      },
    },

    // Laravel Reverb
    reverb: {
      driver: 'reverb',
      host: process.env.REVERB_HOST || '127.0.0.1',
      port: Number.parseInt(process.env.REVERB_PORT || '8080'),
      scheme: 'ws',
      key: process.env.REVERB_APP_KEY,
      secret: process.env.REVERB_APP_SECRET,
      appId: process.env.REVERB_APP_ID,

      options: {
        idleTimeout: 120,
        maxPayloadLength: 16 * 1024 * 1024,
      },
    },

    // Pusher Channels
    pusher: {
      driver: 'pusher',
      key: process.env.PUSHER_APP_KEY,
      secret: process.env.PUSHER_APP_SECRET,
      appId: process.env.PUSHER_APP_ID,
      cluster: process.env.PUSHER_APP_CLUSTER || 'mt1',
      useTLS: true,
    },

    // Ably
    ably: {
      driver: 'ably',
      key: process.env.ABLY_KEY,
    },

    // Log driver (for development/testing)
    log: {
      driver: 'log',
    },

    // Null driver (disables broadcasting)
    null: {
      driver: 'null',
    },
  },
} satisfies BroadcastConfig
