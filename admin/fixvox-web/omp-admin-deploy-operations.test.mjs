import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { ADMIN_DEPLOY_MANIFEST, createAdminDeployOperations } from './omp-admin-deploy-operations.mjs'

async function fixture() {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'admin-deploy-operations-'))
  const sourceRoot = path.join(temp, 'source')
  const sourceAdmin = path.join(sourceRoot, 'admin', 'fixvox-web')
  const targetRoot = path.join(temp, 'fixvox-web')
  const backup = path.join(temp, 'backup.tar.gz')
  const archive = path.join(temp, 'archive')
  await fs.mkdir(sourceAdmin, { recursive: true })
  await fs.mkdir(targetRoot, { recursive: true })
  for (const relative of ADMIN_DEPLOY_MANIFEST) {
    const source = path.join(sourceAdmin, relative)
    await fs.mkdir(path.dirname(source), { recursive: true })
    await fs.writeFile(source, `release:${relative}`)
  }
  await fs.mkdir(path.join(targetRoot, 'public'), { recursive: true })
  await fs.writeFile(path.join(targetRoot, 'server.mjs'), 'before:server')
  await fs.writeFile(path.join(targetRoot, 'public', 'unrelated.txt'), 'preserve unrelated WIP')
  const run = async (file, args) => {
    if (file === '/usr/bin/cp') {
      await fs.cp(targetRoot, args.at(-1), { recursive: true, force: true })
      return
    }
    assert.equal(file, '/usr/bin/tar')
    if (args[0] === '-czf') {
      await fs.rm(archive, { recursive: true, force: true })
      await fs.cp(targetRoot, archive, { recursive: true })
      await fs.writeFile(args[1], 'verified archive fixture')
    } else if (args[0] === '-xzf') {
      await fs.cp(archive, args[args.indexOf('-C') + 1], { recursive: true, force: true })
    } else {
      assert.equal(args[0], '-dzf')
    }
  }
  const config = {
    sourceRoot,
    targetRoot,
    backupRoot: temp,
    adminHome: temp,
    adminUid: 1000,
    adminGid: 1000,
    localHealthUrl: 'http://local/healthz',
    publicHealthUrl: 'https://public/healthz',
  }
  const dependencies = {
    filesystem: { ...fs, chmod: async () => {}, chown: async () => {} },
    run,
    fetch: async () => ({ ok: true }),
  }
  const operations = createAdminDeployOperations(config, dependencies)
  return { temp, targetRoot, backup, operations, config, dependencies }
}

test('Admin deploy clones the complete live directory, verifies hashes, swaps once, and rolls back exactly', async () => {
  const { temp, targetRoot, backup, operations } = await fixture()
  try {
    await operations.backup(targetRoot, ADMIN_DEPLOY_MANIFEST, backup)
    const initialManifest = JSON.parse(await fs.readFile(`${backup}.manifest.json`, 'utf8'))
    assert.equal(initialManifest.version, 2)
    assert.deepEqual(initialManifest.existing, ['server.mjs'])
    assert.deepEqual(initialManifest.absent, ADMIN_DEPLOY_MANIFEST.filter((relative) => relative !== 'server.mjs'))
    assert.match(initialManifest.hashes['server.mjs'], /^[a-f0-9]{64}$/)

    await operations.copy('', targetRoot, ADMIN_DEPLOY_MANIFEST)
    for (const relative of ADMIN_DEPLOY_MANIFEST) {
      assert.equal(await fs.readFile(path.join(targetRoot, relative), 'utf8'), `release:${relative}`)
    }
    assert.equal(await fs.readFile(path.join(targetRoot, 'public', 'unrelated.txt'), 'utf8'), 'preserve unrelated WIP')
    const activatedManifest = JSON.parse(await fs.readFile(`${backup}.manifest.json`, 'utf8'))
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(temp, '.fixvox-web.transaction.json'), 'utf8')),
      { version: 1, backup, direction: 'deploy', phase: 'activated' },
    )
    assert.equal(Object.keys(activatedManifest.sourceHashes).length, ADMIN_DEPLOY_MANIFEST.length)

    await operations.restore(targetRoot, backup)
    assert.equal(await fs.readFile(path.join(targetRoot, 'server.mjs'), 'utf8'), 'before:server')
    for (const relative of initialManifest.absent) {
      await assert.rejects(() => fs.readFile(path.join(targetRoot, relative)), (error) => error.code === 'ENOENT')
    }
    assert.equal(await fs.readFile(path.join(targetRoot, 'public', 'unrelated.txt'), 'utf8'), 'preserve unrelated WIP')
    await operations.health()
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
})

