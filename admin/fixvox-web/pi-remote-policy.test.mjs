import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { registerRemoteAgentPolicy } from './pi-remote-agent-core.mjs'
import {
  auditRecord,
  buildRemoteAgentEnv,
  classifyRemoteToolCall,
  containsSensitiveEnvName,
  remoteAgentArgs,
  resolveRemoteToolInput,
} from './pi-remote-policy.mjs'

const roots = ['/home/fixvox-agent/workspaces/dictation-tauri', '/home/fixvox-agent/workspaces/constelaciones']
const cwd = roots[0]

test('remote agent child env is allowlisted and excludes credential-shaped names', () => {
  const env = buildRemoteAgentEnv({
    PATH: '/usr/bin',
    LANG: 'en_US.UTF-8',
    HOME: '/home/jpsal',
    USER: 'jpsal',
    ADMIN_API_KEY: 'admin-sensitive',
    FIXVOX_ADMIN_WEB_TOKEN: 'web-sensitive',
    GOOGLE_CLOUD_CLIENT_SECRET: 'oauth-sensitive',
    OPENAI_API_KEY: 'provider-sensitive',
    SSH_AUTH_SOCK: '/tmp/agent.sock',
  }, {
    home: '/home/fixvox-agent',
    user: 'fixvox-agent',
    agentDir: '/home/fixvox-agent/.pi/agent',
    auditPath: '/home/fixvox-agent/audit/operations.jsonl',
    roots,
    constelacionesSocket: '/home/fixvox-agent/run/constelaciones-read.sock',
    workspaceBrokerSocket: '/home/fixvox-agent/run/workspace-broker.sock',
  })

  assert.equal(env.PATH, '/usr/bin')
  assert.equal(env.HOME, path.resolve('/home/fixvox-agent'))
  assert.equal(env.USER, 'fixvox-agent')
  assert.equal(env.SSH_AUTH_SOCK, undefined)
  assert.equal(containsSensitiveEnvName(env), false)
  assert.doesNotMatch(JSON.stringify(env), /admin-sensitive|web-sensitive|oauth-sensitive|provider-sensitive/)
})

test('remote runtime disables inherited resources and trusts no project implicitly', () => {
  const args = remoteAgentArgs({
    extensionPath: '/srv/policy.mjs',
    sessionDir: '/srv/sessions',
  })
  const joined = args.join(' ')

  assert.match(joined, /--mode rpc/)
  assert.match(joined, /--no-approve/)
  assert.match(joined, /--no-extensions/)
  assert.match(joined, /--no-skills/)
  assert.match(joined, /--no-prompt-templates/)
  assert.match(joined, /--no-context-files/)
  assert.match(joined, /--no-builtin-tools/)
  assert.match(joined, /--tools read,bash,edit,write,grep,find,ls,constelaciones_future_appointments/)
  assert.doesNotMatch(joined, /(?:^|\s)--approve(?:\s|$)/)
})

test('read policy allows approved repos and denies roots, secrets, stores and sessions', () => {
  assert.equal(classifyRemoteToolCall('constelaciones_future_appointments', { days: 30 }, { cwd, roots }).decision, 'allow')
  assert.equal(classifyRemoteToolCall('read', { path: 'src/App.tsx' }, { cwd, roots }).decision, 'allow')
  assert.equal(classifyRemoteToolCall('read', { path: roots[1] }, { cwd, roots }).decision, 'allow')
  assert.equal(classifyRemoteToolCall('read', { path: '/etc/passwd' }, { cwd, roots }).decision, 'deny')
  assert.equal(classifyRemoteToolCall('read', { path: `${roots[1]}/.env` }, { cwd, roots }).category, 'secret_path')
  assert.equal(classifyRemoteToolCall('read', { path: `${roots[1]}/data/stores/customer.db` }, { cwd, roots }).category, 'secret_path')
})

