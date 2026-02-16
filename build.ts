import { dts } from 'bun-plugin-dtsx'

await Bun.build({
  entrypoints: ['packages/ts-broadcasting/src/index.ts'],
  outdir: './dist',
  target: 'bun',
  plugins: [dts({
    root: 'packages/ts-broadcasting/src',
    outdir: './dist',
  })],
})
