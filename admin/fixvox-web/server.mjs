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
function appHtml() { return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixvox Admin Pi</title>${style()}</head><body><div class="shell"><aside><h1>Fixvox</h1><p class="muted">Admin remoto</p><button onclick="loadHealth()">Health</button><button onclick="loadAccounts()">Accounts</button><button onclick="loadDevices()">Devices</button><button onclick="loadPolicies()">Policies</button><hr><button onclick="quick('Listá el estado operativo del repo y sugerí el próximo paso. No hagas cambios.')">Status Pi</button><button onclick="quick('Listá accounts, devices y policies usando las herramientas disponibles. No mutes producción.')">Resumen admin</button><button onclick="newSession()">Nueva sesión</button><button onclick="refreshState()">Estado sesión</button><button class="danger" onclick="abortPi()">Abortar</button></aside><main><section class="panel chat"><div class="panel-head"><div><h2>Pi Chat</h2><div id="status" class="muted">Cargando...</div></div><div id="session" class="pill">session: ?</div></div><div id="requests" class="requests"></div><div id="messages" class="messages"></div><textarea id="prompt" placeholder="Preguntale a Pi o pedile una tarea... Ctrl+Enter envía"></textarea><div class="row"><button id="send">Enviar</button><button onclick="quick('Hacé un diagnóstico rápido del admin Fixvox, sin cambiar nada.')">Diagnóstico</button></div></section><section class="panel side"><h2>Tool logs</h2><div id="tools" class="tools muted">Sin tools todavía.</div><h2>Admin data</h2><pre id="data">Sin datos todavía.</pre></section></main></div><script>${clientJs()}</script></body></html>` }
function style() { return `<style>body{margin:0;background:#0c0f14;color:#e8edf5;font:14px/1.5 system-ui,Segoe UI,sans-serif}.shell{display:grid;grid-template-columns:250px 1fr;min-height:100vh}aside{border-right:1px solid #202838;padding:24px;background:#111722;position:sticky;top:0;height:100vh;box-sizing:border-box}main{display:grid;grid-template-columns:minmax(480px,1fr) 440px;gap:0}h1,h2{margin:0 0 12px}.panel-head{display:flex;justify-content:space-between;gap:12px;align-items:start}.pill{border:1px solid #2d3a52;background:#0b1019;border-radius:999px;padding:6px 10px;color:#aebbd1}button{background:#4f7cff;color:white;border:0;border-radius:10px;padding:10px 12px;margin:4px;cursor:pointer}button:hover{background:#6b91ff}button.secondary{background:#263249}button.danger{background:#9f394a}hr{border:0;border-top:1px solid #243047;margin:18px 0}textarea,input{width:100%;box-sizing:border-box;background:#080b10;color:#e8edf5;border:1px solid #273247;border-radius:12px;padding:12px}textarea{min-height:120px}.panel{margin:20px;padding:18px;border:1px solid #202838;border-radius:16px;background:#101620}.messages{min-height:340px;max-height:56vh;overflow:auto;background:#080b10;border-radius:12px;padding:12px;white-space:pre-wrap}.msg{margin:0 0 14px;padding:10px;border-radius:12px}.msg.user{background:#122343}.msg.assistant{background:#111827}.msg.system{background:#1d2432;color:#c6d2e6}.role{font-weight:800;color:#9fbcff;margin-bottom:4px}.muted{color:#96a3b8}.error{color:#ff8585}.login{max-width:420px;margin:15vh auto;padding:24px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.side{max-height:calc(100vh - 40px);overflow:auto}pre{overflow:auto;background:#080b10;border-radius:12px;padding:12px}.tools{display:flex;flex-direction:column;gap:8px;margin-bottom:18px}.tool,.request{background:#080b10;border:1px solid #263149;border-radius:12px;padding:10px}.tool.running{border-color:#557dff}.tool.error{border-color:#ff6b7d}.tool.done{border-color:#315f44}.tool-title{font-weight:800}.tool-body{white-space:pre-wrap;max-height:180px;overflow:auto;color:#c2ccdb}.requests{display:flex;flex-direction:column;gap:10px;margin-bottom:12px}.request{border-color:#f4b95b}.request textarea{min-height:70px;margin-top:8px}@media(max-width:980px){.shell{grid-template-columns:1fr}aside{position:relative;height:auto}main{grid-template-columns:1fr}}</style>` }
function clientJs() { return `
const $=id=>document.getElementById(id);
let activeAssistant=null;
let activeController=null;
let toolLogs=new Map();
let requestMap=new Map();
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function add(role,text){const el=document.createElement('div');el.className='msg '+role;el.innerHTML='<div class="role">'+(role==='user'?'JP':role==='assistant'?'Pi':'Sistema')+'</div><div class="content"></div>';el.querySelector('.content').textContent=text||'';$('messages').appendChild(el);$('messages').scrollTop=$('messages').scrollHeight;return el.querySelector('.content');}
function append(el,text){if(!el||!text)return;el.textContent+=text;$('messages').scrollTop=$('messages').scrollHeight;}
async function api(url,opts){const r=await fetch(url,opts);const j=await r.json().catch(()=>null);if(!r.ok)throw new Error(j?.error||j?.error?.message||'Request failed');return j;}
async function loadHealth(){const j=await api('/api/pi-chat/health');$('status').textContent=j.ok?'Pi OK '+(j.piVersion||''):'Pi error '+(j.error||'');$('data').textContent=JSON.stringify(j,null,2);}
async function loadAccounts(){const j=await api('/api/admin/accounts?limit=20');$('data').textContent=JSON.stringify(j,null,2);}
async function loadDevices(){const j=await api('/api/admin/devices?limit=20');$('data').textContent=JSON.stringify(j,null,2);}
async function loadPolicies(){const j=await api('/api/admin/policies');$('data').textContent=JSON.stringify(j,null,2);}
async function sendCommand(command){return api('/api/pi-chat/command',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({command})});}
async function refreshState(){try{const j=await sendCommand({type:'get_state'});$('session').textContent='session: '+(j.response?.data?.sessionName||j.response?.sessionName||'activa');$('data').textContent=JSON.stringify(j.response,null,2);}catch(e){$('session').textContent='session: ?';}}
async function newSession(){await sendCommand({type:'new_session'});$('messages').innerHTML='';toolLogs.clear();renderTools();add('system','Nueva sesión Pi iniciada.');refreshState();}
async function abortPi(){if(activeController)activeController.abort();try{await sendCommand({type:'abort'});}catch{}$('status').textContent='Abortado';}
function quick(t){$('prompt').value=t;send();}
async function send(){const text=$('prompt').value.trim();if(!text)return;$('prompt').value='';add('user',text);activeAssistant=add('assistant','');activeController=new AbortController();$('status').textContent='Pi está trabajando...';try{const res=await fetch('/api/pi-chat/prompt',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:text}),signal:activeController.signal});if(!res.ok||!res.body)throw new Error('Pi no aceptó el prompt');await readSse(res.body,(event)=>handle(event,activeAssistant));}catch(e){if(e.name!=='AbortError')append(activeAssistant,'\n⚠️ '+e.message);}finally{activeController=null;activeAssistant=null;$('status').textContent='Listo';refreshState().catch(()=>{});}}
async function readSse(body,onEvent){const reader=body.getReader();const dec=new TextDecoder();let buf='';while(true){const {done,value}=await reader.read();buf+=dec.decode(value||new Uint8Array(),{stream:!done});let parts=buf.split('\n\n');buf=parts.pop()||'';for(const p of parts){const line=p.split('\n').find(x=>x.startsWith('data: '));if(line)onEvent(JSON.parse(line.slice(6)));}if(done)break;}if(buf.trim()){const line=buf.split('\n').find(x=>x.startsWith('data: '));if(line)onEvent(JSON.parse(line.slice(6)));}}
function handle(e,out){if(e.type==='web_status'){$('status').textContent=e.status;return;}if(e.type==='web_error'){append(out,'\n⚠️ '+e.error);return;}if(e.type==='extension_ui_request'){handleUiRequest(e,out);return;}if(e.type==='tool_execution_start'){const id=String(e.toolCallId||crypto.randomUUID());toolLogs.set(id,{status:'running',title:e.toolName||e.name||'tool',subtitle:e.extensionPath||'',body:''});renderTools();return;}if(e.type==='tool_execution_update'){const id=String(e.toolCallId||'');const t=toolLogs.get(id)||{title:'tool',status:'running'};t.body=extractText(e.partialResult);t.status='running';toolLogs.set(id,t);renderTools();return;}if(e.type==='tool_execution_end'){const id=String(e.toolCallId||'');const t=toolLogs.get(id)||{title:'tool'};t.body=extractText(e.result);t.status=e.isError?'error':'done';toolLogs.set(id,t);renderTools();return;}if(e.type==='message_update'){const u=e.assistantMessageEvent||{};if(u.type==='text_delta')append(out,u.delta||'');if(u.type==='text_end'&&u.content)out.textContent=u.content;if(u.type==='thinking_delta')$('status').textContent='Pi está razonando...';if(u.type==='error')append(out,'\n⚠️ '+(u.error||u.reason||'Error de Pi'));return;}if(e.type==='message_end'||e.type==='turn_end'||e.type==='agent_end')return;if(e.type==='queue_update'){$('status').textContent='Cola Pi actualizada';}}
function extractText(v){if(v==null)return '';if(typeof v==='string')return v;try{return JSON.stringify(v,null,2).slice(0,6000);}catch{return String(v);}}
function renderTools(){const box=$('tools');if(toolLogs.size===0){box.className='tools muted';box.textContent='Sin tools todavía.';return;}box.className='tools';box.innerHTML='';for(const [id,t] of toolLogs){const el=document.createElement('div');el.className='tool '+(t.status||'running');el.innerHTML='<div class="tool-title">'+escapeHtml(t.title||'tool')+' · '+escapeHtml(t.status||'running')+'</div><div class="muted">'+escapeHtml(t.subtitle||id)+'</div><div class="tool-body">'+escapeHtml(t.body||'')+'</div>';box.appendChild(el);}}
function handleUiRequest(e,out){const method=String(e.method||'');if(method==='setStatus'){$('status').textContent=String(e.statusText||'Pi');return;}if(method==='setTitle'){$('status').textContent=String(e.title||'Pi');return;}if(method==='notify'||method==='setWidget')return;if(method==='set_editor_text'){ $('prompt').value=String(e.text||''); return;}append(out,'\n\nPi necesita una respuesta en la UI.');const id=String(e.id||crypto.randomUUID());requestMap.set(id,e);renderRequests();}
function renderRequests(){const box=$('requests');box.innerHTML='';for(const [id,e] of requestMap){const title=e.title||e.question||e.method||'Solicitud Pi';const el=document.createElement('div');el.className='request';const options=Array.isArray(e.options)?e.options:[];el.innerHTML='<b>'+escapeHtml(title)+'</b><div class="muted">'+escapeHtml(e.context||e.description||'')+'</div><textarea placeholder="Respuesta para Pi"></textarea><div class="row"></div>';const row=el.querySelector('.row');for(const opt of options.slice(0,4)){const label=typeof opt==='string'?opt:(opt.label||opt.title||'Opción');const btn=document.createElement('button');btn.className='secondary';btn.textContent=label;btn.onclick=()=>respondUi(id,{selected:label,value:label});row.appendChild(btn);}const send=document.createElement('button');send.textContent='Responder';send.onclick=()=>respondUi(id,{text:el.querySelector('textarea').value});row.appendChild(send);box.appendChild(el);}}
async function respondUi(id,response){const event=requestMap.get(id);if(!event)return;await sendCommand({type:'extension_ui_response',id,...response});requestMap.delete(id);renderRequests();}
$('send').onclick=send;$('prompt').addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey))send();});loadHealth();refreshState().catch(()=>{});
` }
function escapeHtml(text) { return String(text).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])) }

server.listen(PORT, HOST, () => console.log(`Fixvox admin web listening on http://${HOST}:${PORT} cwd=${PI_CWD}`))
