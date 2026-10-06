/**
 * Integration Tests: connection authorization and the gated endpoints
 *
 * The upgrade on /app and /ws used to go through whatever `auth` returned,
 * so configuring `auth` kept nobody out, and /stats and /metrics answered
 * anyone on a server that binds 0.0.0.0 by default.
 */

import type { BroadcastServer } from '../../src/server'
import { afterEach, describe, expect, it } from 'bun:test'
import {
  cleanupTestServer,
  closeWebSocket,
  createTestClient,
  createTestServer,
  getServerPort,
  sendAndWait,
  waitForMessage,
} from '../helpers/test-server'

let server: BroadcastServer | undefined

afterEach(async () => {
  await cleanupTestServer(server)
  server = undefined
})

/**
 * A plain GET on the upgrade path. A refusal answers with its own status
 * before any upgrade is attempted; an accepted request reaches
 * `server.upgrade()`, which fails on a non-WebSocket request with a 400.
 */
async function upgradeStatus(port: number, path = '/ws', headers: Record<string, string> = {}): Promise<{ status: number, body: string }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { headers })
  return { status: response.status, body: await response.text() }
}

function refusedToOpen(port: number, query = ''): Promise<boolean> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${query}`)
    ws.addEventListener('open', () => {
      ws.close()
      resolve(false)
    })
    ws.addEventListener('error', () => resolve(true))
    setTimeout(() => resolve(false), 3000)
  })
}

describe('authorizeConnection', () => {
  it('refuses the upgrade when the hook returns false', async () => {
    server = await createTestServer({ config: { authorizeConnection: () => false } })
    const port = getServerPort(server)

    expect(await upgradeStatus(port)).toEqual({ status: 401, body: 'Unauthorized' })
    expect(await upgradeStatus(port, '/app')).toEqual({ status: 401, body: 'Unauthorized' })
    expect(await refusedToOpen(port)).toBe(true)
    expect(server.getConnectionCount()).toBe(0)
  })

  it('uses the status and message of an object refusal', async () => {
    server = await createTestServer({
      config: { authorizeConnection: () => ({ ok: false, status: 403, message: 'Banned' }) },
    })

    expect(await upgradeStatus(getServerPort(server))).toEqual({ status: 403, body: 'Banned' })
  })

  it('refuses with a 401 when the hook returns nothing, and a 500 when it throws', async () => {
    server = await createTestServer({ config: { authorizeConnection: () => undefined } })
    expect((await upgradeStatus(getServerPort(server))).status).toBe(401)
    await cleanupTestServer(server)

    server = await createTestServer({
      config: {
        authorizeConnection: () => {
          throw new Error('database is down')
        },
      },
    })
    const refused = await upgradeStatus(getServerPort(server))
    expect(refused.status).toBe(500)
    expect(refused.body).not.toContain('database')
  })

  it('accepts the upgrade when the hook returns true', async () => {
    server = await createTestServer({
      config: { authorizeConnection: req => new URL(req.url).searchParams.get('token') === 'let-me-in' },
    })
    const port = getServerPort(server)

    // Reaches server.upgrade(), which a plain GET cannot satisfy.
    expect((await upgradeStatus(port, '/ws?token=let-me-in')).status).toBe(400)
    expect((await upgradeStatus(port, '/ws?token=wrong')).status).toBe(401)

    const ws = await createTestClient(port, '/ws?token=let-me-in')
    const established = await waitForMessage(ws, 'connection_established')
    expect(established.data.socket_id).toBeString()
    await closeWebSocket(ws)
  })

  it('receives the user auth resolved, and can replace it and attach data', async () => {
    const seen: unknown[] = []
    server = await createTestServer({
      auth: true,
      config: {
        authorizeConnection: (req, user) => {
          seen.push(user)
          const id = new URL(req.url).searchParams.get('user')
          return id ? { ok: true, user: { id: Number(id) }, data: { tenant: 'acme' } } : false
        },
      },
    })
    server.auth!.authenticate(() => ({ id: 'from-auth' }))
    server.channels.channel('private-tenant.{tenant}', (socket, params) => {
      return socket.data.user?.id === 7 && socket.data.data?.tenant === params?.tenant
    })

    const ws = await createTestClient(getServerPort(server), '/ws?user=7')
    await waitForMessage(ws, 'connection_established')
    const reply = await sendAndWait(ws, { event: 'subscribe', channel: 'private-tenant.acme' }, 'subscription_succeeded')
    expect(reply.channel).toBe('private-tenant.acme')
    expect(seen).toEqual([{ id: 'from-auth' }])
    await closeWebSocket(ws)
  })
})

describe('auth.required', () => {
  it('refuses an upgrade no user could be authenticated for', async () => {
    server = await createTestServer({ config: { auth: { enabled: true, required: true } } })
    server.auth!.authenticate(req => new URL(req.url).searchParams.get('token') === 'ok' ? { id: 1 } : null)
    const port = getServerPort(server)

    expect((await upgradeStatus(port)).status).toBe(401)
    expect((await upgradeStatus(port, '/ws?token=ok')).status).toBe(400)
  })

  it('still lets anonymous sockets in when auth is configured but not required', async () => {
    server = await createTestServer({ auth: true })
    server.auth!.authenticate(() => null)

    expect((await upgradeStatus(getServerPort(server))).status).toBe(400)
  })
})

describe('/stats and /metrics', () => {
  it('are not served unless enabled', async () => {
    server = await createTestServer()
    const port = getServerPort(server)

    expect((await fetch(`http://127.0.0.1:${port}/stats`)).status).toBe(404)
    expect((await fetch(`http://127.0.0.1:${port}/metrics`)).status).toBe(404)
    // /health stays open for load balancers.
    expect((await fetch(`http://127.0.0.1:${port}/health`)).status).toBe(200)
  })

  it('are served once enabled, each on its own switch', async () => {
    server = await createTestServer({ config: { endpoints: { metrics: true } } })
    const port = getServerPort(server)

    expect((await fetch(`http://127.0.0.1:${port}/stats`)).status).toBe(404)
    const metrics = await fetch(`http://127.0.0.1:${port}/metrics`)
    expect(metrics.status).toBe(200)
    expect(metrics.headers.get('content-type')).toContain('text/plain')
  })

  it('require the bearer token when one is configured', async () => {
    server = await createTestServer({ config: { endpoints: { stats: true, metrics: true, token: 's3cret' } } })
    const port = getServerPort(server)

    for (const path of ['/stats', '/metrics']) {
      expect((await fetch(`http://127.0.0.1:${port}${path}`)).status).toBe(401)
      expect((await fetch(`http://127.0.0.1:${port}${path}`, { headers: { Authorization: 'Bearer nope' } })).status).toBe(401)
      expect((await fetch(`http://127.0.0.1:${port}${path}`, { headers: { Authorization: 'Bearer s3cret' } })).status).toBe(200)
    }

    const stats = await fetch(`http://127.0.0.1:${port}/stats`, { headers: { Authorization: 'Bearer s3cret' } })
    expect(await stats.json()).toHaveProperty('connections')
  })
})
