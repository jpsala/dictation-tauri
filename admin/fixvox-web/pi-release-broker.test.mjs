import assert from 'node:assert/strict'
import test from 'node:test'
import { ReleaseBroker, sensitiveReleasePath } from './pi-release-broker.mjs'

const hashA = 'a'.repeat(40)
const hashB = 'b'.repeat(40)

function fixture(overrides = {}) {
  let now = 1000
  let state = { branch: 'main', remoteName: 'origin', remoteMatches: true, head: hashA, pushedHash: hashA, dirty: true, changedCount: 1, untracked: [], fastForward: true, ...overrides.state }
  const calls = []
  const journal = []
  const runner = {
    inspect: async () => ({ ...state, untracked: [...state.untracked] }),
    diff: async () => 'diff --git a/safe.txt b/safe.txt',
    commit: async (_repo, message) => { calls.push(['commit', message]); state = { ...state, head: hashB, dirty: false }; return { hash: hashB } },
    push: async (_repo, hash) => { calls.push(['push', hash]); state = { ...state, pushedHash: hash }; return { hash } },
    deploy: async (recipe, hash) => { calls.push(['deploy', recipe.id, hash]); if (overrides.deployFails) throw new Error('health check failed; rollback complete'); return { hash, health: 'ok', rollback: recipe.rollbackId } },
  }
  const broker = new ReleaseBroker({
    repositories: { app: { id: 'app', branch: 'main', remoteName: 'origin' } },
    recipes: { admin: { id: 'admin', enabled: true, repoId: 'app', target: 'admin-vps', rollbackId: 'admin-backup' } },
    runner, now: () => now, ttlMs: 100, journal: async (record) => journal.push(record),
  })
  return { broker, calls, journal, setState: (next) => { state = { ...state, ...next } }, tick: (ms) => { now += ms } }
}

test('commit uses one-time challenge and rejects forged, stale and reused confirmation', async () => {
  const { broker, calls, tick } = fixture()
  const forged = await broker.prepare({ operation: 'git_commit', repoId: 'app', message: 'safe change' })
  await assert.rejects(() => broker.execute({ id: forged.id, confirmation: 'wrong' }), (error) => error.status === 403)
  const accepted = await broker.prepare({ operation: 'git_commit', repoId: 'app', message: 'safe change' })
  assert.match(accepted.phrase, /^COMMIT app\/main a{12}$/)
  await broker.execute({ id: accepted.id, confirmation: accepted.phrase })
  assert.deepEqual(calls, [['commit', 'safe change']])
  await assert.rejects(() => broker.execute({ id: accepted.id, confirmation: accepted.phrase }), (error) => error.status === 403)
  const staleFixture = fixture()
  const stale = await staleFixture.broker.prepare({ operation: 'git_commit', repoId: 'app', message: 'safe change' })
  staleFixture.tick(101)
  await assert.rejects(() => staleFixture.broker.execute({ id: stale.id, confirmation: stale.phrase }), (error) => error.status === 403)
  tick(1)
})

test('branch, remote, dirty sensitive files, fast-forward and source hash are enforced', async () => {
  await assert.rejects(() => fixture({ state: { branch: 'feature' } }).broker.status('app'), (error) => error.status === 409)
  await assert.rejects(() => fixture({ state: { remoteMatches: false } }).broker.status('app'), (error) => error.status === 409)
  await assert.rejects(() => fixture({ state: { untracked: ['nested/.env'] } }).broker.status('app'), (error) => error.status === 409)
  await assert.rejects(() => fixture({ state: { dirty: false, fastForward: false } }).broker.prepare({ operation: 'git_push', repoId: 'app' }), /fast-forward/)
  const changed = fixture({ state: { dirty: false } })
  const challenge = await changed.broker.prepare({ operation: 'git_push', repoId: 'app' })
  changed.setState({ head: hashB })
  await assert.rejects(() => changed.broker.execute({ id: challenge.id, confirmation: challenge.phrase }), /changed after confirmation/)
})

test('deploy requires exact pushed hash and journals only bounded metadata', async () => {
  const mismatch = fixture({ state: { dirty: false, head: hashB, pushedHash: hashA } })
  await assert.rejects(() => mismatch.broker.prepare({ operation: 'deploy', repoId: 'app', recipeId: 'admin' }), /exact pushed hash/)
  const success = fixture({ state: { dirty: false } })
  const challenge = await success.broker.prepare({ operation: 'deploy', repoId: 'app', recipeId: 'admin' })
  const result = await success.broker.execute({ id: challenge.id, confirmation: challenge.phrase })
  assert.equal(result.result.health, 'ok')
  assert.deepEqual(Object.keys(success.journal[0]).sort(), ['at', 'operation', 'operationHash', 'repoId', 'result', 'sourceHash', 'target'])
  assert.doesNotMatch(JSON.stringify(success.journal), /diff --git|safe change|credential|token/i)
  const failed = fixture({ state: { dirty: false }, deployFails: true })
  const failedChallenge = await failed.broker.prepare({ operation: 'deploy', repoId: 'app', recipeId: 'admin' })
  await assert.rejects(() => failed.broker.execute({ id: failedChallenge.id, confirmation: failedChallenge.phrase }), /rollback complete/)
  assert.equal(failed.journal[0].result, 'failed')
})

test('pending challenge serializes repository mutations and sensitive paths are recognized', async () => {
  const { broker } = fixture()
  await broker.prepare({ operation: 'git_commit', repoId: 'app', message: 'safe change' })
  await assert.rejects(() => broker.prepare({ operation: 'git_commit', repoId: 'app', message: 'second' }), (error) => error.status === 409)
  for (const file of ['.env', 'nested/auth.json', 'data/private.sqlite', 'sessions/x', 'private-exports/x']) assert.equal(sensitiveReleasePath(file), true)
  assert.equal(sensitiveReleasePath('src/safe.ts'), false)
})
