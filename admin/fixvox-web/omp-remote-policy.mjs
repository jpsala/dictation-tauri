import crypto from 'node:crypto'
import { lstat, readlink } from 'node:fs/promises'
import path from 'node:path'

const SAFE_ENV_KEYS = new Set([
  'PATH', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TERM', 'TMPDIR', 'TZ',
  'HOME', 'USER', 'LOGNAME', 'SHELL',
])

const SECRET_ENV_NAME = /(TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL|COOKIE|SESSION|AUTH)/i
const PROTECTED_PATH_PARTS = [
  /(^|[/\\])\.env(?:\.|$)/i,
  /(^|[/\\])[^/\\]+\.env$/i,
  /(^|[/\\])\.dev\.vars(?:\.|$)/i,
  /(^|[/\\])\.wrangler([/\\]|$)/i,
  /(^|[/\\])\.ssh([/\\]|$)/i,
  /(^|[/\\])\.gnupg([/\\]|$)/i,
  /(^|[/\\])\.aws([/\\]|$)/i,
  /(^|[/\\])\.cloudflared([/\\]|$)/i,
  /(^|[/\\])\.(?:omp|pi)[/\\]agent[/\\](?:auth|sessions)([/\\]|$)/i,
  /(^|[/\\])auth\.json$/i,
  /(^|[/\\])(?:id_(?:rsa|dsa|ecdsa|ed25519)|private[-_.]?key(?:\.[^/\\]+)?|[^/\\]+\.(?:key|pem|p12|pfx))$/i,
  /(^|[/\\])(?:credentials?|secrets?)(?:\.[^/\\]+)?$/i,
  /(^|[/\\])(?:stores?|sessions?|backups?|private-exports?)([/\\]|$)/i,
  /\.(?:sqlite|sqlite3|db)$/i,
]
const SECRET_DISCOVERY_COMMAND = /(?:^|[;&|()\s'"/\\])(?:env|printenv|set|export\s+-p|compgen\s+-e)(?=$|[;&|()\s'"/\\])|\/proc\/(?:self|\$?\w+|\d+)\/environ|(?:^|[;&|()\s'"/\\])(?:\.env(?:\.[^\s'";&|/\\]+)?|[^\s'";&|/\\]*\.env|\.dev\.vars(?:\.[^\s'";&|/\\]+)?|\.wrangler|auth\.json|id_(?:rsa|dsa|ecdsa|ed25519)|private[-_.]?key(?:\.[^\s'";&|/\\]+)?|[^\s'";&|/\\]+\.(?:key|pem|p12|pfx))(?=$|[;&|()\s'"/\\])|credential|secret/i
const RELEASE_BYPASS_COMMAND = /\bgit\b[^\n;&|]{0,200}\b(?:commit|push|tag)\b|(?:^|[;&|()\s])(?:systemctl|docker|wrangler|scp|ssh)(?:$|[;&|()\s])|(?:admin-web-deploy|cloud-deploy|release-windows)/i

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
  if (options.auditPath) env.OMP_CHAT_AGENT_AUDIT_PATH = canonical(options.auditPath)
  if (Array.isArray(options.roots)) env.OMP_CHAT_AGENT_ROOTS = options.roots.map(canonical).join(path.delimiter)
  if (options.constelacionesSocket) env.OMP_CHAT_CONSTELACIONES_SOCKET = canonical(options.constelacionesSocket)
  if (options.workspaceBrokerSocket) env.OMP_CHAT_WORKSPACE_BROKER_SOCKET = canonical(options.workspaceBrokerSocket)
  if (options.releaseBrokerSocket) env.OMP_CHAT_RELEASE_BROKER_SOCKET = canonical(options.releaseBrokerSocket)
  if (options.releaseBrokerEnabled) env.OMP_CHAT_RELEASE_BROKER_ENABLED = '1'
  env.OMP_CHAT_REMOTE_AGENT = '1'
  return env
}

