/**
 * Integration Tests: the outbound path
 *
 * Every broadcast API ends in `server.broadcast()`, so that is where a
 * hook, multi-socket exclusion, the no-subscriber skip and the Bun
 * WebSocket liveness/backpressure options have to hold - against a real
 * started server, not a mock of one.
 */

import type { RedisMessage } from '../../src/redis-adapter'
import type { BroadcastServer } from '../../src/server'
import { Buffer } from 'node:buffer'
import net from 'node:net'
import { afterEach, describe, expect, it, spyOn } from 'bun:test'
import { Broadcast } from '../../src/facade'
import { RedisAdapter } from '../../src/redis-adapter'
import {
  cleanupTestServer,
  closeWebSocket,
  createTestClient,
  createTestServer,
  getServerPort,
  sendAndWait,
  waitFor,
  waitForMessage,
} from '../helpers/test-server'

let server: BroadcastServer | undefined

afterEach(async () => {
  Broadcast.setServer(null as never)
  await cleanupTestServer(server)
  server = undefined
})

async function subscriber(port: number, channel: string): Promise<{ ws: WebSocket, socketId: string, inbox: any[] }> {
  const ws = await createTestClient(port)
  const established = await waitForMessage(ws, 'connection_established')
  await sendAndWait(ws, { event: 'subscribe', channel }, 'subscription_succeeded')
  const inbox: any[] = []
  ws.addEventListener('message', event => inbox.push(JSON.parse(String(event.data))))
  return { ws, socketId: established.data.socket_id, inbox }
}

/**
 * A raw WebSocket client that completes the handshake, subscribes, and
 * then stops reading: it never answers a ping and never drains.
 */
async function silentClient(port: number, channel: string): Promise<net.Socket> {
  const sock = net.connect(port, '127.0.0.1')
  await new Promise(resolve => sock.once('connect', resolve))
  sock.write([
    'GET /ws HTTP/1.1',
    'Host: 127.0.0.1',
    'Upgrade: websocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
    'Sec-WebSocket-Version: 13',
    '',
    '',
  ].join('\r\n'))
  await new Promise(resolve => sock.once('data', resolve))

  // One masked text frame (client frames must be masked).
  const payload = Buffer.from(JSON.stringify({ event: 'subscribe', channel }))
  const mask = Buffer.from([1, 2, 3, 4])
  const masked = Buffer.from(payload.map((byte, i) => byte ^ mask[i % 4]))
  sock.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]))
  await new Promise(resolve => setTimeout(resolve, 100))

  // Paused, it also never sees the server's close, so the tests watch the
  // server side and destroy this end themselves.
  sock.pause()
  return sock
}

describe('broadcast hooks', () => {
  it('add top-level fields to the frame, from every broadcast API', async () => {
    let seq = 0
    server = await createTestServer({ config: { beforeBroadcast: () => ({ seq: ++seq }) } })
    Broadcast.setServer(server)
    const { ws, inbox } = await subscriber(getServerPort(server), 'orders')

    server.broadcast('orders', 'created', { id: 1 })
    server.broadcaster.send('orders', 'updated', { id: 1 })
    Broadcast.send('orders', 'shipped', { id: 1 })
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(inbox).toEqual([
      { seq: 1, event: 'created', channel: 'orders', data: { id: 1 } },
      { seq: 2, event: 'updated', channel: 'orders', data: { id: 1 } },
      { seq: 3, event: 'shipped', channel: 'orders', data: { id: 1 } },
    ])
    await closeWebSocket(ws)
  })

  it('cannot overwrite event, channel or data, and a throwing hook does not stop the broadcast', async () => {
    server = await createTestServer()
    server.addBroadcastHook(() => {
      throw new Error('hook bug')
    })
    server.addBroadcastHook(() => ({ event: 'hijacked', channel: 'elsewhere', data: 'nope', trace: 'abc' }))
    const { ws, inbox } = await subscriber(getServerPort(server), 'orders')

    server.broadcast('orders', 'created', { id: 1 })
    await new Promise(resolve => setTimeout(resolve, 100))

    expect(inbox).toEqual([{ trace: 'abc', event: 'created', channel: 'orders', data: { id: 1 } }])
    await closeWebSocket(ws)
  })

  it('run even when nobody is subscribed, and are removed by the function addBroadcastHook returns', async () => {
    server = await createTestServer()
    const seen: string[] = []
    const remove = server.addBroadcastHook(({ channel, event }) => {
      seen.push(`${channel}:${event}`)
    })

    server.broadcast('empty', 'one', {})
    remove()
    server.broadcast('empty', 'two', {})

    expect(seen).toEqual(['empty:one'])
  })
})

describe('no-subscriber skip', () => {
  it('does not serialize or publish a frame for a channel nobody here is subscribed to', async () => {
    server = await createTestServer()
    const publish = spyOn((server as any).server, 'publish')

    server.broadcast('nobody-home', 'event', { big: 'x'.repeat(1000) })
    expect(publish).not.toHaveBeenCalled()

    const { ws } = await subscriber(getServerPort(server), 'somebody-home')
    server.broadcast('somebody-home', 'event', {})
    expect(publish).toHaveBeenCalledTimes(1)
    await closeWebSocket(ws)
  })

  it('accepts a broadcast without data', async () => {
    server = await createTestServer()
    const { ws, inbox } = await subscriber(getServerPort(server), 'orders')

    expect(() => server!.broadcast('orders', 'ping', undefined)).not.toThrow()
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(inbox).toEqual([{ event: 'ping', channel: 'orders' }])
    await closeWebSocket(ws)
  })
})

