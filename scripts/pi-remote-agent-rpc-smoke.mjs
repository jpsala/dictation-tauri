#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildRemoteAgentEnv, remoteAgentArgs } from '../admin/fixvox-web/pi-remote-policy.mjs'

const repo = path.resolve(import.meta.dirname, '..')
const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-remote-agent-smoke-'))
const extensionPath = path.join(repo, 'admin', 'fixvox-web', 'pi-remote-agent-extension.mjs')
const args = [...remoteAgentArgs({ extensionPath, sessionDir: path.join(temp, 'sessions') }), '--offline']
const env = buildRemoteAgentEnv(process.env, {
  home: temp,
  user: process.env.USER || process.env.USERNAME || 'fixvox-agent-smoke',
  agentDir: path.join(temp, '.pi', 'agent'),
  auditPath: path.join(temp, 'audit', 'operations.jsonl'),
  roots: [repo],
})
const executable = process.platform === 'win32' ? 'cmd.exe' : 'pi'
const executableArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'pi.cmd', ...args] : args
const child = spawn(executable, executableArgs, { cwd: repo, env, stdio: ['pipe', 'pipe', 'pipe'] })
let buffer = ''
let stderr = ''
let response

child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString()
  for (const line of buffer.split(/\r?\n/)) {
    try {
      const event = JSON.parse(line)
      if (event.id === 'state-1') response = event
    } catch {}
  }
})

try {
  child.stdin.write(`${JSON.stringify({ id: 'state-1', type: 'get_state' })}\n`)
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline && !response) await new Promise((resolve) => setTimeout(resolve, 100))
  if (!response?.success) throw new Error(`RPC state check failed. ${stderr.slice(-500)}`)
  process.stdout.write(`${JSON.stringify({ ok: true, sessionName: response.data?.sessionName || null, extension: path.basename(extensionPath), offline: true })}\n`)
} finally {
  child.kill('SIGTERM')
  await fs.rm(temp, { recursive: true, force: true })
}
