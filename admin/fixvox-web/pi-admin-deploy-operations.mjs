import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

export const ADMIN_DEPLOY_MANIFEST = Object.freeze([
  'server.mjs', 'pi-chat-access.mjs', 'pi-remote-policy.mjs', 'pi-remote-agent-core.mjs',
  'pi-remote-agent-extension.mjs', 'pi-workspace-broker-client.mjs', 'pi-workspace-broker.mjs',
  'constelaciones-read-adapter.mjs', 'constelaciones-read-broker.mjs', 'pi-release-broker.mjs',
  'pi-release-broker-client.mjs', 'pi-release-git-runner.mjs', 'pi-release-service.mjs',
  'pi-admin-deploy-broker.mjs', 'pi-admin-deploy-operations.mjs', 'pi-admin-deploy-service.mjs', 'pi-admin-deploy-client.mjs',
  'public/app.js', 'public/styles.css',
])

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

export function createAdminDeployOperations(config) {
  const sourceAdmin = path.join(config.sourceRoot, 'admin', 'fixvox-web')
  const serviceEnv = { PATH: '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8', HOME: config.adminHome, XDG_RUNTIME_DIR: `/run/user/${config.adminUid}`, DBUS_SESSION_BUS_ADDRESS: `unix:path=/run/user/${config.adminUid}/bus` }
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
      await fs.access(file)
      if (file.endsWith('.mjs') || file.endsWith('.js')) await run('/usr/bin/node', ['--check', file], { timeoutMs: 30_000 })
    },
    async backup(targetRoot, manifest, backup) {
      await run('/usr/bin/tar', ['-czf', backup, '-C', targetRoot, ...manifest], { timeoutMs: 120_000 })
    },
    async copy(_sourceRoot, targetRoot, manifest) {
      for (const relative of manifest) {
        const source = path.join(sourceAdmin, relative)
        const target = path.join(targetRoot, relative)
        await fs.mkdir(path.dirname(target), { recursive: true })
        const temporary = `${target}.release-new`
        await fs.copyFile(source, temporary)
        await fs.chown(temporary, config.adminUid, config.adminGid)
        await fs.chmod(temporary, 0o644)
        await fs.rename(temporary, target)
      }
    },
    async restart() {
      await run('/usr/bin/systemctl', ['--user', 'restart', 'fixvox-admin-web.service'], { uid: config.adminUid, gid: config.adminGid, env: serviceEnv, timeoutMs: 60_000 })
    },
    async health() {
      for (const url of [config.localHealthUrl, config.publicHealthUrl]) {
        const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
        if (!response.ok) throw new Error('Admin health check failed.')
      }
    },
    async restore(targetRoot, backup) {
      await run('/usr/bin/tar', ['-xzf', backup, '-C', targetRoot], { timeoutMs: 120_000 })
      for (const relative of ADMIN_DEPLOY_MANIFEST) {
        const target = path.join(targetRoot, relative)
        await fs.chown(target, config.adminUid, config.adminGid)
        await fs.chmod(target, 0o644)
      }
    },
  }
}
