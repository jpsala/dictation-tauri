#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DEFAULT_BASE_URL = 'https://auth-fixvox.jpsala.dev'
const DEFAULT_ENV_FILES = [
  path.join(os.homedir(), '.config', 'dictation-tauri', 'admin.env'),
  path.join(process.cwd(), 'cloud', 'fixvox-proxy', '.dev.vars'),
]

function readEnvFile(file) {
  if (!fs.existsSync(file)) return
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/g)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/)
    if (!match) continue
    if (process.env[match[1]]) continue
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '')
  }
}

for (const file of DEFAULT_ENV_FILES) readEnvFile(file)

const [command = 'help', ...args] = process.argv.slice(2)
const baseUrl = (process.env.FIXVOX_ADMIN_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/g, '')
const adminKey = process.env.ADMIN_API_KEY?.trim()

function usage(exitCode = 0) {
  console.log(`fixvox-admin commands:
  health
  devices [limit] [--raw]
  accounts [limit] [--raw]
  policies
  assign-device-policy <deviceId> <policyId> [label] --yes
  assign-account-policy <accountHandle> <policyId> [label] --yes

Env:
  ADMIN_API_KEY from env, ~/.config/dictation-tauri/admin.env, or cloud/fixvox-proxy/.dev.vars
  FIXVOX_ADMIN_BASE_URL optional (default ${DEFAULT_BASE_URL})`)
  process.exit(exitCode)
}

function requireAdminKey() {
  if (!adminKey) {
    console.error('ADMIN_API_KEY missing. Use env or ~/.config/dictation-tauri/admin.env (chmod 600).')
    process.exit(2)
  }
}

async function request(method, pathname, body) {
  const headers = {}
  if (pathname.startsWith('/admin/')) {
    requireAdminKey()
    headers.Authorization = `Bearer ${adminKey}`
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  const payload = text ? JSON.parse(text) : null
  if (!response.ok) {
    console.error(JSON.stringify({ ok: false, status: response.status, payload: redactPayload(payload) }, null, 2))
    process.exit(1)
  }
  return payload
}

function redactLong(value) {
  if (!value) return value
  const text = String(value)
  if (text.length <= 10) return 'redacted'
  return `${text.slice(0, 6)}…${text.slice(-4)}`
}

function redactPayload(value) {
  if (Array.isArray(value)) return value.map(redactPayload)
  if (!value || typeof value !== 'object') return value
  const out = {}
  for (const [key, raw] of Object.entries(value)) {
    if (/^(deviceId|installId|accountId)$/i.test(key)) out[key] = redactLong(raw)
    else out[key] = redactPayload(raw)
  }
  return out
}

function print(value) {
  console.log(JSON.stringify(value, null, 2))
}

function requireYes(value) {
  if (value !== '--yes') {
    console.error('Mutation requires trailing --yes.')
    process.exit(2)
  }
}

switch (command) {
  case 'help':
  case '--help':
  case '-h':
    usage(0)
    break
  case 'health': {
    const payload = await request('GET', '/health')
    print({ ok: payload.ok, service: payload.service, date: payload.date })
    break
  }
  case 'devices': {
    const limit = Number(args[0] || '20') || 20
    const raw = args.includes('--raw')
    const payload = await request('GET', `/admin/control-plane/devices?limit=${encodeURIComponent(String(limit))}`)
    print(raw ? payload : redactPayload(payload))
    break
  }
  case 'accounts': {
    const limit = Number(args[0] || '20') || 20
    const raw = args.includes('--raw')
    const payload = await request('GET', `/admin/control-plane/accounts?limit=${encodeURIComponent(String(limit))}`)
    print(raw ? payload : payload)
    break
  }
  case 'policies': {
    const payload = await request('GET', '/admin/control-plane/policy')
    print({
      ok: payload.ok,
      source: payload.source,
      updatedAt: payload.updatedAt,
      assignmentKeys: Object.keys(payload.policy?.policyAssignments || {}),
      profileKinds: Object.keys(payload.policy?.policyProfiles || {}),
    })
    break
  }
  case 'assign-device-policy': {
    const [deviceId, policyId, maybeLabel, maybeYes] = args
    if (!deviceId || !policyId) usage(2)
    const label = maybeYes ? maybeLabel : undefined
    requireYes(maybeYes || maybeLabel)
    const payload = await request('POST', '/admin/control-plane/devices/policy', { deviceId, policyId, policyLabel: label })
    print(redactPayload(payload))
    break
  }
  case 'assign-account-policy': {
    const [accountHandle, policyId, maybeLabel, maybeYes] = args
    if (!accountHandle || !policyId) usage(2)
    const label = maybeYes ? maybeLabel : undefined
    requireYes(maybeYes || maybeLabel)
    const payload = await request('POST', '/admin/control-plane/accounts/policy', { accountHandle, policyId, policyLabel: label })
    print(payload)
    break
  }
  default:
    console.error(`Unknown command: ${command}`)
    usage(2)
}
