import { dts } from 'bun-plugin-dtsx'

// eslint-disable-next-line ts/no-top-level-await
await Bun.build({
  entrypoints: ['src/index.ts', 'bin/cli.ts'],
  outdir: './dist',
  splitting: true,
  minify: true,
  target: 'bun',
  plugins: [dts()],
})
