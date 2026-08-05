#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createOmpHostTools } from '../admin/fixvox-web/omp-host-tools.mjs'
import { OmpRpcChunkReassembler } from '../admin/fixvox-web/omp-rpc-framing.mjs'
import { buildRemoteAgentEnv, ompRemoteAgentArgs } from '../admin/fixvox-web/omp-remote-policy.mjs'

const repo = path.resolve(import.meta.dirname, '..')
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'omp-remote-agent-smoke-'))
const args = [...ompRemoteAgentArgs({ sessionDir: path.join(temp, 'sessions') }), '--offline']
const env = buildRemoteAgentEnv(process.env, {
  home: temp,
  user: process.env.USER || process.env.USERNAME || 'fixvox-agent-smoke',
  auditPath: path.join(temp, 'audit', 'operations.jsonl'),
  roots: [repo],
  workspaceBrokerSocket: path.join(temp, 'run', 'workspace-broker.sock'),
  constelacionesSocket: path.join(temp, 'run', 'constelaciones-read.sock'),
})
const hostTools = createOmpHostTools({
  cwd: repo,
  roots: [repo],
  auditPath: path.join(temp, 'audit', 'operations.jsonl'),
  workspaceBrokerSocket: path.join(temp, 'run', 'workspace-broker.sock'),
  constelacionesSocket: path.join(temp, 'run', 'constelaciones-read.sock'),
})
const executable = process.platform === 'win32' ? 'cmd.exe' : 'omp'
const executableArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'omp.cmd', ...args] : args
const child = spawn(executable, executableArgs, { cwd: repo, env, stdio: ['pipe', 'pipe', 'pipe'] })
const decoder = new OmpRpcChunkReassembler()
let buffer = ''
let stderr = ''
let ready
const responses = new Map()

child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString()
  while (true) {
    const index = buffer.indexOf('\n')
    if (index === -1) break
    const line = buffer.slice(0, index).replace(/\r$/, '')
    buffer = buffer.slice(index + 1)
    if (!line.trim()) continue
    const event = decoder.push(JSON.parse(line))
    if (!event) continue
    if (event.type === 'ready') {
      ready = event
      decoder.setLimits(event.maxFrameBytes, event.maxReassembledFrameBytes)
    }
    if (event.type === 'response' && event.id) responses.set(event.id, event)
  }
})

async function waitFor(predicate, label) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    const value = predicate()
    if (value) return value
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`Timeout waiting for ${label}. ${stderr.slice(-500)}`)
}

function command(id, payload) {
  child.stdin.write(`${JSON.stringify({ id, ...payload })}\n`)
  return waitFor(() => responses.get(id), id)
}

try {
  await waitFor(() => ready, 'OMP ready')
  if (ready.supportedProtocolVersions?.includes(2)) {
    const negotiated = await command('protocol-1', { type: 'negotiate_protocol', protocolVersion: 2 })
    if (!negotiated.success) throw new Error('Protocol v2 negotiation failed.')
  }
  const registered = await command('tools-1', { type: 'set_host_tools', tools: hostTools.definitions })
  if (!registered.success) throw new Error('Host tool registration failed.')
  const response = await command('state-1', { type: 'get_state' })
  if (!response.success) throw new Error(`RPC state check failed. ${stderr.slice(-500)}`)
  process.stdout.write(`${JSON.stringify({ ok: true, protocolVersion: ready.supportedProtocolVersions?.includes(2) ? 2 : ready.protocolVersion, hostTools: registered.data?.toolNames || [], sessionName: response.data?.sessionName || null, offline: true })}\n`)
} finally {
  child.kill('SIGTERM')
  await fs.rm(temp, { recursive: true, force: true })
}
