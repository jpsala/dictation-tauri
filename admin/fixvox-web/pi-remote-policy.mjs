import crypto from 'node:crypto'
import { realpath } from 'node:fs/promises'
import path from 'node:path'

const SAFE_ENV_KEYS = new Set([
  'PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TMPDIR', 'TZ',
  'HOME', 'USER', 'LOGNAME', 'SHELL',
])

const SECRET_ENV_NAME = /(TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|COOKIE|SESSION|AUTH)/i
const PROTECTED_PATH_PARTS = [
  /(^|[/\\])\.env(?:\.|$)/i,
  /(^|[/\\])\.ssh([/\\]|$)/i,
  /(^|[/\\])\.gnupg([/\\]|$)/i,
  /(^|[/\\])\.aws([/\\]|$)/i,
  /(^|[/\\])\.cloudflared([/\\]|$)/i,
  /(^|[/\\])\.pi[/\\]agent[/\\](?:auth|sessions)([/\\]|$)/i,
  /(^|[/\\])(?:credentials?|secrets?)(?:\.[^/\\]+)?$/i,
  /(^|[/\\])(?:stores?|sessions?|backups?)([/\\]|$)/i,
]
const SECRET_DISCOVERY_COMMAND = /(?:^|[;&|()\s])(?:env|printenv|set|export\s+-p|compgen\s+-e)(?:$|[;&|()\s])|\/proc\/(?:self|\$?\w+|\d+)\/environ|\.env(?:\s|$)|\.ssh(?:\/|\s|$)|credential|secret/i

function canonical(value) {
  return path.resolve(String(value || ''))
}

