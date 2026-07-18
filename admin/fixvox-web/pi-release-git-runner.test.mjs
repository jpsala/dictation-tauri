import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import test from 'node:test'
import { createGitReleaseRunner } from './pi-release-git-runner.mjs'

const exec = promisify(execFile)
const hashA = 'a'.repeat(40)

async function git(cwd, ...args) { return exec('git', args, { cwd }) }

test('Git runner enforces exact remote, allowlisted commit paths and fast-forward push', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-release-git-'))
  const bare = path.join(temp, 'remote.git')
  const work = path.join(temp, 'work')
  await git(temp, 'init', '--bare', bare)
  await git(temp, 'clone', bare, work)
  await git(work, 'config', 'user.email', 'release-test@example.invalid')
  await git(work, 'config', 'user.name', 'Release Test')
  await fs.mkdir(path.join(work, 'src'))
  await fs.writeFile(path.join(work, 'src', 'safe.txt'), 'one\n')
  await git(work, 'add', 'src/safe.txt'); await git(work, 'commit', '-m', 'initial'); await git(work, 'branch', '-M', 'main'); await git(work, 'push', '-u', 'origin', 'main')
  const remoteUrl = (await git(work, 'remote', 'get-url', 'origin')).stdout.trim()
  const repo = { id: 'app', path: work, home: temp, branch: 'main', remoteName: 'origin', remoteUrl, allowedPaths: ['src'] }
  const runner = createGitReleaseRunner()
  try {
    const initial = await runner.inspect(repo, { refreshRemote: true })
    assert.equal(initial.remoteMatches, true)
    assert.equal(initial.fastForward, true)
    await fs.appendFile(path.join(work, 'src', 'safe.txt'), 'two\n')
    assert.match(await runner.diff(repo), /\+two/)
    const committed = await runner.commit(repo, 'safe update')
    assert.equal(committed.hash.length, 40)
    const beforePush = await runner.inspect(repo, { refreshRemote: true })
    assert.equal(beforePush.fastForward, true)
    const pushed = await runner.push(repo, committed.hash)
    assert.equal(pushed.hash, committed.hash)
    await fs.writeFile(path.join(work, 'outside.txt'), 'not allowed')
    await assert.rejects(() => runner.commit(repo, 'blocked update'), /outside the commit allowlist/)
  } finally {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try { await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }); break }
      catch { await new Promise((resolve) => setTimeout(resolve, 150)) }
    }
  }
})

test('deploy runner executes exact health check and rollback recipe on failure', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-release-deploy-'))
  const deployed = path.join(temp, 'deployed.txt')
  const rolledBack = path.join(temp, 'rolled-back.txt')
  const runner = createGitReleaseRunner()
  const deployScript = path.join(temp, 'deploy.mjs')
  const healthScript = path.join(temp, 'health.mjs')
  const rollbackScript = path.join(temp, 'rollback.mjs')
  await fs.writeFile(deployScript, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(deployed)}, 'yes')`)
  await fs.writeFile(healthScript, 'process.exit(1)')
  await fs.writeFile(rollbackScript, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(rolledBack)}, 'yes')`)
  const recipe = {
    id: 'test', cwd: temp, home: temp, rollbackId: 'test-backup',
    deploy: { file: process.execPath, args: [deployScript] },
    health: { file: process.execPath, args: [healthScript] },
    rollback: { file: process.execPath, args: [rollbackScript] },
  }
  try {
    await assert.rejects(() => runner.deploy(recipe, hashA), /rollback attempted/)
    assert.equal(await fs.readFile(deployed, 'utf8'), 'yes')
    assert.equal(await fs.readFile(rolledBack, 'utf8'), 'yes')
  } finally {
    await fs.rm(temp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })
  }
})
