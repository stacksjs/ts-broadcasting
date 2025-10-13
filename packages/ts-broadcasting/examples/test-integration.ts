/**
 * Integration test example for the broadcasting system
 *
 * This demonstrates how to test your broadcasting setup
 * Run with: bun run examples/test-integration.ts
 */

/* eslint-disable no-console */
import process from 'node:process'
import { Broadcaster, BroadcastServer, config } from '../src'

async function runIntegrationTest() {
  console.log('🚀 Starting Broadcasting Integration Test\n')

  // 1. Start the server
  console.log('1️⃣ Starting server...')
  const server = new BroadcastServer({
    ...config,
    verbose: false, // Disable verbose for cleaner test output
  })

  // Setup channel authorizations
  server.channels.channel('private-test.{id}', (_ws) => {
    console.log(`   ✓ Authorizing private-test channel`)
    return true // Allow all for testing
  })

  server.channels.channel('presence-room.{roomId}', (ws) => {
    console.log(`   ✓ Authorizing presence-room channel`)
    return {
      id: ws.data.socketId,
      info: {
        name: 'Test User',
        connectedAt: ws.data.connectedAt,
      },
    }
  })

  await server.start()
  console.log(`   ✅ Server started on localhost:6001\n`)

  // 2. Create WebSocket clients
  console.log('2️⃣ Creating WebSocket clients...')

  const client1 = await createClient('Client 1')
  const client2 = await createClient('Client 2')

  console.log(`   ✅ Both clients connected\n`)

  // 3. Test public channel
  console.log('3️⃣ Testing public channel...')
  await subscribeClient(client1, 'announcements')
  await subscribeClient(client2, 'announcements')

  // Broadcast to public channel
  const broadcaster = new Broadcaster(server, config)
  broadcaster.send('announcements', 'TestMessage', {
    message: 'Hello everyone!',
  })

  await sleep(100)
  console.log(`   ✅ Public channel broadcast successful\n`)

  // 4. Test private channel
  console.log('4️⃣ Testing private channel...')
  await subscribeClient(client1, 'private-test.123')

  broadcaster.send('private-test.123', 'PrivateMessage', {
    message: 'This is private',
  })

  await sleep(100)
  console.log(`   ✅ Private channel broadcast successful\n`)

  // 5. Test presence channel
  console.log('5️⃣ Testing presence channel...')
  await subscribeClient(client1, 'presence-room.lobby')
  await subscribeClient(client2, 'presence-room.lobby')

  broadcaster.send('presence-room.lobby', 'RoomMessage', {
    message: 'Welcome to the lobby!',
  })

  await sleep(100)
  console.log(`   ✅ Presence channel broadcast successful\n`)

  // 6. Test stats
  console.log('6️⃣ Checking server stats...')
  console.log(`   Connections: ${server.getConnectionCount()}`)
  console.log(`   Channels: ${server.channels.getChannelCount()}`)
  console.log(`   'announcements' subscribers: ${server.getSubscriberCount('announcements')}`)
  console.log(`   ✅ Stats retrieved successfully\n`)

  // 7. Cleanup
  console.log('7️⃣ Cleaning up...')
  client1.close()
  client2.close()
  await sleep(100)
  await server.stop()
  console.log(`   ✅ Cleanup complete\n`)

  console.log('✅ All tests passed! 🎉')
  process.exit(0)
}

// Helper functions
function createClient(name: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket('ws://localhost:6001/ws')
    let socketId: string

    ws.onopen = () => {
      console.log(`   ✓ ${name} connected`)
    }

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data.toString())

      if (message.event === 'connection_established') {
        socketId = message.data.socket_id
        console.log(`   ✓ ${name} established (${socketId.slice(0, 8)}...)`)
        resolve(ws)
      }
      else {
        console.log(`   📨 ${name} received: ${message.event}`)
      }
    }

    ws.onerror = (error) => {
      console.error(`   ✗ ${name} error:`, error)
      reject(error)
    }

    ws.onclose = () => {
      console.log(`   ✓ ${name} disconnected`)
    }
  })
}

function subscribeClient(ws: WebSocket, channel: string): Promise<void> {
  return new Promise((resolve) => {
    const listener = (event: MessageEvent) => {
      const message = JSON.parse(event.data.toString())
      if (message.event === 'subscription_succeeded' && message.channel === channel) {
        ws.removeEventListener('message', listener)
        resolve()
      }
    }

    ws.addEventListener('message', listener)

    ws.send(JSON.stringify({
      event: 'subscribe',
      channel,
    }))
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

// Run the test
runIntegrationTest().catch((error) => {
  console.error('❌ Test failed:', error)
  process.exit(1)
})
