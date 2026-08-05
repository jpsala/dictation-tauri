import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createOmpHostTools } from './omp-host-tools.mjs'
import { OmpRpcChunkReassembler } from './omp-rpc-framing.mjs'
import {
  auditRecord,
  buildRemoteAgentEnv,
  classifyRemoteToolCall,
  containsSensitiveEnvName,
  ompRemoteAgentArgs,
  remoteAgentRoots,
  resolveRemoteToolInput,
} from './omp-remote-policy.mjs'

const roots = ['/home/fixvox-agent/workspaces/dictation-tauri', '/home/fixvox-agent/workspaces/constelaciones']
const cwd = roots[0]

test('isolated OMP environment strips credentials and exports only broker policy coordinates', () => {
  const env = buildRemoteAgentEnv({ PATH: '/usr/bin', HOME: '/home/jpsal', API_TOKEN: 'secret', ADMIN_API_KEY: 'secret', LANG: 'C.UTF-8' }, {
    home: '/home/fixvox-agent', user: 'fixvox-agent', auditPath: '/home/fixvox-agent/audit/operations.jsonl', roots,
    constelacionesSocket: '/run/fixvox-agent/constelaciones.sock', workspaceBrokerSocket: '/run/fixvox-agent/workspace.sock', releaseBrokerSocket: '/run/fixvox-agent/release.sock', releaseBrokerEnabled: true,
  })
  assert.equal(env.API_TOKEN, undefined)
  assert.equal(env.ADMIN_API_KEY, undefined)
  assert.equal(env.OMP_CHAT_RELEASE_BROKER_ENABLED, '1')
  assert.equal(env.OMP_CHAT_REMOTE_AGENT, '1')
  assert.equal(containsSensitiveEnvName(env), false)
})

test('OMP RPC args use documented isolation, session continuity and no Pi-only flags', () => {
  const args = ompRemoteAgentArgs({ sessionDir: '/home/fixvox-agent/sessions', releaseBrokerEnabled: true })
  assert.deepEqual(args.slice(0, 2), ['--mode', 'rpc'])
  for (const flag of ['--auto-approve', '--no-tools', '--no-extensions', '--no-skills', '--no-rules', '--profile', '--session-dir', '--continue']) assert.ok(args.includes(flag))
  for (const flag of ['--name', '--exclude-tools', '--approve', '--no-approve', '--no-context-files', '--no-builtin-tools', '--no-prompt-templates']) assert.ok(!args.includes(flag))
})

test('remote policy preserves root allowlist, secret denial, confirmations and release-only mutation', async () => {
  assert.equal(classifyRemoteToolCall('read', { path: `${cwd}/README.md` }, { cwd, roots }).decision, 'allow')
  assert.equal(classifyRemoteToolCall('read', { path: `${cwd}/.env` }, { cwd, roots }).category, 'secret_path')
  assert.equal(classifyRemoteToolCall('read', { path: '/etc/passwd' }, { cwd, roots }).category, 'read_outside_roots')
  assert.equal(classifyRemoteToolCall('write', { path: `${cwd}/src/app.ts` }, { cwd, roots }).decision, 'confirm')
  assert.equal(classifyRemoteToolCall('edit', { path: `${cwd}/src/app.ts` }, { cwd, roots }).decision, 'confirm')
  assert.equal(classifyRemoteToolCall('bash', { command: 'npm run check' }, { cwd, roots }).decision, 'confirm')
  assert.equal(classifyRemoteToolCall('bash', { command: 'printenv' }, { cwd, roots }).category, 'secret_discovery')
  assert.equal(classifyRemoteToolCall('bash', { command: 'git push origin main' }, { cwd, roots }).category, 'release_bypass')
  assert.equal(classifyRemoteToolCall('release_git_push', { repoId: 'dictation' }, { cwd, roots }).category, 'release_broker')
  assert.deepEqual(remoteAgentRoots(roots.join(path.delimiter)), roots.map((root) => path.resolve(root)))
})

test('realpath canonicalization prevents an approved-root symlink from escaping policy', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-policy-roots-'))
  const root = path.join(temp, 'workspace')
  const outside = path.join(temp, 'outside')
  await fs.mkdir(root)
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'secret.txt'), 'secret')
  await fs.symlink(outside, path.join(root, 'linked-outside'), process.platform === 'win32' ? 'junction' : 'dir')
  try {
    const resolved = await resolveRemoteToolInput('read', { path: path.join(root, 'linked-outside', 'secret.txt') }, root)
    assert.equal(classifyRemoteToolCall('read', resolved, { cwd: root, roots: [root] }).decision, 'deny')
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
})

test('audit records remain redacted and stable', () => {
  const record = auditRecord({ toolName: 'bash', classification: { decision: 'confirm', category: 'bash', detail: 'echo private' }, approved: false, sessionId: 'raw-session' })
  assert.equal(record.decision, 'blocked')
  assert.equal(record.operationHash.length, 64)
  assert.equal(record.sessionHash.length, 64)
  assert.doesNotMatch(JSON.stringify(record), /echo private|raw-session/)
})

test('OMP host tool schemas register the complete broker-owned surface', () => {
  const host = createOmpHostTools({ cwd, roots, auditPath: '/tmp/audit.jsonl', constelacionesSocket: '/tmp/constelaciones.sock', workspaceBrokerSocket: '/tmp/workspace.sock', releaseBrokerSocket: '/tmp/release.sock', releaseBrokerEnabled: true })
  assert.deepEqual(host.definitions.map((tool) => tool.name), ['read', 'write', 'edit', 'bash', 'grep', 'find', 'ls', 'constelaciones_future_appointments', 'release_git_status', 'release_git_diff', 'release_git_commit', 'release_git_push', 'release_deploy'])
  for (const tool of host.definitions) {
    assert.equal(tool.parameters.type, 'object')
    assert.equal(tool.parameters.additionalProperties, false)
  }
})

test('OMP protocol v2 reassembles lossless UTF-8 chunks and rejects interruption', () => {
  const logical = { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'á'.repeat(600000) } }
  const payload = Buffer.from(JSON.stringify(logical), 'utf8')
  const chunkSize = 256 * 1024
  const chunks = Array.from({ length: Math.ceil(payload.length / chunkSize) }, (_, index) => payload.subarray(index * chunkSize, (index + 1) * chunkSize))
  const decoder = new OmpRpcChunkReassembler()
  decoder.setLimits(1024 * 1024, 64 * 1024 * 1024)
  let result
  chunks.forEach((data, index) => { result = decoder.push({ type: 'rpc_chunk', chunkId: 'rpc-1', index, count: chunks.length, byteLength: payload.length, data: data.toString('base64') }) })
  assert.deepEqual(result, logical)
  const interrupted = new OmpRpcChunkReassembler()
  interrupted.push({ type: 'rpc_chunk', chunkId: 'rpc-2', index: 0, count: 2, byteLength: 1024 * 1024, data: Buffer.from('x').toString('base64') })
  assert.throws(() => interrupted.push({ type: 'agent_end' }), /interrumpida/)
})
