const $ = (selector) => document.querySelector(selector)
function setHtml(node, html) {
  if (!node) return
  node.replaceChildren(document.createRange().createContextualFragment(String(html ?? '')))
}
const app = $('#app')

const CONTROL_ROOM_AREAS = {
  chat: { label: 'Pi Chat', description: 'Asistencia contextual para operar Fixvox de forma segura.', renderer: 'chat', icon: 'chat' },
  people: { label: 'Personas', description: 'Cuentas, equipos vinculados y acceso efectivo.', dataTab: 'accounts', renderer: 'accounts', icon: 'accounts' },
  access: { label: 'Planes y acceso', description: 'Roles, acceso operativo y asignaciones autorizadas.', dataTab: 'settings', renderer: 'settings', icon: 'policies' },
  behavior: { label: 'Comportamiento', description: 'Dictado, presets y comportamiento de producto.', dataTab: 'policies', renderer: 'policies', configurationTab: 'presets', icon: 'policies' },
  usage: { label: 'Uso', description: 'Consumo, límites y señales operativas redacted.', dataTab: 'usage', renderer: 'usage', icon: 'usage' },
  system: { label: 'Sistema avanzado', description: 'Motores, instrucciones y configuración técnica protegida.', dataTab: 'policies', renderer: 'policies', configurationTab: 'engines', icon: 'devices' },
  audit: { label: 'Auditoría', description: 'Historial read-only de mutaciones y evidencia redacted.', dataTab: 'audit', renderer: 'audit', icon: 'dashboard' },
}

