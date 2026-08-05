import { spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const bashExecutable = (() => {
  if (process.platform !== 'win32') return 'bash'
  const where = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe')
  const result = spawnSync(where, ['bash'], { encoding: 'utf8' })
  const executable = result.stdout?.split(/\r?\n/).find((entry) => entry.trim())
  if (result.status !== 0 || !executable) throw new Error('Behavioral rollout fixtures require bash.')
  return executable.trim()
})()

const rollout = await fs.readFile(new URL('../../scripts/omp-remote-agent-rollout.ps1', import.meta.url), 'utf8')
const apply = await fs.readFile(new URL('../../scripts/omp-remote-agent-apply.sh', import.meta.url), 'utf8')
const adminDeploy = await fs.readFile(new URL('../../scripts/admin-web-deploy.ps1', import.meta.url), 'utf8')

test('rollout defaults to dry-run and gates every remote mutation', () => {
  assert.match(rollout, /\[switch\]\$ConfirmProduction/)
  assert.match(rollout, /if \(-not \$ConfirmProduction\)/)
  assert.match(rollout, /DRY RUN: no VPS files/)
  assert.ok(rollout.indexOf('if (-not $ConfirmProduction)') < rollout.indexOf('scp $localBundle'))
})

test('rollout uses exact manifest, one verified bundle, bounded retry and cleanup', () => {
  for (const file of ['omp-host-tools.mjs', 'omp-rpc-framing.mjs', 'omp-workspace-broker.mjs', 'constelaciones-read-broker.mjs', 'omp-release-broker.mjs', 'omp-release-broker-client.mjs', 'omp-release-git-runner.mjs', 'omp-release-service.mjs', 'run-isolated-omp.sh', 'fixvox-workspace-broker.service', 'fixvox-constelaciones-read-broker.service']) {
    assert.ok(rollout.includes(file))
  }
  assert.match(rollout, /Get-Sha256/)
  assert.match(rollout, /sha256sum -c/)
  assert.match(rollout, /UploadAttempts/)
  assert.match(rollout, /tar -xzf/)
})

test('remote apply fails dirty mirrors, rejects secrets, and makes rollback fail closed', () => {
  assert.match(apply, /git -C "\$MIRROR_ROOT\/\$repo" diff --quiet/)
  assert.match(apply, /ls-files --others --exclude-standard/)
  assert.match(apply, /Tracked sensitive path rejected/)
  assert.match(apply, /\.env/)
  assert.match(apply, /sqlite/)
  assert.match(apply, /sudo mv "\$MIRROR_ROOT\/\$repo" "\$MIRROR_ROOT\/\.backup-/)
  assert.match(apply, /trap rollback ERR/)
  assert.match(apply, /runtime-and-units\.tar\.gz\.sha256/)
  assert.match(apply, /sudo tar -dzf "\$BACKUP_ROOT\/runtime-and-units\.tar\.gz"/)
  assert.match(apply, /Rollback commit verification failed/)
  assert.match(apply, /rollback was not verified/)
  assert.match(apply, /if ! restore_runtime/)
  assert.match(apply, /if ! verify_health/)
  assert.doesNotMatch(apply, /\|\|\s*true/)
  assert.match(apply, /if sudo test -e "\$MIRROR_ROOT\/\$repo"/)
  assert.match(apply, /current_moved=0/)
  for (const family of [String.raw`\.dev\.vars`, String.raw`[^/]+\.env`, String.raw`\.wrangler`, 'id_(rsa|dsa|ecdsa|ed25519)', String.raw`\.(key|pem|p12|pfx)`]) {
    assert.ok(apply.includes(family), family)
  }
})

test('Admin deploy script only stages and verifies before requesting the existing deploy broker', () => {
  assert.match(adminDeploy, /\[switch\]\$ConfirmProduction/)
  assert.match(adminDeploy, /sha256sum -c/)
  assert.match(adminDeploy, /manifest\.sha256/)
  assert.match(adminDeploy, /OMP_ADMIN_DEPLOY_SOCKET=\/run\/fixvox-release\/admin-deploy\.sock/)
  assert.match(adminDeploy, /omp-admin-deploy-client\.mjs --source-hash/)
  assert.doesNotMatch(adminDeploy, /systemctl|remoteRoot|remoteCandidate|remotePrevious/)
  assert.doesNotMatch(adminDeploy, /\b(?:cp|mv)\s+['"]?\$remote/i)
})

test('rollout never copies or archives provider OAuth', () => {
  assert.doesNotMatch(`${rollout}\n${apply}`, /(?:cp|install|tar)[^\n]*(?:auth\.json|\.omp\/agent\/auth)/i)
  assert.match(apply, /workspace user can read provider auth/i)
})

function shellPath(value) {
  const absolute = path.resolve(value)
  if (process.platform !== 'win32') return absolute
  return `/${absolute[0].toLowerCase()}${absolute.slice(2).replaceAll('\\', '/')}`
}

async function createApplyFixture(options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-remote-apply-'))
  const stage = path.join(root, 'stage')
  const mockBin = path.join(root, 'bin')
  const mirrors = path.join(root, 'mirrors')
  const log = path.join(root, 'mock.log')
  const runId = 'fixture-run'
  const runtimeFiles = [
    'omp-chat-access.mjs', 'omp-remote-policy.mjs', 'omp-host-tools.mjs', 'omp-rpc-framing.mjs',
    'omp-workspace-broker-client.mjs', 'omp-workspace-broker.mjs', 'constelaciones-read-adapter.mjs',
    'constelaciones-read-broker.mjs', 'omp-release-broker.mjs', 'omp-release-broker-client.mjs',
    'omp-release-git-runner.mjs', 'omp-release-service.mjs', 'omp-admin-deploy-broker.mjs',
    'omp-admin-deploy-operations.mjs', 'omp-admin-deploy-service.mjs', 'omp-admin-deploy-client.mjs',
  ]
  await fs.mkdir(path.join(stage, 'admin', 'fixvox-web', 'systemd'), { recursive: true })
  await fs.mkdir(mockBin, { recursive: true })
  await fs.mkdir(path.join(root, 'opt', 'runtime'), { recursive: true })
  await fs.writeFile(path.join(root, 'opt', 'runtime', 'old-runtime'), 'original')
  await fs.writeFile(path.join(root, 'opt', 'run-omp.sh'), 'original launcher')
  for (const file of runtimeFiles) await fs.writeFile(path.join(stage, 'admin', 'fixvox-web', file), 'export {}')
  await fs.writeFile(path.join(stage, 'admin', 'fixvox-web', 'run-isolated-omp.sh'), '#!/bin/sh')
  for (const unit of ['fixvox-workspace-broker.service', 'fixvox-constelaciones-read-broker.service', 'fixvox-release-broker.service', 'fixvox-admin-deploy-helper.service']) {
    await fs.writeFile(path.join(stage, 'admin', 'fixvox-web', 'systemd', unit), '[Service]')
  }
  for (const repo of ['dictation-tauri', 'constelaciones']) {
    const live = path.join(mirrors, repo)
    await fs.mkdir(live, { recursive: true })
    await fs.writeFile(path.join(live, 'live-marker'), `original:${repo}`)
    await fs.writeFile(path.join(live, 'package.json'), '{}')
  }

  const sudo = `#!/usr/bin/env bash
set -u
while [[ \${1:-} == -* ]]; do
  if [[ $1 == -u ]]; then shift 2; else shift; fi
done
cmd=\${1:?}; shift
echo "sudo:$cmd:$*" >> "$MOCK_LOG"
case "$cmd" in
  mv)
    if [[ \${FAIL_CANDIDATE_RENAME:-0} == 1 && $1 == *".candidate-"* && $2 == */dictation-tauri && ! -e "$MOCK_ROOT/rename-failed" ]]; then
      touch "$MOCK_ROOT/rename-failed"; exit 45
    fi
    /usr/bin/mv "$@" ;;
  rm) /usr/bin/rm "$@" ;;
  mkdir) /usr/bin/mkdir "$@" ;;
  install)
    if [[ \${1:-} == -d ]]; then
      /usr/bin/mkdir -p "\${@: -1}"; exit
    fi
    count=0; [[ -f "$MOCK_ROOT/install-count" ]] && count=$(cat "$MOCK_ROOT/install-count")
    count=$((count + 1)); echo "$count" > "$MOCK_ROOT/install-count"
    if [[ \${FAIL_INSTALL_AT:-0} == "$count" ]]; then exit 46; fi
    /usr/bin/mkdir -p "$(dirname "\${@: -1}")"
    /usr/bin/cp "\${@: -2:1}" "\${@: -1}" ;;
  tar)
    if [[ $1 == -czf ]]; then
      /usr/bin/rm -rf "$MOCK_ROOT/runtime-snapshot"
      /usr/bin/mkdir -p "$MOCK_ROOT/runtime-snapshot"
      /usr/bin/cp -a "$MOCK_ROOT/opt/." "$MOCK_ROOT/runtime-snapshot/"
      touch "$2"
    elif [[ $1 == -xzf ]]; then
      [[ \${FAIL_RESTORE:-0} == 1 ]] && exit 47
      /usr/bin/mkdir -p "$MOCK_ROOT/opt"
      /usr/bin/cp -a "$MOCK_ROOT/runtime-snapshot/." "$MOCK_ROOT/opt/"
    fi ;;
  systemctl) "$MOCK_BIN/systemctl" "$@" ;;
  git) "$MOCK_BIN/git" "$@" ;;
  stat) echo 660 ;;
  test) /usr/bin/test "$@" ;;
  chown|find) exit 0 ;;
  *) "$cmd" "$@" ;;
esac
`
  const git = `#!/usr/bin/env bash
set -u
echo "git:$*" >> "$MOCK_LOG"
case " $* " in
  *" clone "*) target="\${@: -1}"; mkdir -p "$target"; echo candidate > "$target/candidate-marker"; echo '{}' > "$target/package.json" ;;
  *" remote get-url "*) echo mock-origin ;;
  *" rev-parse HEAD "*) echo 1111111111111111111111111111111111111111 ;;
  *" ls-files "*) exit 0 ;;
  *" diff "*) exit 0 ;;
  *) exit 0 ;;
esac
`
  const dispatcher = `#!/usr/bin/env bash
set -u
name=$(basename "$0")
echo "$name:$*" >> "$MOCK_LOG"
case "$name" in
  node|sleep) exit 0 ;;
  id) exit 1 ;;
  systemctl) exit 0 ;;
  curl) [[ \${FAIL_HEALTH:-0} == 1 ]] && exit 48; exit 0 ;;
  sha256sum)
    [[ \${1:-} == -c ]] && exit 0
    echo "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa  \${1:-archive}" ;;
esac
`
  for (const [name, contents] of [['sudo', sudo], ['git', git], ...['node', 'sleep', 'id', 'systemctl', 'curl', 'sha256sum'].map((name) => [name, dispatcher])]) {
    const file = path.join(mockBin, name)
    await fs.writeFile(file, contents.replaceAll('\r\n', '\n'))
    await fs.chmod(file, 0o755)
  }

  const fixtureRoot = shellPath(root)
  const rewritten = apply
    .replace('BACKUP_ROOT="/home/jpsal/.local/state/fixvox-agent-rollouts/$RUN_ID"', `BACKUP_ROOT="${fixtureRoot}/backups/$RUN_ID"`)
    .replace('OPT_ROOT=/opt/fixvox-agent', `OPT_ROOT="${fixtureRoot}/opt"`)
    .replace('MIRROR_ROOT=/var/lib/fixvox-workspace/repos', `MIRROR_ROOT="${fixtureRoot}/mirrors"`)
    .replaceAll('/home/jpsal/dev/$repo', `${fixtureRoot}/rescue/$repo`)
    .replaceAll('/etc/systemd/system', `${fixtureRoot}/etc/systemd/system`)
    .replaceAll('/tmp/fixvox-agent-$RUN_ID-$repo', `${fixtureRoot}/tmp/fixvox-agent-$RUN_ID-$repo`)
    .replaceAll('/var/lib/fixvox-workspace/rollout-backups', `${fixtureRoot}/rollout-backups`)
  const script = path.join(root, 'apply-fixture.sh')
  await fs.writeFile(script, rewritten.replaceAll('\r\n', '\n'))
  await fs.chmod(script, 0o755)
  const childPath = `${shellPath(mockBin)}:/usr/bin:/bin`
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toUpperCase() !== 'PATH')),
    PATH: childPath,
    MOCK_BIN: shellPath(mockBin),
    MOCK_ROOT: fixtureRoot,
    MOCK_LOG: shellPath(log),
    FAIL_CANDIDATE_RENAME: options.failCandidateRename ? '1' : '0',
    FAIL_INSTALL_AT: options.failInstallAt ? String(options.failInstallAt) : '0',
    FAIL_RESTORE: options.failRestore ? '1' : '0',
    FAIL_HEALTH: options.failHealth ? '1' : '0',
  }
  assert.deepEqual(Object.keys(env).filter((key) => key.toUpperCase() === 'PATH'), ['PATH'])
  return {
    root,
    mirrors,
    log,
    result: () => spawnSync(bashExecutable, [
      '-c',
      'export PATH="$1:/usr/bin:/bin"; shift; exec /usr/bin/bash "$@"',
      'fixture-runner',
      shellPath(mockBin),
      shellPath(script),
      shellPath(stage),
      runId,
      options.syncMirrors ? '1' : '0',
    ], { env, encoding: 'utf8' }),
  }
}

test('remote apply restores the original mirror when the candidate-to-current rename fails', async () => {
  const fixture = await createApplyFixture({ syncMirrors: true, failCandidateRename: true })
  try {
    const result = fixture.result()
    assert.doesNotMatch(result.stderr, /fatal: cannot change|Failed to connect|Could not resolve host/)
    assert.notEqual(result.status, 0)
    assert.notEqual(result.status, 70, result.stderr)
    assert.equal(await fs.readFile(path.join(fixture.mirrors, 'dictation-tauri', 'live-marker'), 'utf8'), 'original:dictation-tauri')
    await assert.rejects(() => fs.access(path.join(fixture.mirrors, '.backup-fixture-run-dictation-tauri')))
    assert.match(await fs.readFile(fixture.log, 'utf8'), /sudo:mv:.*\.backup-fixture-run-dictation-tauri .*\/dictation-tauri/)
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true })
  }
})

