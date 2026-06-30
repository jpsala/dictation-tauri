#!/usr/bin/env node
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const publicDir = path.join(__dirname, 'public')
const PORT = Number(process.env.FIXVOX_ADMIN_PORT || 8787)
const HOST = process.env.FIXVOX_ADMIN_HOST || '127.0.0.1'
const PI_CWD = path.resolve(process.env.PI_CHAT_CWD || repoRoot)
const PI_BIN = process.env.PI_CHAT_BIN || 'pi'
const PI_ARGS = splitArgs(process.env.PI_CHAT_ARGS || '')
const ADMIN_BASE_URL = (process.env.FIXVOX_ADMIN_BASE_URL || 'https://auth-fixvox.jpsala.dev').replace(/\/+$/g, '')
const sessions = new Map()

loadEnvFile(path.join(repoRoot, 'cloud', 'fixvox-proxy', '.dev.vars'))
loadEnvFile(path.join(process.env.HOME || '', '.config', 'dictation-tauri', 'admin.env'))
loadEnvFile(path.join(process.env.HOME || '', '.config', 'dictation-tauri', 'admin-web.env'))
const WEB_TOKEN = process.env.FIXVOX_ADMIN_WEB_TOKEN || process.env.FIXVOX_ADMIN_PASSWORD || ''