const state = {
  health: null,
  status: 'Listo',
  messages: [],
  tools: new Map(),
  uiRequests: new Map(),
  dataTab: 'accounts',
  activeView: 'people',
  selectedPolicyId: 'pro',
  configurationTab: 'profiles',
  profileTab: 'overview',
  profileEditor: null,
  profileReview: false,
  profileApplying: false,
  rbac: null,
  audit: null,
  lastProfileMutation: null,
  adminData: null,
  accountsData: null,
  devicesData: null,
  env: null,
  session: null,
  sessionNameDraft: '',
  running: false,
  controller: null,
  showAllTools: false,
  selectedEntity: null,
  pendingAccountPolicy: null,
  pendingProfileMutation: null,
  profileNotice: null,
  lastAdminViewRendered: null,
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]))
}
function pretty(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try { return JSON.stringify(value, null, 2) } catch { return String(value) }
}
function formatUsd(value) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return '$0.00'
  return `$${number.toFixed(number > 0 && number < 0.01 ? 4 : 2)}`
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
function currentUiContext() {
  const data = state.adminData || {}
  const counts = {
    accounts: Array.isArray(data.accounts) ? data.accounts.length : undefined,
    devices: Array.isArray(data.devices) ? data.devices.length : undefined,
    policies: Array.isArray(data.profileOptions) ? data.profileOptions.length : Array.isArray(data.policies) ? data.policies.length : Array.isArray(data.policyOptions) ? data.policyOptions.length : undefined,
    usageRows: Array.isArray(data.rows) ? data.rows.length : undefined,
  }
  return Object.fromEntries(Object.entries({
    activeView: state.activeView,
    dataTab: state.dataTab,
    selectedPolicyId: state.selectedPolicyId,
    configurationTab: state.configurationTab,
    selectedEntity: state.selectedEntity,
    sessionName: state.session?.sessionName,
    environment: state.env?.environment,
    counts,
  }).filter(([, value]) => value !== undefined && value !== null))
}
function promptWithUiContext(text) {
  return `${text}\n\n[Fixvox Admin UI context]\n${JSON.stringify(currentUiContext(), null, 2)}`
}
function entityKindForView(view) {
  return { people: 'account', accounts: 'account', devices: 'device', usage: 'usage' }[view] || null
}
function clearCrossViewEntitySelection(view) {
  const expected = entityKindForView(view)
  if (expected && state.selectedEntity?.kind !== expected) state.selectedEntity = null
}
function uiContextSummary() {
  const context = currentUiContext()
  const counts = context.counts || {}
  const countParts = Object.entries(counts).filter(([, value]) => value !== undefined).map(([key, value]) => `${key}: ${value}`)
  const parts = [`vista: ${viewTitle(context.activeView || 'chat')}`]
  if (context.dataTab && context.activeView === 'chat') parts.push(`panel: ${context.dataTab}`)
  if (context.selectedPolicyId && (context.activeView === 'policies' || context.dataTab === 'policies')) parts.push(`policy: ${context.selectedPolicyId}`)
  if (context.selectedEntity) parts.push(`selección: ${context.selectedEntity.label || context.selectedEntity.id}`)
  if (countParts.length) parts.push(countParts.join(' · '))
  return parts.join(' · ')
}
function extractAssistantText(value) {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value.role && value.role !== 'assistant') return ''
  if (typeof value.content === 'string') return value.content
  if (typeof value.text === 'string') return value.text
  if (Array.isArray(value.content)) return value.content.map((part) => extractAssistantText(part)).join('')
  if (value.message) return extractAssistantText(value.message)
  return ''
}
function extractLastAssistantText(value) {
  if (!Array.isArray(value)) return ''
  for (let index = value.length - 1; index >= 0; index -= 1) {
    const message = value[index]
    if (!message || (message.role && message.role !== 'assistant')) continue
    const text = extractAssistantText(message)
    if (text.trim()) return text
  }
  return ''
}
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
  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.error || 'Request failed')
    error.code = payload?.error?.code
    error.status = response.status
    throw error
  }
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
    state.status = state.health.ok ? (state.running ? state.status : 'Listo') : 'Pi no listo'
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
    const response = await fetch('/api/pi-chat/prompt', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: promptWithUiContext(text) }), signal: state.controller.signal })
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
      if (line) {
        try {
          onEvent(JSON.parse(line.slice(6)))
        } catch {
          // Ignore malformed SSE payloads; the stream may continue with valid events.
        }
      }
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
  if (event.type === 'compaction_end') { state.status = event.aborted ? 'Compactación abortada' : 'Contexto compactado'; renderHeader(); return }
  if (event.type === 'auto_retry_start') { state.status = `Reintentando (${event.attempt || 1})`; renderHeader(); return }
  if (event.type === 'queue_update') { state.status = 'Cola Pi actualizada'; renderHeader(); return }
  if (event.type === 'message_end' || event.type === 'turn_end') {
    const finalText = event.message?.role === 'assistant' ? extractAssistantText(event.message) : extractLastAssistantText(event.messages)
    if (finalText.trim()) setMessage(assistantId, finalText)
    return
  }
  if (event.type === 'agent_end') {
    const finalText = extractAssistantText(event.assistantMessage) || extractAssistantText(event.result) || extractLastAssistantText(event.messages)
    if (finalText.trim()) setMessage(assistantId, finalText)
    return
  }
  if (event.type === 'message_update') {
    const update = event.assistantMessageEvent || {}
    if (update.type === 'text_delta') appendMessage(assistantId, update.delta || '')
    if (update.type === 'text_end' && update.content) setMessage(assistantId, update.content)
    if (update.type === 'done') {
      const finalText = extractAssistantText(update.message) || extractAssistantText(update) || update.content || ''
      if (finalText.trim()) setMessage(assistantId, finalText)
    }
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
  appendMessage(assistantId, '\n\nPi necesita una respuesta en la UI.\n\n')
  renderUiRequests()
}
async function respondUiRequest(id, response) {
  await sendCommand({ type: 'extension_ui_response', id, ...response })
  state.uiRequests.delete(id)
  renderUiRequests()
}
async function loadAdmin(tab = state.dataTab) {
  state.dataTab = tab
  const endpoints = { accounts: '/api/admin/accounts?limit=50', devices: '/api/admin/devices?limit=50', policies: '/api/admin/policies', usage: '/api/admin/usage', settings: '/api/admin/roles', audit: '/api/admin/audit' }
  try {
    state.adminData = await jsonFetch(endpoints[tab])
    if (tab === 'accounts') state.accountsData = state.adminData
    if (tab === 'devices') state.devicesData = state.adminData
    if (tab === 'audit') state.audit = state.adminData
    if (tab === 'policies' || tab === 'settings') {
      state.rbac = await jsonFetch('/api/admin/rbac').catch(() => ({ ok: false, role: null }))
      state.audit = await jsonFetch('/api/admin/audit').catch(() => ({ records: [] }))
    }
  } catch (error) { state.adminData = { ok: false, error: error.message } }
  renderAll()
}
function confirmProductionMutation(description) {
  if (!state.env?.production) return true
  return prompt(`PRODUCTION mutation: ${description}\nEscribí PROD para confirmar.`) === 'PROD'
}
function policyLabelFor(policyId, policyOptions = []) {
  const option = policyOptions.find((policy) => (typeof policy === 'string' ? policy : policy.policyId || policy.id) === policyId)
  if (!option) return policyId === 'pro' ? 'Pro' : policyId
  return typeof option === 'string' ? option : option.policyLabel || option.label || policyId
}
function policyImpact(policyId) {
  const catalog = {
    'alpha-basic': ['UI simple', 'sin presets editables', 'quota baja', 'modelos bloqueados'],
    'alpha-full': ['UI avanzada', 'presets editables', 'quota alpha', 'modelos permitidos'],
    'alpha-private': ['perfil privado', 'revisar acceso manual', 'quota configurable'],
    pro: ['UI avanzada', 'quota práctica sin límite', 'mejor voz', 'post-proceso activo'],
  }
  return catalog[policyId] || ['policy custom', 'revisar perfiles asociados']
}
function effectivePolicyId(account) {
  return account?.effectivePolicyId || account?.policyId || null
}
function effectivePolicyLabel(account) {
  return account?.effectivePolicyLabel || account?.effectivePolicyId || account?.policyLabel || account?.policyId || 'device-level'
}
function policySourceLabel(source) {
  return {
    base: 'Base profile',
    group: 'Group targeting',
    account: 'Account override',
    device: 'Device override',
  }[source] || 'Base profile'
}
function policySourceTone(source) {
  return source === 'group' ? 'group' : source === 'account' ? 'account' : source === 'device' ? 'device' : 'base'
}
function groupOptionById(id) {
  return (Array.isArray(state.adminData?.groupOptions) ? state.adminData.groupOptions : []).find((group) => group.id === id)
}
function groupLabel(id) {
  const group = groupOptionById(id)
  return group?.label || id
}
function groupTargetLabel(group) {
  return group?.policyId ? `→ ${group.policyLabel || policyLabelFor(group.policyId, state.adminData?.policyOptions || [])}` : 'targeting only'
}
function renderEffectivePolicyBadge(account) {
  const source = account?.effectivePolicySource || (account?.policyId ? 'account' : 'base')
  const sourceDetail = source === 'group' && account?.matchedGroup ? ` · ${groupLabel(account.matchedGroup)}` : ''
  return `<span class="policy-stack"><span class="policy-badge">${esc(effectivePolicyLabel(account))}</span><small class="source-chip ${esc(policySourceTone(source))}">${esc(policySourceLabel(source))}${esc(sourceDetail)}</small></span>`
}
function accountVariantOptions() {
  const fallback = ['owner', 'friend', 'tester', 'trial', 'debug-tools', 'best-voice', 'cheap-model', 'new-ui', 'private-alpha']
  if (Array.isArray(state.adminData?.variantOptions)) return state.adminData.variantOptions
  return fallback.map((id) => ({ id, label: segmentLabelFallback(id), description: segmentImpactFallback(id), source: 'built-in' }))
}
function variantOption(id) { return accountVariantOptions().find((option) => option.id === id) }
function segmentImpactFallback(segment) {
  return {
    owner: 'acceso owner y cambios rápidos',
    friend: 'usuario cercano para pruebas manuales',
    tester: 'recibe variantes en prueba',
    trial: 'usuario en prueba controlada',
    'debug-tools': 'muestra herramientas/debug avanzado',
    'best-voice': 'prioriza calidad de voz y post-proceso',
    'cheap-model': 'prioriza costo bajo',
    'new-ui': 'habilita variantes nuevas de UI',
    'private-alpha': 'features alpha privadas',
  }[segment] || 'variante personalizada'
}
function segmentImpact(segment) { return variantOption(segment)?.description || segmentImpactFallback(segment) }
function variantEffects(segment) { return Array.isArray(variantOption(segment)?.effects) ? variantOption(segment).effects : ['customOverride: define-before-production'] }
function segmentLabelFallback(segment) {
  return {
    owner: 'Owner',
    friend: 'Amigo',
    tester: 'Tester',
    trial: 'Trial',
    'debug-tools': 'Debug tools',
    'best-voice': 'Best voice',
    'cheap-model': 'Cheap model',
    'new-ui': 'New UI',
    'private-alpha': 'Private alpha',
  }[segment] || segment
}
function segmentLabel(segment) { return variantOption(segment)?.label || segmentLabelFallback(segment) }
function accountVariants(account) { return Array.isArray(account.variants) ? account.variants : (Array.isArray(account.segments) ? account.segments : []) }
function effectiveSettingsPreview(account) {
  const variants = accountVariants(account)
  return [...policyImpact(account.policyId || 'device-level'), ...variants.map((variant) => `${variant}: ${segmentImpact(variant)}`)]
}
async function saveAccountBudget(form) {
  const body = Object.fromEntries(new FormData(form).entries())
  await jsonFetch('/api/admin/accounts/budget', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountHandle: body.accountHandle, budget: { dailyUsd: body.dailyUsd, monthlyUsd: body.monthlyUsd, mode: body.mode } }) })
  await loadAdmin('accounts')
  state.status = `Budget account actualizado: ${body.accountHandle}`
}
async function updateAccountGroups(accountHandle, groups) {
  await jsonFetch('/api/admin/accounts/groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountHandle, groups }) })
  await loadAdmin('accounts')
  state.status = `Groups actualizados: ${accountHandle}`
}
async function createGroup(form) {
  const body = Object.fromEntries(new FormData(form).entries())
  await jsonFetch('/api/admin/groups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  await loadAdmin(state.activeView === 'accounts' ? 'accounts' : 'policies')
  state.status = `Group creado: ${body.label || body.id}`
}
async function saveEngine(form) {
  const body = Object.fromEntries(new FormData(form).entries())
  await jsonFetch('/api/admin/engines', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  await loadAdmin('policies')
  state.status = `Motor guardado: ${body.label || body.id}`
}
async function deleteEngine(id) {
  if (!confirm(`Borrar motor ${id}? Los profiles que lo usen volverán al motor default de ese tipo.`)) return
  await jsonFetch('/api/admin/engines/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
  await loadAdmin('policies')
  state.status = `Motor borrado: ${id}`
}
async function savePrompt(form) {
  const body = Object.fromEntries(new FormData(form).entries())
  await jsonFetch('/api/admin/prompts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  await loadAdmin('policies')
  state.status = `Prompt guardado: ${body.label || body.id}`
}
function selectionPresetDefaultsFromData(data = state.adminData) {
  const defaults = data?.policy?.userSettingsDefaults?.selectionPresets
  const currentItems = Array.isArray(defaults?.items) ? defaults.items : []
  const promptById = new Map((Array.isArray(data?.promptOptions) ? data.promptOptions : []).map((prompt) => [prompt.id, prompt]))
  return currentItems.map((item) => {
    const prompt = promptById.get(item.promptId)
    return {
      ...item,
      label: item.label || item.name || item.id,
      promptContent: prompt?.content ?? item.promptContent ?? '',
    }
  }).filter((item) => item.id && item.promptId)
}
async function publishSelectionPresetDefaults() {
  const items = selectionPresetDefaultsFromData()
  if (!items.length) throw new Error('No hay defaults selectionPresets para publicar')
  if (!confirmProductionMutation(`publish ${items.length} selection preset defaults`)) return
  await jsonFetch('/api/admin/policies/selection-presets', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ source: 'fixvox-cloud-admin', items, syncPrompts: true }) })
  await loadAdmin('policies')
  state.status = `Selection preset defaults publicados: ${items.length}`
}
async function deletePrompt(id) {
  if (!confirm(`Borrar prompt ${id}? Los motores que lo referencien deberán apuntar a otro prompt.`)) return
  await jsonFetch('/api/admin/prompts/delete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
  await loadAdmin('policies')
  state.status = `Prompt borrado: ${id}`
}
function profileDefinitionForApply(definition) {
  const { version, status, basedOnVersion, ...candidate } = structuredClone(definition || {})
  return candidate
}
function publishedProfileRecords(data = state.adminData) {
  return (data?.profileVersions || []).filter((profile) => profile?.published)
}
function activeProfileRecord(profileId) { return publishedProfileRecords().find((profile) => profile.profileId === profileId) || null }
function startProfileEdit(profileId) {
  const record = activeProfileRecord(profileId)
  if (!record?.published) throw new Error('No hay una versión publicada para editar.')
  state.profileEditor = { profileId, expectedActiveVersion: record.published.version, original: profileDefinitionForApply(record.published), candidate: profileDefinitionForApply(record.published), dirty: false }
  state.profileReview = false
  state.profileNotice = { tone: 'success', message: 'Editando cambios sólo en esta ventana. Actualizar la página los descarta.' }
  renderMessages(); wireDynamicEvents()
}
function cancelProfileEdit() {
  state.profileEditor = null; state.profileReview = false; state.pendingProfileMutation = null
  state.profileNotice = { tone: 'success', message: 'Se descartaron los cambios locales. La configuración publicada no cambió.' }
  renderMessages(); wireDynamicEvents()
}
function updateProfileCandidate(form) {
  const editor = state.profileEditor
  if (!editor) return
  const values = Object.fromEntries(new FormData(form).entries()), candidate = structuredClone(editor.candidate), tab = form.dataset.profileEditorTab
  if (tab === 'overview') candidate.label = values.label
  if (tab === 'access') candidate.access = { capabilities: [...new FormData(form).getAll('capability')] }
  if (tab === 'runtime') {
    const operation = (kind) => ({ engineId: values[`${kind}EngineId`], ...(values[`${kind}PromptId`] ? { promptId: values[`${kind}PromptId`] } : {}) })
    candidate.runtime = { transcription: operation('transcription'), postprocess: operation('postprocess'), selectionTransform: operation('selectionTransform') }
  }
  if (tab === 'limits') {
    const amount = (key) => values[key] === '' ? undefined : Number(values[key])
    candidate.limits = { mode: values.limitMode, ...(amount('dailyUsd') === undefined ? {} : { dailyUsd: amount('dailyUsd') }), ...(amount('monthlyUsd') === undefined ? {} : { monthlyUsd: amount('monthlyUsd') }), ...(values.quotaProfile ? { quotaProfile: values.quotaProfile } : {}) }
  }
  if (tab === 'controls') {
    candidate.userControls = Object.fromEntries([...form.querySelectorAll('[data-profile-control]')].map((input) => [input.dataset.profileControl, input.value]))
    candidate.defaults = Object.fromEntries([...form.querySelectorAll('[data-profile-default]')].flatMap((input) => input.value === '' ? [] : [[input.dataset.profileDefault, input.dataset.defaultType === 'boolean' ? input.value === 'true' : input.dataset.defaultType === 'number' ? Number(input.value) : input.value]]))
  }
  editor.candidate = candidate; editor.dirty = JSON.stringify(editor.original) !== JSON.stringify(candidate); state.profileReview = false
}
function profileDiff(before, after, path = '') {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})])
  return [...keys].flatMap((key) => { const nextPath = path ? `${path}.${key}` : key, left = before?.[key], right = after?.[key]; if (left && right && typeof left === 'object' && typeof right === 'object' && !Array.isArray(left) && !Array.isArray(right)) return profileDiff(left, right, nextPath); return JSON.stringify(left) === JSON.stringify(right) ? [] : [{ path: nextPath, before: left, after: right }] })
}
async function applyProfileChanges(profileId) {
  const editor = state.profileEditor
  if (!editor || editor.profileId !== profileId || !editor.dirty) throw new Error('No hay cambios locales para aplicar.')
  state.profileApplying = true; state.profileNotice = { tone: 'pending', message: 'Aplicando una única versión atómica…' }; renderMessages(); wireDynamicEvents()
  try {
    const result = await jsonFetch('/api/admin/profiles/apply', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId, expectedActiveVersion: editor.expectedActiveVersion, definition: editor.candidate, confirmation: `APPLY ${profileId} v${editor.expectedActiveVersion}` }) })
    state.lastProfileMutation = { action: 'apply', profileId, resultingVersion: result.published?.version ?? result.profile?.published?.version ?? null, result: 'success', accountsRefreshed: false }
    state.profileEditor = null; state.profileReview = false; state.pendingProfileMutation = null
    await loadAdmin('policies'); await refreshEffectiveProfilesAfterProfileMutation()
    state.lastProfileMutation = { ...state.lastProfileMutation, accountsRefreshed: true, audit: auditForProfileMutation('apply', profileId) }
    state.profileNotice = { tone: 'success', message: 'Cambios aplicados como una nueva versión publicada.' }; state.status = `Profile aplicado: ${profileId}`; renderAll()
  } catch (error) {
    state.pendingProfileMutation = null
    if (error.code === 'profile_version_stale') { state.profileEditor = null; state.profileReview = false; await loadAdmin('policies'); state.profileNotice = { tone: 'error', message: 'La versión cambió. Se recargó la autoridad; revisá los cambios nuevamente.' } }
    else state.profileNotice = { tone: 'error', message: error.message || 'No se pudieron aplicar los cambios.' }
    renderMessages(); wireDynamicEvents()
  } finally { state.profileApplying = false }
}
async function refreshEffectiveProfilesAfterProfileMutation() { state.accountsData = await jsonFetch('/api/admin/accounts?limit=50'); return state.accountsData }
function auditForProfileMutation(action, profileId) { return [...(state.audit?.records || [])].reverse().find((record) => record.action === action && record.profileId === profileId && record.result === 'success') || null }
async function saveRoleBinding(form) {
  const body = Object.fromEntries(new FormData(form).entries())
  await jsonFetch('/api/admin/roles', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subjectEmail: body.subjectEmail, role: body.role }) })
  await loadAdmin('settings')
  state.status = `Rol actualizado: ${body.subjectEmail}`
}
async function removeRoleBinding(form) {
  const body = Object.fromEntries(new FormData(form).entries())
  await jsonFetch('/api/admin/roles/remove', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subjectEmail: body.subjectEmail }) })
  await loadAdmin('settings')
  state.status = `Binding removido: ${body.subjectEmail}`
}
function previewAccountPolicy(accountHandle, policyId) {
  state.pendingAccountPolicy = { accountHandle, policyId }
  renderMessages(); wireDynamicEvents()
}
async function applyAccountPolicy(accountHandle, policyId) {
  const policyOptions = Array.isArray(state.adminData?.policyOptions) ? state.adminData.policyOptions : []
  const policyLabel = policyLabelFor(policyId, policyOptions)
  if (!confirmProductionMutation(`assign account ${accountHandle} -> ${policyId}`)) return
  state.adminData = await jsonFetch('/api/admin/accounts/policy', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountHandle, policyId, policyLabel }) })
  state.pendingAccountPolicy = null
  renderAll()
}
async function assignAccountPolicy(accountHandle, currentPolicy) {
  previewAccountPolicy(accountHandle, currentPolicy || 'pro')
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
  setHtml(app, `
    <div class="admin-layout">
      <aside class="admin-drawer" id="sidebar"></aside>
      <main class="admin-main">
        <section class="pi-page">
          <div class="pi-header" id="topbar"></div>
          <div id="health-warning"></div>
          <div class="pi-grid">
            <section class="chat-card">
              <div class="card-strip"><div><strong id="main-title">Conversación</strong><small id="main-subtitle">Enter envía · Shift+Enter agrega línea</small></div><span id="cwd-label"></span></div>
              <div class="request-list" id="requests"></div>
              <div class="messages" id="messages"></div>
              <form class="composer" id="composer">
                <textarea id="prompt" aria-label="Mensaje para Pi"></textarea>
                <div class="composer-run-buttons"><button class="composer-icon primary" type="button" id="send-button" title="Enviar" aria-label="Enviar">${sendIcon()}</button><button class="composer-icon" type="button" id="abort-button" title="Abortar" aria-label="Abortar">${stopIcon()}</button></div>
                <button class="composer-icon" type="button" id="new-inline" title="Nueva sesión Pi" aria-label="Nueva sesión Pi">${newIcon()}</button>
              </form>
            </section>
            <aside class="activity-card" id="activity"></aside>
          </div>
        </section>
      </main>
    </div>`)
  $('#composer').onsubmit = (event) => { event.preventDefault(); submitPrompt().catch(alertError) }
  $('#send-button').onclick = () => submitPrompt().catch(alertError)
  $('#abort-button').onclick = () => abortPi().catch(alertError)
  $('#new-inline').onclick = () => newSession().catch(alertError)
  $('#prompt').oninput = () => renderMessages()
  $('#prompt').onkeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitPrompt().catch(alertError)
    }
  }
}
function sendIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 20.2 21 12 3.8 3.8l1.4 6.5L14 12l-8.8 1.7-1.4 6.5Z"/></svg>'
}
function chatIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5.5h14v9H9.5L5 18v-3.5h0v-9Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 9h8M8 12h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
}
function stopIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>'
}
function newIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
}
function renderSidebar() {
  const sidebar = $('#sidebar'); if (!sidebar) return
  const nav = Object.entries(CONTROL_ROOM_AREAS)
  setHtml(sidebar, `<div class="drawer-brand"><div><strong>Fixvox</strong><span>Control Room</span></div></div><div class="drawer-list">${nav.map(([key, area]) => `<button class="drawer-item ${key === state.activeView ? 'selected' : ''}" data-nav="${key}" title="${area.label}" ${key === state.activeView ? 'aria-current="page"' : ''}><span class="drawer-icon">${navIcon(area.icon)}</span><span class="drawer-text">${area.label}</span></button>`).join('')}</div><div class="drawer-user"><div>${esc(state.env?.user?.name || state.env?.user?.emailRedacted || 'Admin')}</div><small>${esc(state.env?.user?.emailRedacted || state.env?.environment || '')}</small><a href="/logout">Salir</a></div>`)
}
function navIcon(key) {
  const icons = {
    dashboard: '<path d="M4 13h6V4H4v9Zm10 7h6V4h-6v16ZM4 20h6v-5H4v5Z"/>',
    chat: '<path d="M5 5.5h14v9H9.5L5 18v-3.5h0v-9Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
    accounts: '<path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8-1a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 19a4.5 4.5 0 0 1 9 0H3.5Zm9-1.5a3.8 3.8 0 0 1 7 1.5h-5.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>',
    devices: '<rect x="7" y="3.5" width="10" height="17" rx="2.2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 17h4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    policies: '<path d="M12 3.5 19 6v5.2c0 4.1-2.6 7.1-7 9.3-4.4-2.2-7-5.2-7-9.3V6l7-2.5Z" fill="none" stroke="currentColor" stroke-width="2"/><path d="m9 12 2 2 4-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    usage: '<path d="M5 19V9m7 10V5m7 14v-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>',
    account: '<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    settings: '<path d="M12 3.5 14 5l2.5-.2.8 2.4 2.2 1.2-.8 2.4.8 2.4-2.2 1.2-.8 2.4-2.5-.2-2 1.5-2-1.5-2.5.2-.8-2.4-2.2-1.2.8-2.4-.8-2.4 2.2-1.2.8-2.4L10 5l2-1.5Z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[key] || icons.dashboard}</svg>`
}
function renderHeader() {
  const header = $('#topbar'); if (!header) return
  const health = state.health
  const envName = state.env?.environment || 'unknown'
  const area = CONTROL_ROOM_AREAS[state.activeView]
  const title = viewTitle(state.activeView)
  const description = area?.description || (state.activeView === 'chat' ? 'Asistencia contextual para la entidad seleccionada.' : 'Control Room operativo de Fixvox.')
  const icon = state.activeView === 'chat' ? chatIcon() : navIcon(area?.icon || state.activeView)
  setHtml(header, `<div><div class="title-line"><span class="title-icon" aria-hidden="true">${icon}</span><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div></div></div><div class="chips"><span class="chip ${health?.ok ? 'ok' : 'warn'}">${health?.ok ? `Pi ${esc(health.piVersion || '')}` : 'Pi no listo'}</span><span class="chip ${state.running ? 'primary' : ''}">${esc(statusLabel(state.status))}</span><span class="chip ${state.env?.production ? 'prod' : 'local'}">${esc(envName)}</span></div>`)
  const cwd = $('#cwd-label')
  if (cwd) setHtml(cwd, state.activeView === 'chat' && health?.ok ? `cwd: <code>${esc(shortPath(health.cwd))}</code> · ${esc(health.process || '')}` : '')
}
function renderHealthWarning() {
  const box = $('#health-warning'); if (!box) return
  if (state.health?.ok || !state.health?.error) { setHtml(box, ''); return }
  setHtml(box, `<div class="alert warning"><strong>${esc(state.health.error)}</strong><br>${esc(state.health.instructions || '')}<br>cwd: <code>${esc(state.health.cwd || '')}</code> · bin: <code>${esc(state.health.piBin || '')}</code></div>`)
}
function renderMessages() {
  const box = $('#messages'); if (!box) return
  const title = $('#main-title')
  const subtitle = $('#main-subtitle')
  const composer = $('#composer')
  const grid = document.querySelector('.pi-grid')
  const renderer = CONTROL_ROOM_AREAS[state.activeView]?.renderer || state.activeView
  if (grid) grid.classList.toggle('admin-wide', ['accounts', 'policies', 'settings'].includes(renderer))
  if (state.activeView !== 'chat') {
    const shouldKeepScroll = state.lastAdminViewRendered === state.activeView
    const previousScrollTop = shouldKeepScroll ? box.scrollTop : 0
    if (title) title.textContent = viewTitle(state.activeView)
    if (subtitle) subtitle.textContent = `Contexto para Pi · ${uiContextSummary()}`
    if (composer) composer.hidden = true
    setHtml(box, renderAdminWorkbench(state.activeView))
    box.scrollTop = previousScrollTop
    state.lastAdminViewRendered = state.activeView
    return
  }
  state.lastAdminViewRendered = null
  if (title) title.textContent = 'Conversación'
  if (subtitle) subtitle.textContent = `Enter envía · Shift+Enter agrega línea · ${uiContextSummary()}`
  if (composer) composer.hidden = false
  setHtml(box, state.messages.length ? state.messages.map((message) => messageBubble(message)).join('') : '<div class="empty-state"><strong>Listo para trabajar</strong><span>Pedile a Pi que revise UI, admin, policies o un cambio local. Nada toca production en modo mock.</span></div>')
  box.scrollTop = box.scrollHeight
  const input = $('#prompt')
  if (input) {
    input.disabled = !state.health?.ok || state.running
    input.placeholder = state.health?.ok ? 'Escribí una instrucción para Pi… (Enter envía, Shift+Enter baja línea)' : 'Pi todavía no está listo en este entorno.'
  }
  const send = $('#send-button')
  const abort = $('#abort-button')
  const canSubmit = Boolean(state.health?.ok && !state.running && (input?.value || '').trim())
  if (send) {
    send.disabled = !canSubmit
    setHtml(send, sendIcon())
    send.title = 'Enviar'
    send.setAttribute('aria-label', send.title)
    send.classList.toggle('danger', false)
  }
  if (abort) {
    abort.disabled = !state.running
    setHtml(abort, stopIcon())
    abort.title = 'Abortar'
    abort.setAttribute('aria-label', abort.title)
  }
}
function viewTitle(view) {
  return CONTROL_ROOM_AREAS[view]?.label || { chat: 'Pi', dashboard: 'Control Room', accounts: 'Personas', devices: 'Equipos', policies: 'Configuración', usage: 'Uso', settings: 'Acceso', account: 'Mi cuenta' }[view] || 'Control Room'
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
  setHtml(box, [...state.uiRequests.values()].map((request) => {
    const method = String(request.method || 'confirm')
    const title = request.title || request.question || (method === 'select' ? 'Elegí una opción' : method === 'input' ? 'Completá el dato pedido' : method === 'editor' ? 'Editá el contenido' : 'Confirmación')
    const message = request.context || request.message || request.description || ''
    const options = Array.isArray(request.options) ? request.options.slice(0, 4) : []
    const header = `<div class="request-head"><strong>Pi necesita una respuesta: ${esc(title)}</strong>${message ? `<div class="muted">${esc(message)}</div>` : ''}<small>Tipo: ${esc(method)}</small></div>`
    if (method === 'select') {
      return `<div class="request-card" data-request="${esc(request.id)}">${header}<div class="button-row">${options.map((option) => { const label = typeof option === 'string' ? option : option.label || option.title || 'Opción'; return `<button class="button small primary" data-request-action="option" data-value="${esc(label)}">${esc(label)}</button>` }).join('')}<button class="button small" data-request-action="cancel">Cancelar</button></div></div>`
    }
    if (method === 'input' || method === 'editor') {
      return `<div class="request-card" data-request="${esc(request.id)}">${header}<textarea ${method === 'editor' ? 'class="editor"' : ''} placeholder="${esc(request.placeholder || 'Respuesta para Pi')}" >${esc(request.prefill || request.text || '')}</textarea><div class="button-row end"><button class="button small" data-request-action="cancel">Cancelar</button><button class="button small primary" data-request-action="respond">Enviar</button></div></div>`
    }
    if (method === 'confirm') {
      return `<div class="request-card" data-request="${esc(request.id)}">${header}<div class="button-row end"><button class="button small" data-request-action="reject">No</button><button class="button small primary" data-request-action="confirm">Sí</button></div></div>`
    }
    return `<div class="request-card" data-request="${esc(request.id)}">${header}<pre class="data-pre">${esc(pretty(request))}</pre><div class="button-row end"><button class="button small" data-request-action="cancel">Cancelar</button><button class="button small primary" data-request-action="confirm">Continuar</button></div></div>`
  }).join(''))
}
function renderActivity() {
  const box = $('#activity'); if (!box) return
  const sessionTitle = state.session?.sessionName || state.session?.sessionId || 'sin nombre'
  const tools = [...state.tools.values()].reverse()
  const visibleTools = state.showAllTools ? tools : tools.slice(0, 8)
  const hiddenToolCount = Math.max(0, tools.length - visibleTools.length)
  const adminPanel = state.activeView === 'chat' ? `<div class="activity-section"><div class="section-head"><div><span class="section-icon">F</span><strong>Fixvox admin</strong></div></div><div class="data-tabs">${['accounts','devices','policies','usage'].map((tab) => `<button class="data-tab ${state.dataTab === tab ? 'active' : ''}" data-tab="${tab}">${tab}</button>`).join('')}</div><div id="admin-data" class="admin-data"></div></div>` : ''
  setHtml(box, `<div class="activity-section session"><div class="section-head"><div><span class="section-icon">S</span><strong>Sesión Pi</strong></div><button class="icon-button mini" id="refresh-session" title="Refrescar sesión">↻</button></div>${state.session ? `<p><strong>${esc(sessionTitle)}</strong><br><code>${esc(shortPath(state.session.sessionFile || ''))}</code></p><div class="chips wrap"><span class="chip">${state.session.messageCount ?? 0} mensajes</span>${state.session.pendingMessageCount ? `<span class="chip warn">${state.session.pendingMessageCount} pendientes</span>` : ''}${state.session.isStreaming ? '<span class="chip primary">streaming</span>' : ''}${state.session.isCompacting ? '<span class="chip">compactando</span>' : ''}</div><div class="rename-row"><input id="session-name" value="${esc(state.sessionNameDraft)}" placeholder="Nombre visible"><button class="icon-button mini" id="rename-session">✓</button></div><button class="button full" id="clone-session">Clonar sesión</button>` : `<p class="muted">No hay estado de sesión cargado.</p><button class="button full" id="refresh-session-empty">Refrescar sesión</button>`}</div><div class="activity-section"><div class="section-head"><div><span class="section-icon">T</span><strong>Actividad técnica</strong></div><span class="muted">${tools.length} tools</span></div>${hiddenToolCount ? `<button class="button tiny" id="toggle-tools">Ver ${hiddenToolCount} tools anteriores</button>` : state.showAllTools && tools.length > 8 ? '<button class="button tiny" id="toggle-tools">Mostrar solo actividad reciente</button>' : ''}<div class="tool-list">${visibleTools.length ? visibleTools.map(toolCard).join('') : '<p class="muted">Sin tools todavía.</p>'}</div></div>${adminPanel}`)
  if (adminPanel) renderAdminData()
  wireDynamicEvents()
}
function toolCard(tool) {
  const title = cleanText(tool.title || 'tool') || 'tool'
  const subtitle = cleanText(tool.subtitle || '')
  const body = cleanText(tool.body || '')
  return `<article class="tool-card ${esc(tool.status)}"><details ${tool.status === 'running' ? 'open' : ''}><summary><div class="tool-head"><span class="tool-dot ${esc(tool.status)}"></span><div class="tool-title"><strong>${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ''}</div><span class="tool-status ${esc(tool.status)}">${esc(tool.status || 'done')}</span></div></summary>${body ? `<pre>${esc(body)}</pre>` : ''}</details></article>`
}

function currentAdminData(view = state.activeView) {
  const area = CONTROL_ROOM_AREAS[view]
  if (view === state.dataTab || area?.dataTab === state.dataTab) return state.adminData
  if (view === 'accounts' || view === 'people') return state.accountsData
  if (view === 'devices') return state.devicesData
  return null
}
function policyRowsFromData(data) {
  if (!data) return []
  if (Array.isArray(data.policies)) return data.policies.map((policy) => ({ ...policy, policyId: policy.id || policy.policyId, policyLabel: policy.label || policy.policyLabel || policy.id }))
  if (Array.isArray(data.policyOptions)) return data.policyOptions.map((policy) => typeof policy === 'string' ? { policyId: policy, policyLabel: policy, capabilities: [] } : { ...policy, policyId: policy.policyId || policy.id, policyLabel: policy.policyLabel || policy.label || policy.policyId || policy.id, capabilities: policy.capabilities || [] })
  return []
}
function renderAdminWorkbench(view) {
  if (view === 'dashboard') return renderDashboardWorkbench()
  if (view === 'account') return renderAccountWorkbench()
  const area = CONTROL_ROOM_AREAS[view]
  const renderer = area?.renderer || view
  const data = currentAdminData(view)
  if (!data) return `<div class="admin-workbench loading"><strong>Cargando ${esc(viewTitle(view))}…</strong></div>`
  if (data.ok === false) return `<div class="alert warning"><strong>No se pudo cargar ${esc(viewTitle(view))}</strong><br>${esc(data.error || 'Error desconocido')}</div>`
  if (renderer === 'accounts') return renderAccountsWorkbench(data)
  if (renderer === 'devices') return renderDevicesWorkbench(data)
  if (renderer === 'policies') return renderConfigurationWorkbench(data)
  if (renderer === 'usage') return renderUsageWorkbench(data)
  if (renderer === 'settings') return renderSettingsWorkbench()
  if (renderer === 'audit') return renderAuditWorkbench(data)
  return `<pre class="data-pre">${esc(pretty(data))}</pre>`
}
function renderDashboardWorkbench() {
  return `<div class="admin-workbench"><div class="workbench-head"><div><span class="eyebrow">Dashboard</span><h2>Control room Fixvox</h2><p>Resumen operativo local-first. Usá Chat para pedir trabajo de Pi o abrí una entidad desde el sidebar.</p></div><button class="button" data-chat-context="Dame un resumen operativo de Fixvox Admin: Pi, accounts, devices, policies y próximos riesgos." data-chat-label="Resumen operativo">Preguntar a Pi</button></div><div class="usage-grid big"><article class="metric"><span>Pi</span><strong>${state.health?.ok ? 'Ready' : 'No listo'}</strong></article><article class="metric"><span>Env</span><strong>${esc(state.env?.environment || 'unknown')}</strong></article><article class="metric"><span>Session</span><strong>${esc(state.session?.messageCount ?? '-')}</strong></article><article class="metric"><span>Tools</span><strong>${state.tools.size}</strong></article></div><div class="entity-grid compact"><article class="entity-card"><strong>Accounts</strong><div class="entity-meta"><span>Usuarios y policies</span></div><button class="button tiny" data-open-view="accounts">Abrir accounts</button></article><article class="entity-card"><strong>Devices</strong><div class="entity-meta"><span>Instalaciones vinculadas</span></div><button class="button tiny" data-open-view="devices">Abrir devices</button></article><article class="entity-card"><strong>Policies</strong><div class="entity-meta"><span>Capabilities y límites</span></div><button class="button tiny" data-open-view="policies">Abrir policies</button></article></div></div>`
}
function renderAccountWorkbench() {
  return `<div class="admin-workbench"><div class="workbench-head"><div><span class="eyebrow">Mi cuenta</span><h2>${esc(state.env?.user?.name || 'Admin')}</h2><p>Sesión web admin autenticada server-side. Los secrets y API keys no se exponen al browser.</p></div><a class="button" href="/logout">Salir</a></div><div class="entity-grid compact"><article class="entity-card"><strong>${esc(state.env?.user?.emailRedacted || 'usuario redacted')}</strong><div class="entity-meta"><span>${esc(state.env?.user?.provider || 'admin')}</span><span>${esc(state.env?.environment || 'env')}</span></div></article><article class="entity-card"><strong>Seguridad</strong><div class="entity-meta"><span>Mutaciones production requieren confirmación PROD.</span></div></article></div></div>`
}
function accountDisplayName(account) { return account.displayName || account.userRedacted || account.emailRedacted || account.accountHandle || 'usuario redacted' }
function accountSecondaryLabel(account) {
  return [account.userEmailRedacted, account.provider, account.accountHandle || account.accountIdRedacted || 'account redacted'].filter(Boolean).join(' · ')
}
function currentAccountBadge(account) {
  return account.isCurrentAccount ? '<span class="chip ok">Tu cuenta</span>' : ''
}
function getSelectedAccount(accounts) {
  return accounts.find((account) => state.selectedEntity?.kind === 'account' && state.selectedEntity?.id === account.accountHandle) || accounts[0] || null
}
function formatDateTime(value) {
  if (!value) return 'sin actividad'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date)
}
function renderAccountsWorkbench(data) {
  const accounts = Array.isArray(data.accounts) ? data.accounts : []
  const selected = getSelectedAccount(accounts)
  const policyOptions = Array.isArray(data.policyOptions) ? data.policyOptions : []
  const proCount = accounts.filter((account) => (effectivePolicyId(account) || '').includes('pro')).length
  const totalDevices = accounts.reduce((sum, account) => sum + Number(account.deviceCount || 0), 0)
  const unlinkedCurrentAccount = data.currentAccount && !data.currentAccount.linked
    ? `<div class="alert warning"><strong>Tu sesión Admin todavía no está vinculada a una cuenta de producto.</strong><br>${esc(data.currentAccount.displayName || 'Cuenta Google')} · ${esc(data.currentAccount.userEmailRedacted || 'email redacted')}</div>`
    : ''
  return `<div class="admin-workbench accounts-workbench"><div class="workbench-head compact"><div><span class="eyebrow">Accounts</span><h2>Cuentas</h2><p>${accounts.length} cuentas · ${proCount} Pro · ${totalDevices} devices vinculados · ${policyOptions.length} profiles disponibles</p></div><button class="button" data-chat-context="Analizá las cuentas visibles y recomendá próximas acciones seguras." data-chat-label="Analizar cuentas">Analizar con Pi</button></div>${unlinkedCurrentAccount}<div class="accounts-toolbar"><input type="search" placeholder="Buscar usuario" disabled><select disabled><option>Todos los profiles</option></select><select disabled><option>Toda actividad</option></select></div><div class="accounts-workbench-grid"><section class="accounts-table-card"><table class="accounts-table"><thead><tr><th>Usuario</th><th>Profile</th><th>Devices</th><th>Última actividad</th><th></th></tr></thead><tbody>${accounts.map((account) => { const selectedRow = selected?.accountHandle === account.accountHandle; return `<tr class="${selectedRow ? 'selected' : ''}" data-select-entity data-entity-kind="account" data-entity-id="${esc(account.accountHandle)}" data-entity-label="${esc(accountDisplayName(account))}"><td><strong>${esc(accountDisplayName(account))} ${currentAccountBadge(account)}</strong><small>${esc(accountSecondaryLabel(account))}</small></td><td>${renderEffectivePolicyBadge(account)}</td><td>${esc(account.deviceCount ?? 0)}</td><td>${esc(formatDateTime(account.lastSeenAt))}</td><td><button class="button tiny" data-chat-context="Explicame la cuenta ${esc(accountDisplayName(account))} (${esc(account.accountHandle)}) y qué profile conviene asignarle." data-chat-label="Analizar ${esc(accountDisplayName(account))}">Pi</button></td></tr>` }).join('') || '<tr><td colspan="5">Sin cuentas para mostrar.</td></tr>'}</tbody></table></section>${selected ? renderAccountDetail(selected, policyOptions) : '<section class="account-detail"><p class="muted">Seleccioná una cuenta para ver detalle.</p></section>'}</div></div>`
}
function renderAccountPolicyPreview(account, policyOptions) {
  const pending = state.pendingAccountPolicy
  if (!pending || pending.accountHandle !== account.accountHandle || pending.policyId === account.policyId) return ''
  const label = policyLabelFor(pending.policyId, policyOptions)
  const devices = Array.isArray(account.devices) ? account.devices.length : Number(account.deviceCount || 0)
  return `<aside class="policy-preview"><div><span class="eyebrow">Preview de cambio</span><h4>${esc(account.policyLabel || account.policyId || 'device-level')} → ${esc(label)}</h4><p>Afecta esta cuenta y ${esc(devices)} device${devices === 1 ? '' : 's'} vinculado${devices === 1 ? '' : 's'}.</p></div><ul>${policyImpact(pending.policyId).map((item) => `<li>${esc(item)}</li>`).join('')}</ul><div class="button-row end"><button class="button small" data-cancel-account-policy>Cancelar</button><button class="button small primary" data-apply-account-policy="${esc(account.accountHandle)}" data-policy="${esc(pending.policyId)}">Aplicar cambio</button></div></aside>`
}
function renderAccountGroups(account) {
  const options = Array.isArray(state.adminData?.groupOptions) ? state.adminData.groupOptions : []
  const active = Array.isArray(account.groups) ? account.groups : []
  const activeSet = new Set(active)
  const rows = options.map((group) => { const checked = activeSet.has(group.id); const next = checked ? active.filter((id) => id !== group.id) : [...active, group.id]; return `<button class="segment-option ${checked ? 'selected' : ''}" data-update-account-groups="${esc(account.accountHandle)}" data-groups="${esc(next.join(','))}"><strong>${checked ? '✓ ' : '+ '}${esc(group.label || group.id)} <em>${esc(groupTargetLabel(group))}</em></strong><span>${esc(group.description || '')}</span></button>` }).join('')
  return `<section class="variants-panel groups-panel"><div class="panel-head"><div><span class="eyebrow">Groups</span><p>Targeting de runtime: puede elegir profile antes de overrides account/device.</p></div><span class="panel-count">${active.length} activos</span></div><div class="segment-options">${rows || '<p class="muted">Sin groups.</p>'}</div><details class="variant-create"><summary>Crear group</summary><form data-create-group><input name="label" placeholder="Nombre, ej. Beta testers" required><input name="description" placeholder="Descripción"><input name="id" placeholder="id opcional"><select name="policyId"><option value="">Sin profile runtime</option>${(state.adminData?.policyOptions || []).map((policy) => { const id = typeof policy === 'string' ? policy : policy.policyId || policy.id || ''; const label = typeof policy === 'string' ? policy : policy.policyLabel || policy.label || id; return `<option value="${esc(id)}">${esc(label)}</option>` }).join('')}</select><button class="button small primary" type="submit">Crear group</button></form></details></section>`
}
function renderAccountBudget(account) {
  const budget = account.accountBudget || { dailyUsd: '', monthlyUsd: '', mode: 'block' }
  return `<form class="policy-budget account-budget" data-save-account-budget><input type="hidden" name="accountHandle" value="${esc(account.accountHandle)}"><strong>Budget override del usuario</strong><p>Si se configura, reemplaza el budget del profile solo para esta cuenta.</p><label><span>Diario USD</span><input name="dailyUsd" type="number" min="0" step="0.01" value="${esc(budget.dailyUsd ?? '')}" placeholder="hereda profile"></label><label><span>Mensual USD</span><input name="monthlyUsd" type="number" min="0" step="0.01" value="${esc(budget.monthlyUsd ?? '')}" placeholder="hereda profile"></label><label><span>Modo</span><select name="mode"><option value="block" ${budget.mode !== 'warn' ? 'selected' : ''}>block</option><option value="warn" ${budget.mode === 'warn' ? 'selected' : ''}>warn</option></select></label><button class="button small primary" type="submit">Guardar budget usuario</button></form>`
}
function renderEffectiveSettings(account) {
  const policyId = effectivePolicyId(account) || 'device-level'
  const policyItems = policyImpact(policyId)
  const variants = accountVariants(account)
  const segmentItems = variants.flatMap((segment) => [`${segmentLabel(segment)}: ${segmentImpact(segment)}`, ...variantEffects(segment).map((effect) => `↳ ${effect}`)])
  const source = account.effectivePolicySource || (account.policyId ? 'account' : 'base')
  const sourceNotes = [
    `source: ${policySourceLabel(source)}`,
    account.matchedGroup ? `matched group: ${groupLabel(account.matchedGroup)}` : null,
    account.policyId ? `account override: ${account.policyLabel || account.policyId}` : 'account override: none',
  ].filter(Boolean)
  return `<section class="effective-settings"><div class="panel-head"><div><span class="eyebrow">Settings efectivos</span><p>Resolución real: base, group targeting, account override y device override.</p></div>${renderEffectivePolicyBadge(account)}</div><div class="effective-columns"><div><strong>Profile efectivo ${esc(effectivePolicyLabel(account))}</strong><ul>${policyItems.map((item) => `<li>${esc(item)}</li>`).join('')}${sourceNotes.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div><div><strong>Overrides usuario</strong>${segmentItems.length ? `<ul>${segmentItems.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : '<p class="muted">Sin overrides activos.</p>'}</div></div></section>`
}
function renderAccountDetail(account, policyOptions) {
  const devices = Array.isArray(account.devices) ? account.devices : []
  return `<section class="account-detail"><div class="entity-card-head"><div><span class="eyebrow">Cuenta seleccionada</span><h3>${esc(accountDisplayName(account))} ${currentAccountBadge(account)}</h3><small>${esc(accountSecondaryLabel(account))}</small></div>${renderEffectivePolicyBadge(account)}</div><div class="account-summary-line"><span>${esc(account.deviceCount ?? devices.length ?? 0)} devices</span><span>Última actividad ${esc(formatDateTime(account.lastSeenAt))}</span></div><div class="policy-control" role="group" aria-label="Policy actual">${policyOptions.map((policy) => { const id = typeof policy === 'string' ? policy : policy.policyId || policy.id || ''; const label = typeof policy === 'string' ? policy : policy.policyLabel || policy.label || id; const active = id === account.policyId; return `<button class="policy-option ${active ? 'active' : ''}" data-preview-account-policy="${esc(account.accountHandle)}" data-policy="${esc(id)}" ${active ? 'disabled' : ''}>${esc(label)}</button>` }).join('') || '<span class="muted">Sin opciones de policy.</span>'}</div>${renderAccountPolicyPreview(account, policyOptions)}${renderAccountBudget(account)}${renderAccountGroups(account)}${renderEffectiveSettings(account)}<div class="linked-devices"><strong>Devices vinculados</strong>${devices.length ? `<div class="linked-device-list">${devices.map((device) => `<article class="linked-device"><div><strong>${esc(device.deviceIdRedacted || 'device redacted')}</strong><small>${esc(formatDateTime(device.lastSeenAt))}</small></div><span class="chip ${device.status === 'active' ? 'ok' : ''}">${esc(device.status || 'unknown')}</span><span class="policy-badge">${esc(device.policyLabel || device.policyId || 'none')}</span><button class="button tiny" disabled>Revocar</button></article>`).join('')}</div>` : '<p class="muted">Este endpoint todavia no devolvio devices vinculados para esta cuenta.</p>'}</div></section>`
}
function renderDevicesWorkbench(data) {
  const devices = Array.isArray(data.devices) ? data.devices : []
  const selected = devices.find((device) => state.selectedEntity?.kind === 'device' && state.selectedEntity?.id === device.deviceId) || devices[0]
  const policyOptions = Array.isArray(data.policyOptions) ? data.policyOptions : []
  const active = devices.filter((device) => device.status === 'active').length
  const policyCount = new Set(devices.map((device) => device.policyId || 'none')).size
  return `<div class="admin-workbench devices-workbench"><div class="workbench-head"><div><span class="eyebrow">Devices</span><h2>Dispositivos</h2><p>Estado, install, policy efectiva y actividad reciente.</p></div><button class="button" data-chat-context="Mostrame un resumen de devices activos, policies y riesgos." data-chat-label="Resumen devices">Preguntar a Pi</button></div><div class="usage-grid big"><article class="metric"><span>Devices</span><strong>${devices.length}</strong></article><article class="metric"><span>Active</span><strong>${active}</strong></article><article class="metric"><span>Policies</span><strong>${policyCount}</strong></article><article class="metric"><span>Policy options</span><strong>${policyOptions.length || '-'}</strong></article></div>${selected ? renderDeviceDetail(selected, policyOptions) : ''}<div class="entity-grid">${devices.map((device) => { const selectedCard = state.selectedEntity?.kind === 'device' && state.selectedEntity?.id === device.deviceId; return `<article class="entity-card ${selectedCard ? 'selected' : ''}" data-select-entity data-entity-kind="device" data-entity-id="${esc(device.deviceId)}" data-entity-label="${esc(device.deviceId)}"><div class="entity-card-head"><div><strong>${esc(device.deviceId)}</strong><small>${esc(device.installId || '')}</small></div><span class="policy-badge">${esc(device.policyLabel || device.policyId || 'none')}</span></div><div class="entity-meta"><span>${esc(device.status || 'unknown')}</span><span>${esc(device.lastSeenAt || 'sin actividad')}</span></div><div class="entity-actions"><button class="button tiny" data-assign-device="${esc(device.deviceId)}" data-policy="${esc(device.policyId || 'pro')}">Asignar policy</button><button class="button tiny" data-chat-context="Revisá el device ${esc(device.deviceId)}: estado, policy y acciones recomendadas." data-chat-label="Analizar device">Analizar con Pi</button></div></article>` }).join('') || '<div class="empty-state"><strong>Sin devices</strong><span>No hay dispositivos para mostrar.</span></div>'}</div></div>`
}
function renderDeviceDetail(device, policyOptions) {
  return `<section class="account-detail device-detail"><div class="entity-card-head"><div><span class="eyebrow">Device seleccionado</span><h3>${esc(device.deviceId)}</h3><small>${esc(device.installId || 'install redacted')}</small></div><span class="chip ${device.status === 'active' ? 'ok' : ''}">${esc(device.status || 'unknown')}</span></div><div class="account-detail-grid"><article class="metric"><span>Policy</span><strong>${esc(device.policyId || 'none')}</strong></article><article class="metric"><span>Label</span><strong>${esc(device.policyLabel || '-')}</strong></article><article class="metric"><span>Last seen</span><strong>${esc(device.lastSeenAt || '-')}</strong></article></div><div class="account-policy-options"><strong>Policy options</strong><div class="button-row">${policyOptions.map((policy) => { const id = typeof policy === 'string' ? policy : policy.policyId || policy.id || ''; const label = typeof policy === 'string' ? policy : policy.policyLabel || policy.label || id; return `<button class="button tiny" data-assign-device="${esc(device.deviceId)}" data-policy="${esc(id)}">${esc(label)}</button>` }).join('') || '<span class="muted">Sin opciones de policy.</span>'}</div></div><div class="entity-actions"><button class="button" data-chat-context="Diagnosticá el device ${esc(device.deviceId)} con policy ${esc(device.policyId || 'none')} y estado ${esc(device.status || 'unknown')}." data-chat-label="Diagnosticar device">Diagnosticar con Pi</button></div></section>`
}
function pricingForEngine(data, engine) {
  const rows = Array.isArray(data.pricing) ? data.pricing : []
  return rows.find((row) => String(row.provider || '').toLowerCase() === String(engine.provider || '').toLowerCase() && String(row.model || '').toLowerCase() === String(engine.model || '').toLowerCase()) || null
}
function formatPricingRow(row) {
  if (!row) return '<span class="price-badge missing">pricing pendiente</span>'
  const priceBits = []
  if (row.audioInputPrice) priceBits.push(`audio in $${row.audioInputPrice}`)
  if (row.inputPrice) priceBits.push(`in $${row.inputPrice}`)
  if (row.outputPrice) priceBits.push(`out $${row.outputPrice}`)
  if (row.requestPrice) priceBits.push(`req $${row.requestPrice}`)
  const checked = row.checkedAt ? ` · ${formatDateTime(row.checkedAt)}` : ''
  return `<span class="price-badge ${esc(row.status || 'unknown')}">${esc(row.status || 'unknown')} · ${esc(row.unitType || 'unknown')}${checked}</span>${priceBits.length ? `<small class="pricing-line">${esc(priceBits.join(' · '))}</small>` : ''}`
}
async function refreshPricing() {
  if (!confirmProductionMutation('refresh provider pricing')) return
  await jsonFetch('/api/admin/pricing/refresh', { method: 'POST' })
  await loadAdmin('policies')
  state.status = 'Pricing actualizado'
}
function renderSelectionPresetDefaults(data) {
  const items = selectionPresetDefaultsFromData(data)
  return `<section class="presets-cloud-sync"><div class="panel-head"><div><span class="eyebrow">Settings defaults</span><h3>Selection presets Cloud sync</h3><p>Replica el patrón de Fixvox: los presets starter viven en <code>userSettingsDefaults.selectionPresets</code> y sus prompts <code>preset.*</code> se sincronizan al catálogo admin.</p></div><div class="panel-actions"><button class="button small primary" data-publish-selection-presets ${items.length ? '' : 'disabled'}>Publicar defaults</button><span class="panel-count">${items.length} presets</span></div></div><div class="variant-catalog-grid compact">${items.map((item) => `<article class="variant-card prompt-card"><div><strong>${esc(item.label || item.id)}</strong><small>${esc(item.id)} · ${esc(item.promptId)} · ${esc(item.hotkey || 'sin hotkey')} · key ${esc(item.pickerKey || '-')}</small></div><pre class="prompt-preview">${esc(item.promptContent || '')}</pre></article>`).join('') || '<p class="muted">No hay defaults de presets en la policy actual.</p>'}</div></section>`
}
function renderPromptCatalog(data) {
  const prompts = Array.isArray(data.promptOptions) ? data.promptOptions : []
  const kindOptions = [['transcription', 'Transcripción'], ['postprocess', 'Post-proceso'], ['selectionTransform', 'Transformación selección'], ['assistant', 'Assistant']]
  return `<section class="prompts-catalog"><div class="panel-head"><div><span class="eyebrow">Prompt catalog</span><h3>Prompts editables</h3><p>Versiones reales de los prompts que referencian los motores. Separar prompt de motor permite cambiar calidad/comportamiento sin cambiar proveedor/modelo.</p></div><span class="panel-count">${prompts.length} total</span></div><div class="variant-catalog-grid">${prompts.map((prompt) => `<article class="variant-card prompt-card"><div><strong>${esc(prompt.label || prompt.id)}</strong><small>${esc(prompt.id)} · ${esc(prompt.kind)} · ${esc(prompt.version || 'v1')} · ${esc(prompt.source || 'custom')}</small></div><p>${esc(prompt.summary || '')}</p>${prompt.content ? `<pre class="prompt-preview">${esc(prompt.content)}</pre>` : '<p class="muted">Sin contenido.</p>'}<div class="variant-actions"><details><summary>Editar</summary><form data-save-prompt><input name="id" value="${esc(prompt.id)}" required><input name="label" value="${esc(prompt.label || prompt.id)}" required><select name="kind">${kindOptions.map(([value, label]) => `<option value="${esc(value)}" ${value === prompt.kind ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select><input name="version" value="${esc(prompt.version || 'v1')}" placeholder="v1"><input name="summary" value="${esc(prompt.summary || '')}" placeholder="resumen"><textarea name="content" rows="5" placeholder="prompt completo">${esc(prompt.content || '')}</textarea><button class="button small primary" type="submit">Guardar</button></form></details><button class="button small danger" data-delete-prompt="${esc(prompt.id)}">Borrar</button></div></article>`).join('') || '<p class="muted">Sin prompts.</p>'}</div><details class="variant-create"><summary>Crear prompt</summary><form data-save-prompt><input name="id" placeholder="id, ej. postProcessBase.v2" required><input name="label" placeholder="Nombre" required><select name="kind"><option value="postprocess">Post-proceso</option><option value="selectionTransform">Transformación selección</option><option value="transcription">Transcripción</option><option value="assistant">Assistant</option></select><input name="version" placeholder="v1" value="v1"><input name="summary" placeholder="resumen"><textarea name="content" rows="5" placeholder="prompt completo"></textarea><button class="button small primary" type="submit">Crear prompt</button></form></details></section>`
}
function renderEngineCatalog(data) {
  const engines = Array.isArray(data.engineOptions) ? data.engineOptions : []
  const kindLabels = { transcription: 'Transcripción', postprocess: 'Post-proceso', selectionTransform: 'Transformación selección' }
  const tierOptions = ['off', 'cheap', 'balanced', 'premium', 'custom']
  const kindOptions = [['transcription', 'Transcripción'], ['postprocess', 'Post-proceso'], ['selectionTransform', 'Transformación selección']]
  return `<section class="engines-catalog"><div class="panel-head"><div><span class="eyebrow">Engine catalog</span><h3>Motores editables</h3><p>Definen proveedor/modelo/costo para cada ruta. Luego los profiles eligen uno por funcionalidad.</p></div><div class="panel-actions"><button class="button small" data-refresh-pricing>Actualizar precios</button><span class="panel-count">${engines.length} total</span></div></div><div class="engine-catalog-grid">${engines.map((engine) => `<article class="engine-card"><div><strong>${esc(engine.label || engine.id)}</strong><small>${esc(kindLabels[engine.kind] || engine.kind)} · ${esc(engine.tier)} · ${esc(engine.source || 'custom')}</small></div><p>${esc(engine.provider)} / ${esc(engine.model)}</p><small>${esc(engine.notes || '')}</small><div class="engine-pricing">${formatPricingRow(pricingForEngine(data, engine))}</div><small><strong>Prompt:</strong> ${esc(engine.promptKey || 'custom')} · ${esc(engine.promptSummary || '')}</small><div class="variant-actions"><details><summary>Editar</summary><form data-save-engine><input type="hidden" name="id" value="${esc(engine.id)}"><input name="label" value="${esc(engine.label || engine.id)}" required><select name="kind">${kindOptions.map(([value, label]) => `<option value="${esc(value)}" ${value === engine.kind ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select><select name="tier">${tierOptions.map((tier) => `<option value="${esc(tier)}" ${tier === engine.tier ? 'selected' : ''}>${esc(tier)}</option>`).join('')}</select><input name="provider" value="${esc(engine.provider || '')}" placeholder="provider"><input name="model" value="${esc(engine.model || '')}" placeholder="model"><input name="notes" value="${esc(engine.notes || '')}" placeholder="notas/costo"><input name="promptKey" value="${esc(engine.promptKey || '')}" placeholder="prompt key"><input name="promptSummary" value="${esc(engine.promptSummary || '')}" placeholder="prompt resumen"><button class="button small primary" type="submit">Guardar</button></form></details><button class="button small danger" data-delete-engine="${esc(engine.id)}">Borrar</button></div></article>`).join('') || '<p class="muted">No hay motores. Creá uno abajo.</p>'}</div><details class="variant-create"><summary>Crear motor</summary><form data-save-engine><input name="label" placeholder="Nombre, ej. Sonnet premium" required><select name="kind"><option value="transcription">Transcripción</option><option value="postprocess">Post-proceso</option><option value="selectionTransform">Transformación selección</option></select><select name="tier"><option value="cheap">cheap</option><option value="balanced">balanced</option><option value="premium">premium</option><option value="custom">custom</option><option value="off">off</option></select><input name="provider" placeholder="provider, ej. openrouter/groq" required><input name="model" placeholder="modelo" required><input name="notes" placeholder="notas/costo estimado"><input name="promptKey" placeholder="prompt key, ej. postProcessBase"><input name="promptSummary" placeholder="resumen del prompt"><input name="id" placeholder="id opcional"><button class="button small primary" type="submit">Crear motor</button></form></details></section>`
}
function profileSourceLabel(source) {
  return { 'built-in': 'Incluido', assignment: 'Configurado', 'quota-group': 'Por cuota' }[source] || 'Configurado'
}
function profileCapabilityGroups(profile) {
  const available = new Set(profile?.capabilities || [])
  return [
    ['Dictado', ['dictation', 'managed_stt', 'postprocess']],
    ['Selección', ['selection_transform', 'translate']],
    ['Assistant', ['assistant_actions', 'managed_llm']],
    ['Administración', ['custom_prompts', 'advanced_settings', 'debug_tools', 'admin_settings']],
  ].map(([label, capabilities]) => [label, capabilities.filter((capability) => available.has(capability))])
}
function renderProfileAssignments(profile) {
  const labels = {
    uiProfile: 'Interfaz', capabilityProfile: 'Acceso', quotaProfile: 'Cuota', llmProfile: 'LLM', settingsDefaultsProfile: 'Defaults',
  }
  const rows = Object.entries(profile?.profiles || {}).filter(([, value]) => value)
  return `<section class="profile-summary-card"><h4>Resumen</h4><p>Composición interna del perfil. Los IDs técnicos quedan visibles como referencia.</p><dl>${rows.map(([key, value]) => `<div><dt>${esc(labels[key] || key)}</dt><dd>${esc(value)}</dd></div>`).join('') || '<div><dt>Composición</dt><dd>Default</dd></div>'}</dl></section>`
}
function renderProfileAccess(profile) {
  return `<section class="profile-summary-card"><h4>Acceso</h4><p>Funciones habilitadas para los usuarios de este perfil.</p><div class="profile-capability-groups">${profileCapabilityGroups(profile).map(([label, capabilities]) => `<div><strong>${esc(label)}</strong><div class="cap-list">${capabilities.map((capability) => `<span>${esc(capability)}</span>`).join('') || '<span class="muted">Sin acceso</span>'}</div></div>`).join('')}</div></section>`
}
function renderProfileRuntime(definition, data) {
  const rows = [['transcription', 'Transcripción'], ['postprocess', 'Post-proceso'], ['selectionTransform', 'Transformación selección']]
  const engines = new Map((data.engineOptions || []).map((engine) => [engine.id, engine.label || engine.id]))
  return `<section class="profile-summary-card"><h4>Runtime</h4><p>Motores y prompts referenciados por ID; sus catálogos siguen separados.</p><dl>${rows.map(([key, label]) => { const operation = definition?.runtime?.[key] || {}; return `<div><dt>${esc(label)}</dt><dd>${esc(engines.get(operation.engineId) || operation.engineId || 'Heredado')}<small>${operation.promptId ? ` · ${esc(operation.promptId)}` : ''}</small></dd></div>` }).join('')}</dl></section>`
}
function renderProfileLimits(definition) {
  const limits = definition?.limits || {}
  return `<section class="profile-summary-card"><h4>Límites</h4><p>Budget y cuota base de la versión publicada.</p><dl><div><dt>Diario</dt><dd>${limits.dailyUsd == null ? 'Heredado' : formatUsd(limits.dailyUsd)}</dd></div><div><dt>Mensual</dt><dd>${limits.monthlyUsd == null ? 'Heredado' : formatUsd(limits.monthlyUsd)}</dd></div><div><dt>Modo</dt><dd>${esc(limits.mode || 'Heredado')}</dd></div><div><dt>Cuota</dt><dd>${esc(limits.quotaProfile || 'Heredada')}</dd></div></dl></section>`
}
const PROFILE_EDITOR_TABS = [['overview', 'Resumen'], ['access', 'Acceso'], ['runtime', 'Runtime'], ['limits', 'Límites'], ['controls', 'Controles']]
const PROFILE_CAPABILITY_GROUPS = [['Dictado', ['dictation', 'managed_stt', 'postprocess']], ['Selección', ['selection_transform', 'translate']], ['Assistant', ['assistant_actions', 'managed_llm']], ['Administración', ['custom_prompts', 'advanced_settings', 'debug_tools', 'admin_settings']]]
const PROFILE_USER_SETTINGS = ['appearance.themeId', 'appearance.dockSkin', 'general.onboardingDone', 'general.showDockOnStartup', 'general.startWithWindows', 'general.preferredSurface', 'general.uiLanguage', 'hotkeys.pasteLast', 'hotkeys.quickChat', 'hotkeys.resultHistory', 'hotkeys.picker', 'hotkeys.pushToTalk', 'hotkeys.stopAndSubmit', 'hotkeys.toggleAssistantMode', 'hotkeys.togglePressEnterAfterPaste', 'hotkeys.voiceRecord', 'transcript.language', 'voice.muteOutputDuringRecording', 'voice.pressEnterAfterPaste', 'voice.showQuickChatReasoning', 'voice.showPresetReasoning', 'voice.assistantWakeWords', 'voice.assistantModeToggleWords', 'voice.commandWakeWords']
function profileSettingLabel(setting) { return setting.replace('.', ' · ') }
function renderProfileEditorTabs() {
  return `<nav class="profile-editor-tabs" aria-label="Secciones del profile">${PROFILE_EDITOR_TABS.map(([id, label]) => `<button class="profile-editor-tab ${state.profileTab === id ? 'active' : ''}" data-profile-tab="${id}" ${state.profileTab === id ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>`
}
function renderProfileAccessEditor(draft) {
  const enabled = new Set(draft.access?.capabilities || [])
  return `<div class="profile-access-editor">${PROFILE_CAPABILITY_GROUPS.map(([group, capabilities]) => `<fieldset><legend>${esc(group)}</legend>${capabilities.map((capability) => `<label class="profile-check"><input type="checkbox" name="capability" value="${esc(capability)}" ${enabled.has(capability) ? 'checked' : ''}><span>${esc(capability)}</span></label>`).join('')}</fieldset>`).join('')}</div>`
}
function renderProfileRuntimeEditor(draft, data) {
  const operationRows = [['transcription', 'Transcripción'], ['postprocess', 'Post-proceso'], ['selectionTransform', 'Transformación selección']]
  const engineOptions = Array.isArray(data.engineOptions) ? data.engineOptions : []
  const promptOptions = Array.isArray(data.promptOptions) ? data.promptOptions : []
  return `<div class="profile-runtime-editor">${operationRows.map(([kind, label]) => { const operation = draft.runtime?.[kind] || {}; const engines = engineOptions.filter((engine) => engine.kind === kind); const prompts = promptOptions.filter((prompt) => prompt.id === 'none' || prompt.kind === kind || (kind === 'postprocess' && prompt.kind === 'assistant')); return `<fieldset><legend>${esc(label)}</legend><label><span>Engine</span><select name="${esc(kind)}EngineId">${engines.map((engine) => `<option value="${esc(engine.id)}" ${engine.id === operation.engineId ? 'selected' : ''}>${esc(engine.label || engine.id)}</option>`).join('')}</select></label><label><span>Prompt</span><select name="${esc(kind)}PromptId">${prompts.map((prompt) => `<option value="${esc(prompt.id)}" ${prompt.id === operation.promptId ? 'selected' : ''}>${esc(prompt.label || prompt.id)}</option>`).join('')}</select></label></fieldset>` }).join('')}</div>`
}
function renderProfileLimitsEditor(draft, data) {
  const quotas = [...new Set((data.profileOptions || []).map((profile) => profile.profiles?.quotaProfile).filter(Boolean))]
  const limits = draft.limits || {}
  return `<div class="profile-limits-editor"><label><span>Budget diario (USD)</span><input name="dailyUsd" type="number" min="0" step="0.01" value="${esc(limits.dailyUsd ?? '')}" placeholder="Heredado"></label><label><span>Budget mensual (USD)</span><input name="monthlyUsd" type="number" min="0" step="0.01" value="${esc(limits.monthlyUsd ?? '')}" placeholder="Heredado"></label><label><span>Modo</span><select name="limitMode"><option value="block" ${limits.mode === 'block' ? 'selected' : ''}>Bloquear</option><option value="warn" ${limits.mode === 'warn' ? 'selected' : ''}>Advertir</option></select></label><label><span>Perfil de cuota</span><select name="quotaProfile"><option value="">Heredado</option>${quotas.map((quota) => `<option value="${esc(quota)}" ${quota === limits.quotaProfile ? 'selected' : ''}>${esc(quota)}</option>`).join('')}</select></label></div>`
}
function renderProfileControlsEditor(draft) {
  return `<div class="profile-controls-editor">${PROFILE_USER_SETTINGS.map((setting) => { const value = draft.defaults?.[setting]; const type = typeof value === 'boolean' ? 'boolean' : typeof value === 'number' ? 'number' : 'string'; const defaultInput = type === 'boolean' ? `<select data-profile-default="${esc(setting)}" data-default-type="boolean"><option value="">Sin default</option><option value="true" ${value === true ? 'selected' : ''}>true</option><option value="false" ${value === false ? 'selected' : ''}>false</option></select>` : `<input data-profile-default="${esc(setting)}" data-default-type="${type}" type="${type === 'number' ? 'number' : 'text'}" value="${esc(value ?? '')}" placeholder="Sin default">`; return `<fieldset class="profile-control-row"><legend>${esc(profileSettingLabel(setting))}</legend><label><span>Visibilidad</span><select data-profile-control="${esc(setting)}" name="control:${esc(setting)}"><option value="hidden" ${draft.userControls?.[setting] === 'hidden' ? 'selected' : ''}>Oculto</option><option value="visible-locked" ${draft.userControls?.[setting] === 'visible-locked' ? 'selected' : ''}>Visible, bloqueado</option><option value="editable" ${draft.userControls?.[setting] === 'editable' ? 'selected' : ''}>Editable</option></select></label><label><span>Default</span>${defaultInput}</label></fieldset>` }).join('')}</div>`
}
function renderProfileDraftEditor(record, data) {
  const editor = state.profileEditor
  if (!editor || editor.profileId !== record.profileId) return ''
  const candidate = editor.candidate, tab = state.profileTab
  const content = tab === 'overview' ? `<label><span>Nombre</span><input name="label" value="${esc(candidate.label)}" required></label>` : tab === 'access' ? renderProfileAccessEditor(candidate) : tab === 'runtime' ? renderProfileRuntimeEditor(candidate, data) : tab === 'limits' ? renderProfileLimitsEditor(candidate, data) : renderProfileControlsEditor(candidate)
  const diff = state.profileReview ? profileDiff(editor.original, candidate) : []
  const impact = { acceso: 0, runtime: 0, límites: 0, controles: 0, general: 0 }
  for (const item of diff) impact[item.path.startsWith('access.') ? 'acceso' : item.path.startsWith('runtime.') ? 'runtime' : item.path.startsWith('limits.') ? 'límites' : item.path.startsWith('userControls.') || item.path.startsWith('defaults.') ? 'controles' : 'general'] += 1
  const review = state.profileReview ? `<section class="profile-review" aria-live="polite"><div class="panel-head"><div><span class="eyebrow">Revisar cambios</span><h4>${diff.length} cambio${diff.length === 1 ? '' : 's'} local${diff.length === 1 ? '' : 'es'}</h4><p>La revisión no envía requests. Aplicar crea una única versión atómica.</p></div></div><div class="profile-review-impact">${Object.entries(impact).filter(([, n]) => n).map(([label, n]) => `<span>${esc(label)}: ${n}</span>`).join('') || '<span>Sin impacto</span>'}</div>${diff.length ? `<div class="profile-diff"><table><thead><tr><th>Campo</th><th>Antes</th><th>Después</th></tr></thead><tbody>${diff.map((item) => `<tr><td><code>${esc(item.path)}</code></td><td><pre>${esc(previewValue(item.before))}</pre></td><td><pre>${esc(previewValue(item.after))}</pre></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No hay cambios para aplicar.</p>'}</section>` : ''
  const pending = state.pendingProfileMutation?.kind === 'apply' && state.pendingProfileMutation.profileId === editor.profileId
  const actions = !canPublishProfiles() ? '<p class="muted">Tu rol permite revisar cambios locales, pero aplicar requiere publisher u owner.</p>' : pending ? `<section class="profile-inline-confirmation"><div><strong>¿Aplicar estos cambios?</strong><span>Se creará una nueva versión publicada y un audit. No hay borrador intermedio.</span></div><div class="button-row"><button class="button" type="button" data-cancel-profile-mutation>Cancelar</button><button class="button primary" type="button" data-confirm-profile-apply ${state.profileApplying ? 'disabled' : ''}>${state.profileApplying ? 'Aplicando…' : 'Confirmar y aplicar'}</button></div></section>` : `<div class="button-row"><button class="button small" type="button" data-review-profile ${editor.dirty ? '' : 'disabled'}>Revisar cambios</button>${state.profileReview && editor.dirty ? '<button class="button small primary" type="button" data-request-profile-apply>Aplicar cambios</button>' : ''}</div>`
  return `<section class="profile-local-editor"><div class="panel-head"><div><span class="eyebrow">Edición local</span><h4>${esc(['Resumen', 'Acceso', 'Runtime', 'Límites', 'Controles'][PROFILE_EDITOR_TABS.findIndex(([id]) => id === tab)] || 'Perfil')}</h4><p>Los cambios viven sólo en esta ventana hasta Aplicar.</p></div><button class="button small" type="button" data-cancel-profile-edit>Cancelar edición</button></div><form data-profile-editor data-profile-editor-tab="${esc(tab)}">${content}</form>${review}${actions}</section>`
}
function previewValue(value) {
  if (value === undefined || value === null) return '—'
  return typeof value === 'object' ? pretty(value) : String(value)
}
function previewRoutingLabel(routing) {
  return Object.entries(routing || {}).map(([operation, route]) => `${operation}: ${route?.engineId || 'unknown'}${route?.promptId ? ` · ${route.promptId}` : ''}`).join(' · ')
}
function canEditProfiles() { return ['editor', 'publisher', 'owner'].includes(state.rbac?.role) }
function canPublishProfiles() { return ['publisher', 'owner'].includes(state.rbac?.role) }
function renderPublishedRollbackControls(record, profileId) {
  if (!record?.published || !canPublishProfiles()) return ''
  const activeVersion = record.published.version
  const options = (record.history || []).filter((version) => version.version !== activeVersion)
  if (!options.length) return ''
  const pending = state.pendingProfileMutation?.kind === 'rollback' && state.pendingProfileMutation.profileId === profileId ? state.pendingProfileMutation : null
  const action = pending
    ? `<section class="profile-inline-confirmation"><div><strong>¿Restaurar esta versión?</strong><span>La versión seleccionada volverá a estar activa para las personas asignadas.</span></div><div class="button-row"><button class="button" type="button" data-cancel-profile-mutation>Cancelar</button><form data-rollback-profile="${esc(profileId)}"><input type="hidden" name="version" value="${esc(pending.version)}"><input type="hidden" name="confirmation" value="${esc(`ROLLBACK ${profileId} to v${pending.version}`)}"><button class="button primary" type="submit">Confirmar restauración</button></form></div></section>`
    : `<form data-request-profile-rollback="${esc(profileId)}" class="profile-confirm-form"><label><span>Versión para restaurar</span><select name="version">${options.map((version) => `<option value="${esc(version.version)}">v${esc(version.version)} · ${esc(version.label || profileId)}</option>`).join('')}</select></label><button class="button small" type="submit">Restaurar versión</button></form>`
  return `<section class="profile-mutation-panel"><div class="panel-head"><div><span class="eyebrow">Historial</span><h4>Restaurar una versión</h4><p>La restauración crea una nueva versión y conserva la historia.</p></div><span class="chip primary">${esc(state.rbac.role)}</span></div>${action}</section>`
}
function renderProfileMutationOutcome(profileId) {
  const mutation = state.lastProfileMutation
  if (!mutation || mutation.profileId !== profileId) return ''
  const audit = mutation.audit
  const action = mutation.action === 'rollback' ? `Rollback a v${mutation.version}` : mutation.action === 'apply' ? 'Cambios aplicados' : 'Publish'
  return `<section class="profile-mutation-outcome" data-profile-outcome><strong>${esc(action)} completado</strong><span>Versión resultante: v${esc(mutation.resultingVersion ?? '—')} · resultado: ${esc(mutation.result)}</span><small>${mutation.accountsRefreshed ? 'Accounts/effective profiles refrescados.' : 'Refrescando Accounts/effective profiles…'} ${audit ? 'Audit registrado.' : 'Audit pendiente de lectura.'}</small></section>`
}
function renderSettingsWorkbench() {
  const data = state.adminData || {}
  const bindings = Array.isArray(data.bindings) ? data.bindings : []
  const role = state.rbac?.role || 'sin rol'
  const owner = role === 'owner'
  const auditRecords = Array.isArray(state.audit?.records) ? state.audit.records.slice(-8).reverse() : []
  return `<div class="admin-workbench settings-workbench"><div class="workbench-head"><div><span class="eyebrow">Settings / Access</span><h2>Role bindings</h2><p>Google OAuth identifica al operador; RBAC server-side decide la autoridad. Las respuestas solo muestran emails redacted.</p></div><span class="chip ${owner ? 'ok' : 'warn'}">${esc(role)}</span></div><section class="settings-role-panel"><div class="panel-head"><div><h3>Bindings actuales</h3><p>${bindings.length} identidades · el último owner no puede eliminarse ni degradarse.</p></div></div><div class="role-binding-list">${bindings.map((binding) => `<article class="role-binding-row"><strong>${esc(binding.emailRedacted)}</strong><span class="chip ${binding.role === 'owner' ? 'primary' : ''}">${esc(binding.role)}</span></article>`).join('') || '<p class="muted">No hay bindings visibles.</p>'}</div></section><section class="settings-role-panel audit-panel"><div class="panel-head"><div><h3>Audit reciente</h3><p>Publish y rollback quedan registrados con actor redacted y versiones.</p></div></div>${auditRecords.length ? `<div class="audit-list">${auditRecords.map((record) => `<article class="audit-row"><strong>${esc(record.action)} · ${esc(record.profileId)}</strong><span>v${esc(record.sourceVersion ?? '—')} → v${esc(record.targetVersion ?? '—')}</span><small>${esc(record.result)} · ${esc(formatDateTime(record.timestamp))}</small></article>`).join('')}</div>` : '<p class="muted">Sin mutaciones auditadas.</p>'}</section>${owner ? `<section class="settings-role-panel"><div class="panel-head"><div><h3>Administrar acceso</h3><p>Escribí el email Google verificado del operador. El Worker persiste solo el principal hasheado.</p></div></div><form data-save-role class="role-form"><label><span>Email Google</span><input name="subjectEmail" type="email" autocomplete="off" required placeholder="operator@example.com"></label><label><span>Rol</span><select name="role"><option value="viewer">viewer</option><option value="editor">editor</option><option value="publisher">publisher</option><option value="owner">owner</option></select></label><button class="button small primary" type="submit">Guardar rol</button></form><form data-remove-role class="role-form"><label><span>Remover binding</span><input name="subjectEmail" type="email" autocomplete="off" required placeholder="operator@example.com"></label><button class="button small danger" type="submit">Remover</button></form></section>` : '<section class="alert warning"><strong>Solo owner gestiona roles.</strong><p>Podés consultar bindings redacted, pero no mutarlos.</p></section>'}</div>`
}
function renderAuditWorkbench(data) {
  const records = Array.isArray(data.records) ? [...data.records].reverse() : []
  return `<div class="admin-workbench settings-workbench"><div class="workbench-head"><div><span class="eyebrow">Auditoría</span><h2>Historial de cambios</h2><p>Las mutaciones aprobadas quedan registradas con evidencia redacted.</p></div></div>${records.length ? `<div class="audit-list">${records.map((record) => `<article class="audit-row"><strong>${esc(record.action)} · ${esc(record.profileId)}</strong><span>v${esc(record.sourceVersion ?? '—')} → v${esc(record.targetVersion ?? '—')}</span><small>${esc(record.result)} · ${esc(formatDateTime(record.timestamp))}</small></article>`).join('')}</div>` : '<p class="muted">No hay mutaciones auditadas para mostrar.</p>'}</div>`
}

function renderProfileControlsSummary(definition) {
  const defaults = definition?.defaults || {}
  const controls = definition?.userControls || {}
  const configured = PROFILE_USER_SETTINGS.filter((setting) => Object.hasOwn(defaults, setting) || Object.hasOwn(controls, setting))
  return `<section class="profile-summary-card profile-controls-summary"><h4>Controles</h4><p>Visibilidad y valor inicial que reciben los usuarios de este profile.</p><dl>${configured.map((setting) => `<div><dt>${esc(profileSettingLabel(setting))}</dt><dd>${esc(controls[setting] || 'Heredado')}<small> · default: ${esc(previewValue(defaults[setting]))}</small></dd></div>`).join('') || '<div><dt>Controles</dt><dd>Sin overrides; se heredan los defaults</dd></div>'}</dl></section>`
}
function renderPublishedProfileSection(tab, selected, definition, data) {
  if (tab === 'access') return renderProfileAccess(selected)
  if (tab === 'runtime') return renderProfileRuntime(definition, data)
  if (tab === 'limits') return renderProfileLimits(definition)
  if (tab === 'controls') return renderProfileControlsSummary(definition)
  return `${renderProfileAssignments(selected)}${renderProfileAccess(selected)}${renderProfileRuntime(definition, data)}${renderProfileLimits(definition)}`
}
function renderProfileActionFeedback() {
  const notice = state.profileNotice
  if (!notice) return ''
  return `<div class="profile-action-feedback" data-tone="${esc(notice.tone)}" role="status">${esc(notice.message)}</div>`
}

function renderProfilesPane(data) {
  const profileOptions = Array.isArray(data.profileOptions) ? data.profileOptions : policyRowsFromData(data)
  const profileVersions = publishedProfileRecords(data)
  const profiles = profileVersions.length ? profileVersions : profileOptions.map((profile) => ({ profileId: profile.policyId || profile.id, label: profile.policyLabel || profile.label, published: null, history: [] }))
  const record = profiles.find((profile) => profile.profileId === state.selectedPolicyId) || profiles[0]
  if (record && !profiles.some((profile) => profile.profileId === state.selectedPolicyId)) state.selectedPolicyId = record.profileId
  const selectedId = record?.profileId, definition = record?.published, editor = state.profileEditor?.profileId === selectedId ? state.profileEditor : null
  const legacy = profileOptions.find((profile) => (profile.policyId || profile.id) === selectedId) || {}
  const selected = definition ? { ...legacy, policyId: selectedId, policyLabel: definition.label, capabilities: definition.access?.capabilities || [] } : legacy
  const editAction = !editor && canEditProfiles() ? `<button class="button primary" type="button" data-edit-profile="${esc(selectedId)}">Editar cambios</button>` : ''
  return `<div class="configuration-pane profiles-pane"><div class="policy-layout"><div class="policy-column">${profiles.map((profile) => { const published = profile.published; return `<button class="policy-row ${profile.profileId === selectedId ? 'active' : ''}" data-policy-select="${esc(profile.profileId)}"><strong>${esc(published?.label || profile.label || profile.profileId)}</strong><small>${esc(profile.profileId)} · Publicado v${esc(published?.version || '-')} · ${(published?.access?.capabilities || []).length} funciones</small></button>` }).join('') || '<div class="empty-state"><strong>No hay perfiles disponibles</strong><span>Reintentá la carga o revisá el contrato del Control Plane.</span></div>'}</div>${record && definition ? `<section class="policy-detail profile-detail"><div class="entity-card-head"><div><span class="eyebrow">${editor ? 'Edición local' : 'Configuración publicada'}</span><h3>${esc(editor?.candidate.label || definition.label || selectedId)}</h3><small>${esc(selectedId)} · v${esc(editor?.expectedActiveVersion || definition.version)}${editor?.dirty ? ' · cambios locales' : ''}</small></div><div class="button-row"><button class="button" data-chat-context="Explicame el perfil ${esc(selectedId)}, sus funciones, runtime y límites." data-chat-label="Explicar perfil ${esc(selectedId)}">Preguntar a Pi</button>${editAction}</div></div>${editor ? `${renderProfileEditorTabs()}<section class="profile-mode-notice"><div><strong>Cambios sólo en esta ventana</strong><span>Actualizar o cancelar descarta los cambios locales. No se enviará nada hasta Aplicar.</span></div></section>${renderProfileActionFeedback()}${renderProfileDraftEditor(record, data)}` : `<div class="profile-summary-grid ${state.profileTab === 'overview' ? '' : 'profile-summary-grid--single'}">${renderPublishedProfileSection(state.profileTab, selected, definition, data)}</div>${renderProfileActionFeedback()}${renderProfileMutationOutcome(selectedId)}${renderPublishedRollbackControls(record, selectedId)}`}</section>` : ''}</div></div>`
}
function renderEnginesPane(data) { return `<div class="configuration-pane">${renderEngineCatalog(data)}</div>` }
function renderPromptsPane(data) { return `<div class="configuration-pane">${renderPromptCatalog(data)}</div>` }
function renderPresetsPane(data) { return `<div class="configuration-pane">${renderSelectionPresetDefaults(data)}</div>` }
function renderConfigurationWorkbench(data) {
  const area = CONTROL_ROOM_AREAS[state.activeView]
  const allTabs = [['profiles', 'Perfiles'], ['engines', 'Motores'], ['prompts', 'Instrucciones'], ['presets', 'Presets']]
  const tabs = state.activeView === 'behavior'
    ? [['presets', 'Presets']]
    : state.activeView === 'system'
      ? [['engines', 'Motores'], ['prompts', 'Instrucciones'], ['profiles', 'Perfiles']]
      : allTabs
  const panes = {
    profiles: renderProfilesPane,
    engines: renderEnginesPane,
    prompts: renderPromptsPane,
    presets: renderPresetsPane,
  }
  const activeTab = tabs.some(([id]) => id === state.configurationTab) ? state.configurationTab : tabs[0][0]
  const pane = panes[activeTab] || renderProfilesPane
  const showTabs = tabs.length > 1
  return `<div class="admin-workbench configuration-workbench"><div class="workbench-head"><div><span class="eyebrow">${esc(area?.label || 'Configuración')}</span><h2>${esc(area?.label || 'Configuración')}</h2><p>${esc(area?.description || 'Configuración protegida del producto.')}</p></div></div>${showTabs ? `<nav class="configuration-tabs" aria-label="Secciones de ${esc(area?.label || 'Configuración')}">${tabs.map(([id, label]) => `<button class="configuration-tab ${activeTab === id ? 'active' : ''}" data-configuration-tab="${id}" ${activeTab === id ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav>` : ''}${pane(data)}</div>`
}
function usageDimensionRows(map) {
  return Object.values(map || {}).sort((a, b) => (Number(b.totalCostUsd || 0) - Number(a.totalCostUsd || 0)) || (Number(b.requestCount || 0) - Number(a.requestCount || 0))).slice(0, 8)
}
function renderUsageBreakdown(title, rows) {
  return `<section class="usage-breakdown"><div class="panel-head"><div><span class="eyebrow">${esc(title)}</span><p>Costo y requests agregados desde telemetry persistida.</p></div></div>${rows.length ? `<table><thead><tr><th>ID</th><th>Requests</th><th>Cost</th><th>Tokens</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.id || '-')}</td><td>${esc(row.requestCount ?? 0)}</td><td>${esc(formatUsd(row.totalCostUsd))}</td><td>${esc(row.totalTokens ?? 0)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Sin datos todavía.</p>'}</section>`
}
function renderUsageWorkbench(data) {
  const summary = data.summary || data
  const today = data.today || summary.today || {}
  const last7d = data.last7d || summary.last7d || {}
  const rows = Array.isArray(data.rows) ? data.rows : []
  const coverage = data.coverage || {}
  const byEngine = usageDimensionRows(today.byEngine)
  const byPrompt = usageDimensionRows(today.byPrompt)
  const byProfile = usageDimensionRows(today.byProfile)
  const coverageText = `${coverage.recentEvents ?? 0}/${coverage.recentEventCap ?? 100} eventos recientes${coverage.eventsPartial ? ' · cobertura parcial' : ''} · prewarm ${coverage.prewarmRetentionDays ?? 7}d`
  const deviceCards = rows.map((row) => {
    const id = `${row.accountHandle || 'sin cuenta'}:${row.deviceHandle || 'device'}`
    const selected = state.selectedEntity?.kind === 'usage' && state.selectedEntity?.id === id
    const quota = row.quota || {}
    const quotaStates = [quota.managedUsage?.state, quota.transcription?.state, quota.aiActions?.state].filter(Boolean)
    const quotaStatus = quotaStates.includes('blocked') ? 'blocked' : quotaStates.includes('paused') ? 'paused' : quotaStates.includes('almost_used') ? 'almost used' : 'ok'
    const prewarm = row.prewarm?.available
      ? `${row.prewarm.successes ?? 0}/${row.prewarm.attempts ?? 0} prewarm · ${row.prewarm.failures ?? 0} fallos`
      : 'prewarm no disponible'
    return `<article class="entity-card ${selected ? 'selected' : ''}" data-select-entity data-entity-kind="usage" data-entity-id="${esc(id)}" data-entity-label="${esc(id)}"><strong>${esc(row.accountHandle || 'Sin cuenta')}</strong><small>${esc(row.deviceHandle || 'device redacted')}</small><div class="entity-meta"><span>${esc(row.sttSeconds ?? 0)}s STT</span><span>${esc(row.llmActions ?? 0)} acciones LLM</span><span>${esc(row.failures ?? 0)} fallos</span><span>quota ${esc(quotaStatus)}</span><span>${esc(prewarm)}</span></div></article>`
  }).join('')
  return `<div class="admin-workbench usage-workbench"><div class="workbench-head"><div><span class="eyebrow">Usage</span><h2>Uso, costos y budgets</h2><p>Desglose operativo redacted por cuenta/device, profile, motor y prompt.</p><small>${esc(coverageText)}</small></div><button class="button" data-chat-context="Analizá usage por engine, prompt y profile; detectá riesgos de budget." data-chat-label="Analizar usage">Analizar con Pi</button></div><div class="usage-grid big"><article class="metric"><span>Requests 7d</span><strong>${esc(last7d.requestCount ?? summary.managedRequests24h ?? '-')}</strong></article><article class="metric"><span>Cost 7d</span><strong>${esc(formatUsd(last7d.totalCostUsd ?? summary.estimatedCostUsd24h ?? 0))}</strong></article><article class="metric"><span>Requests hoy</span><strong>${esc(today.requestCount ?? summary.managedRequests24h ?? '-')}</strong></article><article class="metric"><span>Cost hoy</span><strong>${esc(formatUsd(today.totalCostUsd ?? summary.estimatedCostUsd24h ?? 0))}</strong></article></div><div class="usage-breakdown-grid">${renderUsageBreakdown('Por engine', byEngine)}${renderUsageBreakdown('Por prompt', byPrompt)}${renderUsageBreakdown('Por profile', byProfile)}</div><div class="entity-grid compact">${deviceCards || '<p class="muted">Sin devices conocidos en la ventana actual.</p>'}</div></div>`
}
function renderAdminData() {
  const box = $('#admin-data'); if (!box) return
  const data = state.adminData
  if (!data) { setHtml(box, '<div class="empty small">Cargá accounts/devices/policies/usage.</div>'); return }
  if (state.dataTab === 'accounts' && Array.isArray(data.accounts)) {
    setHtml(box, `<div class="admin-card-list">${data.accounts.map((account) => `<article class="admin-mini"><div><strong>${esc(accountDisplayName(account))}</strong><small>${esc(accountSecondaryLabel(account))}</small></div>${renderEffectivePolicyBadge(account)}<div class="mini-meta"><span>${esc(account.deviceCount)} devices</span><span>${esc(account.lastSeenAt || '')}</span></div><button class="button tiny" data-assign-account="${esc(account.accountHandle)}" data-policy="${esc(account.policyId || 'pro')}">Asignar policy</button></article>`).join('')}</div>`); return
  }
  if (state.dataTab === 'devices' && Array.isArray(data.devices)) {
    setHtml(box, `<div class="admin-card-list">${data.devices.map((device) => `<article class="admin-mini"><div><strong>${esc(device.deviceId)}</strong><small>${esc(device.installId)}</small></div><span class="policy-badge">${esc(device.policyLabel || device.policyId || 'none')}</span><div class="mini-meta"><span>${esc(device.status)}</span><span>${esc(device.lastSeenAt || '')}</span></div><button class="button tiny" data-assign-device="${esc(device.deviceId)}" data-policy="${esc(device.policyId || 'pro')}">Asignar policy</button></article>`).join('')}</div>`); return
  }
  const policies = Array.isArray(data.policies) ? data.policies : Array.isArray(data.policyOptions) ? data.policyOptions.map((id) => ({ id, label: id })) : []
  if (state.dataTab === 'policies' && policies.length) {
    setHtml(box, `<div class="policy-list">${policies.map((policy) => `<article class="mini-card"><strong>${esc(policy.label || policy.id)}</strong><small>${esc(policy.id)}</small><div class="cap-list">${(policy.capabilities || []).map((cap) => `<span>${esc(cap)}</span>`).join('') || '<span>policy</span>'}</div></article>`).join('')}</div>`); return
  }
  if (state.dataTab === 'usage') {
    const summary = data.summary || data
    const rows = Array.isArray(data.rows) ? data.rows : []
    setHtml(box, `<div class="usage-grid"><article class="metric"><span>Accounts</span><strong>${esc(summary.accounts ?? '-')}</strong></article><article class="metric"><span>Devices</span><strong>${esc(summary.activeDevices ?? summary.devices ?? '-')}</strong></article><article class="metric"><span>Requests 24h</span><strong>${esc(summary.managedRequests24h ?? '-')}</strong></article><article class="metric"><span>Cost 24h</span><strong>${esc(summary.estimatedCostUsd24h ?? '-')}</strong></article></div>${rows.length ? `<table><thead><tr><th>Account</th><th>Requests</th><th>Quota</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${esc(row.accountHandle || '-')}</td><td>${esc(row.managedRequests24h ?? '-')}</td><td>${esc(row.quotaStatus || '-')}</td></tr>`).join('')}</tbody></table>` : ''}`); return
  }
  setHtml(box, `<pre class="data-pre">${esc(pretty(data))}</pre>`)
}
function wireDynamicEvents() {
  document.querySelectorAll('[data-nav]').forEach((button) => button.onclick = () => {
    const key = button.dataset.nav
    if (key === 'chat') { state.activeView = 'chat'; renderAll(); return }
    const area = CONTROL_ROOM_AREAS[key]
    if (area) {
      state.activeView = key
      if (area.configurationTab) state.configurationTab = area.configurationTab
      clearCrossViewEntitySelection(key)
      loadAdmin(area.dataTab).catch(alertError)
      renderAll()
      return
    }
    state.activeView = key
    renderAll()
  })
  document.querySelectorAll('[data-tab]').forEach((button) => button.onclick = () => { state.dataTab = button.dataset.tab; loadAdmin(button.dataset.tab).catch(alertError) })
  document.querySelectorAll('[data-open-view]').forEach((button) => button.onclick = () => { state.activeView = button.dataset.openView; loadAdmin(button.dataset.openView).catch(alertError); renderAll() })
  document.querySelectorAll('[data-configuration-tab]').forEach((button) => button.onclick = () => { state.configurationTab = button.dataset.configurationTab; renderMessages(); wireDynamicEvents() })
  document.querySelectorAll('[data-policy-select]').forEach((button) => button.onclick = () => { state.selectedPolicyId = button.dataset.policySelect; state.profileTab = 'overview'; state.profileEditor = null; state.profileReview = false; renderMessages(); wireDynamicEvents() })
  document.querySelectorAll('[data-profile-tab]').forEach((button) => button.onclick = () => { state.profileTab = button.dataset.profileTab; renderMessages(); wireDynamicEvents() })
  document.querySelectorAll('[data-edit-profile]').forEach((button) => button.onclick = () => startProfileEdit(button.dataset.editProfile))
  document.querySelectorAll('[data-cancel-profile-edit]').forEach((button) => button.onclick = cancelProfileEdit)
  document.querySelectorAll('[data-profile-editor]').forEach((form) => {
    const sync = () => {
      updateProfileCandidate(form)
      const review = document.querySelector('[data-review-profile]')
      if (review) review.disabled = !state.profileEditor?.dirty
    }
    form.oninput = sync
    form.onchange = sync
  })
  document.querySelectorAll('[data-review-profile]').forEach((button) => button.onclick = () => { state.profileReview = true; renderMessages(); wireDynamicEvents() })
  document.querySelectorAll('[data-request-profile-apply]').forEach((button) => button.onclick = () => { state.pendingProfileMutation = { kind: 'apply', profileId: state.profileEditor?.profileId }; renderMessages(); wireDynamicEvents() })
  document.querySelectorAll('[data-confirm-profile-apply]').forEach((button) => button.onclick = () => applyProfileChanges(state.profileEditor?.profileId).catch(() => {}))
  document.querySelectorAll('[data-request-profile-rollback]').forEach((form) => form.onsubmit = (event) => {
    event.preventDefault()
    state.pendingProfileMutation = { kind: 'rollback', profileId: form.dataset.requestProfileRollback, version: Number(new FormData(form).get('version')) }
    renderMessages(); wireDynamicEvents()
  })
  document.querySelectorAll('[data-cancel-profile-mutation]').forEach((button) => button.onclick = () => {
    state.pendingProfileMutation = null
    renderMessages(); wireDynamicEvents()
  })
  document.querySelectorAll('[data-rollback-profile]').forEach((form) => form.onsubmit = (event) => { event.preventDefault(); rollbackProfile(form.dataset.rollbackProfile, form).catch(alertError) })
  document.querySelectorAll('[data-save-role]').forEach((form) => form.onsubmit = (event) => { event.preventDefault(); saveRoleBinding(form).catch(alertError) })
  document.querySelectorAll('[data-remove-role]').forEach((form) => form.onsubmit = (event) => { event.preventDefault(); removeRoleBinding(form).catch(alertError) })
  document.querySelectorAll('[data-select-entity]').forEach((card) => card.onclick = (event) => {
    if (event.target.closest('button')) return
    state.selectedEntity = { kind: card.dataset.entityKind, id: card.dataset.entityId, label: card.dataset.entityLabel || card.dataset.entityId }
    renderMessages(); renderHeader(); wireDynamicEvents()
  })
  document.querySelectorAll('[data-chat-context]').forEach((button) => button.onclick = () => { state.activeView = 'chat'; renderAll(); submitPrompt(button.dataset.chatContext, button.dataset.chatLabel || button.textContent).catch(alertError) })
  document.querySelectorAll('[data-preview-account-policy]').forEach((button) => button.onclick = () => previewAccountPolicy(button.dataset.previewAccountPolicy, button.dataset.policy))
  document.querySelectorAll('[data-apply-account-policy]').forEach((button) => button.onclick = () => applyAccountPolicy(button.dataset.applyAccountPolicy, button.dataset.policy).catch(alertError))
  document.querySelectorAll('[data-cancel-account-policy]').forEach((button) => button.onclick = () => { state.pendingAccountPolicy = null; renderMessages(); wireDynamicEvents() })
  document.querySelectorAll('[data-save-account-budget]').forEach((form) => form.onsubmit = (event) => { event.preventDefault(); saveAccountBudget(form).catch(alertError) })
  document.querySelectorAll('[data-create-group]').forEach((form) => form.onsubmit = (event) => { event.preventDefault(); createGroup(form).catch(alertError) })
  document.querySelectorAll('[data-update-account-groups]').forEach((button) => button.onclick = () => updateAccountGroups(button.dataset.updateAccountGroups, (button.dataset.groups || '').split(',').filter(Boolean)).catch(alertError))
  document.querySelectorAll('[data-save-engine]').forEach((form) => form.onsubmit = (event) => { event.preventDefault(); saveEngine(form).catch(alertError) })
  document.querySelectorAll('[data-save-prompt]').forEach((form) => form.onsubmit = (event) => { event.preventDefault(); savePrompt(form).catch(alertError) })
  document.querySelectorAll('[data-publish-selection-presets]').forEach((button) => button.onclick = () => publishSelectionPresetDefaults().catch(alertError))
  document.querySelectorAll('[data-refresh-pricing]').forEach((button) => button.onclick = () => refreshPricing().catch(alertError))
  document.querySelectorAll('[data-delete-engine]').forEach((button) => button.onclick = () => deleteEngine(button.dataset.deleteEngine).catch(alertError))
  document.querySelectorAll('[data-delete-prompt]').forEach((button) => button.onclick = () => deletePrompt(button.dataset.deletePrompt).catch(alertError))
  document.querySelectorAll('[data-assign-account]').forEach((button) => button.onclick = () => assignAccountPolicy(button.dataset.assignAccount, button.dataset.policy).catch(alertError))
  document.querySelectorAll('[data-assign-device]').forEach((button) => button.onclick = () => assignDevicePolicy(button.dataset.assignDevice, button.dataset.policy).catch(alertError))
  const refreshButtons = ['refresh-session','refresh-session-empty']
  for (const id of refreshButtons) { const el = document.getElementById(id); if (el) el.onclick = () => refreshSession().catch(alertError) }
  const rename = $('#rename-session'); if (rename) rename.onclick = () => renameSession().catch(alertError)
  const clone = $('#clone-session'); if (clone) clone.onclick = () => cloneSession().catch(alertError)
  const toggleTools = $('#toggle-tools'); if (toggleTools) toggleTools.onclick = () => { state.showAllTools = !state.showAllTools; renderActivity() }
  const name = $('#session-name'); if (name) name.oninput = (event) => { state.sessionNameDraft = event.currentTarget.value }
  document.querySelectorAll('[data-request]').forEach((card) => {
    const id = card.dataset.request
    card.querySelectorAll('[data-request-action]').forEach((button) => button.onclick = () => {
      const action = button.dataset.requestAction
      const text = card.querySelector('textarea')?.value || ''
      if (action === 'option') return respondUiRequest(id, { selected: button.dataset.value, value: button.dataset.value }).catch(alertError)
      if (action === 'respond') return respondUiRequest(id, { text, value: text }).catch(alertError)
      if (action === 'confirm') return respondUiRequest(id, { confirmed: true }).catch(alertError)
      if (action === 'reject') return respondUiRequest(id, { confirmed: false }).catch(alertError)
      return respondUiRequest(id, { cancelled: true }).catch(alertError)
    })
  })
}
function alertError(error) { alert(error.message || String(error)) }

renderShell()
refreshEnv().then(() => refreshHealth()).then(() => refreshSession()).catch(() => {})
loadAdmin('accounts').catch(() => {})