test('an intermediate runtime install failure restores runtime, restarts services, and verifies health', async () => {
  const fixture = await createApplyFixture({ failInstallAt: 2 })
  try {
    const result = fixture.result()
    assert.doesNotMatch(result.stderr, /fatal: cannot change|Failed to connect|Could not resolve host/)
    assert.notEqual(result.status, 0)
    assert.notEqual(result.status, 70, result.stderr)
    assert.equal(await fs.readFile(path.join(fixture.root, 'opt', 'runtime', 'old-runtime'), 'utf8'), 'original')
    const calls = await fs.readFile(fixture.log, 'utf8')
    assert.match(calls, /sudo:tar:-xzf/)
    assert.match(calls, /sudo:systemctl:restart fixvox-workspace-broker\.service fixvox-constelaciones-read-broker\.service/)
    assert.match(calls, /curl:-fsS http:\/\/127\.0\.0\.1:8787\/healthz/)
    assert.match(calls, /curl:-fsS https:\/\/fixvox\.jpsala\.dev\/healthz/)
  } finally {
    await fs.rm(fixture.root, { recursive: true, force: true })
  }
})

test('remote apply propagates rollback restore and health failures as an unverified rollback', async () => {
  for (const options of [{ failInstallAt: 2, failRestore: true }, { failInstallAt: 2, failHealth: true }]) {
    const fixture = await createApplyFixture(options)
    try {
      const result = fixture.result()
      assert.doesNotMatch(result.stderr, /fatal: cannot change|Failed to connect|Could not resolve host/)
      assert.equal(result.status, 70, result.stderr)
      assert.match(result.stderr, /rollback was not verified/)
    } finally {
      await fs.rm(fixture.root, { recursive: true, force: true })
    }
  }
})