describe('exclusion', () => {
  it('leaves out every excluded socket ID, not just the first', async () => {
    server = await createTestServer()
    const port = getServerPort(server)
    const a = await subscriber(port, 'room')
    const b = await subscriber(port, 'room')
    const c = await subscriber(port, 'room')

    server.broadcast('room', 'typing', {}, [a.socketId, b.socketId])
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(a.inbox).toEqual([])
    expect(b.inbox).toEqual([])
    expect(c.inbox.map(m => m.event)).toEqual(['typing'])

    for (const { ws } of [a, b, c])
      await closeWebSocket(ws)
  })

  it('toOthers() leaves out the sender', async () => {
    server = await createTestServer()
    Broadcast.setServer(server)
    const port = getServerPort(server)
    const sender = await subscriber(port, 'room')
    const other = await subscriber(port, 'room')

    Broadcast.toOthers(sender.socketId).send('room', 'typing', {})
    await new Promise(resolve => setTimeout(resolve, 150))

    expect(sender.inbox).toEqual([])
    expect(other.inbox.map(m => m.event)).toEqual(['typing'])
    await closeWebSocket(sender.ws)
    await closeWebSocket(other.ws)
  })
})

describe('Redis relay', () => {
  it('delivers a relayed message locally without publishing it back to Redis', async () => {
    const handlers: Array<(message: RedisMessage) => void> = []
    // No Redis in the test environment: every call the server makes on the
    // adapter is stubbed, and the relay handler it registers is captured.
    const stubbed = ['connect', 'storeChannel', 'removeChannel', 'storeConnection', 'removeConnection'] as const
    const spies = [
      ...stubbed.map(method => spyOn(RedisAdapter.prototype, method).mockResolvedValue(undefined as never)),
      spyOn(RedisAdapter.prototype, 'close').mockReturnValue(undefined as never),
      spyOn(RedisAdapter.prototype, 'onMessage').mockImplementation((handler) => {
        handlers.push(handler)
      }),
    ]
    const published = spyOn(RedisAdapter.prototype, 'broadcast').mockResolvedValue(undefined as never)

    try {
      server = await createTestServer({ config: { redis: { host: '127.0.0.1', port: 1 } } })
      const { ws, inbox } = await subscriber(getServerPort(server), 'orders')

      handlers[0]!({ type: 'broadcast', channel: 'orders', event: 'created', data: { id: 1 }, serverId: 'other-instance' })
      await new Promise(resolve => setTimeout(resolve, 100))

      expect(inbox.map(m => m.event)).toEqual(['created'])
      expect(published).not.toHaveBeenCalled()

      // A broadcast that starts here does go to Redis, exclusions included.
      server.broadcast('orders', 'updated', {}, ['s1', 's2'])
      expect(published).toHaveBeenCalledWith('orders', 'updated', {}, ['s1', 's2'])
      await closeWebSocket(ws)
    }
    finally {
      await cleanupTestServer(server)
      server = undefined
      for (const spy of [...spies, published])
        spy.mockRestore()
    }
  })
})

describe('websocket options on a host/port server', () => {
  it('reports the configured idleTimeout as activity_timeout', async () => {
    server = await createTestServer({ config: { connections: undefined, host: '127.0.0.1', port: 0, websocket: { idleTimeout: 30 } } })
    const ws = await createTestClient(getServerPort(server))
    const established = await waitForMessage(ws, 'connection_established')
    expect(established.data.activity_timeout).toBe(30)
    await closeWebSocket(ws)
  })

  it('closes a slow consumer past backpressureLimit when closeOnBackpressureLimit is set', async () => {
    server = await createTestServer({
      config: {
        connections: undefined,
        host: '127.0.0.1',
        port: 0,
        websocket: { backpressureLimit: 64 * 1024, closeOnBackpressureLimit: true },
      },
    })
    const silent = await silentClient(getServerPort(server), 'hot')
    expect(server.getSubscriberCount('hot')).toBe(1)

    const frame = 'x'.repeat(64 * 1024)
    for (let i = 0; i < 400 && server.getConnectionCount() > 0; i++) {
      server.broadcast('hot', 'tick', frame)
      await new Promise(resolve => setTimeout(resolve, 1))
    }

    await waitFor(() => server!.getConnectionCount() === 0, 5000, 20)
    expect(server.getSubscriberCount('hot')).toBe(0)
    silent.destroy()
  }, 15_000)

  it('pings idle sockets and closes one that never answers, keeping a healthy one', async () => {
    server = await createTestServer({
      config: { connections: undefined, host: '127.0.0.1', port: 0, websocket: { idleTimeout: 2, sendPings: true } },
    })
    const port = getServerPort(server)
    const healthy = await createTestClient(port)
    let healthyClosed = false
    healthy.addEventListener('close', () => {
      healthyClosed = true
    })
    const silent = await silentClient(port, 'idle')
    expect(server.getConnectionCount()).toBe(2)

    // Bun rounds the idle timeout up to its 4s tick: a ping goes out after
    // one idle period, and the socket closes after another without a pong.
    await waitFor(() => server!.getConnectionCount() === 1, 15_000, 100)
    expect(server.getSubscriberCount('idle')).toBe(0)
    expect(healthyClosed).toBe(false)
    await closeWebSocket(healthy)
    silent.destroy()
  }, 20_000)
})
