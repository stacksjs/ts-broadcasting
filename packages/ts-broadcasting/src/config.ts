import type { BroadcastConfig } from './types'
import { loadConfig } from 'bunfig'

export const defaultConfig: BroadcastConfig = {
  verbose: true,
}

// eslint-disable-next-line antfu/no-top-level-await
export const config: BroadcastConfig = await loadConfig({
  name: 'broadcast',
  alias: 'realtime',
  defaultConfig,
})
