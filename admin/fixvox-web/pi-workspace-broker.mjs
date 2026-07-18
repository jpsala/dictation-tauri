#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { classifyRemoteToolCall, remoteAgentRoots, resolveRemoteToolInput } from './pi-remote-policy.mjs'

const MAX_BODY = 2 * 1024 * 1024
const MAX_OUTPUT = 64 * 1024

async function body(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY) throw new Error('Request exceeds broker limit.')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw new Error('Invalid broker JSON payload.')
  }
}

function json(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function safePath(tool, input, roots) {
  return resolveRemoteToolInput(tool, input, roots[0]).then((resolved) => {
    const classification = classifyRemoteToolCall(tool, resolved, { cwd: roots[0], roots })
    if (classification.decision === 'deny') throw new Error(classification.reason)
    return resolved.path
  })
}

function run(command, cwd, timeoutSeconds = 120) {
  return new Promise((resolve, reject) => {
    const child = spawn('/bin/bash', ['-lc', command], {
      cwd,
      env: { PATH: '/usr/local/bin:/usr/bin:/bin', HOME: '/nonexistent', LANG: 'C.UTF-8' },
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const chunks = []
    let size = 0
    const collect = (chunk) => { if (size < MAX_OUTPUT) chunks.push(chunk.subarray(0, MAX_OUTPUT - size)); size += chunk.length }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const timer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') } }, Math.max(1, Math.min(600, Number(timeoutSeconds) || 120)) * 1000)
    child.once('error', reject)
    child.once('close', (code) => { clearTimeout(timer); resolve({ exitCode: code, output: Buffer.concat(chunks).toString('base64'), truncated: size > MAX_OUTPUT }) })
  })
}

export function createWorkspaceBroker({ roots }) {
  const approvedRoots = roots.map((root) => path.resolve(root))
  return http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' })
      const input = await body(req)
      if (req.url === '/v1/read') {
        const file = await safePath('read', input, approvedRoots)
        return json(res, 200, { ok: true, content: (await fs.readFile(file)).toString('base64') })
      }
      if (req.url === '/v1/access') {
        const file = await safePath('read', input, approvedRoots)
        await fs.access(file)
        return json(res, 200, { ok: true })
      }
      if (req.url === '/v1/write') {
        const file = await safePath('write', input, approvedRoots)
        await fs.writeFile(file, String(input.content ?? ''), 'utf8')
        return json(res, 200, { ok: true })
      }
      if (req.url === '/v1/mkdir') {
        const dir = await safePath('write', input, approvedRoots)
        await fs.mkdir(dir, { recursive: true })
        return json(res, 200, { ok: true })
      }
      if (req.url === '/v1/bash') {
        const cwd = await safePath('read', { path: input.cwd }, approvedRoots)
        const classification = classifyRemoteToolCall('bash', input, { cwd, roots: approvedRoots })
        if (classification.decision === 'deny') throw new Error(classification.reason)
        return json(res, 200, { ok: true, ...(await run(String(input.command || ''), cwd, input.timeout)) })
      }
      return json(res, 404, { ok: false, error: 'Unknown broker route.' })
    } catch (error) {
      return json(res, 403, { ok: false, error: error instanceof Error ? error.message : 'Broker blocked request.' })
    }
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const socketPath = process.env.PI_CHAT_WORKSPACE_BROKER_SOCKET
  if (!socketPath) throw new Error('PI_CHAT_WORKSPACE_BROKER_SOCKET is required.')
  const server = createWorkspaceBroker({ roots: remoteAgentRoots(process.env.PI_CHAT_WORKSPACE_ROOTS) })
  await fs.rm(socketPath, { force: true })
  server.listen(socketPath, async () => {
    await fs.chmod(socketPath, 0o660)
    process.stdout.write('workspace broker ready\n')
  })
}
