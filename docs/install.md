# Install

Installing `ts-broadcasting` is straightforward. It requires [Bun](https://bun.sh) as its runtime.

## Package Managers

::: code-group

```sh [bun]
bun add ts-broadcasting
```

```sh [npm]
npm install ts-broadcasting
```

```sh [pnpm]
pnpm add ts-broadcasting
```

```sh [yarn]
yarn add ts-broadcasting
```

:::

## Requirements

- [Bun](https://bun.sh) v1.0 or later (required as the server runtime)
- Node.js 18+ (for the client SDK only, if not using Bun)

## Verify Installation

After installing, you can verify by starting a simple server:

```ts
import { BroadcastServer } from 'ts-broadcasting'

const server = new BroadcastServer({
  driver: 'bun',
  connections: {
    bun: {
      driver: 'bun',
      host: 'localhost',
      port: 6001,
    },
  },
})

await server.start()
console.log('Broadcasting server running on ws://localhost:6001')
```

Run it with:

```bash
bun run server.ts
```

## CLI Installation

ts-broadcasting includes a CLI binary. After installation, you can use it directly:

```bash
# Via bunx
bunx broadcast start

# Or if installed globally
bun add -g ts-broadcasting
broadcast start
```

## Configuration File

Create a `broadcast.config.ts` file in your project root for automatic configuration loading:

```ts
import type { BroadcastConfig } from 'ts-broadcasting'

const config: BroadcastConfig = {
  driver: 'bun',
  default: 'bun',
  connections: {
    bun: {
      driver: 'bun',
      host: '0.0.0.0',
      port: 6001,
      scheme: 'ws',
    },
  },
}

export default config
```

The config file is loaded automatically via `bunfig`. You can also use `realtime.config.ts` as an alias.

Read more about configuration in the [Configuration](/config) section.

## Next Steps

- [Getting Started](/guide/getting-started) - Set up your server and client
- [Configuration](/config) - Full configuration reference
- [Usage](/usage) - Common usage patterns
