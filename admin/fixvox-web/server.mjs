#!/usr/bin/env node
import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'
import { fileURLToPath } from 'node:url'
import { accountHandleForGoogleSubject, annotateCurrentAdminAccount, redactGoogleEmail } from './account-identity.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..', '..')
const publicDir = path.join(__dirname, 'public')
const PORT = Number(process.env.FIXVOX_ADMIN_PORT || 8787)
const HOST = process.env.FIXVOX_ADMIN_HOST || '127.0.0.1'
const PI_CWD = path.resolve(process.env.PI_CHAT_CWD || repoRoot)
const PI_BIN = process.env.PI_CHAT_BIN || 'pi'
const PI_ARGS = splitArgs(process.env.PI_CHAT_ARGS || '')
const ADMIN_BASE_URL = (process.env.FIXVOX_ADMIN_BASE_URL || 'https://auth-fixvox.jpsala.dev').replace(/\/+$/g, '')
const ADMIN_ENV = process.env.FIXVOX_ADMIN_ENV || (ADMIN_BASE_URL.includes('127.0.0.1') || ADMIN_BASE_URL.includes('localhost') ? 'local' : 'production')
const sessions = new Map()
const mockProfileDrafts = new Map()
const mockProfileHistories = new Map()
const mockRoleBindings = new Map([['jpsala@gmail.com', 'owner']])
const mockAuditRecords = []

loadEnvFile(path.join(repoRoot, 'cloud', 'fixvox-proxy', '.dev.vars'))
loadEnvFile(path.join(process.env.HOME || '', '.config', 'dictation-tauri', 'admin.env'))
loadEnvFile(path.join(process.env.HOME || '', '.config', 'dictation-tauri', 'admin-web.env'))
const WEB_TOKEN = process.env.FIXVOX_ADMIN_WEB_TOKEN || process.env.FIXVOX_ADMIN_PASSWORD || ''
const GOOGLE_CLIENT_ID = process.env.FIXVOX_ADMIN_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLOUD_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.FIXVOX_ADMIN_GOOGLE_CLIENT_SECRET || process.env.GOOGLE_CLOUD_CLIENT_SECRET || ''
const ALLOWED_EMAILS = new Set(String(process.env.FIXVOX_ADMIN_ALLOWED_EMAILS || '').split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))
const RBAC_BOOTSTRAP_OWNER_EMAIL = normalizeGoogleEmail(process.env.FIXVOX_ADMIN_BOOTSTRAP_OWNER_EMAIL || 'jpsala@gmail.com')
const PRIVILEGED_OAUTH_MAX_AGE_MS = 10 * 60 * 1000
const MOCK_MODE = process.env.FIXVOX_ADMIN_MOCK === '1'
const ADMIN_CREDENTIAL_ENV_KEYS = ['ADMIN_API_KEY', 'ADMIN_VIEW_API_KEY', 'ADMIN_EDIT_API_KEY', 'ADMIN_PUBLISH_API_KEY']

function piProcessEnv() {
  const env = { ...process.env }
  for (const key of ADMIN_CREDENTIAL_ENV_KEYS) delete env[key]
  return env
}

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
      env: piProcessEnv(),
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
    const child = spawn(PI_BIN, [...PI_ARGS, '--version'], { env: piProcessEnv(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })
    let stdout = '', stderr = ''
    const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve({ ok: false, error: 'Timeout ejecutando pi --version' }) }, 5000)
    child.stdout.on('data', (chunk) => { stdout += chunk.toString() })
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.once('error', (error) => { clearTimeout(timeout); resolve({ ok: false, error: error.message }) })
    child.once('exit', (code) => { clearTimeout(timeout); resolve(code === 0 ? { ok: true, version: stdout.trim() } : { ok: false, error: stderr.trim() || stdout.trim() }) })
  })
}

function normalizeGoogleEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Google email inválido.')
  return email
}
function redactAdminEmail(value) {
  const [local, domain] = normalizeGoogleEmail(value).split('@')
  return `${local[0] || 'u'}…@${domain}`
}
function mockAuditPayload() {
  return { schemaVersion: 1, records: mockAuditRecords.map((record) => ({ ...record })) }
}
function mockRolePayload() {
  return {
    bindings: [...mockRoleBindings.entries()].map(([email, role]) => ({ emailRedacted: redactAdminEmail(email), role })).sort((left, right) => left.emailRedacted.localeCompare(right.emailRedacted)),
  }
}
function mockSetRoleBinding(body, actorEmail) {
  const subjectEmail = normalizeGoogleEmail(body.subjectEmail)
  const role = String(body.role || '')
  if (!['viewer', 'editor', 'publisher', 'owner'].includes(role)) throw Object.assign(new Error('invalid role'), { status: 400 })
  if (mockRoleBindings.get(normalizeGoogleEmail(actorEmail)) !== 'owner') throw Object.assign(new Error('owner role required'), { status: 403 })
  if (mockRoleBindings.get(subjectEmail) === 'owner' && role !== 'owner' && [...mockRoleBindings.values()].filter((value) => value === 'owner').length === 1) throw Object.assign(new Error('cannot demote the final owner'), { status: 403 })
  mockRoleBindings.set(subjectEmail, role)
  return mockRolePayload()
}
function mockRemoveRoleBinding(body, actorEmail) {
  const subjectEmail = normalizeGoogleEmail(body.subjectEmail)
  if (mockRoleBindings.get(normalizeGoogleEmail(actorEmail)) !== 'owner') throw Object.assign(new Error('owner role required'), { status: 403 })
  if (mockRoleBindings.get(subjectEmail) === 'owner' && [...mockRoleBindings.values()].filter((value) => value === 'owner').length === 1) throw Object.assign(new Error('cannot remove the final owner'), { status: 403 })
  mockRoleBindings.delete(subjectEmail)
  return mockRolePayload()
}
function rbacPrincipalKeyForEmail(email) {
  return `arp_${crypto.createHash('sha256').update(`admin-role:${normalizeGoogleEmail(email)}`).digest('hex')}`
}
function readSession(req) {
  if (MOCK_MODE) {
    const email = normalizeGoogleEmail(process.env.FIXVOX_ADMIN_MOCK_EMAIL || 'jpsala@gmail.com')
    return {
      provider: 'google',
      email,
      name: email === RBAC_BOOTSTRAP_OWNER_EMAIL ? 'Juan Pablo Sala' : 'Mock admin',
      sub: process.env.FIXVOX_ADMIN_MOCK_SUB || (email === RBAC_BOOTSTRAP_OWNER_EMAIL ? 'mock-jpsala-google-sub' : `mock-${email}`),
      authenticatedAt: Number(process.env.FIXVOX_ADMIN_MOCK_AUTHENTICATED_AT || Date.now()),
      expiresAt: Date.now() + 86400000,
    }
  }
  const cookie = req.headers.cookie || ''
  const match = cookie.match(/(?:^|;\s*)fixvox_admin_session=([^;]+)/)
  const token = match?.[1]
  const session = token ? sessions.get(token) : null
  if (!session || session.expiresAt <= Date.now()) return null
  return session
}
function isAuthed(req) {
  return Boolean(readSession(req))
}
function setSession(res, user = { provider: 'token', email: null }) {
  const token = crypto.randomBytes(24).toString('base64url')
  sessions.set(token, { ...user, authenticatedAt: Date.now(), expiresAt: Date.now() + 1000 * 60 * 60 * 24 })
  res.setHeader('Set-Cookie', `fixvox_admin_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`)
}
function clearSession(res) {
  res.setHeader('Set-Cookie', 'fixvox_admin_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0')
}
function googleLoginEnabled() {
  return Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET)
}
function buildExternalUrl(req, pathname) {
  const proto = req.headers['x-forwarded-proto'] || (req.headers.host?.startsWith('127.0.0.1') ? 'http' : 'https')
  return `${proto}://${req.headers.host}${pathname}`
}
async function exchangeGoogleCode(req, code) {
  const redirectUri = buildExternalUrl(req, '/auth/google/callback')
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  })
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const tokenPayload = await tokenResponse.json().catch(() => ({}))
  if (!tokenResponse.ok) throw new Error(tokenPayload.error_description || tokenPayload.error || 'Google token exchange failed')
  const userResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
  })
  const user = await userResponse.json().catch(() => ({}))
  if (!userResponse.ok) throw new Error('Google userinfo failed')
  const email = String(user.email || '').toLowerCase()
  if (!email || user.email_verified === false) throw new Error('Google email no verificado')
  if (ALLOWED_EMAILS.size > 0 && !ALLOWED_EMAILS.has(email)) throw new Error('Email no autorizado para Fixvox Admin')
  return { provider: 'google', email, name: user.name || email, sub: String(user.sub || '').trim() || null }
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
function adminCredential(required) {
  const candidates = required === 'view'
    ? [process.env.ADMIN_VIEW_API_KEY, process.env.ADMIN_EDIT_API_KEY, process.env.ADMIN_API_KEY]
    : [process.env.ADMIN_EDIT_API_KEY, process.env.ADMIN_API_KEY]
  return candidates.find((candidate) => String(candidate || '').trim()) || ''
}

