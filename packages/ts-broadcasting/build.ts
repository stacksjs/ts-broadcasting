import { rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { dts } from 'bun-plugin-dtsx'

// eslint-disable-next-line ts/no-top-level-await
const result = await Bun.build({
  entrypoints: ['src/index.ts', 'bin/cli.ts'],
  outdir: './dist',
  splitting: true,
  minify: true,
  target: 'bun',
  plugins: [dts()],
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs)
    console.error(log)

  process.exit(1)
}

/**
 * Refuse to ship a bundle that cannot be compiled into a binary.
 *
 * A module-scope `await import()` is easy to write and looks harmless — the
 * usual shape is a try/catch probe for an optional dependency. What it
 * actually does is make the module top-level-await, which every importer
 * inherits, and `bun build --compile` refuses to bundle a `require()` of
 * anything that transitively contains one.
 *
 * So the cost is not paid here. It is paid by whichever downstream project
 * compiles a binary: their release job fails, several dependency hops away,
 * pointing at a file nobody there has opened.
 *
 * The check asks Bun rather than reading the output, because Bun is the thing
 * that will refuse it. Scanning minified text for `await` cannot tell a
 * module-scope await from one inside an async function, and a guard that
 * cries wolf is a guard someone deletes.
 */
async function assertCompilable(entry: string): Promise<void> {
  const probe = join(tmpdir(), `ts-broadcasting-compile-probe-${process.pid}.ts`)
  const output = join(tmpdir(), `ts-broadcasting-compile-probe-${process.pid}.bin`)

  // `require`, not `import`: that is the call bun --compile rejects, and it is
  // how downstream consumers reach this package from a CLI entry.
  await writeFile(probe, `require(${JSON.stringify(resolve(entry))})\n`)

  const built = Bun.spawnSync([
    'bun',
    'build',
    probe,
    '--compile',
    '--target=bun',
    '--outfile',
    output,
  ], { stderr: 'pipe', stdout: 'pipe' })

  await rm(probe, { force: true })
  await rm(output, { force: true })

  if (built.exitCode === 0)
    return

  const message = built.stderr.toString()

  console.error(`\n${entry} cannot be compiled into a binary, so neither can anything that imports it:\n`)
  console.error(message.trim())
  console.error('\nA top-level await is the usual cause. Move it inside a function — an optional-dependency probe can load on first use.\n')
  process.exit(1)
}

// eslint-disable-next-line ts/no-top-level-await
await assertCompilable('./dist/src/index.js')
