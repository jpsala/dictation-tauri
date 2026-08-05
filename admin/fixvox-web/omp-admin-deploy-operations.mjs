import { spawn } from 'node:child_process'
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

const BACKUP_MANIFEST_VERSION = 1

function backupManifestPath(backup) {
  return `${backup}.manifest.json`
}

async function targetPathState(filesystem, targetRoot, manifest) {
  const existing = []
  const absent = []
  for (const relative of manifest) {
    try {
      await filesystem.lstat(path.join(targetRoot, relative))
      existing.push(relative)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      absent.push(relative)
    }
  }
  return { version: BACKUP_MANIFEST_VERSION, existing, absent }
}

function validateBackupManifest(value) {
  const allowed = new Set(ADMIN_DEPLOY_MANIFEST)
  const existing = Array.isArray(value?.existing) ? value.existing : []
  const absent = Array.isArray(value?.absent) ? value.absent : []
  const paths = [...existing, ...absent]
  if (value?.version !== BACKUP_MANIFEST_VERSION
    || paths.length !== ADMIN_DEPLOY_MANIFEST.length
    || new Set(paths).size !== paths.length
    || paths.some((relative) => typeof relative !== 'string' || !allowed.has(relative))) {
    throw new Error('Admin backup manifest is invalid.')
  }
  return { existing, absent }
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
      const error = new Error(`Admin helper command failed (${code}).`)
      error.stderr = Buffer.concat(stderr).toString('utf8').slice(-1000)
      reject(error)
    })
  })
}

export function createAdminDeployOperations(config, dependencies = {}) {
  const filesystem = dependencies.filesystem || fs
  const execute = dependencies.run || run
  const sourceAdmin = path.join(config.sourceRoot, 'admin', 'fixvox-web')
  return {
    async inspect(sourceRoot) {
      const capture = async (args) => {
        const chunks = []
        await new Promise((resolve, reject) => {
          const child = spawn('/usr/bin/git', args, { cwd: sourceRoot, env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'] })
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
      const state = await targetPathState(filesystem, targetRoot, manifest)
      await execute('/usr/bin/tar', ['-czf', backup, '-C', targetRoot, ...(state.existing.length ? state.existing : ['--files-from', '/dev/null'])], { timeoutMs: 120_000 })
      await filesystem.writeFile(backupManifestPath(backup), JSON.stringify(state), { mode: 0o600 })
    },
    async copy(_sourceRoot, targetRoot, manifest) {
      for (const relative of manifest) {
        const source = path.join(sourceAdmin, relative)
        const target = path.join(targetRoot, relative)
        await filesystem.mkdir(path.dirname(target), { recursive: true })
        const temporary = `${target}.release-new`
        await filesystem.copyFile(source, temporary)
        await filesystem.chown(temporary, config.adminUid, config.adminGid)
        await filesystem.chmod(temporary, 0o644)
        await filesystem.rename(temporary, target)
      }
    },
    async restart() {
      await execute('/usr/bin/systemctl', ['--user', 'restart', 'fixvox-admin-web.service'], { uid: config.adminUid, gid: config.adminGid, env: serviceEnv, timeoutMs: 60_000 })
    },
    async health() {
      for (const url of [config.localHealthUrl, config.publicHealthUrl]) {
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
        if (!response.ok) throw new Error('Admin health check failed.')
      }
    },
    async restore(targetRoot, backup) {
      const state = validateBackupManifest(JSON.parse(await filesystem.readFile(backupManifestPath(backup), 'utf8')))
      for (const relative of state.absent) {
        try {
          await filesystem.unlink(path.join(targetRoot, relative))
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error
        }
      }
      await execute('/usr/bin/tar', ['-xzf', backup, '-C', targetRoot], { timeoutMs: 120_000 })
      for (const relative of state.existing) {
        const target = path.join(targetRoot, relative)
        await filesystem.chown(target, config.adminUid, config.adminGid)
        await filesystem.chmod(target, 0o644)
      }
    },
  }
}
