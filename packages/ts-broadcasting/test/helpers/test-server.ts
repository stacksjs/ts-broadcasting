/**
 * Test Server Utilities
 *
 * Helper functions for creating and managing test servers
 */

import type { ServerWebSocket } from 'bun'
import { BroadcastServer, type ServerConfig } from '../../src'
import type { WebSocketData } from '../../src/types'

export interface TestServerOptions {
  port?: number
  redis?: boolean
  auth?: boolean
  rateLimit?: boolean
  security?: boolean
  verbose?: boolean
}

/**
 * Create a test server with configurable features
 */
export async function createTestServer(options: TestServerOptions = {}): Promise<BroadcastServer> {
  const config: ServerConfig = {
    verbose: options.verbose || false,
    driver: 'bun',
    default: 'bun',
    connections: {
      bun: {
        driver: 'bun',
        host: '127.0.0.1',
        port: options.port || 0, // Random port
        scheme: 'ws',
        options: {
          idleTimeout: 30,
          maxPayloadLength: 1024 * 1024,
        },
      },
    },
  }

  // Add optional features
  if (options.redis) {
    config.redis = {
      host: process.env.REDIS_HOST || 'localhost',
      port: Number.parseInt(process.env.REDIS_PORT || '6379'),
      keyPrefix: `test:${Date.now()}:`,
    }
  }

  if (options.auth) {
    config.auth = {
      enabled: true,
      cookie: {
        name: 'test_token',
      },
    }
  }

  if (options.rateLimit) {
    config.rateLimit = {
      max: 10,
      window: 1000,
      perChannel: true,
    }
  }

  if (options.security) {
    config.security = {
      cors: {
        enabled: true,
        origins: ['http://localhost:3000'],
      },
      maxPayloadSize: 1024 * 1024,
      sanitizeMessages: true,
    }
  }

  const server = new BroadcastServer(config)
  await server.start()

  return server
}

/**
 * Get the actual port the server is listening on
 */
export function getServerPort(server: any): number {
  return server.server?.port || 6001
}

/**
 * Create a WebSocket client for testing
 */
export async function createTestClient(port: number, path = '/ws'): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`)

  return new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', reject)
    setTimeout(() => reject(new Error('Connection timeout')), 5000)
  })
}

/**
 * Wait for a specific message from WebSocket
 */
export function waitForMessage(
  ws: WebSocket,
  eventName: string,
  timeout = 5000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${eventName}`))
    }, timeout)

    const handler = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data)
        if (data.event === eventName) {
          clearTimeout(timeoutId)
          ws.removeEventListener('message', handler)
          resolve(data)
        }
      }
      catch (error) {
        // Ignore parse errors
      }
    }

    ws.addEventListener('message', handler)
  })
}

/**
 * Send a message and wait for response
 */
export async function sendAndWait(
  ws: WebSocket,
  message: any,
  expectedEvent: string,
  timeout = 5000,
): Promise<any> {
  const promise = waitForMessage(ws, expectedEvent, timeout)
  ws.send(JSON.stringify(message))
  return promise
}

/**
 * Close WebSocket gracefully
 */
export async function closeWebSocket(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve()
      return
    }

    ws.addEventListener('close', () => resolve())
    ws.close()

    // Force close after timeout
    setTimeout(() => resolve(), 1000)
  })
}

/**
 * Clean up test server
 */
export async function cleanupTestServer(server: BroadcastServer): Promise<void> {
  await server.stop()
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100,
): Promise<void> {
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, interval))
  }

  throw new Error('Condition not met within timeout')
}

/**
 * Create multiple test clients
 */
export async function createMultipleClients(
  port: number,
  count: number,
  path = '/ws',
): Promise<WebSocket[]> {
  const promises = []
  for (let i = 0; i < count; i++) {
    promises.push(createTestClient(port, path))
  }
  return Promise.all(promises)
}
