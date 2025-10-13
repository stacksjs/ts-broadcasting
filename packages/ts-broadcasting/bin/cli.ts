import { CLI } from '@stacksjs/clapp'
import { version } from '../package.json'
import { config } from '../src/config'
import { BroadcastServer } from '../src/server'

const cli = new CLI('broadcast')

interface StartOptions {
  host?: string
  port?: number
  verbose?: boolean
  connection?: string
}

interface StatsOptions {
  connection?: string
  watch?: boolean
  interval?: number
}

let server: BroadcastServer | null = null

cli
  .command('start', 'Start the broadcasting WebSocket server')
  .option('--host <host>', 'The host to bind to')
  .option('--port <port>', 'The port to listen on')
  .option('--connection <connection>', 'The connection to use from config')
  .option('--verbose', 'Enable verbose logging')
  .example('broadcast start')
  .example('broadcast start --host 0.0.0.0 --port 6001')
  .example('broadcast start --verbose')
  .action(async (options?: StartOptions) => {
    try {
      // Override config with CLI options
      const serverConfig = { ...config }

      if (options?.verbose !== undefined) {
        serverConfig.verbose = options.verbose
      }

      const connectionName = options?.connection || serverConfig.default || 'bun'
      const connectionConfig = serverConfig.connections?.[connectionName]

      if (!connectionConfig) {
        console.error(`Connection '${connectionName}' not found in configuration`)
        process.exit(1)
      }

      if (options?.host) {
        connectionConfig.host = options.host
      }

      if (options?.port) {
        connectionConfig.port = options.port
      }

      server = new BroadcastServer(serverConfig)

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\nShutting down server...')
        await server?.stop()
        process.exit(0)
      })

      process.on('SIGTERM', async () => {
        console.log('\nShutting down server...')
        await server?.stop()
        process.exit(0)
      })

      await server.start()

      // Keep process alive
      await new Promise(() => {})
    }
    catch (error) {
      console.error('Failed to start server:', error)
      process.exit(1)
    }
  })

cli
  .command('stats', 'Show server statistics')
  .option('--connection <connection>', 'The connection to query')
  .option('--watch', 'Watch mode - continuously update stats')
  .option('--interval <interval>', 'Update interval in seconds for watch mode', { default: 5 })
  .example('broadcast stats')
  .example('broadcast stats --watch')
  .example('broadcast stats --watch --interval 2')
  .action(async (options?: StatsOptions) => {
    const connectionName = options?.connection || config.default || 'bun'
    const connectionConfig = config.connections?.[connectionName]

    if (!connectionConfig) {
      console.error(`Connection '${connectionName}' not found in configuration`)
      process.exit(1)
    }

    const host = connectionConfig.host || '127.0.0.1'
    const port = connectionConfig.port || 6001
    const url = `http://${host}:${port}/stats`

    const fetchStats = async () => {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        const stats = await response.json()
        return stats
      }
      catch (error) {
        throw new Error(`Failed to fetch stats: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    const displayStats = (stats: any) => {
      if (options?.watch) {
        console.clear()
      }

      console.log('Broadcasting Server Statistics')
      console.log('==============================')
      console.log(`Connections: ${stats.connections}`)
      console.log(`Channels: ${stats.channels}`)
      console.log(`Uptime: ${Math.floor(stats.uptime)}s`)
      console.log(`Last updated: ${new Date().toLocaleTimeString()}`)
    }

    if (options?.watch) {
      const interval = (options.interval || 5) * 1000

      const update = async () => {
        try {
          const stats = await fetchStats()
          displayStats(stats)
        }
        catch (error) {
          console.error(error instanceof Error ? error.message : 'Unknown error')
        }
      }

      // Initial fetch
      await update()

      // Update periodically
      setInterval(update, interval)

      // Keep process alive
      await new Promise(() => {})
    }
    else {
      try {
        const stats = await fetchStats()
        displayStats(stats)
      }
      catch (error) {
        console.error(error instanceof Error ? error.message : 'Unknown error')
        process.exit(1)
      }
    }
  })

cli
  .command('config', 'Show the current configuration')
  .example('broadcast config')
  .action(() => {
    console.log('Broadcasting Configuration')
    console.log('=========================')
    console.log(JSON.stringify(config, null, 2))
  })

cli.command('version', 'Show the version of the CLI').action(() => {
  console.log(version)
})

cli.version(version)
cli.help()
cli.parse()
