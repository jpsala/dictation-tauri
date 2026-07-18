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
  await fs.writeFile(path.join(root, '.env'), 'secret')
  const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\pi-workspace-${process.pid}-${Date.now()}` : path.join(temp, 'broker.sock')
  const server = createWorkspaceBroker({ roots: [root] })
  server.listen(socketPath)
  await once(server, 'listening')
  const operations = createBrokerOperations(socketPath)
  try {
    assert.equal((await operations.read.readFile(path.join(root, 'read.txt'))).toString(), 'hello')
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