test('realpath canonicalization prevents an approved-root symlink from escaping policy', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-policy-roots-'))
  const root = path.join(temp, 'workspace')
  const outside = path.join(temp, 'outside')
  await fs.mkdir(root)
  await fs.mkdir(outside)
  await fs.writeFile(path.join(outside, 'secret.txt'), 'sensitive')
  await fs.symlink(outside, path.join(root, 'linked-outside'), process.platform === 'win32' ? 'junction' : 'dir')
  try {
    const input = await resolveRemoteToolInput('read', { path: 'linked-outside/secret.txt' }, root)
    const classification = classifyRemoteToolCall('read', input, { cwd: root, roots: [root] })
    const nestedWriteInput = await resolveRemoteToolInput('write', { path: 'linked-outside/new/deep/file.txt' }, root)
    const nestedWrite = classifyRemoteToolCall('write', nestedWriteInput, { cwd: root, roots: [root] })
    assert.equal(classification.decision, 'deny')
    assert.equal(classification.category, 'read_outside_roots')
    assert.equal(nestedWrite.decision, 'deny')
    assert.equal(nestedWrite.category, 'write_outside_roots')
  } finally {
    await fs.rm(temp, { recursive: true, force: true })
  }
})

test('writes and shell require approval while secret discovery stays unconditionally blocked', () => {
  const write = classifyRemoteToolCall('write', { path: 'src/new.ts', content: 'safe' }, { cwd, roots })
  const edit = classifyRemoteToolCall('edit', { path: `${roots[1]}/src/app.ts` }, { cwd, roots })
  const git = classifyRemoteToolCall('bash', { command: 'git status --short' }, { cwd, roots })
  const deploy = classifyRemoteToolCall('bash', { command: 'systemctl --user restart app' }, { cwd, roots })
  const secret = classifyRemoteToolCall('bash', { command: 'cat ~/.ssh/id_ed25519' }, { cwd, roots })

  assert.equal(write.decision, 'confirm')
  assert.equal(edit.decision, 'confirm')
  assert.equal(git.decision, 'confirm')
  assert.equal(deploy.decision, 'confirm')
  assert.equal(secret.decision, 'deny')
  assert.equal(classifyRemoteToolCall('unknown', {}, { cwd, roots }).decision, 'deny')
})

test('audit record is bounded and never persists raw paths, commands, prompts or session ids', () => {
  const classification = {
    decision: 'confirm',
    category: 'bash',
    summary: 'Ejecutar comando',
    detail: 'deploy --token super-sensitive --customer customer-sensitive',
    scope: 'constelaciones/private/customer-sensitive',
  }
  const record = auditRecord({
    toolName: 'bash',
    classification,
    approved: false,
    sessionId: 'session-sensitive',
    now: new Date('2026-07-18T00:00:00.000Z'),
  })
  const otherRecord = auditRecord({
    toolName: 'bash',
    classification: { ...classification, detail: 'git status --short' },
    approved: false,
    sessionId: 'session-sensitive',
    now: new Date('2026-07-18T00:00:00.000Z'),
  })
  const serialized = JSON.stringify(record)

  assert.deepEqual(Object.keys(record).sort(), ['at', 'category', 'decision', 'operationHash', 'schemaVersion', 'sessionHash', 'tool'])
  assert.notEqual(record.operationHash, otherRecord.operationHash)
  assert.equal(record.decision, 'blocked')
  assert.doesNotMatch(serialized, /super-sensitive|customer-sensitive|session-sensitive|deploy --token/)
})

