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
    if (!cwdOk) return { ok: false, cwd: PI_CWD, piBin: PI_BIN, process: this.running ? 'running' : 'stopped', error: 'PI_CHAT_CWD no parece repo valido.' }
    const version = await getPiVersion()
    return { ok: version.ok, cwd: PI_CWD, piBin: PI_BIN, piVersion: version.version, process: this.running ? 'running' : 'stopped', error: version.error }
  }
  async ensureStarted() {
    if (this.running) return
    const child = spawn(PI_BIN, [...PI_ARGS, '--mode', 'rpc', '--approve', '--name', 'fixvox-admin-web-pi'], {
      cwd: PI_CWD,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
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
    const child = spawn(PI_BIN, [...PI_ARGS, '--version'], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
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

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true })
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
      return sendJson(res, 200, { ok: true, response: await pi.send(body.command || body) })
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
    if (url.pathname === '/api/admin/devices') return sendJson(res, 200, await proxyAdmin(`/admin/control-plane/devices?limit=${encodeURIComponent(url.searchParams.get('limit') || '20')}`))
    if (url.pathname === '/api/admin/policies') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/policy'))
    return sendJson(res, 404, { error: { message: 'Not found' } })
  } catch (error) {
    sendJson(res, error.status || 500, { ok: false, error: error.message || 'Server error' })
  }
})

function withGuardrails(message) {
  return `${message}\n\nContexto: estas en Fixvox Admin Web remoto, repo /home/jpsal/dev/dictation-tauri. Guardrails: no push, deploy, systemd/tunnel, policy mutation, secrets ni acciones destructivas sin confirmacion explicita de JP. No imprimir tokens, emails completos, account IDs, device IDs completos, transcripts, selected text ni audio.`
}
function html(res, body) { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(body) }
function loginHtml(error = '') { return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixvox Admin</title>${style()}</head><body><main class="login"><h1>Fixvox Admin</h1><p>Ingresá el token admin web.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}<form method="post"><input name="token" type="password" autofocus autocomplete="current-password"><button>Entrar</button></form></main></body></html>` }
function appHtml() { return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixvox Admin Pi</title>${style()}</head><body><div class="shell"><aside><h1>Fixvox</h1><p class="muted">Admin remoto</p><button onclick="loadHealth()">Health</button><button onclick="loadAccounts()">Accounts</button><button onclick="loadDevices()">Devices</button><button onclick="quick('Listá el estado operativo del repo y sugerí el próximo paso. No hagas cambios.')">Status Pi</button></aside><main><section class="panel"><h2>Pi Chat</h2><div id="status" class="muted">Cargando...</div><div id="messages" class="messages"></div><textarea id="prompt" placeholder="Preguntale a Pi o pedile una tarea..."></textarea><div class="row"><button id="send">Enviar</button><button onclick="quick('Listá accounts, devices y policies usando las herramientas disponibles. No mutes producción.')">Resumen admin</button></div></section><section class="panel"><h2>Admin data</h2><pre id="data">Sin datos todavía.</pre></section></main></div><script>${clientJs()}</script></body></html>` }
function style() { return `<style>body{margin:0;background:#0c0f14;color:#e8edf5;font:14px/1.5 system-ui,Segoe UI,sans-serif}.shell{display:grid;grid-template-columns:240px 1fr;min-height:100vh}aside{border-right:1px solid #202838;padding:24px;background:#111722}h1,h2{margin:0 0 12px}button{background:#4f7cff;color:white;border:0;border-radius:10px;padding:10px 12px;margin:4px;cursor:pointer}button:hover{background:#6b91ff}textarea,input{width:100%;box-sizing:border-box;background:#080b10;color:#e8edf5;border:1px solid #273247;border-radius:12px;padding:12px}textarea{min-height:110px}.panel{margin:20px;padding:18px;border:1px solid #202838;border-radius:16px;background:#101620}.messages{min-height:240px;max-height:50vh;overflow:auto;background:#080b10;border-radius:12px;padding:12px;white-space:pre-wrap}.muted{color:#96a3b8}.error{color:#ff8585}.login{max-width:420px;margin:15vh auto;padding:24px}.row{display:flex;gap:8px;align-items:center}pre{overflow:auto;background:#080b10;border-radius:12px;padding:12px}</style>` }
function clientJs() { return `const $=id=>document.getElementById(id);let current='';function add(role,text){const el=document.createElement('div');el.textContent=(role==='user'?'JP: ':'Pi: ')+text;$('messages').appendChild(el);$('messages').scrollTop=$('messages').scrollHeight;return el}async function loadHealth(){const j=await fetch('/api/pi-chat/health').then(r=>r.json());$('status').textContent=j.ok?'Pi OK '+(j.piVersion||''):'Pi error '+(j.error||'');$('data').textContent=JSON.stringify(j,null,2)}async function loadAccounts(){const j=await fetch('/api/admin/accounts?limit=20').then(r=>r.json());$('data').textContent=JSON.stringify(j,null,2)}async function loadDevices(){const j=await fetch('/api/admin/devices?limit=20').then(r=>r.json());$('data').textContent=JSON.stringify(j,null,2)}function quick(t){$('prompt').value=t;send()}async function send(){const text=$('prompt').value.trim();if(!text)return;$('prompt').value='';add('user',text);const out=add('assistant','');const res=await fetch('/api/pi-chat/prompt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:text})});const reader=res.body.getReader();const dec=new TextDecoder();let buf='';while(true){const {done,value}=await reader.read();if(done)break;buf+=dec.decode(value,{stream:true});let parts=buf.split('\\n\\n');buf=parts.pop();for(const p of parts){const line=p.split('\\n').find(x=>x.startsWith('data: '));if(!line)continue;handle(JSON.parse(line.slice(6)),out)}}}function handle(e,out){if(e.type==='web_status'){$('status').textContent=e.status;return}if(e.type==='web_error'){out.textContent+='\\n⚠️ '+e.error;return}if(e.type==='message_update'){const u=e.assistantMessageEvent||{};if(u.type==='text_delta')out.textContent+=u.delta||'';if(u.type==='text_end'&&u.content)out.textContent=u.content}if(e.type==='tool_execution_start')out.textContent+='\\n[tool] '+(e.toolName||e.name||'tool')+'...';if(e.type==='tool_execution_end')out.textContent+=' done\\n'}$('send').onclick=send;$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))send()});loadHealth();` }
function escapeHtml(text) { return String(text).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])) }

server.listen(PORT, HOST, () => console.log(`Fixvox admin web listening on http://${HOST}:${PORT} cwd=${PI_CWD}`))
