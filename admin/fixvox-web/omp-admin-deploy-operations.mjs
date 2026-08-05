import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const ADMIN_DEPLOY_MANIFEST = Object.freeze([
  'server.mjs', 'omp-chat-access.mjs', 'omp-remote-policy.mjs', 'omp-host-tools.mjs', 'omp-rpc-framing.mjs',
  'omp-workspace-broker-client.mjs', 'omp-workspace-broker.mjs',
  'constelaciones-read-adapter.mjs', 'constelaciones-read-broker.mjs', 'omp-release-broker.mjs',
  'omp-release-broker-client.mjs', 'omp-release-git-runner.mjs', 'omp-release-service.mjs',
  'omp-admin-deploy-broker.mjs', 'omp-admin-deploy-operations.mjs', 'omp-admin-deploy-service.mjs', 'omp-admin-deploy-client.mjs',
  'public/app.js', 'public/styles.css',
])

const BACKUP_MANIFEST_VERSION = 2

function backupManifestPath(backup) {
  return `${backup}.manifest.json`
}

async function sha256(filesystem, file) {
  return crypto.createHash('sha256').update(await filesystem.readFile(file)).digest('hex')
}

async function exists(filesystem, file) {
  try {
    await filesystem.lstat(file)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') return false
    throw error
  }
}

async function targetPathState(filesystem, targetRoot, manifest) {
  const existing = []
  const absent = []
  const hashes = {}
  for (const relative of manifest) {
    const target = path.join(targetRoot, relative)
    if (await exists(filesystem, target)) {
      existing.push(relative)
      hashes[relative] = await sha256(filesystem, target)
    } else {
      absent.push(relative)
    }
  }
  return { version: BACKUP_MANIFEST_VERSION, existing, absent, hashes }
}

function validateBackupManifest(value) {
  const allowed = new Set(ADMIN_DEPLOY_MANIFEST)
  const existing = Array.isArray(value?.existing) ? value.existing : []
  const absent = Array.isArray(value?.absent) ? value.absent : []
  const paths = [...existing, ...absent]
  const hashes = value?.hashes && typeof value.hashes === 'object' && !Array.isArray(value.hashes) ? value.hashes : {}
  if (value?.version !== BACKUP_MANIFEST_VERSION
    || paths.length !== ADMIN_DEPLOY_MANIFEST.length
    || new Set(paths).size !== paths.length
    || paths.some((relative) => typeof relative !== 'string' || !allowed.has(relative))
    || Object.keys(hashes).length !== existing.length
    || existing.some((relative) => !/^[a-f0-9]{64}$/.test(hashes[relative] || ''))
    || Object.keys(hashes).some((relative) => !existing.includes(relative))) {
    throw new Error('Admin backup manifest is invalid.')
  }
  return { existing, absent, hashes }
}

function transactionPaths(targetRoot, backup) {
  const key = path.basename(backup).replace(/[^a-zA-Z0-9_.-]/g, '_')
  const parent = path.dirname(targetRoot)
  const name = path.basename(targetRoot)
  return {
    candidate: path.join(parent, `.${name}.candidate-${key}`),
    previous: path.join(parent, `.${name}.previous-${key}`),
    failed: path.join(parent, `.${name}.failed-${key}`),
    recovery: path.join(parent, `.${name}.recovery-${key}`),
  }
}

async function verifyState(filesystem, targetRoot, state) {
  for (const relative of state.existing) {
    if (await sha256(filesystem, path.join(targetRoot, relative)) !== state.hashes[relative]) {
      throw new Error(`Admin rollback hash mismatch: ${relative}`)
    }
  }
  for (const relative of state.absent) {
    if (await exists(filesystem, path.join(targetRoot, relative))) {
      throw new Error(`Admin rollback retained an originally absent path: ${relative}`)
    }
  }
}

function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: options.cwd, uid: options.uid, gid: options.gid, env: options.env || { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] })
    const stderr = []
    let bytes = 0
    child.stderr.on('data', (chunk) => { bytes += chunk.length; if (bytes <= 64 * 1024) stderr.push(chunk); else child.kill('SIGKILL') })
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs || 60_000)
    child.once('error', reject)
    child.once('close', (code) => {
      clearTimeout(timer)
      if (code === 0) return resolve()
      const detail = Buffer.concat(stderr).toString('utf8').trim().replace(/\s+/g, ' ').slice(-500)
      const error = new Error(`Admin helper command ${path.basename(file)} failed (${code}).${detail ? ` ${detail}` : ''}`)
      error.stderr = detail
      reject(error)
    })
  })
}

