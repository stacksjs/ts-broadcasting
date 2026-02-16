import { dts } from 'bun-plugin-dtsx'

// eslint-disable-next-line ts/no-top-level-await
await Bun.build({
  entrypoints: ['packages/ts-broadcasting/src/index.ts'],
  outdir: './dist',
  target: 'bun',
  plugins: [dts({
    root: 'packages/ts-broadcasting/src',
    outdir: './dist',
  } as any)],
})
