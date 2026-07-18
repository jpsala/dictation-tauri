import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const rollout = await fs.readFile(new URL('../../scripts/pi-remote-agent-rollout.ps1', import.meta.url), 'utf8')
const apply = await fs.readFile(new URL('../../scripts/pi-remote-agent-apply.sh', import.meta.url), 'utf8')

test('rollout defaults to dry-run and gates every remote mutation', () => {
  assert.match(rollout, /\[switch\]\$ConfirmProduction/)
  assert.match(rollout, /if \(-not \$ConfirmProduction\)/)
  assert.match(rollout, /DRY RUN: no VPS files/)
  assert.ok(rollout.indexOf('if (-not $ConfirmProduction)') < rollout.indexOf('scp $localBundle'))
})

test('rollout uses exact manifest, one verified bundle, bounded retry and cleanup', () => {
  for (const file of ['pi-remote-agent-extension.mjs', 'pi-workspace-broker.mjs', 'constelaciones-read-broker.mjs', 'pi-release-broker.mjs', 'pi-release-broker-client.mjs', 'pi-release-git-runner.mjs', 'pi-release-service.mjs', 'run-isolated-pi.sh', 'fixvox-workspace-broker.service', 'fixvox-constelaciones-read-broker.service']) {
    assert.ok(rollout.includes(file))
  }
  assert.match(rollout, /Get-Sha256/)
  assert.match(rollout, /sha256sum -c/)
  assert.match(rollout, /UploadAttempts/)
  assert.match(rollout, /tar -xzf/)
})

test('remote apply fails dirty mirrors, rejects secrets and swaps on one filesystem', () => {
  assert.match(apply, /git -C "\$MIRROR_ROOT\/\$repo" diff --quiet/)
  assert.match(apply, /ls-files --others --exclude-standard/)
  assert.match(apply, /Tracked sensitive path rejected/)
  assert.match(apply, /\.env/)
  assert.match(apply, /sqlite/)
  assert.match(apply, /sudo mv "\$MIRROR_ROOT\/\$repo" "\$MIRROR_ROOT\/\.backup-/)
  assert.match(apply, /trap rollback ERR/)
  assert.match(apply, /systemctl stop fixvox-release-broker\.service/)
  assert.match(apply, /RELEASE_WAS_ACTIVE/)
  assert.match(apply, /runtime-and-units\.tar\.gz/)
})

test('rollout never copies or archives provider OAuth', () => {
  assert.doesNotMatch(`${rollout}\n${apply}`, /(?:cp|install|tar)[^\n]*(?:auth\.json|\.pi\/agent\/auth)/i)
  assert.match(apply, /workspace user can read provider auth/i)
})
