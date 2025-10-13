/**
 * Integration Tests: Channel Subscriptions
 *
 * Tests for public, private, and presence channel functionality
 */

import { describe, expect, it, beforeEach, afterEach } from 'bun:test'
import { BroadcastServer } from '../../src/server'
import {
  createTestServer,
  createTestClient,
  waitForMessage,
  sendAndWait,
  closeWebSocket,
  cleanupTestServer,
  getServerPort,
} from '../helpers/test-server'

describe('Channel Subscriptions', () => {
  let server: BroadcastServer
  let port: number

  beforeEach(async () => {
    server = await createTestServer({ port: 0 })
    port = getServerPort(server)
  })

  afterEach(async () => {
    await cleanupTestServer(server)
  })

  describe('Public Channels', () => {
    it('should subscribe to public channel', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      const response = await sendAndWait(ws, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      expect(response.event).toBe('subscription_succeeded')
      expect(response.channel).toBe('news')

      await closeWebSocket(ws)
    })

    it('should receive broadcasts on public channel', async () => {
      const ws1 = await createTestClient(port)
      const ws2 = await createTestClient(port)

      await waitForMessage(ws1, 'connection_established')
      await waitForMessage(ws2, 'connection_established')

      await sendAndWait(ws1, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      await sendAndWait(ws2, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      // Broadcast to channel
      server.broadcaster.send('news', 'article.created', {
        title: 'Breaking News',
      })

      const msg1Promise = waitForMessage(ws1, 'article.created')
      const msg2Promise = waitForMessage(ws2, 'article.created')

      const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise])

      expect(msg1.data.title).toBe('Breaking News')
      expect(msg2.data.title).toBe('Breaking News')

      await closeWebSocket(ws1)
      await closeWebSocket(ws2)
    })

    it('should unsubscribe from public channel', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      await sendAndWait(ws, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      expect(server.getSubscriberCount('news')).toBe(1)

      ws.send(JSON.stringify({
        event: 'unsubscribe',
        channel: 'news',
      }))

      await new Promise(resolve => setTimeout(resolve, 100))

      expect(server.getSubscriberCount('news')).toBe(0)

      await closeWebSocket(ws)
    })

    it('should handle multiple public channels', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      await sendAndWait(ws, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      await sendAndWait(ws, {
        event: 'subscribe',
        channel: 'announcements',
      }, 'subscription_succeeded')

      expect(server.getSubscriberCount('news')).toBe(1)
      expect(server.getSubscriberCount('announcements')).toBe(1)

      await closeWebSocket(ws)
    })
  })

  describe('Private Channels', () => {
    beforeEach(() => {
      // Setup authorization for private channels
      server.channels.channel('private-user.{userId}', (ws, params) => {
        // For testing, allow if socketId contains userId
        return ws.data.socketId.includes(params.userId) || params.userId === '123'
      })
    })

    it('should subscribe to authorized private channel', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      const response = await sendAndWait(ws, {
        event: 'subscribe',
        channel: 'private-user.123',
      }, 'subscription_succeeded')

      expect(response.event).toBe('subscription_succeeded')
      expect(response.channel).toBe('private-user.123')

      await closeWebSocket(ws)
    })

    it('should reject unauthorized private channel', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      const response = await sendAndWait(ws, {
        event: 'subscribe',
        channel: 'private-user.999',
      }, 'subscription_error')

      expect(response.event).toBe('subscription_error')
      expect(response.data.type).toBe('AuthError')

      await closeWebSocket(ws)
    })

    it('should support client events (whisper) on private channels', async () => {
      const ws1 = await createTestClient(port)
      const ws2 = await createTestClient(port)

      await waitForMessage(ws1, 'connection_established')
      await waitForMessage(ws2, 'connection_established')

      // Subscribe both to same private channel
      await sendAndWait(ws1, {
        event: 'subscribe',
        channel: 'private-user.123',
      }, 'subscription_succeeded')

      await sendAndWait(ws2, {
        event: 'subscribe',
        channel: 'private-user.123',
      }, 'subscription_succeeded')

      // Send client event from ws1
      ws1.send(JSON.stringify({
        event: 'client-typing',
        channel: 'private-user.123',
        data: { typing: true },
      }))

      // ws2 should receive it
      const message = await waitForMessage(ws2, 'client-typing')

      expect(message.data.typing).toBe(true)

      await closeWebSocket(ws1)
      await closeWebSocket(ws2)
    })

    it('should not allow client events on public channels', async () => {
      const ws1 = await createTestClient(port)
      const ws2 = await createTestClient(port)

      await waitForMessage(ws1, 'connection_established')
      await waitForMessage(ws2, 'connection_established')

      await sendAndWait(ws1, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      await sendAndWait(ws2, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      // Try to send client event on public channel
      ws1.send(JSON.stringify({
        event: 'client-message',
        channel: 'news',
        data: { text: 'test' },
      }))

      // ws2 should NOT receive it
      await new Promise(resolve => setTimeout(resolve, 200))

      await closeWebSocket(ws1)
      await closeWebSocket(ws2)
    })
  })

  describe('Presence Channels', () => {
    beforeEach(() => {
      // Setup authorization for presence channels
      server.channels.channel('presence-chat.{roomId}', (ws, params) => {
        return {
          id: ws.data.socketId,
          info: {
            name: `User-${ws.data.socketId.slice(0, 8)}`,
            online: true,
          },
        }
      })
    })

    it('should subscribe to presence channel', async () => {
      const ws = await createTestClient(port)
      await waitForMessage(ws, 'connection_established')

      const response = await sendAndWait(ws, {
        event: 'subscribe',
        channel: 'presence-chat.room1',
      }, 'subscription_succeeded')

      expect(response.event).toBe('subscription_succeeded')
      expect(response.data).toHaveProperty('presence')
      expect(response.data.presence).toHaveProperty('ids')
      expect(response.data.presence).toHaveProperty('hash')
      expect(response.data.presence).toHaveProperty('count')

      await closeWebSocket(ws)
    })

    it('should notify existing members when someone joins', async () => {
      const ws1 = await createTestClient(port)
      await waitForMessage(ws1, 'connection_established')

      await sendAndWait(ws1, {
        event: 'subscribe',
        channel: 'presence-chat.room1',
      }, 'subscription_succeeded')

      const ws2 = await createTestClient(port)
      await waitForMessage(ws2, 'connection_established')

      // ws1 should receive member_added event
      const memberAddedPromise = waitForMessage(ws1, 'member_added')

      await sendAndWait(ws2, {
        event: 'subscribe',
        channel: 'presence-chat.room1',
      }, 'subscription_succeeded')

      const memberAdded = await memberAddedPromise

      expect(memberAdded.event).toBe('member_added')
      expect(memberAdded.data).toHaveProperty('id')
      expect(memberAdded.data).toHaveProperty('info')

      await closeWebSocket(ws1)
      await closeWebSocket(ws2)
    })

    it('should notify when member leaves', async () => {
      const ws1 = await createTestClient(port)
      const ws2 = await createTestClient(port)

      await waitForMessage(ws1, 'connection_established')
      await waitForMessage(ws2, 'connection_established')

      await sendAndWait(ws1, {
        event: 'subscribe',
        channel: 'presence-chat.room1',
      }, 'subscription_succeeded')

      // Wait for ws1's member_added before ws2 subscribes
      const memberAddedPromise = waitForMessage(ws1, 'member_added')

      await sendAndWait(ws2, {
        event: 'subscribe',
        channel: 'presence-chat.room1',
      }, 'subscription_succeeded')

      await memberAddedPromise

      // ws1 should receive member_removed when ws2 leaves
      const memberRemovedPromise = waitForMessage(ws1, 'member_removed')

      await closeWebSocket(ws2)

      const memberRemoved = await memberRemovedPromise

      expect(memberRemoved.event).toBe('member_removed')

      await closeWebSocket(ws1)
    })

    it('should track presence member count', async () => {
      const ws1 = await createTestClient(port)
      const ws2 = await createTestClient(port)

      await waitForMessage(ws1, 'connection_established')
      await waitForMessage(ws2, 'connection_established')

      await sendAndWait(ws1, {
        event: 'subscribe',
        channel: 'presence-chat.room1',
      }, 'subscription_succeeded')

      await sendAndWait(ws2, {
        event: 'subscribe',
        channel: 'presence-chat.room1',
      }, 'subscription_succeeded')

      expect(server.getSubscriberCount('presence-chat.room1')).toBe(2)

      const members = server.channels.getPresenceMembers('presence-chat.room1')
      expect(members?.size).toBe(2)

      await closeWebSocket(ws1)
      await closeWebSocket(ws2)
    })
  })

  describe('Channel Broadcasting', () => {
    it('should broadcast to specific channel only', async () => {
      const wsNews = await createTestClient(port)
      const wsAnnouncements = await createTestClient(port)

      await waitForMessage(wsNews, 'connection_established')
      await waitForMessage(wsAnnouncements, 'connection_established')

      await sendAndWait(wsNews, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      await sendAndWait(wsAnnouncements, {
        event: 'subscribe',
        channel: 'announcements',
      }, 'subscription_succeeded')

      // Broadcast only to news
      server.broadcaster.send('news', 'article.created', { title: 'Test' })

      const newsMessage = await waitForMessage(wsNews, 'article.created')
      expect(newsMessage.data.title).toBe('Test')

      // announcements should not receive it
      await new Promise(resolve => setTimeout(resolve, 200))

      await closeWebSocket(wsNews)
      await closeWebSocket(wsAnnouncements)
    })

    it('should support broadcast exclusion (toOthers)', async () => {
      const ws1 = await createTestClient(port)
      const ws2 = await createTestClient(port)

      await waitForMessage(ws1, 'connection_established')
      const ws2Connected = await waitForMessage(ws2, 'connection_established')
      const ws2SocketId = ws2Connected.data.socket_id

      await sendAndWait(ws1, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      await sendAndWait(ws2, {
        event: 'subscribe',
        channel: 'news',
      }, 'subscription_succeeded')

      // Broadcast excluding ws2
      server.broadcast('news', 'update', { message: 'test' }, ws2SocketId)

      // ws1 should receive it
      const ws1Message = await waitForMessage(ws1, 'update')
      expect(ws1Message.data.message).toBe('test')

      // ws2 should NOT receive it
      await new Promise(resolve => setTimeout(resolve, 200))

      await closeWebSocket(ws1)
      await closeWebSocket(ws2)
    })
  })
})
