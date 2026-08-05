import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { once } from 'node:events'
import { fileURLToPath } from 'node:url'

const adminRoot = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(adminRoot, '..', '..')
const port = 19087
const baseUrl = `http://127.0.0.1:${port}`

async function waitForServer() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/healthz`)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('Admin test server did not become ready.')
}

async function readPromptAndApprove(response) {
  assert.equal(response.status, 200)
  assert.ok(response.body)
  const events = []
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((candidate) => candidate.startsWith('data: '))
      if (!line) continue
      const event = JSON.parse(line.slice(6))
      events.push(event)
      if (event.type === 'extension_ui_request' && event.method === 'confirm') {
        const approval = await fetch(`${baseUrl}/api/pi-chat/command`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ command: { type: 'extension_ui_response', id: event.id, confirmed: true } }),
        })
        assert.equal(approval.status, 200)
      }
    }
    if (done) return events
  }
}

test('OMP RPC negotiates v2 and completes host tool progress, result, and cancellation frames', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'fixvox-omp-host-protocol-'))
  const recordFile = path.join(temp, 'frames.jsonl')
  const auditFile = path.join(temp, 'audit.jsonl')
  const probeScript = path.join(temp, 'omp-probe.mjs')
  const workspaceSocket = process.platform === 'win32' ? `\\\\.\\pipe\\fixvox-workspace-${process.pid}-${Date.now()}` : path.join(temp, 'workspace.sock')
  const brokerRequests = []
  const workspaceBroker = http.createServer(async (request, response) => {
    const chunks = []
    for await (const chunk of request) chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    brokerRequests.push({ route: request.url, body })
    if (request.url === '/v1/bash') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, output: Buffer.from('progress from broker\n').toString('base64'), exitCode: 0 }))
      return
    }
    if (request.url === '/v1/read') return
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: false, error: 'Unexpected broker route.' }))
  })
  const roleBackend = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true, role: 'owner' }))
  })
  const probeSource = `