async function proxyAdmin(pathname, method = 'GET', body, credential = adminCredential(method === 'GET' ? 'view' : 'edit')) {
  const headers = { Authorization: `Bearer ${credential}` }
  if (body !== undefined) headers['content-type'] = 'application/json'
  const response = await fetch(`${ADMIN_BASE_URL}${pathname}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) throw Object.assign(new Error(payload?.error?.message || 'Fixvox admin request failed'), { status: response.status, payload })
  return payload
}

async function resolveServerRole(session) {
  if (MOCK_MODE) {
    const email = normalizeGoogleEmail(session.email)
    if (email === RBAC_BOOTSTRAP_OWNER_EMAIL) return 'owner'
    const configuredRole = String(process.env.FIXVOX_ADMIN_MOCK_ROLE || '').trim()
    if (['viewer', 'editor', 'publisher', 'owner'].includes(configuredRole)) return configuredRole
    return mockRoleBindings.get(email) || null
  }
  const principalKey = rbacPrincipalKeyForEmail(session.email)
  const query = new URLSearchParams({ bootstrapOwnerEmail: RBAC_BOOTSTRAP_OWNER_EMAIL, principalKey })
  const payload = await proxyAdmin(`/admin/control-plane/roles/resolve?${query}`)
  return ['viewer', 'editor', 'publisher', 'owner'].includes(payload?.role) ? payload.role : null
}
async function requireGoogleRole(req, allowedRoles) {
  const session = readSession(req)
  if (!session || session.provider !== 'google' || !session.email) {
    throw Object.assign(new Error('Verified Google authentication required.'), { status: 403 })
  }
  const role = await resolveServerRole(session)
  if (!role || !allowedRoles.includes(role)) throw Object.assign(new Error('Forbidden.'), { status: 403 })
  return { email: normalizeGoogleEmail(session.email), role }
}

async function requireRecentGoogleRole(req, allowedRoles) {
  const session = readSession(req)
  if (!session || session.provider !== 'google' || !session.email || Date.now() - Number(session.authenticatedAt || 0) > PRIVILEGED_OAUTH_MAX_AGE_MS) {
    throw Object.assign(new Error('Recent verified Google authentication required.'), { status: 403 })
  }
  return requireGoogleRole(req, allowedRoles)
}


function mockSessionState() {
  return {
    sessionId: 'mock-local-session',
    sessionName: 'fixvox-local-ui-lab',
    sessionFile: path.join(PI_CWD, '.pi', 'sessions', 'fixvox-local-ui-lab.jsonl'),
    messageCount: 12,
    pendingMessageCount: 0,
    isStreaming: false,
    isCompacting: false,
    model: { provider: 'openai', id: 'gpt-5', name: 'GPT-5' },
    followUpMode: 'auto',
    steeringMode: 'normal',
  }
}
let mockAccountsData = null
const MOCK_PROFILE_USER_SETTINGS = ['appearance.themeId', 'appearance.dockSkin', 'general.onboardingDone', 'general.showDockOnStartup', 'general.startWithWindows', 'general.preferredSurface', 'general.uiLanguage', 'hotkeys.pasteLast', 'hotkeys.quickChat', 'hotkeys.resultHistory', 'hotkeys.picker', 'hotkeys.pushToTalk', 'hotkeys.stopAndSubmit', 'hotkeys.toggleAssistantMode', 'hotkeys.togglePressEnterAfterPaste', 'hotkeys.voiceRecord', 'transcript.language', 'voice.muteOutputDuringRecording', 'voice.pressEnterAfterPaste', 'voice.showQuickChatReasoning', 'voice.showPresetReasoning', 'voice.assistantWakeWords', 'voice.assistantModeToggleWords', 'voice.commandWakeWords']
function mockPolicyLabel(policyId) {
  return policyId === 'pro' ? 'Pro' : policyId === 'alpha-full' ? 'Alpha full' : policyId === 'alpha-basic' ? 'Alpha basic' : policyId || null
}
function mockEffectiveAccount(account, data) {
  const policyOptions = new Set(data.policyOptions || [])
  const activeGroups = Array.isArray(account.groups) ? account.groups : []
  const groupMatch = activeGroups
    .map((id) => (data.groupOptions || []).find((group) => group.id === id && group.policyId && policyOptions.has(group.policyId)))
    .find(Boolean)
  if (account.policyId) {
    return { ...account, effectivePolicyId: account.policyId, effectivePolicyLabel: account.policyLabel || mockPolicyLabel(account.policyId), effectivePolicySource: 'account', matchedGroup: null }
  }
  if (groupMatch) {
    return { ...account, effectivePolicyId: groupMatch.policyId, effectivePolicyLabel: groupMatch.policyLabel || mockPolicyLabel(groupMatch.policyId), effectivePolicySource: 'group', matchedGroup: groupMatch.id }
  }
  return { ...account, effectivePolicyId: 'alpha-basic', effectivePolicyLabel: 'Alpha basic', effectivePolicySource: 'base', matchedGroup: null }
}
function defaultMockAccountsData() {
  return {
    ok: true,
    accounts: [
      { accountHandle: accountHandleForGoogleSubject('mock-jpsala-google-sub'), accountIdRedacted: 'account redacted', userRedacted: 'j…@gmail.com', userEmailRedacted: 'j…@gmail.com', provider: 'google', policyId: 'pro', policyLabel: 'Pro', variants: ['owner', 'debug-tools', 'best-voice'], segments: ['owner', 'debug-tools', 'best-voice'], groups: ['friends', 'paid'], deviceCount: 2, lastSeenAt: '2026-06-30T14:20:00.000Z', devices: [
        { deviceIdRedacted: 'dev_redacted_owner', policyId: 'pro', policyLabel: 'Pro', status: 'active', lastSeenAt: '2026-06-30T14:20:00.000Z' },
        { deviceIdRedacted: 'dev_redacted_tablet', policyId: 'pro', policyLabel: 'Pro', status: 'active', lastSeenAt: '2026-06-30T12:55:00.000Z' },
      ] },
      { accountHandle: 'acc_alpha_team', accountIdRedacted: 'account redacted', userRedacted: 'a…@gmail.com', userEmailRedacted: 'a…@gmail.com', provider: 'google', policyId: null, policyLabel: null, variants: ['friend', 'tester'], segments: ['friend', 'tester'], groups: ['private-alpha'], deviceCount: 1, lastSeenAt: '2026-06-30T13:10:00.000Z', devices: [
        { deviceIdRedacted: 'dev_redacted_laptop', policyId: 'alpha-full', policyLabel: 'Alpha full', status: 'active', lastSeenAt: '2026-06-30T13:10:00.000Z' },
      ] },
      { accountHandle: 'acc_trial_user', accountIdRedacted: 'account redacted', userRedacted: 't…@gmail.com', userEmailRedacted: 't…@gmail.com', provider: 'google', policyId: 'alpha-basic', policyLabel: 'Alpha basic', variants: ['trial'], segments: ['trial'], groups: ['trial'], deviceCount: 1, lastSeenAt: '2026-06-29T22:44:00.000Z', devices: [
        { deviceIdRedacted: 'dev_redacted_trial', policyId: 'alpha-basic', policyLabel: 'Alpha basic', status: 'active', lastSeenAt: '2026-06-29T22:44:00.000Z' },
      ] },
    ],
    nextCursor: null,
    policyOptions: ['alpha-basic', 'alpha-full', 'alpha-private', 'pro'],
    variantOptions: [
      { id: 'owner', label: 'Owner', description: 'acceso owner y cambios rápidos', preset: 'access', effects: ['adminAccess: elevated', 'safeMutations: allowedWithConfirmation'], source: 'built-in' },
      { id: 'friend', label: 'Amigo', description: 'usuario cercano para pruebas manuales', preset: 'manualTesting', effects: ['rollout: manual', 'feedbackPriority: high'], source: 'built-in' },
      { id: 'tester', label: 'Tester', description: 'recibe variantes en prueba', preset: 'manualTesting', effects: ['rollout: manual', 'feedbackPriority: high'], source: 'built-in' },
      { id: 'trial', label: 'Trial', description: 'usuario en prueba controlada', preset: 'trial', effects: ['quotaTier: trial', 'advancedSettings: limited'], source: 'built-in' },
      { id: 'debug-tools', label: 'Debug tools', description: 'muestra herramientas/debug avanzado', preset: 'debug', effects: ['showDebugTools: true', 'verboseDiagnostics: true'], source: 'built-in' },
      { id: 'best-voice', label: 'Best voice', description: 'prioriza calidad de voz y post-proceso', preset: 'voiceQuality', effects: ['voiceMode: best', 'postProcess: on'], source: 'built-in' },
      { id: 'cheap-model', label: 'Cheap model', description: 'prioriza costo bajo', preset: 'lowCost', effects: ['modelTier: low-cost', 'postProcess: minimal'], source: 'built-in' },
      { id: 'new-ui', label: 'New UI', description: 'habilita variantes nuevas de UI', preset: 'newUi', effects: ['uiVariant: next', 'showAdvancedSettings: true'], source: 'built-in' },
      { id: 'private-alpha', label: 'Private alpha', description: 'features alpha privadas', preset: 'privateAlpha', effects: ['alphaFeatures: private', 'requiresManualReview: true'], source: 'built-in' },
    ],
    availableSegments: ['owner', 'friend', 'tester', 'trial', 'debug-tools', 'best-voice', 'cheap-model', 'new-ui', 'private-alpha'],
    groupOptions: [
      { id: 'friends', label: 'Friends', description: 'Usuarios cercanos y amigos con feedback manual.', policyId: 'pro', policyLabel: 'Pro', source: 'built-in' },
      { id: 'private-alpha', label: 'Private alpha', description: 'Usuarios en alpha privada con acceso controlado.', policyId: 'alpha-full', policyLabel: 'Alpha full', source: 'built-in' },
      { id: 'trial', label: 'Trial', description: 'Usuarios de prueba con límites bajos.', policyId: 'alpha-basic', policyLabel: 'Alpha basic', source: 'built-in' },
      { id: 'paid', label: 'Paid', description: 'Usuarios pagos o habilitados comercialmente.', policyId: 'pro', policyLabel: 'Pro', source: 'built-in' },
    ],
    engineOptions: [
      { id: 'stt-off', label: 'STT off', kind: 'transcription', tier: 'off', provider: 'none', model: 'off', notes: 'No usa transcripción managed.', promptKey: 'none', promptSummary: 'Sin prompt.', source: 'built-in' },
      { id: 'stt-groq-whisper-turbo', label: 'Groq Whisper Turbo', kind: 'transcription', tier: 'balanced', provider: 'groq', model: 'whisper-large-v3-turbo', notes: 'Default histórico de Fixvox: mejor balance calidad/precio/velocidad para dictado managed.', promptKey: 'transcriptBase', promptSummary: 'Español rioplatense técnico; conserva comandos, URLs, modelos, archivos y puntuación hablada literal.', source: 'built-in' },
      { id: 'postprocess-off', label: 'Postprocess off', kind: 'postprocess', tier: 'off', provider: 'none', model: 'off', notes: 'Sin post-proceso managed.', promptKey: 'none', promptSummary: 'Sin prompt.', source: 'built-in' },
      { id: 'postprocess-groq-gpt-oss-120b', label: 'Groq GPT-OSS 120B post', kind: 'postprocess', tier: 'balanced', provider: 'groq', model: 'openai/gpt-oss-120b', notes: 'Default histórico de post-proceso: buena calidad/precio/velocidad para cleanup bilingüe.', promptKey: 'postProcessBase', promptSummary: 'Limpia dictado español/bilingüe con cambios mínimos; reconstruye tokens técnicos y listas cuando está claro.', source: 'built-in' },
      { id: 'transform-off', label: 'Transform off', kind: 'selectionTransform', tier: 'off', provider: 'none', model: 'off', notes: 'Sin transformación de selección managed.', promptKey: 'none', promptSummary: 'Sin prompt.', source: 'built-in' },
      { id: 'transform-groq-llama-70b', label: 'Groq Llama 70B transform', kind: 'selectionTransform', tier: 'balanced', provider: 'groq', model: 'llama-3.3-70b-versatile', notes: 'Default histórico para traducción/transformación de selección.', promptKey: 'selectionTransformBase', promptSummary: 'Reescribe el texto seleccionado según la instrucción del usuario preservando intención y formato.', source: 'built-in' },
      { id: 'translate-groq-llama-70b', label: 'Groq Llama 70B translate', kind: 'selectionTransform', tier: 'balanced', provider: 'groq', model: 'llama-3.3-70b-versatile', notes: 'Ruta histórica de traducción natural/fiel.', promptKey: 'translateBase', promptSummary: 'Traduce de forma fiel y natural, preservando significado, tono e intención.', source: 'built-in' },
      { id: 'assistant-groq-8b-instant', label: 'Groq 8B assistant', kind: 'postprocess', tier: 'cheap', provider: 'groq', model: 'llama-3.1-8b-instant', notes: 'Ruta histórica barata/rápida para assistant/default targets; disponible para profiles económicos.', promptKey: 'assistant.quickChat', promptSummary: 'Prompt base vacío en política actual; útil para respuestas rápidas de bajo costo.', source: 'built-in' },
      { id: 'postprocess-openrouter-premium', label: 'OpenRouter post premium', kind: 'postprocess', tier: 'premium', provider: 'openrouter', model: 'anthropic/claude-sonnet-4', notes: 'Opción premium editable para cuentas habilitadas; no era el default histórico.', promptKey: 'postProcessBase', promptSummary: 'Mismo prompt de cleanup; modelo premium para mayor calidad cuando justifique costo.', source: 'built-in' },
      { id: 'transform-openrouter-premium', label: 'OpenRouter transform premium', kind: 'selectionTransform', tier: 'premium', provider: 'openrouter', model: 'anthropic/claude-sonnet-4', notes: 'Opción premium editable para transformación/traducción avanzada; no era el default histórico.', promptKey: 'selectionTransformBase', promptSummary: 'Mismo prompt de transformación; modelo premium para casos habilitados.', source: 'built-in' },
    ],
    promptOptions: [
      { id: 'none', label: 'Sin prompt', kind: 'assistant', version: 'v1', summary: 'No aplica prompt de sistema.', content: '', source: 'built-in' },
      { id: 'transcriptBase', label: 'Transcript base', kind: 'transcription', version: 'v1', summary: 'Español rioplatense técnico; conserva comandos, URLs, modelos, archivos y puntuación hablada literal.', content: 'Transcribe el audio con precisión. Mantén español rioplatense cuando corresponda, conserva términos técnicos, nombres de modelos, URLs, comandos, paths y puntuación hablada cuando sea claramente intencional.', source: 'built-in' },
      { id: 'postProcessBase', label: 'Post-process base', kind: 'postprocess', version: 'v1', summary: 'Limpia dictado español/bilingüe con cambios mínimos.', content: 'Limpia el dictado manteniendo el significado. Corrige errores evidentes de STT, reconstruye términos técnicos, puntuación y listas cuando sea claro. No agregues explicaciones ni cambies intención.', source: 'built-in' },
      { id: 'selectionTransformBase', label: 'Selection transform base', kind: 'selectionTransform', version: 'v1', summary: 'Reescribe texto seleccionado según instrucción.', content: 'Aplica la instrucción del usuario al texto seleccionado. Devuelve solo el texto final transformado. Preserva formato, intención y tono salvo que la instrucción pida lo contrario.', source: 'built-in' },
      { id: 'translateBase', label: 'Translate base', kind: 'selectionTransform', version: 'v1', summary: 'Traduce de forma fiel y natural.', content: 'Traduce el texto de forma fiel y natural. Conserva significado, tono, formato y términos técnicos. Devuelve solo la traducción.', source: 'built-in' },
      { id: 'assistant.quickChat', label: 'Assistant quick chat', kind: 'assistant', version: 'v1', summary: 'Respuesta rápida de bajo costo.', content: 'Respondé de forma breve, útil y directa.', source: 'built-in' },
    ],
    policyVariants: { pro: ['best-voice'], 'alpha-full': ['tester'] },
    policyEngines: {
      pro: { transcription: 'stt-groq-whisper-turbo', postprocess: 'postprocess-groq-gpt-oss-120b', selectionTransform: 'transform-groq-llama-70b' },
      'alpha-full': { transcription: 'stt-groq-whisper-turbo', postprocess: 'postprocess-groq-gpt-oss-120b', selectionTransform: 'transform-groq-llama-70b' },
      'alpha-basic': { transcription: 'stt-groq-whisper-turbo', postprocess: 'postprocess-off', selectionTransform: 'transform-off' },
    },
    policyBudgets: {
      pro: { dailyUsd: 5, monthlyUsd: 50, mode: 'warn' },
      'alpha-full': { dailyUsd: 1, monthlyUsd: 10, mode: 'block' },
      'alpha-basic': { dailyUsd: 0.25, monthlyUsd: 2, mode: 'block' },
    },
    redacted: true,
  }
}
function mockAccounts() {
  mockAccountsData ||= defaultMockAccountsData()
  const data = JSON.parse(JSON.stringify(mockAccountsData))
  data.accounts = data.accounts.map((account) => mockEffectiveAccount(account, data))
  return data
}
function mockAssignAccountPolicy(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const accountHandle = String(payload.accountHandle || '')
  const policyId = String(payload.policyId || '')
  const policyLabel = String(payload.policyLabel || policyId)
  const account = mockAccountsData.accounts.find((item) => item.accountHandle === accountHandle)
  if (!account || !policyId) return { ok: false, error: 'mock account/policy not found' }
  account.policyId = policyId
  account.policyLabel = policyLabel
  account.devices = account.devices.map((device) => ({ ...device, policyId, policyLabel }))
  return mockAccounts()
}
function mockAssignAccountSegments(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const accountHandle = String(payload.accountHandle || '')
  const available = new Set(mockAccountsData.availableSegments || [])
  const rawVariants = Array.isArray(payload.variants) ? payload.variants : payload.segments
  const segments = Array.isArray(rawVariants) ? rawVariants.map((item) => String(item).trim()).filter((item) => item && available.has(item)) : []
  const account = mockAccountsData.accounts.find((item) => item.accountHandle === accountHandle)
  if (!account) return { ok: false, error: 'mock account not found' }
  account.variants = [...new Set(segments)]
  account.segments = account.variants
  return mockAccounts()
}
function mockAssignAccountBudget(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const accountHandle = String(payload.accountHandle || '')
  const account = mockAccountsData.accounts.find((item) => item.accountHandle === accountHandle)
  if (!account) return { ok: false, error: 'mock account not found' }
  const budget = payload.budget || {}
  account.accountBudget = {
    dailyUsd: budget.dailyUsd === '' || budget.dailyUsd == null ? null : Number(budget.dailyUsd),
    monthlyUsd: budget.monthlyUsd === '' || budget.monthlyUsd == null ? null : Number(budget.monthlyUsd),
    mode: budget.mode === 'warn' ? 'warn' : 'block',
  }
  return mockAccounts()
}
function mockAssignAccountGroups(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const accountHandle = String(payload.accountHandle || '')
  const account = mockAccountsData.accounts.find((item) => item.accountHandle === accountHandle)
  if (!account) return { ok: false, error: 'mock account not found' }
  const allowed = new Set((mockAccountsData.groupOptions || []).map((item) => item.id))
  const groups = Array.isArray(payload.groups) ? payload.groups.map((item) => String(item).trim()).filter((item) => item && allowed.has(item)) : []
  account.groups = [...new Set(groups)]
  return mockAccounts()
}
function mockCreateGroup(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const id = slugVariant(payload.id || payload.label)
  const label = String(payload.label || '').trim()
  if (!id || !label) return { ok: false, error: 'group label/id required' }
  const policyId = String(payload.policyId || '').trim() || null
  const policyLabel = policyId ? mockPolicyLabel(policyId) : null
  const group = { id, label, description: String(payload.description || 'Grupo personalizado'), policyId, policyLabel, source: 'custom' }
  mockAccountsData.groupOptions = [...(mockAccountsData.groupOptions || []).filter((item) => item.id !== id), group]
  return { ok: true, group, groupOptions: mockAccountsData.groupOptions }
}
function slugVariant(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
}
function variantEffectsForPreset(preset) {
  return {
    access: ['adminAccess: elevated', 'safeMutations: allowedWithConfirmation'],
    manualTesting: ['rollout: manual', 'feedbackPriority: high'],
    debug: ['showDebugTools: true', 'verboseDiagnostics: true'],
    voiceQuality: ['voiceMode: best', 'postProcess: on'],
    lowCost: ['modelTier: low-cost', 'postProcess: minimal'],
    newUi: ['uiVariant: next', 'showAdvancedSettings: true'],
    privateAlpha: ['alphaFeatures: private', 'requiresManualReview: true'],
    trial: ['quotaTier: trial', 'advancedSettings: limited'],
    custom: ['customOverride: define-before-production'],
  }[preset] || ['customOverride: define-before-production']
}
function mockCreateAccountVariant(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const label = String(payload.label || '').trim()
  const preset = String(payload.preset || 'custom').trim() || 'custom'
  const description = String(payload.description || '').trim() || 'variante personalizada'
  const id = slugVariant(payload.id || label)
  if (!label || !id) return { ok: false, error: 'variant label required' }
  const variant = { id, label, description, preset, effects: variantEffectsForPreset(preset), source: 'custom' }
  mockAccountsData.variantOptions = [...mockAccountsData.variantOptions.filter((item) => item.id !== id), variant]
  mockAccountsData.availableSegments = mockAccountsData.variantOptions.map((item) => item.id)
  return { ok: true, variant, variantOptions: mockAccountsData.variantOptions, availableSegments: mockAccountsData.availableSegments }
}
function mockDeleteAccountVariant(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const id = slugVariant(payload.id)
  if (!id) return { ok: false, error: 'variant id required' }
  mockAccountsData.variantOptions = mockAccountsData.variantOptions.filter((item) => item.id !== id)
  mockAccountsData.availableSegments = mockAccountsData.variantOptions.map((item) => item.id)
  mockAccountsData.accounts = mockAccountsData.accounts.map((account) => ({
    ...account,
    variants: (account.variants || account.segments || []).filter((item) => item !== id),
    segments: (account.variants || account.segments || []).filter((item) => item !== id),
  }))
  mockAccountsData.policyVariants = Object.fromEntries(Object.entries(mockAccountsData.policyVariants || {}).map(([policyId, variants]) => [policyId, variants.filter((item) => item !== id)]).filter(([, variants]) => variants.length > 0))
  return { ok: true, variant: { id }, variantOptions: mockAccountsData.variantOptions, availableSegments: mockAccountsData.availableSegments }
}
function mockAssignPolicyVariants(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const policyId = String(payload.policyId || '').trim()
  const allowed = new Set(mockAccountsData.availableSegments || [])
  const variants = Array.isArray(payload.variants) ? payload.variants.map((item) => String(item).trim()).filter((item) => allowed.has(item)) : []
  if (!policyId) return { ok: false, error: 'policyId required' }
  mockAccountsData.policyVariants = { ...(mockAccountsData.policyVariants || {}) }
  if (variants.length) mockAccountsData.policyVariants[policyId] = [...new Set(variants)]
  else delete mockAccountsData.policyVariants[policyId]
  return { ok: true, variantOptions: mockAccountsData.variantOptions, availableSegments: mockAccountsData.availableSegments, policyVariants: mockAccountsData.policyVariants, policyEngines: mockAccountsData.policyEngines || {} }
}
function mockAssignSelectionPresetDefaults(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const selectionPresets = payload.selectionPresets && typeof payload.selectionPresets === 'object' ? payload.selectionPresets : {}
  const rawItems = Array.isArray(payload.items) ? payload.items : Array.isArray(selectionPresets.items) ? selectionPresets.items : []
  const items = rawItems.map((item) => ({
    id: String(item.id || '').trim(),
    label: String(item.label || item.name || item.id || 'Preset').trim(),
    promptId: String(item.promptId || item.prompt_id || (item.id ? `preset.${item.id}` : '')).trim(),
    hotkey: String(item.hotkey || ''),
    pickerKey: String(item.pickerKey || item.picker_key || ''),
    provider: item.provider == null ? null : String(item.provider),
    model: item.model == null ? null : String(item.model),
    enabled: item.enabled === undefined ? true : Boolean(item.enabled),
    confirm: Boolean(item.confirm),
    promptContent: String(item.promptContent || item.prompt_content || ''),
  })).filter((item) => item.id && item.promptId)
  if (!items.length) return { ok: false, error: 'selection preset defaults require items' }
  const promptIds = new Set(items.map((item) => item.promptId))
  mockAccountsData.promptOptions = [
    ...(mockAccountsData.promptOptions || []).filter((prompt) => !promptIds.has(prompt.id)),
    ...items.filter((item) => item.promptContent).map((item) => ({
      id: item.promptId,
      label: `Preset - ${item.label}`,
      kind: 'selectionTransform',
      version: 'v1',
      summary: `Selection preset default synced from ${item.id}.`,
      content: item.promptContent,
      source: 'custom',
    })),
  ]
  mockAccountsData.policy ||= {}
  mockAccountsData.policy.userSettingsDefaults ||= {}
  mockAccountsData.policy.userSettingsDefaults.selectionPresets = { schemaVersion: 1, source: payload.source || selectionPresets.source || 'fixvox-cloud-admin', items }
  return { ok: true, selectionPresets: mockAccountsData.policy.userSettingsDefaults.selectionPresets, policy: mockAccountsData.policy, variantOptions: mockAccountsData.variantOptions || [], availableSegments: mockAccountsData.availableSegments || [], engineOptions: mockAccountsData.engineOptions || [], promptOptions: mockAccountsData.promptOptions || [], policyVariants: mockAccountsData.policyVariants || {}, policyEngines: mockAccountsData.policyEngines || {}, policyBudgets: mockAccountsData.policyBudgets || {} }
}
function mockSaveEngine(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const id = slugVariant(payload.id || payload.label)
  const label = String(payload.label || '').trim()
  const kind = ['transcription', 'postprocess', 'selectionTransform'].includes(String(payload.kind)) ? String(payload.kind) : ''
  if (!id || !label || !kind) return { ok: false, error: 'engine label/kind required' }
  const engine = {
    id,
    label,
    kind,
    tier: String(payload.tier || 'custom'),
    provider: String(payload.provider || 'custom'),
    model: String(payload.model || 'custom'),
    notes: String(payload.notes || 'motor personalizado'),
    promptKey: String(payload.promptKey || 'custom'),
    promptSummary: String(payload.promptSummary || 'Prompt editable/custom.'),
    source: 'custom',
  }
  mockAccountsData.engineOptions = [...(mockAccountsData.engineOptions || []).filter((item) => item.id !== id), engine]
  return { ok: true, engine, engineOptions: mockAccountsData.engineOptions, promptOptions: mockAccountsData.promptOptions || [], policyEngines: mockAccountsData.policyEngines || {}, policyVariants: mockAccountsData.policyVariants || {}, variantOptions: mockAccountsData.variantOptions || [], availableSegments: mockAccountsData.availableSegments || [] }
}
function mockDeleteEngine(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const id = slugVariant(payload.id)
  if (!id) return { ok: false, error: 'engine id required' }
  mockAccountsData.engineOptions = (mockAccountsData.engineOptions || []).filter((item) => item.id !== id)
  return { ok: true, engine: { id }, engineOptions: mockAccountsData.engineOptions, promptOptions: mockAccountsData.promptOptions || [], policyEngines: mockAccountsData.policyEngines || {}, policyVariants: mockAccountsData.policyVariants || {}, variantOptions: mockAccountsData.variantOptions || [], availableSegments: mockAccountsData.availableSegments || [] }
}
function mockSavePrompt(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const id = String(payload.id || payload.label || '').trim()
  const label = String(payload.label || '').trim()
  const kind = ['transcription', 'postprocess', 'selectionTransform', 'assistant'].includes(String(payload.kind)) ? String(payload.kind) : 'postprocess'
  if (!id || !label) return { ok: false, error: 'prompt id/label required' }
  const prompt = { id, label, kind, version: String(payload.version || 'v1'), summary: String(payload.summary || 'Prompt personalizado.'), content: String(payload.content || ''), source: 'custom' }
  mockAccountsData.promptOptions = [...(mockAccountsData.promptOptions || []).filter((item) => item.id !== id), prompt]
  return { ok: true, prompt, promptOptions: mockAccountsData.promptOptions, engineOptions: mockAccountsData.engineOptions || [], policyEngines: mockAccountsData.policyEngines || {}, policyVariants: mockAccountsData.policyVariants || {}, variantOptions: mockAccountsData.variantOptions || [], availableSegments: mockAccountsData.availableSegments || [] }
}
function mockDeletePrompt(payload) {
  mockAccountsData ||= defaultMockAccountsData()
  const id = String(payload.id || '').trim()
  if (!id) return { ok: false, error: 'prompt id required' }
  mockAccountsData.promptOptions = (mockAccountsData.promptOptions || []).filter((item) => item.id !== id)
  return { ok: true, prompt: { id }, promptOptions: mockAccountsData.promptOptions, engineOptions: mockAccountsData.engineOptions || [], policyEngines: mockAccountsData.policyEngines || {}, policyVariants: mockAccountsData.policyVariants || {}, variantOptions: mockAccountsData.variantOptions || [], availableSegments: mockAccountsData.availableSegments || [] }
}
function mockDevices() {
  return {
    ok: true,
    devices: [
      { deviceId: 'dev_redacted_owner', installId: 'install_redacted_a', policyId: 'pro', policyLabel: 'Pro', status: 'active', lastSeenAt: '2026-06-30T14:20:00.000Z' },
      { deviceId: 'dev_redacted_laptop', installId: 'install_redacted_b', policyId: 'alpha-full', policyLabel: 'Alpha full', status: 'active', lastSeenAt: '2026-06-30T13:10:00.000Z' },
    ],
    policyOptions: ['alpha-basic', 'alpha-full', 'alpha-private', 'pro'],
    redacted: true,
  }
}
function mockPricingSnapshot() {
  mockAccountsData ||= defaultMockAccountsData()
  const targets = (mockAccountsData.engineOptions || [])
    .filter((engine) => engine.provider && engine.provider !== 'none' && engine.model && engine.model !== 'off')
    .map((engine) => ({ provider: engine.provider, model: engine.model }))
  const uniqueTargets = [...new Map(targets.map((target) => [`${target.provider}:${target.model}`, target])).values()]
  return {
    watchlist: { required: uniqueTargets, manual: [], merged: uniqueTargets },
    pricing: uniqueTargets.map((target) => ({
      provider: target.provider,
      model: target.model,
      pricingSource: target.provider === 'groq' ? 'mock-groq-pricing' : 'mock-openrouter-pricing',
      checkedAt: new Date('2026-06-30T20:00:00.000Z').toISOString(),
      status: 'live',
      unitType: target.provider === 'groq' && target.model.includes('whisper') ? 'per_hour' : 'per_1m_tokens',
      currency: 'USD',
      inputPrice: target.model.includes('gpt-oss') ? '0.15' : target.model.includes('llama-3.1-8b') ? '0.05' : target.provider === 'openrouter' ? '3.00' : null,
      outputPrice: target.model.includes('gpt-oss') ? '0.75' : target.model.includes('llama-3.1-8b') ? '0.08' : target.provider === 'openrouter' ? '15.00' : null,
      audioInputPrice: target.model.includes('whisper') ? '0.04' : null,
      audioOutputPrice: null,
      requestPrice: null,
      rawPriceJson: null,
    })),
  }
}
function mockPolicies() {
  const accounts = mockAccounts()
  const pricing = mockPricingSnapshot()
  const payload = {
    ok: true,
    variantOptions: accounts.variantOptions,
    availableSegments: accounts.availableSegments,
    policyVariants: accounts.policyVariants || {},
    policyEngines: accounts.policyEngines || {},
    policyBudgets: accounts.policyBudgets || {},
    engineOptions: accounts.engineOptions || [],
    promptOptions: accounts.promptOptions || [],
    pricing: pricing.pricing,
    pricingWatchlist: pricing.watchlist,
    profileOptions: [
      { policyId: 'alpha-basic', policyLabel: 'Alpha Basic', source: 'built-in', capabilities: ['dictation', 'postprocess', 'managed_stt', 'managed_llm'], profiles: { uiProfile: 'alpha-basic', capabilityProfile: 'basic', quotaProfile: 'alpha-basic', llmProfile: 'basic', settingsDefaultsProfile: 'alpha-lulu' } },
      { policyId: 'alpha-full', policyLabel: 'Alpha Full', source: 'built-in', capabilities: ['translate', 'dictation', 'postprocess', 'selection_transform', 'assistant_actions', 'custom_prompts', 'advanced_settings', 'managed_stt', 'managed_llm'], profiles: { uiProfile: 'alpha-full', capabilityProfile: 'full', quotaProfile: 'alpha-full', llmProfile: 'full', settingsDefaultsProfile: 'alpha-lulu' } },
      { policyId: 'power-admin', policyLabel: 'Power Admin', source: 'built-in', capabilities: ['translate', 'dictation', 'postprocess', 'selection_transform', 'assistant_actions', 'custom_prompts', 'advanced_settings', 'debug_tools', 'managed_stt', 'managed_llm', 'admin_settings'], profiles: { uiProfile: 'alpha-full', capabilityProfile: 'power', quotaProfile: 'pro-unlimited', llmProfile: 'pro-best-voice', settingsDefaultsProfile: 'alpha-lulu' } },
      { policyId: 'pro', policyLabel: 'Pro', source: 'built-in', capabilities: ['translate', 'dictation', 'postprocess', 'selection_transform', 'assistant_actions', 'custom_prompts', 'advanced_settings', 'managed_stt', 'managed_llm'], profiles: { uiProfile: 'alpha-full', capabilityProfile: 'full', quotaProfile: 'pro-unlimited', llmProfile: 'pro-best-voice', settingsDefaultsProfile: 'alpha-lulu' } },
    ],
    policies: [
      { id: 'pro', label: 'Pro', capabilities: ['dictation', 'managed_stt', 'advanced_settings'] },
      { id: 'alpha-full', label: 'Alpha full', capabilities: ['dictation', 'managed_stt'] },
      { id: 'alpha-basic', label: 'Alpha basic', capabilities: ['dictation'] },
    ],
    redacted: true,
  }
  payload.profileVersions = payload.profileOptions.map((profile) => {
    const engines = payload.policyEngines[profile.policyId] || {}
    const published = {
      schemaVersion: 1,
      profileId: profile.policyId,
      label: profile.policyLabel,
      version: 1,
      status: 'published',
      access: { capabilities: profile.capabilities },
      runtime: {
        transcription: { engineId: engines.transcription || 'stt-groq-whisper-turbo', promptId: 'transcriptBase' },
        postprocess: { engineId: engines.postprocess || (profile.policyId === 'alpha-basic' ? 'postprocess-off' : 'postprocess-groq-gpt-oss-120b'), promptId: profile.policyId === 'alpha-basic' ? 'none' : 'postProcessBase' },
        selectionTransform: { engineId: engines.selectionTransform || (profile.policyId === 'alpha-basic' ? 'transform-off' : 'transform-groq-llama-70b'), promptId: profile.policyId === 'alpha-basic' ? 'none' : 'selectionTransformBase' },
      },
      limits: { ...(payload.policyBudgets[profile.policyId] || { mode: 'block' }), quotaProfile: profile.profiles.quotaProfile || undefined },
      userControls: Object.fromEntries(MOCK_PROFILE_USER_SETTINGS.map((setting) => [setting, 'editable'])),
      defaults: { 'general.showDockOnStartup': false, 'voice.pressEnterAfterPaste': false },
    }
    const history = mockProfileHistories.get(profile.policyId) || [published]
    const active = history.at(-1) || null
    const draft = mockProfileDrafts.get(profile.policyId) || null
    return { profileId: profile.policyId, label: draft?.label || active?.label || profile.policyLabel, published: active, draft, history }
  })
  for (const profileId of new Set([...mockProfileDrafts.keys(), ...mockProfileHistories.keys()])) {
    if (payload.profileVersions.some((profile) => profile.profileId === profileId)) continue
    const draft = mockProfileDrafts.get(profileId) || null
    const history = mockProfileHistories.get(profileId) || []
    const active = history.at(-1) || null
    payload.profileVersions.push({ profileId, label: draft?.label || active?.label || profileId, published: active, draft, history })
  }
  return payload
}
function mockCreateProfileDraft(body) {
  const source = mockPolicies().profileVersions.find((profile) => profile.profileId === body.profileId)
  const draftProfileId = String(body.draftProfileId || body.profileId || '').trim()
  if (!source || !draftProfileId) throw Object.assign(new Error('profile not found'), { status: 404 })
  const existing = mockProfileDrafts.get(draftProfileId)
  if (existing) return mockPolicies().profileVersions.find((profile) => profile.profileId === draftProfileId)
  const history = mockProfileHistories.get(draftProfileId) || []
  const sourceDefinition = source.published || source.draft
  const draft = {
    ...structuredClone(sourceDefinition),
    profileId: draftProfileId,
    label: String(body.label || source.label).trim(),
    version: history.length ? Math.max(...history.map((version) => version.version)) + 1 : draftProfileId === source.profileId && source.published ? source.published.version + 1 : 1,
    status: 'draft',
    ...(source.published?.version ? { basedOnVersion: source.published.version } : {}),
  }
  mockProfileDrafts.set(draftProfileId, draft)
  return mockPolicies().profileVersions.find((profile) => profile.profileId === draftProfileId)
}
function mockSaveProfileDraft(body) {
  const existing = mockProfileDrafts.get(body.profileId)
  if (!existing || !body.definition) throw Object.assign(new Error('profile draft not found'), { status: 404 })
  const draft = { ...structuredClone(body.definition), profileId: body.profileId, version: existing.version, status: 'draft', ...(existing.basedOnVersion ? { basedOnVersion: existing.basedOnVersion } : {}) }
  mockProfileDrafts.set(body.profileId, draft)
  return mockPolicies().profileVersions.find((profile) => profile.profileId === body.profileId)
}
function mockDiscardProfileDraft(body) {
  const profileId = String(body.profileId || '').trim()
  const draft = mockProfileDrafts.get(profileId)
  if (!draft) throw Object.assign(new Error('profile draft not found'), { status: 404 })
  if (body.expectedDraftVersion !== draft.version) throw Object.assign(new Error('The profile version no longer matches this confirmation.'), { status: 409 })
  if (body.confirmation !== `DISCARD ${profileId} v${draft.version}`) throw Object.assign(new Error('invalid discard confirmation'), { status: 400 })
  mockProfileDrafts.delete(profileId)
  return { ok: true, profileId, discardedDraftVersion: draft.version, publishedVersion: mockProfileRecord(profileId)?.published?.version ?? null }
}
function mockPreviewProfile(query) {
  const profileId = String(query.get('profileId') || '').trim()
  const record = mockPolicies().profileVersions.find((profile) => profile.profileId === profileId)
  if (!record?.draft) throw Object.assign(new Error('profile draft not found'), { status: 404 })
  const before = record.published || {}
  const after = record.draft
  const diff = []
  for (const [operation, draftOperation] of Object.entries(after.runtime || {})) {
    const previousOperation = before.runtime?.[operation] || {}
    if (previousOperation.engineId !== draftOperation.engineId) diff.push({ section: 'runtime', path: `runtime.${operation}.engineId`, before: previousOperation.engineId, after: draftOperation.engineId })
    if (previousOperation.promptId !== draftOperation.promptId) diff.push({ section: 'runtime', path: `runtime.${operation}.promptId`, before: previousOperation.promptId, after: draftOperation.promptId })
  }
  const devices = mockDevices().devices.filter((device) => device.policyId === profileId)
  return {
    profileId,
    draftVersion: after.version,
    activeVersion: record.published?.version || null,
    diff,
    warnings: [],
    impact: { accounts: 0, devices: devices.length, groups: mockAccounts().groupOptions.filter((group) => group.policyId === profileId).length },
    selectedTarget: { accountHandle: query.get('accountHandle') || null, deviceId: query.get('deviceId') || null, profileId, policySource: query.get('deviceId') ? 'device' : query.get('accountHandle') ? 'account' : null },
    pricing: { availability: 'available', cachedAt: new Date('2026-06-30T20:00:00.000Z').toISOString(), targets: [] },
  }
}
function mockProfileRecord(profileId) {
  return mockPolicies().profileVersions.find((profile) => profile.profileId === profileId) || null
}
function mockPublishProfile(body) {
  const profile = mockProfileRecord(String(body.profileId || '').trim())
  const draft = mockProfileDrafts.get(String(body.profileId || '').trim())
  if (!profile || !draft) throw Object.assign(new Error('profile draft not found'), { status: 404 })
  if (body.expectedActiveVersion !== (profile.published?.version ?? null) || body.expectedDraftVersion !== draft.version) throw Object.assign(new Error('The profile version no longer matches this confirmation.'), { status: 409 })
  if (body.confirmation !== `PUBLISH ${profile.profileId} v${draft.version}`) throw Object.assign(new Error('invalid publish confirmation'), { status: 400 })
  const nextVersion = Math.max(0, ...profile.history.map((version) => version.version)) + 1
  const published = { ...structuredClone(draft), version: nextVersion, status: 'published' }
  mockProfileHistories.set(profile.profileId, [...profile.history, published])
  mockProfileDrafts.delete(profile.profileId)
  mockAuditRecords.push({ actor: String(body.actorKey || 'worker-publish-credential'), action: 'publish', profileId: profile.profileId, sourceVersion: profile.published?.version ?? null, targetVersion: nextVersion, resultingVersion: nextVersion, requestedVersion: null, timestamp: new Date().toISOString(), result: 'success' })
  return mockProfileRecord(profile.profileId)
}
function mockRollbackProfile(body) {
  const profile = mockProfileRecord(String(body.profileId || '').trim())
  const version = Number(body.version)
  const target = profile?.history.find((candidate) => candidate.version === version)
  if (!profile || !target) throw Object.assign(new Error('profile version not found'), { status: 404 })
  if (body.expectedActiveVersion !== (profile.published?.version ?? null)) throw Object.assign(new Error('The profile version no longer matches this confirmation.'), { status: 409 })
  if (body.confirmation !== `ROLLBACK ${profile.profileId} to v${version}`) throw Object.assign(new Error('invalid rollback confirmation'), { status: 400 })
  const nextVersion = Math.max(...profile.history.map((candidate) => candidate.version)) + 1
  const published = { ...structuredClone(target), version: nextVersion, status: 'published', basedOnVersion: version }
  mockProfileHistories.set(profile.profileId, [...profile.history, published])
  mockProfileDrafts.delete(profile.profileId)
  mockAuditRecords.push({ actor: String(body.actorKey || 'worker-publish-credential'), action: 'rollback', profileId: profile.profileId, sourceVersion: profile.published?.version ?? null, targetVersion: version, resultingVersion: nextVersion, requestedVersion: version, timestamp: new Date().toISOString(), result: 'success' })
  return mockProfileRecord(profile.profileId)
}
function mockUsage() {
  const today = {
    day: new Date().toISOString().slice(0, 10),
    requestCount: 18,
    totalCostUsd: 0.42,
    totalTokens: 3200,
    byEngine: {
      'stt-groq-whisper-turbo': { id: 'stt-groq-whisper-turbo', requestCount: 12, totalCostUsd: 0.18, totalTokens: 0 },
      'postprocess-groq-gpt-oss-120b': { id: 'postprocess-groq-gpt-oss-120b', requestCount: 6, totalCostUsd: 0.24, totalTokens: 3200 },
    },
    byPrompt: {
      transcriptBase: { id: 'transcriptBase', requestCount: 12, totalCostUsd: 0.18, totalTokens: 0 },
      postProcessBase: { id: 'postProcessBase', requestCount: 6, totalCostUsd: 0.24, totalTokens: 3200 },
    },
    byProfile: {
      pro: { id: 'pro', requestCount: 14, totalCostUsd: 0.32, totalTokens: 2500 },
      'alpha-basic': { id: 'alpha-basic', requestCount: 4, totalCostUsd: 0.10, totalTokens: 700 },
    },
  }
  return {
    ok: true,
    today,
    last7d: { requestCount: 42, totalCostUsd: 1.12, totalTokens: 8800 },
    summary: { accounts: 3, activeDevices: 4, managedRequests24h: 18, estimatedCostUsd24h: 0.42 },
    rows: [
      {
        accountHandle: 'acct_jp_owner', deviceHandle: 'device…1234', status: 'active', sttSeconds: 82.4, llmActions: 6, failures: 0,
        prewarm: { available: true, attempts: 12, successes: 12, failures: 0 },
        quota: {
          managedUsage: { state: 'ok', rolling5hRemaining: 98, weeklyRemaining: 490 },
          transcription: { state: 'ok', rolling5hRemaining: 3200, weeklyRemaining: 18000 },
          aiActions: { state: 'ok', rolling5hRemaining: 44, weeklyRemaining: 210 },
        },
      },
      {
        accountHandle: 'acct_alpha_team', deviceHandle: 'device…9876', status: 'active', sttSeconds: 34.1, llmActions: 2, failures: 1,
        prewarm: { available: false, attempts: 0, successes: 0, failures: 0 },
        quota: {
          managedUsage: { state: 'almost_used', rolling5hRemaining: 2, weeklyRemaining: 16 },
          transcription: { state: 'blocked', rolling5hRemaining: 0, weeklyRemaining: 120 },
          aiActions: { state: 'ok', rolling5hRemaining: 8, weeklyRemaining: 32 },
        },
      },
    ],
    coverage: { knownDevices: 2, deviceCap: 20, recentEvents: 18, recentEventCap: 100, eventsPartial: false, oldestEventAt: null, newestEventAt: null, prewarmRetentionDays: 7, prewarmUnavailableDevices: 1 },
    redacted: true,
  }
}
async function mockPrompt(message, send) {
  send({ type: 'web_status', status: 'Pi está trabajando…' })
  const toolId = `mock-tool-${Date.now()}`
  send({ type: 'tool_execution_start', toolCallId: toolId, toolName: 'fixvox.local_ui_probe', extensionPath: 'mock/local' })
  await new Promise((resolve) => setTimeout(resolve, 120))
  send({ type: 'tool_execution_end', toolCallId: toolId, toolName: 'fixvox.local_ui_probe', result: { ok: true, checked: ['sidebar', 'chat', 'composer', 'activity'] } })
  if (message.includes('FIXVOX_FINAL_MESSAGE_EVENT')) {
    send({ type: 'message_end', message: { role: 'assistant', content: 'FIXVOX_FINAL_MESSAGE_OK' } })
    send({ type: 'agent_end' })
    return
  }
  if (message.includes('FIXVOX_UI_REQUEST_SELECT')) {
    send({ type: 'extension_ui_request', id: `mock-request-${Date.now()}`, method: 'select', title: 'Elegí ambiente', message: 'Mock request para validar cards interactivas.', options: ['local', 'production'] })
    send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Esperando respuesta UI.' } })
    send({ type: 'agent_end' })
    return
  }
  if (message.includes('FIXVOX_UI_REQUEST_INPUT')) {
    send({ type: 'extension_ui_request', id: `mock-request-${Date.now()}`, method: 'input', title: 'Nombre de sesión', message: 'Mock input request.', placeholder: 'Nombre visible', prefill: 'fixvox-local-ui-lab' })
    send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Esperando input UI.' } })
    send({ type: 'agent_end' })
    return
  }
  if (message.includes('FIXVOX_UI_REQUEST_EDITOR')) {
    send({ type: 'extension_ui_request', id: `mock-request-${Date.now()}`, method: 'editor', title: 'Editar prompt', message: 'Mock editor request.', placeholder: 'Contenido largo', prefill: 'Linea 1\nLinea 2' })
    send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Esperando editor UI.' } })
    send({ type: 'agent_end' })
    return
  }
  if (message.includes('FIXVOX_UI_REQUEST_CONFIRM')) {
    send({ type: 'extension_ui_request', id: `mock-request-${Date.now()}`, method: 'confirm', title: 'Confirmar acción', message: 'Mock confirm request.' })
    send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Esperando confirmación UI.' } })
    send({ type: 'agent_end' })
    return
  }
  const text = message.includes('FIXVOX')
    ? 'FIXVOX_LOCAL_MOCK_OK'
    : 'Modo local mock listo. Puedo probar sidebar, input, chat, streaming, tools, session state y componentes sin tocar VPS ni production.'
  send({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: text } })
  send({ type: 'agent_end' })
}
function mockCommand(command) {
  if (command?.type === 'get_state') return { ok: true, response: { data: mockSessionState() } }
  if (command?.type === 'new_session') return { ok: true, response: { data: mockSessionState() } }
  if (command?.type === 'set_session_name') return { ok: true, response: { data: { ...mockSessionState(), sessionName: command.name || 'fixvox-local-ui-lab' } } }
  if (command?.type === 'clone') return { ok: true, response: { data: { ...mockSessionState(), sessionName: 'fixvox-local-ui-lab-clone' } } }
  return { ok: true, response: { data: { accepted: true, commandType: command?.type || 'unknown' } } }
}
function mockAdmin(pathname) {
  if (pathname === '/api/admin/accounts' || pathname === '/api/admin/accounts/policy') return mockAccounts()
  if (pathname === '/api/admin/devices' || pathname === '/api/admin/devices/policy') return mockDevices()
  if (pathname === '/api/admin/policies') return mockPolicies()
  if (pathname === '/api/admin/usage') return mockUsage()
  return null
}

function withGuardrails(message) {
  return `${message}\n\nContexto: estas en Fixvox Admin Web remoto, repo /home/jpsal/dev/dictation-tauri. Guardrails: no push, deploy, systemd/tunnel, policy mutation, secrets ni acciones destructivas sin confirmacion explicita de JP. No imprimir tokens, emails completos, account IDs, device IDs completos, transcripts, selected text ni audio.`
}

function html(res, body) {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}
function loginHtml(error = '') {
  const googleButton = googleLoginEnabled() ? '<a class="google-login" href="/auth/google/start">Entrar con Google</a>' : '<p class="muted">Google login no configurado todavía.</p>'
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fixvox Admin</title><link rel="stylesheet" href="/assets/styles.css"></head><body><main class="login"><div class="login-card"><p class="eyebrow">Fixvox Admin</p><h1>Control room</h1><p>Entrá con Google. El token queda como fallback operativo.</p>${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}${googleButton}<details><summary>Fallback con token</summary><form method="post"><input name="token" type="password" autocomplete="current-password" placeholder="Token"><button>Entrar con token</button></form></details></div></main></body></html>`
}
function appHtml() {
  return fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8')
}
function escapeHtml(text) {
  return String(text).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]))
}
function serveStatic(_req, res, pathname) {
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
    if (url.pathname === '/auth/google/start') {
      if (!googleLoginEnabled()) return html(res, loginHtml('Google login no configurado.'))
      const state = crypto.randomBytes(18).toString('base64url')
      sessions.set(`oauth:${state}`, { expiresAt: Date.now() + 10 * 60 * 1000 })
      const redirectUri = buildExternalUrl(req, '/auth/google/callback')
      const googleUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
      googleUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
      googleUrl.searchParams.set('redirect_uri', redirectUri)
      googleUrl.searchParams.set('response_type', 'code')
      googleUrl.searchParams.set('scope', 'openid email profile')
      googleUrl.searchParams.set('state', state)
      googleUrl.searchParams.set('prompt', 'select_account')
      res.writeHead(302, { location: googleUrl.toString() })
      return res.end()
    }
    if (url.pathname === '/auth/google/callback') {
      try {
        const state = url.searchParams.get('state') || ''
        const code = url.searchParams.get('code') || ''
        const oauthState = sessions.get(`oauth:${state}`)
        sessions.delete(`oauth:${state}`)
        if (!state || !code || !oauthState || oauthState.expiresAt <= Date.now()) throw new Error('Google login state invalido o expirado')
        const user = await exchangeGoogleCode(req, code)
        setSession(res, user)
        res.writeHead(302, { location: '/admin/pi' })
        return res.end()
      } catch (error) {
        return html(res, loginHtml(error instanceof Error ? error.message : 'Google login falló.'))
      }
    }
    if (url.pathname === '/logout') {
      clearSession(res)
      res.writeHead(302, { location: '/login' })
      return res.end()
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
    if (url.pathname === '/api/admin/rbac') {
      const principal = await requireGoogleRole(req, ['viewer', 'editor', 'publisher', 'owner'])
      return sendJson(res, 200, { ok: true, role: principal.role })
    }
    if (url.pathname === '/api/admin/audit' && req.method === 'GET') {
      await requireGoogleRole(req, ['viewer', 'editor', 'publisher', 'owner'])
      if (MOCK_MODE) return sendJson(res, 200, mockAuditPayload())
      return sendJson(res, 200, await proxyAdmin('/admin/control-plane/audit'))
    }
    if (url.pathname === '/api/admin/roles' && req.method === 'GET') {
      await requireGoogleRole(req, ['viewer', 'editor', 'publisher', 'owner'])
      if (MOCK_MODE) return sendJson(res, 200, mockRolePayload())
      return sendJson(res, 200, await proxyAdmin(`/admin/control-plane/roles?bootstrapOwnerEmail=${encodeURIComponent(RBAC_BOOTSTRAP_OWNER_EMAIL)}`))
    }
    if (url.pathname === '/api/admin/roles' && req.method === 'POST') {
      const principal = await requireRecentGoogleRole(req, ['owner'])
      const body = JSON.parse(await readBody(req) || '{}')
      const brokeredBody = { ...body, actorEmail: principal.email, bootstrapOwnerEmail: RBAC_BOOTSTRAP_OWNER_EMAIL }
      if (MOCK_MODE) return sendJson(res, 200, mockSetRoleBinding(brokeredBody, principal.email))
      return sendJson(res, 200, await proxyAdmin('/admin/control-plane/roles', 'POST', brokeredBody))
    }
    if (url.pathname === '/api/admin/roles/remove' && req.method === 'POST') {
      const principal = await requireRecentGoogleRole(req, ['owner'])
      const body = JSON.parse(await readBody(req) || '{}')
      const brokeredBody = { ...body, actorEmail: principal.email, bootstrapOwnerEmail: RBAC_BOOTSTRAP_OWNER_EMAIL }
      if (MOCK_MODE) return sendJson(res, 200, mockRemoveRoleBinding(brokeredBody, principal.email))
      return sendJson(res, 200, await proxyAdmin('/admin/control-plane/roles/remove', 'POST', brokeredBody))
    }
    if (url.pathname === '/api/admin/env') {
      const session = readSession(req)
      return sendJson(res, 200, {
        ok: true,
        environment: MOCK_MODE ? 'local-mock' : ADMIN_ENV,
        production: !MOCK_MODE && ADMIN_ENV === 'production',
        mock: MOCK_MODE,
        adminBaseUrl: MOCK_MODE ? 'mock://fixvox-admin' : ADMIN_BASE_URL,
        piCwd: PI_CWD,
        user: session ? { provider: session.provider, emailRedacted: session.email ? redactGoogleEmail(session.email) : null, name: session.name || null } : null,
      guardrails: [
        'No push/deploy/systemd/tunnel sin aprobacion explicita.',
        'No mutar policies/users en production sin confirmacion explicita.',
        'No imprimir tokens, account IDs crudos, device IDs completos, transcripts ni audio.',
        ],
      })
    }
    if (url.pathname === '/api/pi-chat/health') return sendJson(res, 200, MOCK_MODE ? { ok: true, cwd: PI_CWD, piBin: PI_BIN, piVersion: '0.80.2-mock', process: 'mock' } : await pi.health())
    if (url.pathname === '/api/pi-chat/command' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}')
      const command = body.command || body
      if (MOCK_MODE) return sendJson(res, 200, mockCommand(command))
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
      if (MOCK_MODE) { await mockPrompt(message, send); return res.end() }
      try { await pi.prompt(withGuardrails(message), send); send({ type: 'web_status', status: 'done' }) }
      catch (error) { send({ type: 'web_error', error: error instanceof Error ? error.message : 'Pi error' }) }
      return res.end()
    }
    if (url.pathname === '/api/admin/profiles/drafts' && (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE')) await requireGoogleRole(req, ['editor', 'publisher', 'owner'])
    if (url.pathname === '/api/admin/profiles/preview' && req.method === 'GET') await requireGoogleRole(req, ['viewer', 'editor', 'publisher', 'owner'])
    if (MOCK_MODE && url.pathname === '/api/admin/profiles/drafts' && req.method === 'POST') return sendJson(res, 200, mockCreateProfileDraft(JSON.parse(await readBody(req) || '{}')))
    if (MOCK_MODE && url.pathname === '/api/admin/profiles/drafts' && req.method === 'PUT') return sendJson(res, 200, mockSaveProfileDraft(JSON.parse(await readBody(req) || '{}')))
    if (MOCK_MODE && url.pathname === '/api/admin/profiles/drafts' && req.method === 'DELETE') return sendJson(res, 200, mockDiscardProfileDraft(JSON.parse(await readBody(req) || '{}')))
    if (MOCK_MODE && url.pathname === '/api/admin/profiles/preview' && req.method === 'GET') return sendJson(res, 200, mockPreviewProfile(url.searchParams))
    if (MOCK_MODE && !process.env.FIXVOX_ADMIN_BASE_URL && (url.pathname === '/api/admin/profiles/publish' || url.pathname === '/api/admin/profiles/rollback') && req.method === 'POST') {
      const principal = await requireRecentGoogleRole(req, ['publisher', 'owner'])
      const body = JSON.parse(await readBody(req) || '{}')
      const brokeredBody = { ...body, actorKey: rbacPrincipalKeyForEmail(principal.email) }
      try {
        return sendJson(res, 200, url.pathname.endsWith('/publish') ? mockPublishProfile(brokeredBody) : mockRollbackProfile(brokeredBody))
      } catch (error) {
        return sendJson(res, error.status || 400, { ok: false, error: { message: error.message || 'Mock profile mutation failed.' } })
      }
    }
    if (req.method === 'POST' && (url.pathname === '/api/admin/policies/engines' || url.pathname === '/api/admin/policies/budget')) return sendJson(res, 409, { ok: false, error: { message: 'Direct profile mutation is read-only; use a typed profile draft.', code: 'profile_composer_required' } })
    if (MOCK_MODE && url.pathname === '/api/admin/accounts' && req.method === 'GET') return sendJson(res, 200, annotateCurrentAdminAccount(mockAccounts(), readSession(req)))
    if (MOCK_MODE && url.pathname === '/api/admin/accounts/policy' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(mockAssignAccountPolicy(JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (MOCK_MODE && url.pathname === '/api/admin/accounts/budget' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(mockAssignAccountBudget(JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (MOCK_MODE && url.pathname === '/api/admin/accounts/groups' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(mockAssignAccountGroups(JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (MOCK_MODE && (url.pathname === '/api/admin/accounts/segments' || url.pathname === '/api/admin/accounts/variants/assign') && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(mockAssignAccountSegments(JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (MOCK_MODE && url.pathname === '/api/admin/groups' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(mockCreateGroup(JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (MOCK_MODE && url.pathname === '/api/admin/accounts/variants' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(mockCreateAccountVariant(JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (MOCK_MODE && url.pathname === '/api/admin/accounts/variants/delete' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(mockDeleteAccountVariant(JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (MOCK_MODE && url.pathname === '/api/admin/policies/variants' && req.method === 'POST') return sendJson(res, 200, mockAssignPolicyVariants(JSON.parse(await readBody(req) || '{}')))
    if (MOCK_MODE && url.pathname === '/api/admin/policies/selection-presets' && req.method === 'POST') return sendJson(res, 200, mockAssignSelectionPresetDefaults(JSON.parse(await readBody(req) || '{}')))
    if (MOCK_MODE && url.pathname === '/api/admin/pricing') return sendJson(res, 200, mockPricingSnapshot())
    if (MOCK_MODE && url.pathname === '/api/admin/pricing/refresh' && req.method === 'POST') return sendJson(res, 200, mockPricingSnapshot())
    if (MOCK_MODE && url.pathname === '/api/admin/engines' && req.method === 'POST') return sendJson(res, 200, mockSaveEngine(JSON.parse(await readBody(req) || '{}')))
    if (MOCK_MODE && url.pathname === '/api/admin/engines/delete' && req.method === 'POST') return sendJson(res, 200, mockDeleteEngine(JSON.parse(await readBody(req) || '{}')))
    if (MOCK_MODE && url.pathname === '/api/admin/prompts' && req.method === 'POST') return sendJson(res, 200, mockSavePrompt(JSON.parse(await readBody(req) || '{}')))
    if (MOCK_MODE && url.pathname === '/api/admin/prompts/delete' && req.method === 'POST') return sendJson(res, 200, mockDeletePrompt(JSON.parse(await readBody(req) || '{}')))
    if (MOCK_MODE && url.pathname.startsWith('/api/admin/')) { const mocked = mockAdmin(url.pathname); if (mocked) return sendJson(res, 200, mocked) }
    if (url.pathname === '/api/admin/profiles/drafts' && (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE')) return sendJson(res, 200, await proxyAdmin('/admin/control-plane/profiles/drafts', req.method, JSON.parse(await readBody(req) || '{}')))
    if (url.pathname === '/api/admin/profiles/preview' && req.method === 'GET') {
      const query = new URLSearchParams()
      for (const key of ['profileId', 'accountHandle', 'deviceId']) {
        const value = url.searchParams.get(key)
        if (value) query.set(key, value)
      }
      return sendJson(res, 200, await proxyAdmin(`/admin/control-plane/profiles/preview?${query}`))
    }
    if ((url.pathname === '/api/admin/profiles/publish' || url.pathname === '/api/admin/profiles/rollback') && req.method === 'POST') {
      const principal = await requireRecentGoogleRole(req, ['publisher', 'owner'])
      const body = JSON.parse(await readBody(req) || '{}')
      const brokeredBody = { ...body, actorKey: rbacPrincipalKeyForEmail(principal.email) }
      return sendJson(res, 200, await proxyAdmin(
        url.pathname === '/api/admin/profiles/publish' ? '/admin/control-plane/profiles/publish' : '/admin/control-plane/profiles/rollback',
        'POST',
        brokeredBody,
        process.env.ADMIN_PUBLISH_API_KEY || '',
      ))
    }
    if (url.pathname === '/api/admin/audit' && req.method === 'GET') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/audit'))
    if (url.pathname === '/api/admin/accounts') {
      const accounts = await proxyAdmin(`/admin/control-plane/accounts?limit=${encodeURIComponent(url.searchParams.get('limit') || '20')}`)
      return sendJson(res, 200, annotateCurrentAdminAccount(accounts, readSession(req)))
    }
    if (url.pathname === '/api/admin/accounts/policy' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(await proxyAdmin('/admin/control-plane/accounts/policy', 'POST', JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (url.pathname === '/api/admin/accounts/budget' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(await proxyAdmin('/admin/control-plane/accounts/budget', 'POST', JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (url.pathname === '/api/admin/accounts/groups' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(await proxyAdmin('/admin/control-plane/accounts/groups', 'POST', JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if ((url.pathname === '/api/admin/accounts/segments' || url.pathname === '/api/admin/accounts/variants/assign') && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(await proxyAdmin('/admin/control-plane/accounts/variants/assign', 'POST', JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (url.pathname === '/api/admin/groups' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(await proxyAdmin('/admin/control-plane/groups', 'POST', JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (url.pathname === '/api/admin/accounts/variants' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(await proxyAdmin('/admin/control-plane/accounts/variants', 'POST', JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (url.pathname === '/api/admin/accounts/variants/delete' && req.method === 'POST') return sendJson(res, 200, annotateCurrentAdminAccount(await proxyAdmin('/admin/control-plane/accounts/variants/delete', 'POST', JSON.parse(await readBody(req) || '{}')), readSession(req)))
    if (url.pathname === '/api/admin/policies/variants' && req.method === 'POST') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/policy/variants', 'POST', JSON.parse(await readBody(req) || '{}')))
    if (url.pathname === '/api/admin/policies/selection-presets' && req.method === 'POST') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/policy/selection-presets', 'POST', JSON.parse(await readBody(req) || '{}')))
    if (url.pathname === '/api/admin/pricing') return sendJson(res, 200, await proxyAdmin('/admin/pricing'))
    if (url.pathname === '/api/admin/pricing/refresh' && req.method === 'POST') return sendJson(res, 200, await proxyAdmin('/admin/pricing/refresh', 'POST', {}))
    if (url.pathname === '/api/admin/engines' && req.method === 'POST') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/engines', 'POST', JSON.parse(await readBody(req) || '{}')))
    if (url.pathname === '/api/admin/engines/delete' && req.method === 'POST') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/engines/delete', 'POST', JSON.parse(await readBody(req) || '{}')))
    if (url.pathname === '/api/admin/prompts' && req.method === 'POST') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/prompts', 'POST', JSON.parse(await readBody(req) || '{}')))
    if (url.pathname === '/api/admin/prompts/delete' && req.method === 'POST') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/prompts/delete', 'POST', JSON.parse(await readBody(req) || '{}')))
    if (url.pathname === '/api/admin/devices') return sendJson(res, 200, await proxyAdmin(`/admin/control-plane/devices?limit=${encodeURIComponent(url.searchParams.get('limit') || '20')}`))
    if (url.pathname === '/api/admin/devices/policy' && req.method === 'POST') return sendJson(res, 200, await proxyAdmin('/admin/control-plane/devices/policy', 'POST', JSON.parse(await readBody(req) || '{}')))
    if (url.pathname === '/api/admin/policies') {
      const [policyPayload, accountPayload, pricingPayload] = await Promise.all([
        proxyAdmin('/admin/control-plane/policy'),
        proxyAdmin('/admin/control-plane/accounts?limit=1').catch(() => ({})),
        proxyAdmin('/admin/pricing').catch(() => ({})),
      ])
      return sendJson(res, 200, { ...policyPayload, variantOptions: accountPayload.variantOptions || policyPayload.variantOptions || [], availableSegments: accountPayload.availableSegments || policyPayload.availableSegments || [], engineOptions: policyPayload.engineOptions || accountPayload.engineOptions || [], promptOptions: policyPayload.promptOptions || accountPayload.promptOptions || [], pricing: pricingPayload.pricing || [], pricingWatchlist: pricingPayload.watchlist || null, policyVariants: policyPayload.policyVariants || {}, policyEngines: policyPayload.policyEngines || {}, policyBudgets: policyPayload.policyBudgets || accountPayload.policyBudgets || {} })
    }
    if (url.pathname === '/api/admin/usage') return sendJson(res, 200, await proxyAdmin('/admin/usage/summary'))
    return sendJson(res, 404, { error: { message: 'Not found' } })
  } catch (error) {
    sendJson(res, error.status || 500, { ok: false, error: error.message || 'Server error' })
  }
})

server.listen(PORT, HOST, () => console.log(`Fixvox admin web listening on http://${HOST}:${PORT} cwd=${PI_CWD}`))