export function ompRemoteAgentArgs(options = {}) {
  const sessionDir = canonical(options.sessionDir)
  return [
    '--mode', 'rpc',
    '--auto-approve',
    '--no-tools',
    '--no-extensions',
    '--no-skills',
    '--no-rules',
    '--profile', 'fixvox-admin-remote-agent',
    '--session-dir', sessionDir,
    '--continue',
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

async function resolvePhysicalPath(absolute) {
  const initial = path.resolve(absolute)
  let resolved = path.parse(initial).root
  let pending = path.relative(resolved, initial).split(path.sep).filter(Boolean)
  const followed = new Set()
  let hops = 0
  while (pending.length) {
    const component = pending.shift()
    const candidate = path.join(resolved, component)
    let metadata
    try {
      metadata = await lstat(candidate)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
      return path.join(candidate, ...pending)
    }
    if (!metadata.isSymbolicLink()) {
      resolved = candidate
      continue
    }
    const identity = canonical(candidate)
    if (followed.has(identity) || ++hops > 64) {
      throw Object.assign(new Error('Path resolution encountered a symbolic-link cycle.'), { code: 'ELOOP' })
    }
    followed.add(identity)
    const linked = path.resolve(path.dirname(candidate), await readlink(candidate))
    const linkedRoot = path.parse(linked).root
    pending = [...path.relative(linkedRoot, linked).split(path.sep).filter(Boolean), ...pending]
    resolved = linkedRoot
  }
  return resolved
}

export async function resolveRemoteToolInput(toolName, input, cwd = process.cwd()) {
  const name = String(toolName || '')
  const payload = input && typeof input === 'object' ? { ...input } : {}
  if (name === 'bash' && typeof payload.cwd === 'string') {
    const absolute = path.resolve(cwd, payload.cwd)
    try {
      payload.cwd = await resolvePhysicalPath(absolute)
    } catch {
      payload.__pathResolutionFailed = true
      payload.cwd = absolute
    }
    return payload
  }
  if (!['read', 'grep', 'find', 'ls', 'write', 'edit'].includes(name) || typeof payload.path !== 'string') return payload
  const absolute = path.resolve(cwd, payload.path)
  try {
    payload.path = await resolvePhysicalPath(absolute)
  } catch {
    payload.path = absolute
    payload.__pathResolutionFailed = true
  }
  return payload
}

export function classifyRemoteToolCall(toolName, input, options = {}) {
  const cwd = canonical(options.cwd || process.cwd())
  const roots = (options.roots || [cwd]).map(canonical)
  const name = String(toolName || '')
  const payload = input && typeof input === 'object' ? input : {}
  if (payload.__pathResolutionFailed) {
    return { decision: 'deny', category: 'path_resolution_failed', reason: 'Path could not be resolved safely.' }
  }

  if (name.startsWith('release_')) {
    const enabled = ['release_git_status', 'release_git_diff', 'release_git_commit', 'release_git_push', 'release_deploy']
    return enabled.includes(name)
      ? { decision: 'allow', category: 'release_broker', scope: name }
      : { decision: 'deny', category: 'unknown_release_tool', reason: 'Unknown release operation.' }
  }

  if (name === 'constelaciones_future_appointments') {
    return { decision: 'allow', category: 'domain_read', scope: 'constelaciones/future-appointments' }
  }

  if (['read', 'grep', 'find', 'ls'].includes(name)) {
    const rawPath = typeof payload.path === 'string' && payload.path.trim() ? payload.path : cwd
    const target = path.resolve(cwd, rawPath)
    const root = matchingRoot(target, roots)
    if (!root) return { decision: 'deny', category: 'read_outside_roots', reason: 'Read path is outside approved workspaces.' }
    if (protectedPath(target)) return { decision: 'deny', category: 'secret_path', reason: 'Sensitive paths are never available to OMP Chat.' }
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
    const executionCwd = path.resolve(cwd, String(payload.cwd || cwd))
    const executionRoot = matchingRoot(executionCwd, roots)
    if (!executionRoot) return { decision: 'deny', category: 'bash_outside_roots', reason: 'Shell cwd is outside approved workspaces.' }
    if (protectedPath(executionCwd)) return { decision: 'deny', category: 'secret_path', reason: 'Shell cwd cannot be a sensitive path.' }
    const command = String(payload.command || '').trim()
    if (!command) return { decision: 'deny', category: 'empty_command', reason: 'Empty shell command.' }
    if (SECRET_DISCOVERY_COMMAND.test(command)) {
      return { decision: 'deny', category: 'secret_discovery', reason: 'Credential and secret discovery is blocked.' }
    }
    if (RELEASE_BYPASS_COMMAND.test(command)) {
      return { decision: 'deny', category: 'release_bypass', reason: 'Git mutation and deployment commands require the dedicated release broker.' }
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
