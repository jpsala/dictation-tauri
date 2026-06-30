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
  sessionNameDraft: '',
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
function cleanText(value) {
  return String(value ?? '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\[[0-9;:]*m/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
function statusLabel(value) {
  const text = cleanText(value || '')
  if (!text) return 'Listo'
  if (/codex|token|left|%|thinking|tool/i.test(text)) return 'Pi está trabajando…'
  return text.length > 44 ? `${text.slice(0, 41)}…` : text
}
function shortPath(value) {
  const text = String(value || '')
  if (text.length <= 42) return text
  return `…${text.slice(-39)}`
}
function toolText(value) { return pretty(value).slice(0, 8000) }
function addMessage(role, content) {
  const message = { id: crypto.randomUUID(), role, content }
  state.messages.push(message)
  renderMessages()
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
  renderAll()
}
async function refreshHealth() {
  try {
    state.health = await jsonFetch('/api/pi-chat/health')
    state.status = state.health.ok ? `Pi ${state.health.piVersion || ''}` : 'Pi no listo'
  } catch (error) {
    state.health = { ok: false, error: error.message, process: 'stopped' }
    state.status = 'Pi error'
  }
  renderAll()
}
async function refreshSession() {
  if (!state.health?.ok) return
  try {
    const payload = await sendCommand({ type: 'get_state' })
    state.session = payload.response?.data || payload.response || null
    state.sessionNameDraft = state.session?.sessionName || ''
  } catch { state.session = null }
  renderActivity()
  renderHeader()
}
async function renameSession() {
  if (!state.health?.ok) return
  await sendCommand({ type: 'set_session_name', name: state.sessionNameDraft.trim() })
  await refreshSession()
}
async function cloneSession() {
  if (!state.health?.ok) return
  await sendCommand({ type: 'clone' })
  addMessage('system', 'Sesión Pi clonada desde el punto actual.')
  await refreshSession()
}
async function newSession() {
  await sendCommand({ type: 'new_session' })
  state.messages = [{ id: crypto.randomUUID(), role: 'system', content: 'Nueva sesión Pi iniciada.' }]
  state.tools.clear()
  state.uiRequests.clear()
  state.sessionNameDraft = ''
  await refreshHealth()
  await refreshSession()
  renderAll()
}
async function abortPi() {
  if (state.controller) state.controller.abort()
  try { await sendCommand({ type: 'abort' }) } catch {}
  state.running = false
  state.status = 'Abortado'
  renderAll()
}
async function submitPrompt(textOverride, displayTextOverride) {
  const input = $('#prompt')
  const text = String(textOverride ?? input?.value ?? '').trim()
  const displayText = String(displayTextOverride ?? text).trim()
  if (!text || !displayText || state.running || !state.health?.ok) return
  if (input) input.value = ''
  addMessage('user', displayText)
  const assistantId = addMessage('assistant', '')
  state.running = true
  state.status = 'Pi está trabajando...'
  state.controller = new AbortController()
  renderAll()
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
    renderAll()
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
  if (event.type === 'web_status') { state.status = statusLabel(event.status || 'Pi'); renderHeader(); return }
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
  if (method === 'setStatus') { state.status = statusLabel(event.statusText || 'Pi'); renderHeader(); return }
  if (method === 'setTitle') { state.status = statusLabel(event.title || 'Pi'); renderHeader(); return }
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
  renderSidebar()
  renderAdminData()
}
function confirmProductionMutation(description) {
  if (!state.env?.production) return true
  return prompt(`PRODUCTION mutation: ${description}\nEscribí PROD para confirmar.`) === 'PROD'
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

function renderAll() {
  if (!app.dataset.ready) renderShell()
  renderSidebar(); renderHeader(); renderHealthWarning(); renderMessages(); renderUiRequests(); renderActivity(); renderAdminData(); wireDynamicEvents()
}
function renderShell() {
  app.dataset.ready = 'true'
  app.innerHTML = `
    <div class="admin-layout">
      <aside class="admin-drawer" id="sidebar"></aside>
      <main class="admin-main">
        <section class="pi-page">
          <div class="pi-header" id="topbar"></div>
          <div id="health-warning"></div>
          <div class="pi-grid">
            <section class="chat-card">
              <div class="card-strip"><strong>Conversación</strong><span id="cwd-label"></span></div>
              <div class="request-list" id="requests"></div>
              <div class="messages" id="messages"></div>
              <form class="composer" id="composer">
                <textarea id="prompt" aria-label="Mensaje para Pi"></textarea>
                <div class="composer-buttons"><button class="icon-button primary" type="submit" id="send-button" title="Enviar">➤</button><button class="icon-button" type="button" id="abort-inline" title="Abortar">■</button><button class="icon-button" type="button" id="new-inline" title="Nueva sesión">↻</button></div>
              </form>
            </section>
            <aside class="activity-card" id="activity"></aside>
          </div>
        </section>
      </main>
    </div>`
  $('#composer').onsubmit = (event) => { event.preventDefault(); submitPrompt().catch(alertError) }
  $('#abort-inline').onclick = () => abortPi().catch(alertError)
  $('#new-inline').onclick = () => newSession().catch(alertError)
  $('#prompt').onkeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitPrompt().catch(alertError)
    }
  }
}
function renderSidebar() {
  const sidebar = $('#sidebar'); if (!sidebar) return
  const nav = [
    ['Dashboard', 'D', 'dashboard'], ['Chat', 'C', 'chat'], ['Accounts', 'A', 'accounts'], ['Devices', 'V', 'devices'], ['Policies', 'P', 'policies'], ['Usage', 'U', 'usage'], ['Mi cuenta', 'M', 'account'],
  ]
  sidebar.innerHTML = `<div class="drawer-brand"><div><strong>Fixvox</strong><span>Admin y usuarios</span></div></div><div class="drawer-list">${nav.map(([label, icon, key]) => `<button class="drawer-item ${key === 'chat' ? 'selected' : ''}" data-nav="${key}" title="${label}"><span class="drawer-icon">${icon}</span><span class="drawer-text">${label}</span></button>`).join('')}</div><div class="drawer-user"><div>${esc(state.env?.user?.name || state.env?.user?.email || 'Admin')}</div><small>${esc(state.env?.user?.email || state.env?.environment || '')}</small><a href="/logout">Salir</a></div>`
}
function renderHeader() {
  const header = $('#topbar'); if (!header) return
  const health = state.health
  const envName = state.env?.environment || 'unknown'
  header.innerHTML = `<div><div class="title-line"><span class="title-icon" aria-hidden="true">C</span><h1>Chat</h1></div><p>Consola agentica dentro de Fixvox.</p></div><div class="chips"><span class="chip ${health?.ok ? 'ok' : 'warn'}">${health?.ok ? `Pi ${esc(health.piVersion || '')}` : 'Pi no listo'}</span><span class="chip ${state.running ? 'primary' : ''}">${esc(statusLabel(state.status))}</span><span class="chip ${state.env?.production ? 'prod' : 'local'}">${esc(envName)}</span></div>`
  const cwd = $('#cwd-label')
  if (cwd) cwd.innerHTML = health?.ok ? `cwd: <code>${esc(shortPath(health.cwd))}</code> · ${esc(health.process || '')}` : ''
}
function renderHealthWarning() {
  const box = $('#health-warning'); if (!box) return
  if (state.health?.ok || !state.health?.error) { box.innerHTML = ''; return }
  box.innerHTML = `<div class="alert warning"><strong>${esc(state.health.error)}</strong><br>${esc(state.health.instructions || '')}<br>cwd: <code>${esc(state.health.cwd || '')}</code> · bin: <code>${esc(state.health.piBin || '')}</code></div>`
}
function renderMessages() {
  const box = $('#messages'); if (!box) return
  box.innerHTML = state.messages.length ? state.messages.map((message) => messageBubble(message)).join('') : '<div class="empty">Todavía no hay mensajes.</div>'
  box.scrollTop = box.scrollHeight
  const input = $('#prompt')
  if (input) {
    input.disabled = !state.health?.ok || state.running
    input.placeholder = state.health?.ok ? 'Escribí una instrucción para Pi… (Enter envía, Shift+Enter baja línea)' : 'Pi todavía no está listo en este entorno.'
  }
  const send = $('#send-button')
  if (send) send.disabled = !state.health?.ok || state.running
}
function messageBubble(message) {
  const role = message.role === 'user' ? (state.env?.user?.name || 'Vos') : message.role === 'system' ? 'Sistema' : 'agente'
  const fallback = message.role === 'assistant' && state.running && !message.content ? 'Trabajando…' : message.content || (message.role === 'assistant' ? 'Pi terminó sin texto visible. Revisá la actividad técnica.' : '')
  return `<div class="message-row ${message.role}"><article class="bubble"><div class="bubble-label">${esc(role)}</div><div class="markdown-lite">${renderMarkdownLite(fallback)}</div></article></div>`
}
function renderMarkdownLite(text) {
  let html = esc(text)
  html = html.replace(/```([\s\S]*?)```/g, '<pre>$1</pre>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\n/g, '<br>')
  return html
}
function renderUiRequests() {
  const box = $('#requests'); if (!box) return
  box.innerHTML = [...state.uiRequests.values()].map((request) => {
    const options = Array.isArray(request.options) ? request.options.slice(0, 4) : []
    return `<div class="request-card" data-request="${esc(request.id)}"><strong>${esc(request.title || request.question || request.method || 'Solicitud Pi')}</strong><div class="muted">${esc(request.context || request.description || '')}</div><textarea placeholder="Respuesta para Pi"></textarea><div class="button-row">${options.map((option) => `<button class="button small" data-option="${esc(typeof option === 'string' ? option : option.label || option.title || 'Opción')}">${esc(typeof option === 'string' ? option : option.label || option.title || 'Opción')}</button>`).join('')}<button class="button small primary" data-respond>Responder</button></div></div>`
  }).join('')
}
function renderActivity() {
  const box = $('#activity'); if (!box) return
  const sessionTitle = state.session?.sessionName || state.session?.sessionId || 'sin nombre'
  const tools = [...state.tools.values()].reverse()
  const visibleTools = tools.slice(0, 6)
  const hiddenToolCount = Math.max(0, tools.length - visibleTools.length)
  box.innerHTML = `<div class="activity-section session"><div class="section-head"><div><span class="section-icon">S</span><strong>Sesión Pi</strong></div><button class="icon-button mini" id="refresh-session" title="Refrescar sesión">↻</button></div>${state.session ? `<p><strong>${esc(sessionTitle)}</strong><br><code>${esc(shortPath(state.session.sessionFile || ''))}</code></p><div class="chips wrap"><span class="chip">${state.session.messageCount ?? 0} mensajes</span>${state.session.pendingMessageCount ? `<span class="chip warn">${state.session.pendingMessageCount} pendientes</span>` : ''}${state.session.isStreaming ? '<span class="chip primary">streaming</span>' : ''}${state.session.isCompacting ? '<span class="chip">compactando</span>' : ''}</div><div class="rename-row"><input id="session-name" value="${esc(state.sessionNameDraft)}" placeholder="Nombre visible"><button class="icon-button mini" id="rename-session">✓</button></div><button class="button full" id="clone-session">Clonar sesión</button>` : `<p class="muted">No hay estado de sesión cargado.</p><button class="button full" id="refresh-session-empty">Refrescar sesión</button>`}</div><div class="activity-section"><div class="section-head"><div><span class="section-icon">T</span><strong>Actividad técnica</strong></div><span class="muted">${tools.length} tools</span></div><div class="tool-list">${visibleTools.length ? visibleTools.map(toolCard).join('') : '<p class="muted">Sin tools todavía.</p>'}</div>${hiddenToolCount ? `<p class="muted tool-overflow-note">+ ${hiddenToolCount} tools anteriores ocultas para mantener el panel limpio.</p>` : ''}</div><div class="activity-section"><div class="section-head"><div><span class="section-icon">F</span><strong>Fixvox admin</strong></div></div><div class="data-tabs">${['accounts','devices','policies','usage'].map((tab) => `<button class="data-tab ${state.dataTab === tab ? 'active' : ''}" data-tab="${tab}">${tab}</button>`).join('')}</div><div id="admin-data" class="admin-data"></div></div>`
  renderAdminData()
  wireDynamicEvents()
}
function toolCard(tool) {
  const title = cleanText(tool.title || 'tool') || 'tool'
  const subtitle = cleanText(tool.subtitle || '')
  const body = cleanText(tool.body || '')
  return `<article class="tool-card ${esc(tool.status)}"><div class="tool-head"><span class="tool-dot ${esc(tool.status)}"></span><div class="tool-title"><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div><span class="tool-status ${esc(tool.status)}">${esc(tool.status || 'done')}</span></div>${body ? `<pre>${esc(body)}</pre>` : ''}</article>`
}
function renderAdminData() {
  const box = $('#admin-data'); if (!box) return
  const data = state.adminData
  if (!data) { box.innerHTML = '<div class="empty small">Cargá accounts/devices/policies/usage.</div>'; return }
  if (state.dataTab === 'accounts' && Array.isArray(data.accounts)) {
    box.innerHTML = `<table><thead><tr><th>Account</th><th>Policy</th><th>Devices</th><th></th></tr></thead><tbody>${data.accounts.map((account) => `<tr><td><strong>${esc(account.accountHandle)}</strong><br><small>${esc(account.accountIdRedacted)}</small></td><td>${esc(account.policyId || 'device-level')}<br><small>${esc(account.policyLabel || '')}</small></td><td>${esc(account.deviceCount)}<br><small>${esc(account.lastSeenAt || '')}</small></td><td><button class="button tiny" data-assign-account="${esc(account.accountHandle)}" data-policy="${esc(account.policyId || 'pro')}">Asignar</button></td></tr>`).join('')}</tbody></table>`; return
  }
  if (state.dataTab === 'devices' && Array.isArray(data.devices)) {
    box.innerHTML = `<table><thead><tr><th>Device</th><th>Policy</th><th>Status</th><th></th></tr></thead><tbody>${data.devices.map((device) => `<tr><td><strong>${esc(device.deviceId)}</strong><br><small>${esc(device.installId)}</small></td><td>${esc(device.policyId || 'none')}<br><small>${esc(device.policyLabel || '')}</small></td><td>${esc(device.status)}<br><small>${esc(device.lastSeenAt || '')}</small></td><td><button class="button tiny" data-assign-device="${esc(device.deviceId)}" data-policy="${esc(device.policyId || 'pro')}">Asignar</button></td></tr>`).join('')}</tbody></table>`; return
  }
  const policies = Array.isArray(data.policies) ? data.policies : Array.isArray(data.policyOptions) ? data.policyOptions.map((id) => ({ id, label: id })) : []
  if (state.dataTab === 'policies' && policies.length) {
    box.innerHTML = `<div class="policy-list">${policies.map((policy) => `<article class="mini-card"><strong>${esc(policy.label || policy.id)}</strong><small>${esc(policy.id)}</small><div class="cap-list">${(policy.capabilities || []).map((cap) => `<span>${esc(cap)}</span>`).join('') || '<span>policy</span>'}</div></article>`).join('')}</div>`; return
  }
  if (state.dataTab === 'usage') {
    const summary = data.summary || data
    const rows = Array.isArray(data.rows) ? data.rows : []
    box.innerHTML = `<div class="usage-grid"><article class="metric"><span>Accounts</span><strong>${esc(summary.accounts ?? '-')}</strong></article><article class="metric"><span>Devices</span><strong>${esc(summary.activeDevices ?? summary.devices ?? '-')}</strong></article><article class="metric"><span>Requests 24h</span><strong>${esc(summary.managedRequests24h ?? '-')}</strong></article><article class="metric"><span>Cost 24h</span><strong>${esc(summary.estimatedCostUsd24h ?? '-')}</strong></article></div>${rows.length ? `<table><thead><tr><th>Account</th><th>Requests</th><th>Quota</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.accountHandle || '-')}</td><td>${esc(row.managedRequests24h ?? '-')}</td><td>${esc(row.quotaStatus || '-')}</td></tr>`).join('')}</tbody></table>` : ''}`; return
  }
  box.innerHTML = `<pre class="data-pre">${esc(pretty(data))}</pre>`
}
function wireDynamicEvents() {
  document.querySelectorAll('[data-nav]').forEach((button) => button.onclick = () => {
    const key = button.dataset.nav
    if (['accounts','devices','policies','usage'].includes(key)) loadAdmin(key).catch(alertError)
    if (key === 'chat') document.querySelector('.messages')?.scrollIntoView({ block: 'nearest' })
  })
  document.querySelectorAll('[data-tab]').forEach((button) => button.onclick = () => loadAdmin(button.dataset.tab).catch(alertError))
  document.querySelectorAll('[data-assign-account]').forEach((button) => button.onclick = () => assignAccountPolicy(button.dataset.assignAccount, button.dataset.policy).catch(alertError))
  document.querySelectorAll('[data-assign-device]').forEach((button) => button.onclick = () => assignDevicePolicy(button.dataset.assignDevice, button.dataset.policy).catch(alertError))
  const refreshButtons = ['refresh-session','refresh-session-empty']
  for (const id of refreshButtons) { const el = document.getElementById(id); if (el) el.onclick = () => refreshSession().catch(alertError) }
  const rename = $('#rename-session'); if (rename) rename.onclick = () => renameSession().catch(alertError)
  const clone = $('#clone-session'); if (clone) clone.onclick = () => cloneSession().catch(alertError)
  const name = $('#session-name'); if (name) name.oninput = (event) => { state.sessionNameDraft = event.currentTarget.value }
  document.querySelectorAll('[data-request]').forEach((card) => {
    const id = card.dataset.request
    card.querySelectorAll('[data-option]').forEach((button) => button.onclick = () => respondUiRequest(id, { selected: button.dataset.option, value: button.dataset.option }).catch(alertError))
    const respond = card.querySelector('[data-respond]')
    if (respond) respond.onclick = () => respondUiRequest(id, { text: card.querySelector('textarea')?.value || '' }).catch(alertError)
  })
}
function alertError(error) { alert(error.message || String(error)) }

renderShell()
refreshEnv().then(() => refreshHealth()).then(() => refreshSession()).catch(() => {})
loadAdmin('accounts').catch(() => {})
