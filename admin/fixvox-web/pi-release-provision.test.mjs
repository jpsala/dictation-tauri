import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import test from 'node:test'

const provision = await fs.readFile(new URL('../../scripts/pi-release-provision.ps1', import.meta.url), 'utf8')
const releaseUnit = await fs.readFile(new URL('./systemd/fixvox-release-broker.service', import.meta.url), 'utf8')
const deployUnit = await fs.readFile(new URL('./systemd/fixvox-admin-deploy-helper.service', import.meta.url), 'utf8')
let recipe
try { recipe = JSON.parse(await fs.readFile(new URL('./release-recipes.example.json', import.meta.url), 'utf8')) }
catch { throw new Error('Release recipe fixture must be valid JSON.') }

test('release provisioning is dry-run by default with separate key and enable gates', () => {
  assert.match(provision, /\[switch\]\$ConfirmProduction/)
  assert.match(provision, /\[switch\]\$RegisterDeployKey/)
  assert.match(provision, /\[switch\]\$EnableReleaseBroker/)
  assert.ok(provision.indexOf('if (-not $ConfirmProduction)') < provision.indexOf('ssh-keygen'))
  assert.match(provision, /DRY RUN: no users, keys, GitHub settings, services, configs, credentials, or feature flags changed/)
})

test('deploy key is repo-specific, write-enabled and never copied to agent/workspace', () => {
  assert.match(provision, /repos\/jpsala\/dictation-tauri\/keys/)
  assert.match(provision, /read_only=false/)
  assert.match(provision, /fixvox-release-dictation/)
  assert.doesNotMatch(provision, /(?:cp|install)[^\n]*(?:dictation-tauri$|dictation-tauri")/m)
  assert.doesNotMatch(provision, /cat "\$key"(?:\s|$)/)
  assert.doesNotMatch(provision, /gho_|GITHUB_TOKEN|GH_TOKEN/)
})

test('services and deploy recipe remain disabled without the explicit enable switch', () => {
  assert.equal(recipe.recipes['fixvox-admin-vps'].enabled, false)
  assert.match(provision, /if \[\[ \$enable == 1 \]\]/)
  assert.match(provision, /systemctl disable fixvox-admin-deploy-helper\.service fixvox-release-broker\.service/)
  assert.match(releaseUnit, /User=fixvox-release/)
  assert.match(deployUnit, /User=root/)
  assert.match(deployUnit, /PI_ADMIN_DEPLOY_CONFIG=\/etc\/fixvox-release\/admin-deploy\.json/)
})

test('release config exposes only typed fixed recipes and no credentials', () => {
  assert.equal(recipe.repositories['dictation-tauri'].pushUrl, 'git@github.com:jpsala/dictation-tauri.git')
  assert.deepEqual(recipe.repositories['dictation-tauri'].allowedPaths, ['admin/fixvox-web', 'scripts', 'docs'])
  assert.deepEqual(recipe.recipes['fixvox-admin-vps'].deploy.file, '/usr/bin/node')
  assert.doesNotMatch(JSON.stringify(recipe), /token|private.?key|password/i)
})