test('remote policy behavior blocks before execution and audits allow, deny, approve, cancel and no-UI', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-policy-harness-'))
  const root = path.join(temp, 'workspace')
  const auditPath = path.join(temp, 'audit', 'operations.jsonl')
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, 'safe.txt'), 'safe')
  const previousRoots = process.env.PI_CHAT_AGENT_ROOTS
  const previousAudit = process.env.PI_CHAT_AGENT_AUDIT_PATH
  process.env.PI_CHAT_AGENT_ROOTS = root
  process.env.PI_CHAT_AGENT_AUDIT_PATH = auditPath
  const handlers = new Map()
  const tools = []
  const fakePi = {
    on(name, handler) { handlers.set(name, handler) },
    registerTool(tool) { tools.push(tool.name) },
  }
  const context = (confirmed, hasUI = true) => ({
    cwd: root,
    hasUI,
    sessionManager: { getSessionId: () => 'session-sensitive' },
    ui: { confirm: async () => confirmed },
  })
  try {
    registerRemoteAgentPolicy(fakePi, { futureAppointmentsParameters: { type: 'object', properties: {} } })
    const gate = handlers.get('tool_call')
    assert.equal(typeof gate, 'function')
    assert.ok(tools.includes('constelaciones_future_appointments'))
    assert.equal(await gate({ toolName: 'read', input: { path: 'safe.txt' } }, context(false)), undefined)
    assert.equal((await gate({ toolName: 'read', input: { path: '/etc/passwd' } }, context(true))).block, true)
    assert.equal(await gate({ toolName: 'write', input: { path: 'approved.txt', content: 'ok' } }, context(true)), undefined)
    assert.equal((await gate({ toolName: 'write', input: { path: 'cancelled.txt', content: 'no' } }, context(false))).block, true)
    assert.equal((await gate({ toolName: 'bash', input: { command: 'git status --short' } }, context(true, false))).block, true)
    assert.equal((await gate({ toolName: 'bash', input: { command: 'cat ~/.ssh/id_ed25519' } }, context(true))).block, true)
    const records = (await fs.readFile(auditPath, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.deepEqual(records.map((record) => record.decision), ['allow', 'deny', 'approved', 'blocked', 'blocked', 'deny'])
    const serialized = JSON.stringify(records)
    assert.doesNotMatch(serialized, /safe\.txt|approved\.txt|cancelled\.txt|git status|id_ed25519|session-sensitive/)
  } finally {
    if (previousRoots === undefined) delete process.env.PI_CHAT_AGENT_ROOTS
    else process.env.PI_CHAT_AGENT_ROOTS = previousRoots
    if (previousAudit === undefined) delete process.env.PI_CHAT_AGENT_AUDIT_PATH
    else process.env.PI_CHAT_AGENT_AUDIT_PATH = previousAudit
    await fs.rm(temp, { recursive: true, force: true })
  }
})

test('remote policy extension gates tool calls before execution through RPC UI', async () => {
  const source = await fs.readFile(new URL('./pi-remote-agent-core.mjs', import.meta.url), 'utf8')
  const deploy = await fs.readFile(new URL('../../scripts/admin-web-deploy.ps1', import.meta.url), 'utf8')
  assert.match(source, /pi\.on\('tool_call'/)
  assert.match(source, /ctx\.ui\.confirm/)
  assert.match(source, /timeout:\s*CONFIRM_TIMEOUT_MS/)
  assert.match(source, /if \(!approved\) return \{ block: true/)
  assert.match(source, /if \(!ctx\.hasUI\)/)
  const extension = await fs.readFile(new URL('./pi-remote-agent-extension.mjs', import.meta.url), 'utf8')
  assert.match(extension, /createFindTool/)
  assert.match(extension, /createLsTool/)
  assert.match(extension, /name: 'grep'/)
  for (const file of ['pi-chat-access.mjs', 'pi-remote-policy.mjs', 'pi-remote-agent-core.mjs', 'pi-remote-agent-extension.mjs', 'pi-workspace-broker-client.mjs', 'pi-workspace-broker.mjs', 'constelaciones-read-adapter.mjs', 'constelaciones-read-broker.mjs']) {
    assert.ok(deploy.includes(file))
  }
  assert.match(deploy, /Send-BundleWithRetry/)
  assert.match(deploy, /sha256sum -c/)
  assert.doesNotMatch(deploy, /\$scpArguments/)
})
