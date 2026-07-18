#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { classifyRemoteToolCall, remoteAgentRoots, resolveRemoteToolInput } from './pi-remote-policy.mjs'

const MAX_BODY = 2 * 1024 * 1024
const MAX_OUTPUT = 64 * 1024
const MAX_SEARCH_FILE_BYTES = 1024 * 1024

function safeLimit(value, fallback, maximum) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.min(maximum, Math.floor(number))) : fallback
}

function validateGlob(pattern) {
  const value = String(pattern || '**/*')
  if (value.length > 300 || path.isAbsolute(value) || value.split(/[\\/]/).includes('..')) throw new Error('Unsafe glob pattern.')
  return value
}

async function globPaths(pattern, cwd, roots, limit, ignore = []) {
  const paths = []
  for await (const entry of fs.glob(validateGlob(pattern), { cwd, exclude: ignore, withFileTypes: false })) {
    try {
      const candidate = await safePath('read', { path: path.resolve(cwd, entry) }, roots)
      paths.push(path.relative(cwd, candidate).replaceAll('\\', '/'))
      if (paths.length >= limit) break
    } catch {}
  }
  return paths
}

async function grepFiles(input, roots) {
  const target = await safePath('grep', { path: input.path || roots[0] }, roots)
  const source = String(input.pattern || '')
  if (!source || source.length > 500) throw new Error('Invalid grep pattern.')
  const limit = safeLimit(input.limit, 50, 200)
  const targetIsDirectory = (await fs.stat(target)).isDirectory()
  const args = ['--json', '--line-number', '--max-filesize', `${MAX_SEARCH_FILE_BYTES}`, '--glob', '!.git/**', '--glob', '!node_modules/**', '--glob', '!target/**', '--glob', '!.env', '--glob', '!.env.*', '--glob', '!**/sessions/**', '--glob', '!**/stores/**', '--glob', '!**/*.sqlite', '--glob', '!**/*.db']
  if (input.literal) args.push('--fixed-strings')
  if (input.ignoreCase) args.push('--ignore-case')
  if (input.glob) args.push('--glob', validateGlob(input.glob))
  args.push('--', source, target)
  return new Promise((resolve, reject) => {
    const rgBin = process.platform === 'win32' ? 'rg' : '/usr/bin/rg'
    const child = spawn(rgBin, args, { env: { PATH: process.platform === 'win32' ? process.env.PATH : '/usr/local/bin:/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'pipe'] })
    let buffer = ''
    let outputBytes = 0
    const rawMatches = []
    const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
    child.stdout.on('data', (chunk) => {
      outputBytes += chunk.length
      if (outputBytes > 1024 * 1024) return child.kill('SIGKILL')
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        try {
          const event = JSON.parse(line)
          if (event.type !== 'match') continue
          rawMatches.push({ path: String(event.data.path?.text || ''), line: Number(event.data.line_number), text: String(event.data.lines?.text || '').trimEnd().slice(0, 500) })
          if (rawMatches.length >= limit) child.kill('SIGTERM')
        } catch {}
      }
    })
    child.once('error', reject)
    child.once('close', async (code, signal) => {
      clearTimeout(timer)
      if (signal === 'SIGKILL' && outputBytes <= 1024 * 1024) return reject(new Error('Grep timed out.'))
      if (code && code !== 1 && rawMatches.length < limit) return reject(new Error('Grep failed.'))
      const matches = []
      for (const match of rawMatches) {
        try {
          const base = targetIsDirectory ? target : path.dirname(target)
          const candidate = path.isAbsolute(match.path) ? match.path : path.resolve(base, match.path)
          const resolved = await resolveRemoteToolInput('read', { path: candidate }, roots[0])
          const classification = classifyRemoteToolCall('read', resolved, { cwd: roots[0], roots })
          if (classification.decision !== 'allow') continue
          const displayPath = targetIsDirectory ? path.relative(target, resolved.path) : path.basename(resolved.path)
          if (!displayPath || path.isAbsolute(displayPath) || displayPath === '..' || displayPath.startsWith(`..${path.sep}`)) continue
          matches.push({ ...match, path: displayPath.replaceAll('\\', '/') })
          if (matches.length >= limit) break
        } catch {}
      }
      resolve(matches)
    })
  })
}

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
      if (req.url === '/v1/exists') {
        try { await safePath('read', input, approvedRoots); return json(res, 200, { ok: true, exists: true }) }
        catch { return json(res, 200, { ok: true, exists: false }) }
      }
      if (req.url === '/v1/stat') {
        const target = await safePath('read', input, approvedRoots)
        return json(res, 200, { ok: true, directory: (await fs.stat(target)).isDirectory() })
      }
      if (req.url === '/v1/readdir') {
        const target = await safePath('ls', input, approvedRoots)
        const entries = []
        for (const entry of await fs.readdir(target)) {
          try { await safePath('read', { path: path.join(target, entry) }, approvedRoots); entries.push(entry) } catch {}
          if (entries.length >= safeLimit(input.limit, 500, 500)) break
        }
        return json(res, 200, { ok: true, entries })
      }
      if (req.url === '/v1/glob') {
        const cwd = await safePath('find', { path: input.cwd }, approvedRoots)
        const paths = await globPaths(input.pattern, cwd, approvedRoots, safeLimit(input.limit, 200, 500), Array.isArray(input.ignore) ? input.ignore : [])
        return json(res, 200, { ok: true, paths })
      }
      if (req.url === '/v1/grep') {
        return json(res, 200, { ok: true, matches: await grepFiles(input, approvedRoots) })
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
