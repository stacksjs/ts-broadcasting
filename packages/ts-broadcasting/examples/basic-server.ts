import { BroadcastServer, config } from '../src'

// Create and start a basic broadcasting server
async function main() {
  const server = new BroadcastServer(config)

  // Define channel authorizations
  server.channels.channel('private-user.{userId}', (ws, _data) => {
    // Only allow users to subscribe to their own private channel
    return ws.data.user?.id === Number.parseInt((ws.data.channels.values().next().value as string).split('.')[1])
  })

  server.channels.channel('presence-chat.{roomId}', (ws, _data) => {
    // Return user info for presence channels
    return {
      id: ws.data.user?.id || ws.data.socketId,
      info: {
        name: ws.data.user?.name || 'Anonymous',
      },
    }
  })

  await server.start()

  console.warn('Broadcasting server is running!')
  console.warn('Connect with: ws://localhost:6001/ws')
}

main().catch(console.error)
