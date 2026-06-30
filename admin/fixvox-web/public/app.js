const $ = (selector) => document.querySelector(selector)
const app = $('#app')
const state = {
  health: null,
  status: 'Listo',
  messages: [],
  tools: new Map(),
  uiRequests: new Map(),
  dataTab: 'accounts',
  adminData: null,
  env: null,
  session: null,
  running: false,
  controller: null,
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}
function pretty(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}
function toolText(value) { return pretty(value).slice(0, 8000) }
function addMessage(role, content) {
  const message = { id: crypto.randomUUID(), role, content }
  state.messages.push(message)
  render()
  return message.id
}
function appendMessage(id, delta) {
  const message = state.messages.find((item) => item.id === id)
  if (!message || !delta) return
  message.content += delta
  renderMessages()
}
function setMessage(id, content) {
  const message = state.messages.find((item) => item.id === id)
  if (!message) return
  message.content = content
  renderMessages()
}
async function jsonFetch(url, options = {}) {
  const response = await fetch(url, options)
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(payload?.error || payload?.error?.message || 'Request failed')
  return payload
}
async function sendCommand(command) {
  return jsonFetch('/api/pi-chat/command', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command }) })
}
async function refreshEnv() {
  try { state.env = await jsonFetch('/api/admin/env') }
  catch (error) { state.env = { ok: false, environment: 'unknown', error: error.message } }
  render()
}
async function refreshHealth() {
  try {
    state.health = await jsonFetch('/api/pi-chat/health')
    state.status = state.health.ok ? `Pi ${state.health.piVersion || ''}` : 'Pi no listo'
  } catch (error) {
    state.health = { ok: false, error: error.message }
    state.status = 'Pi error'
  }
  render()
}
async function refreshSession() {
  try {
    const payload = await sendCommand({ type: 'get_state' })
    state.session = payload.response?.data || payload.response || null
  } catch { state.session = null }
  renderActivity()
}
async function newSession() {
  await sendCommand({ type: 'new_session' })
  state.messages = [{ id: crypto.randomUUID(), role: 'system', content: 'Nueva sesión Pi iniciada.' }]
  state.tools.clear()
  state.uiRequests.clear()
  await refreshSession()
  render()
}
async function abortPi() {
  if (state.controller) state.controller.abort()
  try { await sendCommand({ type: 'abort' }) } catch {}
  state.running = false
  state.status = 'Abortado'
  render()
}
async function submitPrompt(textOverride) {
  const input = $('#prompt')
  const text = String(textOverride ?? input?.value ?? '').trim()
  if (!text || state.running || !state.health?.ok) return
  if (input) input.value = ''
  addMessage('user', text)
  const assistantId = addMessage('assistant', '')
  state.running = true
  state.status = 'Pi está trabajando...'
  state.controller = new AbortController()
  render()
  try {
    const response = await fetch('/api/pi-chat/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: text }), signal: state.controller.signal })
    if (!response.ok || !response.body) throw new Error('Pi no aceptó el prompt')
    await readSse(response.body, (event) => handlePiEvent(event, assistantId))
  } catch (error) {
    if (error.name !== 'AbortError') appendMessage(assistantId, `\n\n⚠️ ${error.message}`)
  } finally {
    state.running = false
    state.controller = null
    state.status = 'Listo'
    render()
    refreshHealth().catch(() => {})
    refreshSession().catch(() => {})
  }
}
async function readSse(body, onEvent) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value || new Uint8Array(), { stream: !done })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() || ''
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((item) => item.startsWith('data: '))
      if (line) onEvent(JSON.parse(line.slice(6)))
    }
    if (done) break
  }
}
function handlePiEvent(event, assistantId) {
  if (event.type === 'web_status') { state.status = String(event.status || 'Pi'); renderHeader(); return }
  if (event.type === 'web_error') { appendMessage(assistantId, `\n\n⚠️ ${event.error || 'Error de Pi'}`); return }
  if (event.type === 'extension_ui_request') { handleUiRequest(event, assistantId); return }
  if (event.type === 'tool_execution_start') {
    const id = String(event.toolCallId || crypto.randomUUID())
    state.tools.set(id, { id, status: 'running', title: event.toolName || event.name || 'tool', subtitle: event.extensionPath || '', body: '' })
    renderActivity(); return
  }
  if (event.type === 'tool_execution_update') {
    const id = String(event.toolCallId || '')
    const tool = state.tools.get(id) || { id, title: 'tool', status: 'running' }
    tool.status = 'running'; tool.body = toolText(event.partialResult)
    state.tools.set(id, tool); renderActivity(); return
  }
  if (event.type === 'tool_execution_end') {
    const id = String(event.toolCallId || '')
    const tool = state.tools.get(id) || { id, title: 'tool' }
    tool.status = event.isError ? 'error' : 'done'; tool.body = toolText(event.result)
    state.tools.set(id, tool); renderActivity(); return
  }
  if (event.type === 'compaction_start') { state.status = 'Pi compactando contexto...'; renderHeader(); return }
  if (event.type === 'queue_update') { state.status = 'Cola Pi actualizada'; renderHeader(); return }
  if (event.type === 'message_update') {
    const update = event.assistantMessageEvent || {}
    if (update.type === 'text_delta') appendMessage(assistantId, update.delta || '')
    if (update.type === 'text_end' && update.content) setMessage(assistantId, update.content)
    if (update.type === 'thinking_delta') { state.status = 'Pi está razonando...'; renderHeader() }
    if (update.type === 'error') appendMessage(assistantId, `\n\n⚠️ ${update.error || update.reason || 'Error de Pi'}`)
  }
}
function handleUiRequest(event, assistantId) {
  const method = String(event.method || '')
  if (method === 'setStatus') { state.status = String(event.statusText || 'Pi'); renderHeader(); return }
  if (method === 'setTitle') { state.status = String(event.title || 'Pi'); renderHeader(); return }
  if (method === 'set_editor_text') { const input = $('#prompt'); if (input) input.value = String(event.text || ''); return }
  if (method === 'notify' || method === 'setWidget') return
  const id = String(event.id || crypto.randomUUID())
  state.uiRequests.set(id, { ...event, id })
  appendMessage(assistantId, '\n\nPi necesita una respuesta en la UI.')
  renderUiRequests()
}
async function respondUiRequest(id, response) {
  await sendCommand({ type: 'extension_ui_response', id, ...response })
  state.uiRequests.delete(id)
  renderUiRequests()
}
async function loadAdmin(tab = state.dataTab) {
  state.dataTab = tab
  const endpoints = { accounts: '/api/admin/accounts?limit=50', devices: '/api/admin/devices?limit=50', policies: '/api/admin/policies', usage: '/api/admin/usage' }
  try { state.adminData = await jsonFetch(endpoints[tab]) } catch (error) { state.adminData = { ok: false, error: error.message } }
  renderAdminData()
}
async function assignAccountPolicy(accountHandle, currentPolicy) {
  const policyId = prompt(`Policy para ${accountHandle}`, currentPolicy || 'pro')
  if (!policyId) return
  if (!confirm(`Asignar policy ${policyId} a account ${accountHandle}?`)) return
  if (!confirmProductionMutation(`assign account ${accountHandle} -> ${policyId}`)) return
  const policyLabel = prompt('Label opcional', policyId === 'pro' ? 'Pro' : policyId) || undefined
  state.adminData = await jsonFetch('/api/admin/accounts/policy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountHandle, policyId, policyLabel }) })
  renderAdminData()
}
async function assignDevicePolicy(deviceId, currentPolicy) {
  const policyId = prompt(`Policy para device ${deviceId}`, currentPolicy || 'pro')
  if (!policyId) return
  if (!confirm(`Asignar policy ${policyId} a device ${deviceId}?`)) return
  if (!confirmProductionMutation(`assign device ${deviceId} -> ${policyId}`)) return
  const policyLabel = prompt('Label opcional', policyId === 'pro' ? 'Pro' : policyId) || undefined
  state.adminData = await jsonFetch('/api/admin/devices/policy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId, policyId, policyLabel }) })
  renderAdminData()
}
function confirmProductionMutation(description) {
  if (!state.env?.production) return true
  return prompt(`PRODUCTION mutation: ${description}\nEscribí PROD para confirmar.`) === 'PROD'
}
function render() {
  const envName = state.env?.environment || 'unknown'
  const envClass = state.env?.production ? 'prod' : 'local'
  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">F</div><div><h1>Fixvox</h1><p>Admin remoto</p></div></div>
        <div class="nav-group"><div class="nav-label">Pi Chat</div>
          <button class="quick-btn" data-quick="Listá el estado operativo del repo y sugerí el próximo paso. No hagas cambios.">Status Pi</button>
          <button class="quick-btn" data-quick="Listá accounts, devices y policies usando las herramientas disponibles. No mutes producción.">Resumen admin</button>
          <button class="quick-btn" data-quick="Hacé un diagnóstico rápido del admin Fixvox, sin cambiar nada.">Diagnóstico</button>
        </div>
        <div class="nav-group"><div class="nav-label">Admin</div>
          ${['accounts','devices','policies','usage'].map((tab) => `<button class="nav-btn ${state.dataTab === tab ? 'active' : ''}" data-tab="${tab}">${tab}</button>`).join('')}
        </div>
        <div class="nav-group"><div class="nav-label">Sesión</div>
          <button class="nav-btn" id="new-session">Nueva sesión</button>
          <button class="nav-btn" id="refresh-session">Estado sesión</button>
          <button class="nav-btn danger" id="abort-pi">Abortar</button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar" id="topbar"></header>
        <div class="env-banner ${envClass}"><strong>${envName.toUpperCase()}</strong> · ${esc(state.env?.adminBaseUrl || 'sin base URL')} · ${state.env?.production ? 'Mutaciones requieren escribir PROD.' : 'Entorno seguro para iterar antes de promover a producción.'}</div>
        <div class="content">
          <section class="panel chat-panel">
            <div class="panel-header"><div><div class="panel-title">Conversación</div><div class="muted">Enter agrega línea · Ctrl/⌘+Enter envía</div></div></div>
            <div class="request-list" id="requests"></div>
            <div class="messages" id="messages"></div>
            <form class="composer" id="composer"><textarea id="prompt" placeholder="Escribí una instrucción para Pi..."></textarea><div class="composer-actions"><button type="submit">Enviar</button><button type="button" class="secondary" id="abort-inline">Abort</button></div></form>
          </section>
          <aside class="side"><section class="panel"><div class="panel-header"><div class="panel-title">Actividad técnica</div></div><div class="tool-list" id="tools"></div></section><section class="panel"><div class="panel-header"><div class="panel-title">Control plane</div></div><div class="data-tabs">${['accounts','devices','policies','usage'].map((tab) => `<button class="data-tab ${state.dataTab === tab ? 'active' : ''}" data-tab="${tab}">${tab}</button>`).join('')}</div><div class="admin-body" id="admin-data"></div></section></aside>
        </div>
      </div>
    </div>`
  wireEvents(); renderHeader(); renderMessages(); renderUiRequests(); renderActivity(); renderAdminData()
}
function renderHeader() {
  const header = $('#topbar'); if (!header) return
  const health = state.health
  const session = state.session?.sessionName || state.session?.sessionId || 'sin sesión'
  const envName = state.env?.environment || 'unknown'
  header.innerHTML = `<div><h2>Pi Chat Fixvox</h2><div class="muted">Control room para Dictation Tauri + Fixvox Cloud</div></div><div class="chips"><span class="chip ${state.env?.production ? 'prod' : 'local'}">${esc(envName)}</span><span class="chip ${health?.ok ? 'ok' : 'warn'}">${health?.ok ? `Pi ${esc(health.piVersion || '')}` : 'Pi no listo'}</span><span class="chip">${esc(state.status)}</span><span class="chip">${esc(session)}</span></div>`
}
function renderMessages() {
  const box = $('#messages'); if (!box) return
  box.innerHTML = state.messages.map((message) => `<div class="message-row ${message.role}"><div class="bubble"><div class="bubble-label">${message.role === 'user' ? 'JP' : message.role === 'system' ? 'Sistema' : 'agente'}</div>${esc(message.content)}</div></div>`).join('') || '<div class="empty">Todavía no hay mensajes.</div>'
  box.scrollTop = box.scrollHeight
}
function renderUiRequests() {
  const box = $('#requests'); if (!box) return
  box.innerHTML = [...state.uiRequests.values()].map((request) => {
    const options = Array.isArray(request.options) ? request.options.slice(0, 4) : []
    return `<div class="request-card" data-request="${esc(request.id)}"><strong>${esc(request.title || request.question || request.method || 'Solicitud Pi')}</strong><div class="muted">${esc(request.context || request.description || '')}</div><textarea placeholder="Respuesta para Pi"></textarea><div class="chips">${options.map((option) => `<button class="secondary" data-option="${esc(typeof option === 'string' ? option : option.label || option.title || 'Opción')}">${esc(typeof option === 'string' ? option : option.label || option.title || 'Opción')}</button>`).join('')}<button data-respond>Responder</button></div></div>`
  }).join('')
}
function renderActivity() {
  const box = $('#tools'); if (!box) return
  const tools = [...state.tools.values()].reverse()
  box.innerHTML = tools.length ? tools.map((tool) => `<div class="tool-card ${esc(tool.status)}"><div class="tool-head"><span>${esc(tool.title || 'tool')}</span><span>${esc(tool.status || 'running')}</span></div><div class="muted">${esc(tool.subtitle || tool.id || '')}</div>${tool.body ? `<pre class="tool-body">${esc(tool.body)}</pre>` : ''}</div>`).join('') : '<div class="empty">Sin tools todavía.</div>'
}
function renderAdminData() {
  const box = $('#admin-data'); if (!box) return
  const data = state.adminData
  if (!data) { box.innerHTML = '<div class="empty">Cargá accounts/devices/policies/usage.</div>'; return }
  if (state.dataTab === 'accounts' && Array.isArray(data.accounts)) {
    box.innerHTML = `<table class="table"><thead><tr><th>Account</th><th>Policy</th><th>Devices</th><th></th></tr></thead><tbody>${data.accounts.map((account) => `<tr><td><strong>${esc(account.accountHandle)}</strong><br><span class="muted">${esc(account.accountIdRedacted)}</span></td><td>${esc(account.policyId || 'device-level')}<br><span class="muted">${esc(account.policyLabel || '')}</span></td><td>${esc(account.deviceCount)}<br><span class="muted">${esc(account.lastSeenAt || '')}</span></td><td><button data-assign-account="${esc(account.accountHandle)}" data-policy="${esc(account.policyId || 'pro')}">Asignar</button></td></tr>`).join('')}</tbody></table>`; return
  }
  if (state.dataTab === 'devices' && Array.isArray(data.devices)) {
    box.innerHTML = `<table class="table"><thead><tr><th>Device</th><th>Policy</th><th>Status</th><th></th></tr></thead><tbody>${data.devices.map((device) => `<tr><td><strong>${esc(device.deviceId)}</strong><br><span class="muted">${esc(device.installId)}</span></td><td>${esc(device.policyId || 'none')}<br><span class="muted">${esc(device.policyLabel || '')}</span></td><td>${esc(device.status)}<br><span class="muted">${esc(device.lastSeenAt || '')}</span></td><td><button data-assign-device="${esc(device.deviceId)}" data-policy="${esc(device.policyId || 'pro')}">Asignar</button></td></tr>`).join('')}</tbody></table>`; return
  }
  box.innerHTML = `<pre class="data">${esc(pretty(data))}</pre>`
}
function wireEvents() {
  document.querySelectorAll('[data-quick]').forEach((button) => button.onclick = () => submitPrompt(button.dataset.quick))
  document.querySelectorAll('[data-tab]').forEach((button) => button.onclick = () => loadAdmin(button.dataset.tab))
  $('#new-session').onclick = () => newSession().catch(alertError)
  $('#refresh-session').onclick = () => refreshSession().catch(alertError)
  $('#abort-pi').onclick = () => abortPi().catch(alertError)
  $('#abort-inline').onclick = () => abortPi().catch(alertError)
  $('#composer').onsubmit = (event) => { event.preventDefault(); submitPrompt().catch(alertError) }
  $('#prompt').onkeydown = (event) => { if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); submitPrompt().catch(alertError) } }
  document.querySelectorAll('[data-assign-account]').forEach((button) => button.onclick = () => assignAccountPolicy(button.dataset.assignAccount, button.dataset.policy).catch(alertError))
  document.querySelectorAll('[data-assign-device]').forEach((button) => button.onclick = () => assignDevicePolicy(button.dataset.assignDevice, button.dataset.policy).catch(alertError))
  document.querySelectorAll('[data-request]').forEach((card) => {
    const id = card.dataset.request
    card.querySelectorAll('[data-option]').forEach((button) => button.onclick = () => respondUiRequest(id, { selected: button.dataset.option, value: button.dataset.option }).catch(alertError))
    const respond = card.querySelector('[data-respond]')
    if (respond) respond.onclick = () => respondUiRequest(id, { text: card.querySelector('textarea')?.value || '' }).catch(alertError)
  })
}
function alertError(error) { alert(error.message || String(error)) }

render()
refreshEnv().then(() => refreshHealth()).then(() => refreshSession()).catch(() => {})
loadAdmin('accounts').catch(() => {})
