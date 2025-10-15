/**
 * E2E Tests: Client SDK (Echo)
 *
 * End-to-end tests for the client-side SDK
 */

import type { BroadcastServer } from '../../src/server'
import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import Echo from '../../src/client'
import {
  cleanupTestServer,
  createTestServer,
  getServerPort,
  waitFor,
} from '../helpers/test-server'

describe('Client SDK (Echo)', () => {
  let server: BroadcastServer
  let port: number
  let echo: Echo

  beforeEach(async () => {
    server = await createTestServer({ port: 0 })
    port = getServerPort(server)
  })

  afterEach(async () => {
    if (echo) {
      echo.disconnect()
    }
    await cleanupTestServer(server)
  })

  describe('Connection', () => {
    it('should connect to broadcast server', async () => {
      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo.isConnected())

      expect(echo.isConnected()).toBe(true)
    })

    it('should reconnect after disconnect', async () => {
      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
        autoReconnect: true,
        reconnectInterval: 100,
      })

      await waitFor(() => echo.isConnected())

      echo.disconnect()

      await waitFor(() => !echo.isConnected(), 1000)

      // Should reconnect automatically
      await waitFor(() => echo.isConnected(), 3000)

      expect(echo.isConnected()).toBe(true)
    })

    it('should provide socket ID', async () => {
      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo.socketId() !== null)

      const socketId = echo.socketId()
      expect(socketId).toBeDefined()
      expect(typeof socketId).toBe('string')
    })
  })

  describe('Public Channels', () => {
    beforeEach(async () => {
      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo.isConnected())
    })

    it('should subscribe to public channel', async () => {
      const channel = echo.channel('news')

      await waitFor(() => channel.isSubscribed, 2000)

      expect(channel.isSubscribed).toBe(true)
    })

    it('should receive events on public channel', async () => {
      const channel = echo.channel('news')

      let receivedEvent = false
      let eventData: any = null

      channel.listen('article.created', (data: any) => {
        receivedEvent = true
        eventData = data
      })

      await waitFor(() => channel.isSubscribed, 2000)

      // Broadcast from server
      server.broadcaster.send('news', 'article.created', {
        title: 'Breaking News',
        id: 123,
      })

      await waitFor(() => receivedEvent, 2000)

      expect(receivedEvent).toBe(true)
      expect(eventData.title).toBe('Breaking News')
      expect(eventData.id).toBe(123)
    })

    it('should unsubscribe from public channel', async () => {
      const channel = echo.channel('news')

      await waitFor(() => channel.isSubscribed, 2000)

      channel.unsubscribe()

      await waitFor(() => !channel.isSubscribed, 2000)

      expect(channel.isSubscribed).toBe(false)
    })

    it('should handle multiple listeners on same channel', async () => {
      const channel = echo.channel('news')

      let listener1Called = false
      let listener2Called = false

      channel.listen('update', () => {
        listener1Called = true
      })

      channel.listen('update', () => {
        listener2Called = true
      })

      await waitFor(() => channel.isSubscribed, 2000)

      server.broadcaster.send('news', 'update', { message: 'test' })

      await waitFor(() => listener1Called && listener2Called, 2000)

      expect(listener1Called).toBe(true)
      expect(listener2Called).toBe(true)
    })
  })

  describe('Private Channels', () => {
    beforeEach(async () => {
      // Setup authorization
      server.channels.channel('private-user.{userId}', () => true)

      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo.isConnected())
    })

    it('should subscribe to private channel', async () => {
      const channel = echo.private('user.123')

      await waitFor(() => channel.isSubscribed, 2000)

      expect(channel.isSubscribed).toBe(true)
    })

    it('should send and receive whisper events', async () => {
      const channel1 = echo.private('user.123')
      const echo2 = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo2.isConnected())

      const channel2 = echo2.private('user.123')

      await waitFor(() => channel1.isSubscribed && channel2.isSubscribed, 2000)

      let receivedWhisper = false
      let whisperData: any = null

      channel2.listenForWhisper('typing', (data: any) => {
        receivedWhisper = true
        whisperData = data
      })

      channel1.whisper('typing', { typing: true })

      await waitFor(() => receivedWhisper, 2000)

      expect(receivedWhisper).toBe(true)
      expect(whisperData.typing).toBe(true)

      echo2.disconnect()
    })
  })

  describe('Presence Channels', () => {
    beforeEach(async () => {
      // Setup presence authorization
      server.channels.channel('presence-chat.{roomId}', (ws) => {
        return {
          id: ws.data.socketId,
          info: {
            name: `User-${ws.data.socketId.slice(0, 8)}`,
          },
        }
      })

      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo.isConnected())
    })

    it('should subscribe to presence channel', async () => {
      const channel = echo.join('chat.room1')

      await waitFor(() => channel.isSubscribed, 2000)

      expect(channel.isSubscribed).toBe(true)
    })

    it('should receive current members on join', async () => {
      const channel = echo.join('chat.room1')

      await waitFor(() => channel.isSubscribed, 2000)

      const members = (channel as any).members
      expect(members).toBeDefined()
      expect(members.size).toBeGreaterThan(0)
    })

    it('should notify when member joins', async () => {
      const channel1 = echo.join('chat.room1')

      await waitFor(() => channel1.isSubscribed, 2000)

      let memberJoined = false
      let joinedMember: any = null

      channel1.here((_members: any[]) => {
        // Initial members
      })

      channel1.joining((_member: any) => {
        memberJoined = true
        joinedMember = _member
      })

      // Create second client
      const echo2 = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo2.isConnected())

      const channel2 = echo2.join('chat.room1')

      await waitFor(() => channel2.isSubscribed, 2000)
      await waitFor(() => memberJoined, 2000)

      expect(memberJoined).toBe(true)
      expect(joinedMember).toBeDefined()

      echo2.disconnect()
    })

    it('should notify when member leaves', async () => {
      const echo2 = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo2.isConnected())

      const channel1 = echo.join('chat.room1')
      const channel2 = echo2.join('chat.room1')

      await waitFor(() => channel1.isSubscribed && channel2.isSubscribed, 2000)

      let memberLeft = false

      channel1.leaving((_member: any) => {
        memberLeft = true
      })

      // Disconnect second client
      echo2.disconnect()

      await waitFor(() => memberLeft, 2000)

      expect(memberLeft).toBe(true)
    })
  })

  describe('Connection Events', () => {
    it('should emit connect event', async () => {
      let connected = false

      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      echo.connector.on('connect', () => {
        connected = true
      })

      await waitFor(() => connected, 2000)

      expect(connected).toBe(true)
    })

    it('should emit disconnect event', async () => {
      let disconnected = false

      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo.isConnected())

      echo.connector.on('disconnect', () => {
        disconnected = true
      })

      echo.disconnect()

      await waitFor(() => disconnected, 2000)

      expect(disconnected).toBe(true)
    })
  })

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', async () => {
      let errorOccurred = false

      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port: 9999, // Non-existent port
        autoReconnect: false,
      })

      echo.connector.on('error', () => {
        errorOccurred = true
      })

      await waitFor(() => errorOccurred, 2000)

      expect(errorOccurred).toBe(true)
    })

    it('should handle subscription errors', async () => {
      server.channels.channel('private-forbidden', () => false)

      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo.isConnected())

      let subscriptionFailed = false

      const channel = echo.private('forbidden')

      channel.error((_error: any) => {
        subscriptionFailed = true
      })

      await waitFor(() => subscriptionFailed, 2000)

      expect(subscriptionFailed).toBe(true)
    })
  })

  describe('Channel Management', () => {
    beforeEach(async () => {
      echo = new Echo({
        broadcaster: 'bun',
        host: '127.0.0.1',
        port,
      })

      await waitFor(() => echo.isConnected())
    })

    it('should leave channel', async () => {
      const channel = echo.channel('news')

      await waitFor(() => channel.isSubscribed, 2000)

      echo.leave('news')

      await waitFor(() => !channel.isSubscribed, 2000)

      expect(channel.isSubscribed).toBe(false)
    })

    it('should leave all channels on disconnect', async () => {
      const channel1 = echo.channel('news')
      const channel2 = echo.channel('announcements')

      await waitFor(() => channel1.isSubscribed && channel2.isSubscribed, 2000)

      echo.disconnect()

      await waitFor(() => !channel1.isSubscribed && !channel2.isSubscribed, 2000)

      expect(channel1.isSubscribed).toBe(false)
      expect(channel2.isSubscribed).toBe(false)
    })
  })
})