import fs from 'node:fs';
const recordFile = ${JSON.stringify(recordFile)};
const record = (frame) => fs.appendFileSync(recordFile, JSON.stringify(frame) + '\\n');
if (process.argv.includes('--version')) { process.stdout.write('omp/17.2.8\\n'); process.exit(0); }
record({ kind: 'argv', args: process.argv.slice(2) });
const send = (frame) => process.stdout.write(JSON.stringify(frame) + '\\n');
send({ type: 'ready', protocolVersion: 1, supportedProtocolVersions: [1, 2], maxFrameBytes: 1048576, maxReassembledFrameBytes: 67108864 });
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  input += chunk;
  while (input.includes('\\n')) {
    const index = input.indexOf('\\n');
    const line = input.slice(0, index);
    input = input.slice(index + 1);
    if (!line.trim()) continue;
    const frame = JSON.parse(line);
    record(frame);
    if (frame.type === 'host_tool_update') continue;
    if (frame.type === 'host_tool_result' && frame.id === 'host-progress') {
      send({ type: 'host_tool_call', id: 'host-cancel', toolCallId: 'tool-cancel', toolName: 'read', arguments: { path: ${JSON.stringify(path.join(repoRoot, 'package.json'))} } });
      send({ type: 'host_tool_cancel', id: 'cancel-1', targetId: 'host-cancel' });
      continue;
    }
    if (frame.type === 'host_tool_result' && frame.id === 'host-cancel') {
      send({ type: 'agent_end', messages: [{ role: 'assistant', content: [{ type: 'text', text: 'host tools complete' }] }] });
      continue;
    }
    send({ type: 'response', id: frame.id, command: frame.type, success: true, ...(frame.type === 'get_state' ? { data: { sessionId: 'host-protocol-session' } } : {}) });
    if (frame.type === 'prompt') {
      send({ type: 'host_tool_call', id: 'host-progress', toolCallId: 'tool-progress', toolName: 'bash', arguments: { command: 'printf progress', cwd: ${JSON.stringify(repoRoot)} } });
    }
  }
});
`
  await fs.writeFile(probeScript, probeSource)
  await new Promise((resolve) => workspaceBroker.listen(workspaceSocket, resolve))
  await new Promise((resolve) => roleBackend.listen(19088, '127.0.0.1', resolve))
  const server = spawn(process.execPath, ['server.mjs'], {
    cwd: adminRoot,
    env: {
      ...process.env,
      FIXVOX_ADMIN_SKIP_ENV_FILES: '1',
      FIXVOX_ADMIN_MOCK: '0',
      FIXVOX_ADMIN_ENV: 'local',
      FIXVOX_ADMIN_LOCAL_AUTH_FIXTURE: '1',
      FIXVOX_ADMIN_BASE_URL: 'http://127.0.0.1:19088',
      FIXVOX_ADMIN_HOST: '127.0.0.1',
      FIXVOX_ADMIN_PORT: String(port),
      ADMIN_VIEW_API_KEY: 'local-view-fixture',
      OMP_CHAT_BIN: process.execPath,
      OMP_CHAT_ARGS: probeScript,
      OMP_CHAT_REMOTE_AGENT_ENABLED: '1',
      OMP_CHAT_AGENT_HOME: path.join(temp, 'agent-home'),
      OMP_CHAT_AGENT_SESSION_DIR: path.join(temp, 'sessions'),
      OMP_CHAT_AGENT_AUDIT_PATH: auditFile,
      OMP_CHAT_AGENT_ROOTS: repoRoot,
      OMP_CHAT_WORKSPACE_BROKER_SOCKET: workspaceSocket,
      OMP_CHAT_CONSTELACIONES_SOCKET: path.join(temp, 'constelaciones.sock'),
    },
    stdio: 'ignore',
  })
  try {
    await waitForServer()
    const events = await readPromptAndApprove(await fetch(`${baseUrl}/api/pi-chat/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'exercise host protocol' }),
    }))
    const frames = (await fs.readFile(recordFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    const argv = frames.find((frame) => frame.kind === 'argv').args
    assert.ok(argv.includes('--no-tools'))
    assert.ok(!argv.some((arg) => ['--name', '--no-builtin-tools', '--no-context-files'].includes(arg)))
    assert.deepEqual(frames.filter((frame) => frame.type === 'negotiate_protocol').map((frame) => frame.protocolVersion), [2])
    const registration = frames.find((frame) => frame.type === 'set_host_tools')
    assert.ok(registration.tools.some((tool) => tool.name === 'read'))
    assert.ok(registration.tools.some((tool) => tool.name === 'bash'))
    const update = frames.find((frame) => frame.type === 'host_tool_update' && frame.id === 'host-progress')
    assert.match(update.partialResult.content[0].text, /progress from broker/)
    const completed = frames.find((frame) => frame.type === 'host_tool_result' && frame.id === 'host-progress')
    assert.equal(completed.isError, undefined)
    const cancelled = frames.find((frame) => frame.type === 'host_tool_result' && frame.id === 'host-cancel')
    assert.equal(cancelled.isError, true)
    assert.match(cancelled.result.content[0].text, /cancelled/i)
    assert.deepEqual(brokerRequests.map(({ route }) => route), ['/v1/bash'])
    assert.ok(events.some((event) => event.type === 'ready' && event.negotiatedProtocolVersion === 2))
    assert.ok(events.some((event) => event.type === 'agent_end'))
    assert.ok(events.some((event) => event.type === 'web_status' && event.status === 'done'))
    const audits = (await fs.readFile(auditFile, 'utf8')).trim().split('\n').map((line) => JSON.parse(line))
    assert.ok(audits.every((record) => !JSON.stringify(record).includes('printf progress')))
  } finally {
    server.kill('SIGTERM')
    await once(server, 'exit')
    workspaceBroker.closeAllConnections?.()
    workspaceBroker.close()
    roleBackend.close()
    await Promise.all([once(workspaceBroker, 'close'), once(roleBackend, 'close')])
    await fs.rm(temp, { recursive: true, force: true })
  }
})
