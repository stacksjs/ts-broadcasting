/**
 * Full Features Example
 *
 * Demonstrates the BroadcastServer with all optional features enabled:
 * - Redis horizontal scaling
 * - Authentication
 * - Rate limiting
 * - Monitoring
 * - Security
 */

/* eslint-disable no-console */
import type { ServerConfig } from '../src'
import process from 'node:process'
import { BroadcastServer } from '../src'

async function main() {
  // Create server with all features enabled
  const config: ServerConfig = {
    verbose: true,
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
          maxPayloadLength: 16 * 1024 * 1024,
          perMessageDeflate: true,
        },
      },
    },

    // Optional: Redis for horizontal scaling
    redis: {
      host: 'localhost',
      port: 6379,
      keyPrefix: 'broadcast:',
    },

    // Optional: Authentication
    auth: {
      enabled: true,
      cookie: {
        name: 'auth_token',
        secure: true,
      },
    },

    // Optional: Rate limiting
    rateLimit: {
      max: 100, // 100 messages
      window: 60000, // per minute
      perChannel: true,
    },

    // Optional: Security
    security: {
      cors: {
        enabled: true,
        origins: ['http://localhost:3000'],
        credentials: true,
      },
      maxPayloadSize: 1024 * 1024, // 1 MB
      sanitizeMessages: true,
    },
  }

  const server = new BroadcastServer(config)

  // Custom authentication
  if (server.auth) {
    server.auth.authenticate(async (req) => {
      const authHeader = req.headers.get('authorization')
      if (authHeader?.startsWith('Bearer ')) {
        // Verify your JWT token here
        return {
          id: 123,
          name: 'John Doe',
          email: 'john@example.com',
        }
      }
      return null
    })
  }

  // Channel authorization
  server.channels.channel('private-user.{userId}', (ws) => {
    return ws.data.user?.id === Number.parseInt(ws.data.socketId)
  })

  server.channels.channel('presence-chat.{roomId}', (ws) => {
    return {
      id: ws.data.user?.id || ws.data.socketId,
      info: {
        name: ws.data.user?.name || 'Anonymous',
        online: true,
      },
    }
  })

  // Monitoring
  if (server.monitoring) {
    server.monitoring.on('all', (event) => {
      console.log(`[${event.type}] ${event.socketId}`)
    })

    server.monitoring.on('connection', (event) => {
      console.log(`✓ New connection: ${event.socketId}`)
    })

    server.monitoring.on('broadcast', (event) => {
      console.log(`📡 Broadcast to ${event.channel}`)
    })
  }

  // Custom validation
  if (server.validator) {
    server.validator.addValidator((message: any) => {
      if (message.channel && message.channel.length > 200) {
        return 'Channel name too long'
      }
      return true
    })
  }

  await server.start()

  console.log('==========================================')
  console.log('Broadcasting Server Started')
  console.log('==========================================')
  console.log('WebSocket: ws://localhost:6001/ws')
  console.log('Health: http://localhost:6001/health')
  console.log('Stats: http://localhost:6001/stats')
  console.log('')
  console.log('Features Enabled:')
  console.log(`  ${server.redis ? '✓' : '✗'} Redis Horizontal Scaling`)
  console.log(`  ${server.auth ? '✓' : '✗'} Authentication`)
  console.log(`  ${server.rateLimit ? '✓' : '✗'} Rate Limiting`)
  console.log(`  ${server.security ? '✓' : '✗'} Security & Sanitization`)
  console.log(`  ✓ Real-time Monitoring`)
  console.log('==========================================')

  // Example broadcasts using helpers
  setTimeout(() => {
    server.helpers.toUser(123, 'notification', {
      title: 'Welcome!',
      body: 'Thanks for joining',
    })

    server.helpers.systemMessage('Server is running smoothly', 'info')
  }, 2000)

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...')
    const stats = await server.getStats()
    console.log('Final stats:', stats)
    await server.stop()
    process.exit(0)
  })
}

main().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
