import { spawn } from 'node:child_process'
import path from 'node:path'
import { sensitiveReleasePath } from './pi-release-broker.mjs'

function execute(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      cwd: options.cwd,
      env: { PATH: process.platform === 'win32' ? process.env.PATH : '/usr/local/bin:/usr/bin:/bin', HOME: options.home || '/nonexistent', LANG: 'C.UTF-8', GIT_TERMINAL_PROMPT: '0', ...(options.gitSshCommand ? { GIT_SSH_COMMAND: options.gitSshCommand } : {}), ...(options.extraEnv || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const stdout = []
    const stderr = []
    let bytes = 0
    const collect = (target) => (chunk) => { bytes += chunk.length; if (bytes <= (options.maxBytes || 128 * 1024)) target.push(chunk); else child.kill('SIGKILL') }
    child.stdout.on('data', collect(stdout)); child.stderr.on('data', collect(stderr))
    const timer = setTimeout(() => child.kill('SIGKILL'), options.timeoutMs || 30_000)
    child.once('error', reject)
    child.once('close', (code, signal) => {
      clearTimeout(timer)
      const rawOutput = Buffer.concat(stdout).toString('utf8')
      const output = options.trim === false ? rawOutput.replace(/\r?\n$/, '') : rawOutput.trim()
      if (code === 0) return resolve(output)
      const error = new Error(signal === 'SIGKILL' ? 'Release command timed out or exceeded output limit.' : `Release command failed (${code}).`)
      error.stderr = Buffer.concat(stderr).toString('utf8').slice(-1000)
      reject(error)
    })
  })
}

async function git(repo, args, options = {}) {
  const defaultGit = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git', 'cmd', 'git.exe') : '/usr/bin/git'
  return execute(repo.gitBin || defaultGit, args, { cwd: repo.path, home: repo.home, gitSshCommand: repo.gitSshCommand, ...options })
}

function allowedChange(repo, file) {
  const normalized = String(file || '').replaceAll('\\', '/')
  return !sensitiveReleasePath(normalized) && repo.allowedPaths.some((allowed) => normalized === allowed || normalized.startsWith(`${allowed.replace(/\/$/, '')}/`))
}

export function createGitReleaseRunner() {
  return {
    async inspect(repo, { refreshRemote = false } = {}) {
      const branch = await git(repo, ['rev-parse', '--abbrev-ref', 'HEAD'])
      const remoteUrl = await git(repo, ['remote', 'get-url', repo.remoteName])
      if (refreshRemote) await git(repo, ['fetch', '--no-tags', repo.pushUrl || repo.remoteName, repo.branch], { timeoutMs: 120_000 })
      const head = await git(repo, ['rev-parse', 'HEAD'])
      const status = await git(repo, ['status', '--porcelain=v1', '--untracked-files=all'], { trim: false })
      const lines = status ? status.split('\n') : []
      const files = lines.map((line) => line.slice(3).split(' -> ').at(-1))
      const untracked = lines.filter((line) => line.startsWith('?? ')).map((line) => line.slice(3))
      let pushedHash = head
      let fastForward = true
      if (refreshRemote) {
        pushedHash = await git(repo, ['rev-parse', 'FETCH_HEAD'])
        try { await git(repo, ['merge-base', '--is-ancestor', pushedHash, head]) } catch { fastForward = false }
      }
      return { branch, remoteName: repo.remoteName, remoteMatches: remoteUrl === repo.remoteUrl, head, pushedHash, dirty: lines.length > 0, changedCount: lines.length, changedFiles: files, untracked, fastForward }
    },
    async diff(repo) {
      return git(repo, ['diff', '--no-ext-diff', '--unified=3', '--', ...repo.allowedPaths], { maxBytes: 64 * 1024 })
    },
    async commit(repo, message) {
      const state = await this.inspect(repo)
      if (!state.changedFiles.every((file) => allowedChange(repo, file))) throw new Error('Dirty files outside the commit allowlist.')
      await git(repo, ['add', '--', ...repo.allowedPaths])
      await git(repo, ['commit', '--no-verify', '-m', message], { timeoutMs: 60_000 })
      return { hash: await git(repo, ['rev-parse', 'HEAD']) }
    },
    async push(repo, expectedHash) {
      const head = await git(repo, ['rev-parse', 'HEAD'])
      if (head !== expectedHash) throw new Error('Push source hash changed.')
      await git(repo, ['push', '--porcelain', repo.pushUrl || repo.remoteName, `HEAD:refs/heads/${repo.branch}`], { timeoutMs: 120_000 })
      await git(repo, ['fetch', '--no-tags', repo.pushUrl || repo.remoteName, repo.branch], { timeoutMs: 120_000 })
      const pushedHash = await git(repo, ['rev-parse', 'FETCH_HEAD'])
      if (pushedHash !== expectedHash) throw new Error('Remote hash does not match pushed source.')
      return { hash: pushedHash }
    },
    async deploy(recipe, expectedHash) {
      const cwd = path.resolve(recipe.cwd)
      const runExact = (spec, extraArgs = []) => execute(spec.file, [...(spec.args || []), ...extraArgs], { cwd, home: recipe.home, extraEnv: recipe.env, timeoutMs: spec.timeoutMs || 300_000, maxBytes: 64 * 1024 })
      try {
        await runExact(recipe.deploy, ['--source-hash', expectedHash])
        await runExact(recipe.health)
        return { hash: expectedHash, health: 'ok', rollback: recipe.rollbackId }
      } catch (error) {
        await runExact(recipe.rollback, ['--source-hash', expectedHash]).catch(() => {})
        throw new Error('Deploy or health check failed; rollback attempted.')
      }
    },
  }
}