test('a failed second rename restores the original live directory instead of leaving a partial activation', async () => {
  const { temp, targetRoot, backup } = await fixture()
  let rejectActivation = true
  const filesystem = {
    ...fs,
    chmod: async () => {},
    chown: async () => {},
    rename: async (source, target) => {
      if (rejectActivation && source.includes('.candidate-') && target === targetRoot) {
        rejectActivation = false
        throw Object.assign(new Error('injected activation rename failure'), { code: 'EIO' })
      }
      return fs.rename(source, target)
    },
  }
  const sourceRoot = path.join(temp, 'source')
  const archive = path.join(temp, 'archive-second-rename')
  const run = async (file, args) => {
    if (file === '/usr/bin/cp') return fs.cp(targetRoot, args.at(-1), { recursive: true, force: true })
    if (args[0] === '-czf') {
      await fs.cp(targetRoot, archive, { recursive: true })
      await fs.writeFile(args[1], 'archive')
    }
  }
  const operations = createAdminDeployOperations({ sourceRoot, targetRoot, backupRoot: temp, adminHome: temp, adminUid: 1, adminGid: 1 }, { filesystem, run })
  try {
    await operations.backup(targetRoot, ADMIN_DEPLOY_MANIFEST, backup)
    await assert.rejects(() => operations.copy('', targetRoot, ADMIN_DEPLOY_MANIFEST), /injected activation rename failure/)
    assert.equal(await fs.readFile(path.join(targetRoot, 'server.mjs'), 'utf8'), 'before:server')
    assert.equal(await fs.readFile(path.join(targetRoot, 'public', 'unrelated.txt'), 'utf8'), 'preserve unrelated WIP')
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
})
test('journal reconciliation is idempotent after a restart in every deploy and rollback phase', async () => {
  const { temp, targetRoot, backup, operations, config, dependencies } = await fixture()
  const snapshot = path.join(temp, 'original-snapshot')
  const parent = path.dirname(targetRoot)
  const key = path.basename(backup)
  const paths = {
    candidate: path.join(parent, `.fixvox-web.candidate-${key}`),
    previous: path.join(parent, `.fixvox-web.previous-${key}`),
    failed: path.join(parent, `.fixvox-web.failed-${key}`),
    recovery: path.join(parent, `.fixvox-web.recovery-${key}`),
    journal: path.join(parent, '.fixvox-web.transaction.json'),
  }
  async function makeNew(directory) {
    await fs.mkdir(path.join(directory, 'public'), { recursive: true })
    await fs.writeFile(path.join(directory, 'server.mjs'), 'new:server')
    await fs.writeFile(path.join(directory, 'public', 'unrelated.txt'), 'new unrelated')
  }
  try {
    await operations.backup(targetRoot, ADMIN_DEPLOY_MANIFEST, backup)
    await fs.cp(targetRoot, snapshot, { recursive: true })
    for (const direction of ['deploy', 'rollback']) {
      for (const phase of ['prepared', 'target_displaced', 'activated']) {
        for (const item of [targetRoot, paths.candidate, paths.previous, paths.failed, paths.recovery]) await fs.rm(item, { recursive: true, force: true })
        await fs.cp(snapshot, targetRoot, { recursive: true })
        if (direction === 'deploy') {
          await makeNew(paths.candidate)
          if (phase !== 'prepared') await fs.rename(targetRoot, paths.previous)
          if (phase === 'activated') await fs.rename(paths.candidate, targetRoot)
        } else {
          await fs.cp(snapshot, paths.previous, { recursive: true })
          await fs.rm(targetRoot, { recursive: true, force: true })
          await makeNew(targetRoot)
          if (phase === 'target_displaced') await fs.rename(targetRoot, paths.failed)
          if (phase === 'activated') {
            await fs.rename(targetRoot, paths.failed)
            await fs.rename(paths.previous, targetRoot)
          }
        }
        await fs.writeFile(paths.journal, JSON.stringify({ version: 1, direction, phase, backup }))
        const restarted = createAdminDeployOperations(config, dependencies)
        await restarted.reconcile(targetRoot)
        await restarted.reconcile(targetRoot)
        assert.equal(await fs.readFile(path.join(targetRoot, 'server.mjs'), 'utf8'), 'before:server', `${direction}:${phase}`)
        assert.equal(await fs.readFile(path.join(targetRoot, 'public', 'unrelated.txt'), 'utf8'), 'preserve unrelated WIP', `${direction}:${phase}`)
        await assert.rejects(() => fs.access(paths.journal))
        for (const stale of [paths.candidate, paths.previous, paths.failed, paths.recovery]) await assert.rejects(() => fs.access(stale))
      }
    }
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
})
test('a restart after durable commit but before stale-directory cleanup keeps the verified release active', async () => {
  const { temp, targetRoot, backup, operations, config, dependencies } = await fixture()
  const previous = path.join(temp, `.fixvox-web.previous-${path.basename(backup)}`)
  try {
    await operations.backup(targetRoot, ADMIN_DEPLOY_MANIFEST, backup)
    await operations.copy('', targetRoot, ADMIN_DEPLOY_MANIFEST)
    await fs.rm(path.join(temp, '.fixvox-web.transaction.json'))
    assert.equal(await fs.readFile(path.join(targetRoot, 'server.mjs'), 'utf8'), 'release:server.mjs')
    assert.equal(await fs.readFile(path.join(previous, 'server.mjs'), 'utf8'), 'before:server')
    const restarted = createAdminDeployOperations(config, dependencies)
    await restarted.reconcile(targetRoot)
    assert.equal(await fs.readFile(path.join(targetRoot, 'server.mjs'), 'utf8'), 'release:server.mjs')
    assert.equal(await fs.readFile(path.join(previous, 'server.mjs'), 'utf8'), 'before:server')
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
})



test('Admin restart targets the configured user systemd session through fixed runuser arguments', async () => {
  const calls = []
  const operations = createAdminDeployOperations({ sourceRoot: '/source', adminUser: 'jpsal', adminHome: '/home/jpsal', adminUid: 1234 }, { run: async (...args) => calls.push(args) })
  await operations.restart()
  assert.deepEqual(calls, [['/usr/sbin/runuser', ['-u', 'jpsal', '--', '/usr/bin/env', 'HOME=/home/jpsal', 'XDG_RUNTIME_DIR=/run/user/1234', 'DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1234/bus', '/usr/bin/systemctl', '--user', 'restart', 'fixvox-admin-web.service'], {
    timeoutMs: 60_000,
  }]])
})

test('Admin health retries startup races before checking the public endpoint', async () => {
  const requests = []
  const pauses = []
  const operations = createAdminDeployOperations({
    sourceRoot: '/source',
    localHealthUrl: 'http://local/healthz',
    publicHealthUrl: 'https://public/healthz',
  }, {
    fetch: async (url) => {
      requests.push(url)
      if (requests.length === 1) throw new Error('connection refused')
      return { ok: true }
    },
    pause: async (milliseconds) => pauses.push(milliseconds),
  })
  await operations.health()
  assert.deepEqual(requests, ['http://local/healthz', 'http://local/healthz', 'https://public/healthz'])
  assert.deepEqual(pauses, [250])
})