function loadEnvFile(file) {
  if (!file || !fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/g)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match || process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

function splitArgs(value) {
  return value.split(' ').map((part) => part.trim()).filter(Boolean)
}

class PiRpcProcess {
  constructor() {
    this.decoder = new StringDecoder('utf8')
    this.eventHandlers = new Set()
    this.pending = new Map()
    this.process = null
    this.requestId = 0
    this.stderr = ''
    this.stdoutBuffer = ''
    this.lastError = undefined
  }
  get running() { return this.process?.exitCode === null && !this.process.killed }
  async health() {
    const cwdOk = fs.existsSync(path.join(PI_CWD, 'package.json'))
    if (!cwdOk) return { ok: false, cwd: PI_CWD, piBin: PI_BIN, process: this.running ? 'running' : 'stopped', error: 'PI_CHAT_CWD no parece repo valido.', instructions: 'Configura PI_CHAT_CWD apuntando al repo dictation-tauri.' }
    const version = await getPiVersion()
    return { ok: version.ok, cwd: PI_CWD, piBin: PI_BIN, piVersion: version.version, process: this.running ? 'running' : 'stopped', error: version.error, instructions: version.ok ? undefined : 'Instala Pi o configura PI_CHAT_BIN.' }
  }
  async ensureStarted() {
    if (this.running) return
    const child = spawn(PI_BIN, [...PI_ARGS, '--mode', 'rpc', '--approve', '--name', 'fixvox-admin-web-pi'], {
      cwd: PI_CWD,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    this.process = child
    this.stderr = ''
    this.stdoutBuffer = ''
    this.lastError = undefined
    child.stdout.on('data', (chunk) => this.handleStdout(chunk))
    child.stderr.on('data', (chunk) => { this.stderr += chunk.toString() })
    child.once('error', (error) => this.handleExit(error))
    child.once('exit', (code, signal) => this.handleExit(new Error(`Pi RPC terminó${code === null ? '' : ` con código ${code}`}${signal ? ` (${signal})` : ''}.${this.stderr ? ` stderr: ${this.stderr}` : ''}`)))
    await new Promise((resolve) => setTimeout(resolve, 200))
    if (!this.running) throw new Error(this.lastError || `No se pudo iniciar Pi RPC. ${this.stderr}`)
  }
  async send(command, timeoutMs = 15_000) {
    await this.ensureStarted()
    const id = `web-${++this.requestId}`
    const payload = { ...command, id }
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Timeout esperando respuesta de Pi para ${command.type || 'unknown'}.`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timeout })
      this.process.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (!error) return
        clearTimeout(timeout)
        this.pending.delete(id)
        reject(error)
      })
    })
  }
  async sendExtensionUiResponse(response) {
    await this.ensureStarted()
    this.process.stdin.write(`${JSON.stringify({ ...response, type: 'extension_ui_response' })}\n`)
  }
  async stop() {
    const child = this.process
    if (!child) return
    child.kill('SIGTERM')
    this.process = null
  }
  async prompt(message, onEvent) {
    await this.ensureStarted()
    return new Promise((resolve, reject) => {
      let settled = false
      const unsubscribe = this.subscribe((event) => {
        onEvent(event)
        if (event.type === 'agent_end') finish()
        const update = event.assistantMessageEvent
        if (event.type === 'message_update' && update?.type === 'error') finish(new Error(update.error || update.reason || 'Pi error'))
      })
      const finish = (error) => {
        if (settled) return
        settled = true
        unsubscribe()
        error ? reject(error) : resolve()
      }
      this.send({ type: 'prompt', message }, 30_000).then(onEvent).catch(finish)
    })
  }
  subscribe(handler) { this.eventHandlers.add(handler); return () => this.eventHandlers.delete(handler) }
  handleStdout(chunk) {
    this.stdoutBuffer += typeof chunk === 'string' ? chunk : this.decoder.write(chunk)
    while (true) {
      const index = this.stdoutBuffer.indexOf('\n')
      if (index === -1) return
      const rawLine = this.stdoutBuffer.slice(0, index).replace(/\r$/, '')
      this.stdoutBuffer = this.stdoutBuffer.slice(index + 1)
      if (!rawLine.trim()) continue
      this.handleLine(rawLine)
    }
  }
  handleLine(rawLine) {
    let event
    try { event = JSON.parse(rawLine) } catch (error) { this.lastError = `No pude parsear JSONL Pi: ${error}`; return }
    if (event.type === 'response' && typeof event.id === 'string') {
      const pending = this.pending.get(event.id)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pending.delete(event.id)
        event.success === false ? pending.reject(new Error(String(event.error || 'Pi RPC error'))) : pending.resolve(event)
      }
      return
    }
    for (const handler of this.eventHandlers) handler(event)
  }
  handleExit(error) {
    this.lastError = error.message
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(error) }
    this.pending.clear()
    this.process = null
  }
}
const pi = new PiRpcProcess()

async function getPiVersion() {
  return new Promise((resolve) => {
    const child = spawn(PI_BIN, [...PI_ARGS, '--version'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = '', stderr = ''
    const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve({ ok: false, error: 'Timeout ejecutando pi --version' }) }, 5000)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.once('error', (error) => { clearTimeout(timeout); resolve({ ok: false, error: error.message }) })
    child.once('exit', (code) => { clearTimeout(timeout); resolve(code === 0 ? { ok: true, version: stdout.trim() } : { ok: false, error: stderr.trim() || stdout.trim() }) })
  })
}

function isAuthed(req) {
  if (!WEB_TOKEN) return false
  const cookie = req.headers.cookie || ''
  const match = cookie.match(/(?:^|;\s*)fixvox_admin_session=([^;]+)/)
  const token = match?.[1]
  return token && sessions.get(token) && sessions.get(token) > Date.now()
}
function setSession(res) {
  const token = crypto.randomBytes(24).toString('base64url')
  sessions.set(token, Date.now() + 1000 * 60 * 60 * 24)
  res.setHeader('Set-Cookie', `fixvox_admin_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`)
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(data))
}
function readBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => resolve(body))
  })
}
async function proxyAdmin(pathname, method = 'GET', body) {
  const headers = { Authorization: `Bearer ${process.env.ADMIN_API_KEY || ''}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${ADMIN_BASE_URL}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || 'Fixvox admin request failed'), { status: response.status, payload })
  return payload
}

function withGuardrails(message) {
  return `${message}\n\nContexto: estas en Fixvox Admin Web remoto, repo /home/jpsal/dev/dictation-tauri. Guardrails: no push, deploy, systemd/tunnel, policy mutation, secrets ni acciones destructivas sin confirmacion explicita de JP. No imprimir tokens, emails completos, account IDs, device IDs completos, transcripts, selected text ni audio.`
}

function html(res, body) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}
function loginHtml(error = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixvox Admin</title><link rel="stylesheet" href="/assets/styles.css"></head><body><main class="login"><div class="login-card"><p class="eyebrow">Fixvox Admin</p><h1>Control room</h1><p>Ingresá el token admin web para continuar.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}<form method="post"><input name="token" type="password" autofocus autocomplete="current-password" placeholder="Token"><button>Entrar</button></form></div></main></body></html>`
}
function appHtml() {
  return fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
}
function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))
}
function serveStatic(req, res, pathname) {
  const relative = pathname.replace(/^\/assets\//, '')
  const filePath = path.normalize(path.join(publicDir, relative))
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false
  const ext = path.extname(filePath)
  const types = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' }
  res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream', 'cache-control': 'no-store' })
  fs.createReadStream(filePath).pipe(res)
  return true
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true })
    if (url.pathname.startsWith('/assets/')) {
      if (serveStatic(req, res, url.pathname)) return
      return sendJson(res, 404, { error: { message: 'Asset not found' } })
    }
    if (url.pathname === '/login' && req.method === 'GET') return html(res, loginHtml())
    if (url.pathname === '/login' && req.method === 'POST') {
      const body = new URLSearchParams(await readBody(req))
      if (WEB_TOKEN && body.get('token') === WEB_TOKEN) {
        setSession(res)
        res.writeHead(302, { location: '/admin/pi' })
        return res.end()
      }
      return html(res, loginHtml('Token invalido.'))
    }
    if (!isAuthed(req)) {
      res.writeHead(302, { location: '/login' })
      return res.end()
    }
    if (url.pathname === '/' || url.pathname === '/admin' || url.pathname === '/admin/pi') return html(res, appHtml())
    if (url.pathname === '/api/pi-chat/health') return sendJson(res, 200, await pi.health())
    if (url.pathname === '/api/pi-chat/command' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}')
      const command = body.command || body
      if (command?.type === 'extension_ui_response') {
        await pi.sendExtensionUiResponse(command)
        return sendJson(res, 200, { ok: true })
      }
      if (command?.type === 'stop') {
        await pi.stop()
        return sendJson(res, 200, { ok: true })
      }
      return sendJson(res, 200, { ok: true, response: await pi.send(command) })
    }
    if (url.pathname === '/api/pi-chat/prompt' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}')
      const message = String(body.message || '').trim()
      if (!message) return sendJson(res, 400, { ok: false, error: 'Mensaje requerido.' })
      res.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive' })
      const send = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`)
      send({ type: 'web_status', status: 'starting' })
      try { await pi.prompt(withGuardrails(message), send); send({ type: 'web_status', status: 'done' }) }
      catch (error) { send({ type: 'web_error', error: error instanceof Error ? error.message : 'Pi error' }) }
      return res.end()
    }
    if (url.pathname === '/api/admin/accounts') return sendJson(res, 200, await proxyAdmin(`/admin/control-plane/accounts?limit=${encodeURIComponent(url.searchParams.get('limit') || '20')}`))
    if (url.pathname === '/api/admin/accounts/policy' && req.method === 'POST') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/accounts/policy', 'POST', JSON.parse(await readBody(req) || '{}')))
    if (url.pathname === '/api/admin/devices') return sendJson(res, 200, await proxyAdmin(`/admin/control-plane/devices?limit=${encodeURIComponent(url.searchParams.get('limit') || '20')}`))
    if (url.pathname === '/api/admin/devices/policy' && req.method === 'POST') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/devices/policy', 'POST', JSON.parse(await readBody(req) || '{}')))
    if (url.pathname === '/api/admin/policies') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/policy'))
    if (url.pathname === '/api/admin/usage') return sendJson(res, 200, await proxyAdmin('/admin/usage/summary'))
    return sendJson(res, 404, { error: { message: 'Not found' } })
  } catch (error) {
    sendJson(res, error.status || 500, { ok: false, error: error.message || 'Server error' })
  }
})

server.listen(PORT, HOST, () => console.log(`Fixvox admin web listening on http://${HOST}:${PORT} cwd=${PI_CWD}`))
