import { expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('the installed batch SDK preserves constructor positions and runtime defaults', async () => {
  const directory = await mkdtemp(join(process.env.BROADCAST_PACKAGE_EVIDENCE ?? tmpdir(), 'broadcast-package-'))
  const consumer = join(directory, 'consumer')
  const archive = join(directory, 'package.tgz')
  const commands: Array<Record<string, unknown>> = []
  const receipt: Record<string, unknown> = { directory, commands, completed: false }
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
  async function run(phase: string, args: string[], cwd: string) {
    const env: Record<string, string | undefined> = { ...process.env, DO_NOT_TRACK: '1', NO_TELEMETRY: '1' }
    for (const key of Object.keys(env)) if (/token|password|secret|private_key|^npm_config_|^bun_auth_/i.test(key)) delete env[key]
    const child = Bun.spawn(args, { cwd, env, stdout: 'pipe', stderr: 'pipe', timeout: 120_000 })
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    const output = stdout + stderr
    const log = `${commands.length}-${phase}.log`
    await writeFile(join(directory, log), output)
    commands.push({ phase, args, cwd, code, log, diagnostics: [...output.matchAll(/error TS(\d+)/g)].map(match => Number(match[1])) })
    return { code, output }
  }
  try {
    if (process.env.BROADCAST_PACKAGE_ARCHIVE) {
      receipt.archiveInput = resolve(process.env.BROADCAST_PACKAGE_ARCHIVE)
      await copyFile(resolve(process.env.BROADCAST_PACKAGE_ARCHIVE), archive)
    }
    else {
      const packed = await run('pack', [process.execPath, '--no-env-file', 'pm', 'pack', '--filename', archive], resolve(import.meta.dir, '..'))
      expect(packed.code, packed.output).toBe(0)
    }
    const bytes = await readFile(archive)
    receipt.archiveSHA256 = hash(bytes)
    const files = await new Bun.Archive(bytes).files()
    const manifest = await files.get('package/package.json')!.json()
    expect(manifest.name).toBe('ts-broadcasting')
    receipt.version = manifest.version
    await mkdir(consumer)
    const consumerManifest = { private: true, type: 'module', dependencies: { 'ts-broadcasting': `file:${archive}` }, devDependencies: { typescript: '7.0.2', '@types/bun': '1.4.4' } }
    receipt.consumerManifest = consumerManifest
    await writeFile(join(consumer, 'package.json'), JSON.stringify(consumerManifest))
    const compilerOptions = { target: 'ESNext', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: false, paths: {}, types: ['bun'], noEmit: true }
    receipt.compilerOptions = compilerOptions
    await writeFile(join(consumer, 'tsconfig.json'), JSON.stringify({ compilerOptions, files: ['control.ts'] }))
    const prefix = `import { BatchOperationsManager, ChannelManager } from 'ts-broadcasting';
import type { BatchSubscribeResult, WebSocketData } from 'ts-broadcasting';
import type { ServerWebSocket } from 'bun';
type IsAny<T> = 0 extends (1 & T) ? true : false;
const channels = new ChannelManager();
declare const socket: ServerWebSocket<WebSocketData>;`
    const controls = [
      { text: `const batch = new BatchOperationsManager(undefined, channels);
const result = batch.batchSubscribe(socket, { channels: ['news'] });
const precise: Promise<BatchSubscribeResult> = result;
const safeConfig: false = null as unknown as IsAny<ConstructorParameters<typeof BatchOperationsManager>[0]>;
const safeItem: false = null as unknown as IsAny<Awaited<typeof result>['succeeded'][number]>;` },
      { code: 2554, text: 'new BatchOperationsManager()' },
      { code: 2554, text: 'new BatchOperationsManager(undefined)' },
      { code: 2322, text: "new BatchOperationsManager({ enabled: 'yes' }, channels)" },
      { code: 2339, text: "const phantom = new BatchOperationsManager(undefined, channels).notABatchMethod" },
    ]
    const nativeCLI = process.env.BROADCAST_PACKAGE_ARCHIVE ? process.env.BROADCAST_NATIVE_CLI : resolve(import.meta.dir, '../../../bin/broadcast')
    if (!process.env.BROADCAST_PACKAGE_ARCHIVE) expect(nativeCLI).toBeDefined()
    if (nativeCLI) receipt.nativeCLI = { path: resolve(nativeCLI), sha256: hash(await readFile(nativeCLI)) }
    let lockSHA256: string | undefined
    for (const flags of [[], ['--frozen-lockfile']]) {
      const phase = flags.length ? 'frozen' : 'normal'
      const installed = await run(`${phase}-install`, [process.execPath, '--no-env-file', 'install', '--registry=https://registry.npmjs.org', ...flags], consumer)
      expect(installed.code, installed.output).toBe(0)
      const lock = hash(await readFile(join(consumer, 'bun.lock')))
      if (lockSHA256) expect(lock).toBe(lockSHA256)
      else { lockSHA256 = lock; receipt.lockSHA256 = lock }
      for (const [name, file] of files) {
        expect(name.startsWith('package/') && !name.split('/').includes('..')).toBe(true)
        const installed = await readFile(join(consumer, 'node_modules/ts-broadcasting', name.slice('package/'.length)))
        expect(hash(installed), name).toBe(hash(new Uint8Array(await file.arrayBuffer())))
      }
      for (const [name, expected] of Object.entries({ typescript: '7.0.2', '@types/bun': '1.4.4' })) {
        expect((await Bun.file(join(consumer, 'node_modules', name, 'package.json')).json()).version).toBe(expected)
      }
      for (const [index, control] of controls.entries()) {
        await writeFile(join(consumer, 'control.ts'), `${prefix}\n${control.text}\n`)
        const checked = await run(`${phase}-types-${index}`, [process.execPath, '--no-env-file', join(consumer, 'node_modules/typescript/lib/tsc.js'), '--project', 'tsconfig.json'], consumer)
        expect(checked.code === 0, checked.output).toBe(index === 0)
        if ('code' in control) {
          expect(checked.output.match(/error TS\d+/g), checked.output).toEqual([`error TS${control.code}`])
          expect(checked.output).toContain('control.ts(')
        }
      }
      await writeFile(join(consumer, 'runtime.js'), `import assert from 'node:assert/strict';
import { BatchOperationsManager, ChannelManager } from 'ts-broadcasting';
const batch = new BatchOperationsManager(undefined, new ChannelManager());
const calls = [];
const request = { channels: ['news', 'updates'], event: 'ready', data: { value: 7 } };
const result = batch.batchBroadcast((...args) => calls.push(args), request);
assert.deepEqual(result, { succeeded: ['news', 'updates'], failed: {} });
assert.deepEqual(calls, [['news', 'ready', { value: 7 }, undefined], ['updates', 'ready', { value: 7 }, undefined]]);
const boundaryChannels = Array.from({ length: 50 }, (_, index) => 'room-' + index);
const boundaryCalls = [];
const boundary = batch.batchBroadcast((...args) => boundaryCalls.push(args), { ...request, channels: boundaryChannels });
assert.deepEqual(boundary, { succeeded: boundaryChannels, failed: {} });
assert.deepEqual(boundaryCalls, boundaryChannels.map(channel => [channel, 'ready', { value: 7 }, undefined]));
assert.throws(() => batch.batchBroadcast(() => {}, { ...request, channels: Array.from({ length: 51 }, (_, index) => 'room-' + index) }), /Batch size exceeds maximum/);
assert.throws(() => new BatchOperationsManager({ enabled: false }, new ChannelManager()).batchBroadcast(() => {}, request), /Batch operations are disabled/);
console.log('PASS installed batch SDK');`)
      const runtime = await run(`${phase}-runtime`, [process.execPath, '--no-env-file', 'runtime.js'], consumer)
      expect(runtime.code, runtime.output).toBe(0)
      expect(runtime.output.trim()).toBe('PASS installed batch SDK')
      const cli = await run(`${phase}-cli-help`, [process.execPath, '--no-env-file', join(consumer, 'node_modules/ts-broadcasting/dist/bin/cli.js'), '--help'], consumer)
      expect(cli.code, cli.output).toBe(0)
      expect(cli.output).toMatch(/usage/i)
      if (nativeCLI) {
        const native = await run(`${phase}-native-cli-help`, [resolve(nativeCLI), '--help'], consumer)
        expect(native.code, native.output).toBe(0)
        expect(native.output).toMatch(/usage/i)
      }
    }
    receipt.completed = true
  }
  finally {
    await writeFile(join(directory, 'receipt.json'), JSON.stringify(receipt, null, 2))
    await rm(join(consumer, 'node_modules'), { recursive: true, force: true })
    if (!process.env.BROADCAST_PACKAGE_EVIDENCE) await rm(directory, { recursive: true, force: true })
  }
}, 180_000)
