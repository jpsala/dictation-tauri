import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import test from 'node:test'
import { once } from 'node:events'
import { AdminDeployBroker } from './pi-admin-deploy-broker.mjs'
import { createAdminDeployServer } from './pi-admin-deploy-service.mjs'

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

test('deploy HTTP surface is bounded and rejects caller-controlled fields', async () => {
  const socketPath = process.platform === 'win32' ? `\\\\.\\pipe\\admin-deploy-${process.pid}-${Date.now()}` : path.join(os.tmpdir(), `admin-deploy-${process.pid}-${Date.now()}.sock`)
  const seen = []
  const server = createAdminDeployServer({ deploy: async (sourceHash) => { seen.push(sourceHash); return { ok: true, sourceHash } } })
  server.listen(socketPath); await once(server, 'listening')
  const send = (body) => new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path: '/v1/deploy', method: 'POST', headers: { 'content-type': 'application/json' } }, (response) => { const chunks=[]; response.on('data', (chunk)=>chunks.push(chunk)); response.on('end',()=>{ try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks)) }) } catch (error) { reject(error) } }) })
    request.on('error', reject); request.end(body)
  })
  try {
    assert.equal((await send('{bad')).status, 400)
    assert.equal((await send(JSON.stringify({ sourceHash: hash, command: 'rm -rf /' }))).status, 400)
    assert.equal((await send(JSON.stringify({ sourceHash: hash, padding: 'x'.repeat(5000) }))).status, 413)
    assert.equal((await send(JSON.stringify({ sourceHash: hash }))).status, 200)
    assert.deepEqual(seen, [hash])
  } finally { server.close(); await once(server, 'close') }
})
