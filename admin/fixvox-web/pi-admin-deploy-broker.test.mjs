import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { AdminDeployBroker } from './pi-admin-deploy-broker.mjs'

const hash = 'a'.repeat(40)

function fixture(temp, overrides = {}) {
  const calls = []
  const operations = {
    inspect: async () => ({ hash, branch: 'main', clean: true, ...overrides.state }),
    check: async (file) => calls.push(['check', path.basename(file)]),
    backup: async (_root, _manifest, backup) => { calls.push(['backup']); await fs.writeFile(backup, 'backup') },
    copy: async () => { calls.push(['copy']); if (overrides.copyFails) throw new Error('copy failed') },
    restart: async () => calls.push(['restart']),
    health: async () => { calls.push(['health']); if (overrides.healthFailsOnce && calls.filter(([name]) => name === 'health').length === 1) throw new Error('health failed') },
    restore: async () => calls.push(['restore']),
  }
  return { broker: new AdminDeployBroker({ sourceRoot: '/source', targetRoot: '/target', backupRoot: temp, manifest: ['server.mjs', 'public/app.js'], operations }), calls }
}

test('admin deploy requires exact clean main hash and bounded manifest', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-deploy-broker-'))
  try {
    await assert.rejects(() => fixture(temp).broker.deploy('bad'), (error) => error.status === 400)
    await assert.rejects(() => fixture(temp, { state: { branch: 'feature' } }).broker.deploy(hash), (error) => error.status === 409)
    const { broker, calls } = fixture(temp)
    const result = await broker.deploy(hash)
    assert.equal(result.sourceHash, hash)
    assert.deepEqual(calls.map(([name]) => name), ['check', 'check', 'backup', 'copy', 'restart', 'health'])
  } finally { await fs.rm(temp, { recursive: true, force: true }) }
})

test('failed health restores backup and verifies rollback', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-deploy-rollback-'))
  try {
    const { broker, calls } = fixture(temp, { healthFailsOnce: true })
    await assert.rejects(() => broker.deploy(hash), /rollback restored and verified/)
    assert.deepEqual(calls.map(([name]) => name), ['check', 'check', 'backup', 'copy', 'restart', 'health', 'restore', 'restart', 'health'])
  } finally { await fs.rm(temp, { recursive: true, force: true }) }
})