function insideRoot(target, root) {
  const relative = path.relative(root, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function matchingRoot(target, roots) {
  return roots.find((root) => insideRoot(target, root))
}

function protectedPath(target) {
  return PROTECTED_PATH_PARTS.some((pattern) => pattern.test(target))
}

function scopeForPath(target, root) {
  if (!root) return undefined
  const relative = path.relative(root, target).replaceAll('\\', '/')
  return relative ? `${path.basename(root)}/${relative}` : path.basename(root)
}

export function buildRemoteAgentEnv(source, options = {}) {
  const env = {}
  for (const [key, value] of Object.entries(source || {})) {
    if (!SAFE_ENV_KEYS.has(key) || SECRET_ENV_NAME.test(key) || value === null || value === undefined) continue
    env[key] = String(value)
  }
  if (options.home) env.HOME = canonical(options.home)
  if (options.user) {
    env.USER = String(options.user)
    env.LOGNAME = String(options.user)
  }
  if (options.agentDir) env.PI_CODING_AGENT_DIR = canonical(options.agentDir)
  if (options.auditPath) env.PI_CHAT_AGENT_AUDIT_PATH = canonical(options.auditPath)
  if (Array.isArray(options.roots)) env.PI_CHAT_AGENT_ROOTS = options.roots.map(canonical).join(path.delimiter)
  if (options.constelacionesSocket) env.PI_CHAT_CONSTELACIONES_SOCKET = canonical(options.constelacionesSocket)
  env.PI_CHAT_REMOTE_AGENT = '1'
  return env
}

export function remoteAgentArgs(options = {}) {
  const extensionPath = canonical(options.extensionPath)
  const sessionDir = canonical(options.sessionDir)
  return [
    '--mode', 'rpc',
    '--no-approve',
    '--no-extensions',
    '--no-skills',
    '--no-prompt-templates',
    '--no-context-files',
    '--tools', 'read,bash,edit,write,grep,find,ls,constelaciones_future_appointments',
    '--extension', extensionPath,
    '--session-dir', sessionDir,
    '--name', 'fixvox-admin-remote-agent',
  ]
}

export function remoteAgentRoots(value, fallbackCwd = process.cwd()) {
  const roots = String(value || '')
    .split(path.delimiter)
    .map((item) => item.trim())
    .filter(Boolean)
    .map(canonical)
  return roots.length ? [...new Set(roots)] : [canonical(fallbackCwd)]
}

async function resolveWriteTarget(absolute) {
  let cursor = path.dirname(absolute)
  const suffix = [path.basename(absolute)]
  while (true) {
    try {
      const parent = await realpath(cursor)
      return path.join(parent, ...suffix)
    } catch {
      const next = path.dirname(cursor)
      if (next === cursor) return absolute
      suffix.unshift(path.basename(cursor))
      cursor = next
    }
  }
}

export async function resolveRemoteToolInput(toolName, input, cwd = process.cwd()) {
  const name = String(toolName || '')
  const payload = input && typeof input === 'object' ? { ...input } : {}
  if (!['read', 'grep', 'find', 'ls', 'write', 'edit'].includes(name) || typeof payload.path !== 'string') return payload
  const absolute = path.resolve(cwd, payload.path)
  try {
    payload.path = await realpath(absolute)
    return payload
  } catch {
    return { ...payload, path: name === 'write' ? await resolveWriteTarget(absolute) : absolute }
  }
}

export function classifyRemoteToolCall(toolName, input, options = {}) {
  const cwd = canonical(options.cwd || process.cwd())
  const roots = (options.roots || [cwd]).map(canonical)
  const name = String(toolName || '')
  const payload = input && typeof input === 'object' ? input : {}

  if (name === 'constelaciones_future_appointments') {
    return { decision: 'allow', category: 'domain_read', scope: 'constelaciones/future-appointments' }
  }

  if (['read', 'grep', 'find', 'ls'].includes(name)) {
    const rawPath = typeof payload.path === 'string' && payload.path.trim() ? payload.path : cwd
    const target = path.resolve(cwd, rawPath)
    const root = matchingRoot(target, roots)
    if (!root) return { decision: 'deny', category: 'read_outside_roots', reason: 'Read path is outside approved workspaces.' }
    if (protectedPath(target)) return { decision: 'deny', category: 'secret_path', reason: 'Sensitive paths are never available to Pi Chat.' }
    return { decision: 'allow', category: 'read', scope: scopeForPath(target, root) }
  }

  if (name === 'write' || name === 'edit') {
    const target = path.resolve(cwd, String(payload.path || ''))
    const root = matchingRoot(target, roots)
    if (!payload.path || !root) return { decision: 'deny', category: 'write_outside_roots', reason: 'Write path is outside approved workspaces.' }
    if (protectedPath(target)) return { decision: 'deny', category: 'secret_path', reason: 'Sensitive paths cannot be modified.' }
    return {
      decision: 'confirm',
      category: name,
      scope: scopeForPath(target, root),
      summary: `${name === 'write' ? 'Escribir' : 'Editar'} ${scopeForPath(target, root)}`,
    }
  }

  if (name === 'bash') {
    const command = String(payload.command || '').trim()
    if (!command) return { decision: 'deny', category: 'empty_command', reason: 'Empty shell command.' }
    if (SECRET_DISCOVERY_COMMAND.test(command)) {
      return { decision: 'deny', category: 'secret_discovery', reason: 'Credential and secret discovery is blocked.' }
    }
    const firstCommand = command.match(/[A-Za-z0-9_.:/-]+/)?.[0] || 'shell command'
    return { decision: 'confirm', category: 'bash', summary: `Ejecutar comando: ${firstCommand}`, detail: command.slice(0, 800) }
  }

  return { decision: 'deny', category: 'unknown_tool', reason: `Tool ${name || 'unknown'} is not enabled by remote-agent policy.` }
}

export function auditRecord({ toolName, classification, approved, sessionId, now = new Date() }) {
  let decision = classification.decision
  if (classification.decision === 'confirm') decision = approved ? 'approved' : 'blocked'
  const fingerprint = crypto.createHash('sha256')
    .update(JSON.stringify({
      toolName,
      category: classification.category,
      operation: classification.detail || classification.scope || classification.summary || '',
    }))
    .digest('hex')
  return {
    schemaVersion: 1,
    at: now.toISOString(),
    tool: String(toolName || 'unknown'),
    category: String(classification.category || 'unknown'),
    decision,
    operationHash: fingerprint,
    sessionHash: sessionId
      ? crypto.createHash('sha256').update(String(sessionId)).digest('hex')
      : undefined,
  }
}

export function containsSensitiveEnvName(env) {
  return Object.keys(env || {}).some((key) => SECRET_ENV_NAME.test(key))
}
