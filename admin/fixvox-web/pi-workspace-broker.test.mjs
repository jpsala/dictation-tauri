import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { once } from 'node:events'
import { createBrokerOperations } from './pi-workspace-broker-client.mjs'
import { createWorkspaceBroker } from './pi-workspace-broker.mjs'

test('workspace broker performs bounded repo operations and blocks escapes/secrets', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-workspace-broker-'))
  const root = path.join(temp, 'workspace')
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, 'read.txt'), 'hello')
  await fs.writeFile(path.join(root, 'safe.txt'), 'needle one\nneedle two\nneedle three\n')
  await fs.writeFile(path.join(root, '.env'), 'secret needle')
  for (const secretDir of ['stores', 'sessions']) {
    await fs.mkdir(path.join(root, secretDir))
    await fs.writeFile(path.join(root, secretDir, 'private.txt'), 'secret needle')
  }
  await fs.writeFile(path.join(root, 'private.sqlite'), 'secret needle')
  await fs.writeFile(path.join(root, 'private.db'), 'secret needle')
  const outside = path.join(temp, 'outside')
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'outside.txt'), 'secret needle')
  await fs.symlink(outside, path.join(root, 'linked-outside'), process.platform === 'win32' ? 'junction' : 'dir')
  const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\pi-workspace-${process.pid}-${Date.now()}` : path.join(temp, 'broker.sock')
  const server = createWorkspaceBroker({ roots: [root] })
  server.listen(socketPath)
  await once(server, 'listening')
  const operations = createBrokerOperations(socketPath)
  try {
    assert.equal((await operations.read.readFile(path.join(root, 'read.txt'))).toString(), 'hello')
    const entries = await operations.ls.readdir(root)
    assert.ok(entries.includes('read.txt'))
    assert.ok(!entries.includes('.env'))
    assert.ok(!entries.includes('stores'))
    assert.ok(!entries.includes('sessions'))
    assert.ok(!entries.includes('private.sqlite'))
    assert.ok(!entries.includes('private.db'))
    const found = await operations.find.glob('**/*.txt', root, { ignore: [], limit: 20 })
    assert.ok(found.includes('read.txt'))
    assert.ok(!found.some((entry) => entry.includes('linked-outside') || entry.includes('private.txt')))
    const matches = await operations.grep({ pattern: 'HELLO', path: root, literal: true, ignoreCase: true, limit: 20 })
    assert.deepEqual(matches, [{ path: 'read.txt', line: 1, text: 'hello' }])
    assert.deepEqual(await operations.grep({ pattern: 'secret', path: root, literal: true, limit: 20 }), [])
    const limited = await operations.grep({ pattern: 'needle', path: root, literal: true, limit: 2 })
    assert.equal(limited.length, 2)
    assert.ok(limited.every((match) => match.path === 'safe.txt' && match.text.length <= 500))
    await assert.rejects(() => operations.grep({ pattern: '[invalid', path: root, limit: 20 }), /Grep failed/)
    await assert.rejects(() => operations.find.glob('../../*', root, { ignore: [], limit: 20 }), /Unsafe glob/)
    await assert.rejects(() => operations.find.glob(path.resolve(root, '*'), root, { ignore: [], limit: 20 }), /Unsafe glob/)
    await operations.write.mkdir(path.join(root, 'nested'))
    await operations.write.writeFile(path.join(root, 'nested', 'new.txt'), 'written')
    assert.equal(await fs.readFile(path.join(root, 'nested', 'new.txt'), 'utf8'), 'written')
    if (process.platform !== 'win32') {
      let output = ''
      const result = await operations.bash.exec('printf broker-ok', root, { onData: (chunk) => { output += chunk.toString() }, timeout: 5 })
      assert.equal(result.exitCode, 0)
      assert.equal(output, 'broker-ok')
    }
    await assert.rejects(() => operations.read.readFile(path.join(root, '.env')), /Sensitive paths/)
    await assert.rejects(() => operations.read.readFile(path.join(temp, 'outside.txt')), /outside approved/)
    await assert.rejects(() => operations.bash.exec('cat ~/.ssh/id_ed25519', root, { onData() {}, timeout: 5 }), /discovery is blocked/)
  } finally {
    server.close()
    await once(server, 'close')
    await fs.rm(temp, { recursive: true, force: true })
  }
})