export function createAdminDeployOperations(config, dependencies = {}) {
  const filesystem = dependencies.filesystem || fs
  const execute = dependencies.run || run
  const request = dependencies.fetch || fetch
  const pause = dependencies.pause || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)))
  const sourceAdmin = path.join(config.sourceRoot, 'admin', 'fixvox-web')
  let transaction
  let cleanup = []

  function journalPath(targetRoot) {
    return path.join(path.dirname(targetRoot), `.${path.basename(targetRoot)}.transaction.json`)
  }

  async function syncDirectory(directory) {
    if (process.platform === 'win32') return
    const handle = await filesystem.open(directory, 'r')
    try { await handle.sync() } finally { await handle.close() }
  }

  async function writeJournal(targetRoot, payload) {
    const journal = journalPath(targetRoot)
    const temporary = `${journal}.new`
    const handle = await filesystem.open(temporary, 'w', 0o600)
    try {
      await handle.writeFile(JSON.stringify({ version: 1, ...payload }))
      await handle.sync()
    } finally {
      await handle.close()
    }
    await filesystem.rename(temporary, journal)
    await syncDirectory(path.dirname(journal))
  }

  async function clearJournal(targetRoot) {
    await filesystem.rm(journalPath(targetRoot), { force: true })
    await syncDirectory(path.dirname(targetRoot))
  }

  async function readJournal(targetRoot) {
    try {
      const value = JSON.parse(await filesystem.readFile(journalPath(targetRoot), 'utf8'))
      if (value?.version !== 1
        || !['deploy', 'rollback'].includes(value.direction)
        || !['prepared', 'target_displaced', 'activated'].includes(value.phase)
        || typeof value.backup !== 'string') throw new Error('Admin transaction journal is invalid.')
      const backup = path.resolve(value.backup)
      if (!config.backupRoot) throw new Error('Admin transaction backup root is not configured.')
      const backupRoot = path.resolve(config.backupRoot)
      const relativeBackup = path.relative(backupRoot, backup)
      if (relativeBackup.startsWith('..') || path.isAbsolute(relativeBackup)) throw new Error('Admin transaction journal backup is outside the configured backup root.')
      return { direction: value.direction, phase: value.phase, backup }
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined
      throw error
    }
  }

  async function reconcile(targetRoot = config.targetRoot) {
    if (!targetRoot) return
    const journal = await readJournal(targetRoot)
    if (!journal) return
    const paths = transactionPaths(targetRoot, journal.backup)
    const hasTarget = await exists(filesystem, targetRoot)
    const hasPrevious = await exists(filesystem, paths.previous)
    if (hasPrevious) {
      await filesystem.rm(paths.failed, { recursive: true, force: true })
      if (hasTarget) await filesystem.rename(targetRoot, paths.failed)
      await filesystem.rename(paths.previous, targetRoot)
    } else if (!hasTarget) {
      throw new Error('Admin transaction recovery has neither the live nor previous directory.')
    }
    const state = validateBackupManifest(JSON.parse(await filesystem.readFile(backupManifestPath(journal.backup), 'utf8')))
    await verifyState(filesystem, targetRoot, state)
    await execute('/usr/bin/tar', ['-dzf', journal.backup, '-C', targetRoot], { timeoutMs: 120_000 })
    for (const stale of [paths.candidate, paths.previous, paths.failed, paths.recovery]) {
      await filesystem.rm(stale, { recursive: true, force: true })
    }
    await clearJournal(targetRoot)
  }

  async function safeSwap(next, current, displaced, backup, direction) {
    await filesystem.rm(displaced, { recursive: true, force: true })
    await writeJournal(current, { backup, direction, phase: 'prepared' })
    await filesystem.rename(current, displaced)
    await writeJournal(current, { backup, direction, phase: 'target_displaced' })
    try {
      await filesystem.rename(next, current)
      await writeJournal(current, { backup, direction, phase: 'activated' })
    } catch (activationError) {
      try {
        if (!(await exists(filesystem, current))) await filesystem.rename(displaced, current)
        await clearJournal(current)
      } catch (recoveryError) {
        throw new AggregateError([activationError, recoveryError], 'Admin directory activation failed and the original directory could not be recovered.')
      }
      throw activationError
    }
  }

  return {
    reconcile,
    async inspect(sourceRoot) {
      const capture = async (args) => {
        const chunks = []
        await new Promise((resolve, reject) => {
          const child = spawn('/usr/bin/git', ['-c', `safe.directory=${sourceRoot}`, ...args], { cwd: sourceRoot, env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'] })
          child.stdout.on('data', (chunk) => chunks.push(chunk)); child.once('error', reject); child.once('close', (code) => code === 0 ? resolve() : reject(new Error('Git source inspection failed.')))
        })
        return Buffer.concat(chunks).toString('utf8').trim()
      }
      return { hash: await capture(['rev-parse', 'HEAD']), branch: await capture(['rev-parse', '--abbrev-ref', 'HEAD']), clean: (await capture(['status', '--porcelain=v1', '--untracked-files=all'])) === '' }
    },
    async check(file) {
      await filesystem.access(file)
      if (file.endsWith('.mjs') || file.endsWith('.js')) await execute('/usr/bin/node', ['--check', file], { timeoutMs: 30_000 })
    },
    async backup(targetRoot, manifest, backup) {
      await reconcile(targetRoot)
      const state = await targetPathState(filesystem, targetRoot, manifest)
      const paths = transactionPaths(targetRoot, backup)
      await filesystem.rm(paths.candidate, { recursive: true, force: true })
      await filesystem.rm(paths.previous, { recursive: true, force: true })
      await filesystem.rm(paths.failed, { recursive: true, force: true })
      await filesystem.rm(paths.recovery, { recursive: true, force: true })
      await execute('/usr/bin/tar', ['-czf', backup, '-C', targetRoot, '.'], { timeoutMs: 120_000 })
      await filesystem.writeFile(backupManifestPath(backup), JSON.stringify(state), { mode: 0o600 })
      transaction = { backup, targetRoot, state, ...paths }
      cleanup = []
    },
    async copy(_sourceRoot, targetRoot, manifest) {
      if (!transaction || transaction.targetRoot !== targetRoot) throw new Error('Admin deploy transaction was not prepared.')
      const { candidate, previous } = transaction
      await filesystem.mkdir(candidate, { recursive: true })
      try {
        await execute('/usr/bin/cp', ['-a', '--', `${targetRoot}/.`, candidate], { timeoutMs: 120_000 })
        const sourceHashes = {}
        for (const relative of manifest) {
          const source = path.join(sourceAdmin, relative)
          const target = path.join(candidate, relative)
          const parent = path.dirname(target)
          const parentMetadata = await filesystem.lstat(parent)
          if (parentMetadata.isSymbolicLink()) throw new Error(`Admin candidate parent is a symbolic link: ${relative}`)
          const temporary = `${target}.release-new`
          await filesystem.copyFile(source, temporary)
          await filesystem.chown(temporary, config.adminUid, config.adminGid)
          await filesystem.chmod(temporary, 0o644)
          await filesystem.rename(temporary, target)
          sourceHashes[relative] = await sha256(filesystem, source)
          if (await sha256(filesystem, target) !== sourceHashes[relative]) throw new Error(`Admin candidate hash mismatch: ${relative}`)
        }
        await filesystem.writeFile(backupManifestPath(transaction.backup), JSON.stringify({ ...transaction.state, sourceHashes }), { mode: 0o600 })
        await safeSwap(candidate, targetRoot, previous, transaction.backup, 'deploy')
        cleanup = [previous]
      } catch (error) {
        if (await exists(filesystem, targetRoot)) await filesystem.rm(candidate, { recursive: true, force: true })
        throw error
      }
    },
    async restart() {
      await execute('/usr/sbin/runuser', ['-u', config.adminUser, '--', '/usr/bin/env', `HOME=${config.adminHome}`, `XDG_RUNTIME_DIR=/run/user/${config.adminUid}`, `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/${config.adminUid}/bus`, '/usr/bin/systemctl', '--user', 'restart', 'fixvox-admin-web.service'], { timeoutMs: 60_000 })
    },
    async health() {
      for (const url of [config.localHealthUrl, config.publicHealthUrl]) {
        const deadline = Date.now() + 30_000
        let healthy = false
        do {
          try {
            healthy = (await request(url, { signal: AbortSignal.timeout(5_000) })).ok
          } catch {
            healthy = false
          }
          if (!healthy) await pause(250)
        } while (!healthy && Date.now() < deadline)
        if (!healthy) throw new Error('Admin health check failed.')
      }
      if (transaction?.targetRoot) await clearJournal(transaction.targetRoot)
      for (const target of cleanup) await filesystem.rm(target, { recursive: true, force: true })
      cleanup = []
    },
    async restore(targetRoot, backup) {
      await reconcile(targetRoot)
      const state = validateBackupManifest(JSON.parse(await filesystem.readFile(backupManifestPath(backup), 'utf8')))
      const paths = transactionPaths(targetRoot, backup)
      if (await exists(filesystem, paths.previous)) {
        await safeSwap(paths.previous, targetRoot, paths.failed, backup, 'rollback')
        cleanup = [paths.failed]
      } else {
        try {
          await verifyState(filesystem, targetRoot, state)
        } catch {
          await filesystem.rm(paths.recovery, { recursive: true, force: true })
          await filesystem.mkdir(paths.recovery, { recursive: true })
          await execute('/usr/bin/tar', ['-xzf', backup, '-C', paths.recovery], { timeoutMs: 120_000 })
          await safeSwap(paths.recovery, targetRoot, paths.failed, backup, 'rollback')
          cleanup = [paths.failed]
        }
      }
      await verifyState(filesystem, targetRoot, state)
      await execute('/usr/bin/tar', ['-dzf', backup, '-C', targetRoot], { timeoutMs: 120_000 })
    },
  }
}
