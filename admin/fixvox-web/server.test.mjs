import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import test from 'node:test'

const port = 18987
const baseUrl = `http://127.0.0.1:${port}`

async function withServer(env, run) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, FIXVOX_ADMIN_SKIP_ENV_FILES: '1', FIXVOX_ADMIN_MOCK: '1', FIXVOX_ADMIN_HOST: '127.0.0.1', FIXVOX_ADMIN_PORT: String(port), ...env },
    stdio: 'ignore',
  })
  try {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      try {
        if ((await fetch(`${baseUrl}/healthz`)).ok) break
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    await run()
  } finally {
    child.kill('SIGTERM')
    await once(child, 'exit')
  }
}

test('server RBAC derives the recent verified Google role server-side', async () => {
  await withServer({}, async () => {
    const response = await fetch(`${baseUrl}/api/admin/rbac?email=attacker@example.com&role=owner`)
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.deepEqual(payload, { ok: true, role: 'owner' })
    assert.doesNotMatch(JSON.stringify(payload), /attacker@example\.com|jpsala@gmail\.com/)
    const envResponse = await fetch(`${baseUrl}/api/admin/env`)
    const envPayload = await envResponse.json()
    assert.equal(envPayload.user.email, undefined)
    assert.equal(envPayload.user.emailRedacted, 'j…@gmail.com')
    assert.doesNotMatch(JSON.stringify(envPayload), /jpsala@gmail\.com/)
  })
})

test('server RBAC accepts a verified Google session without recent reauthentication', async () => {
  await withServer({ FIXVOX_ADMIN_MOCK_AUTHENTICATED_AT: String(Date.now() - 11 * 60 * 1000) }, async () => {
    const response = await fetch(`${baseUrl}/api/admin/rbac`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true, role: 'owner' })
  })
})

test('local auth fixture reaches the canonical loopback backend without enabling mock data', async () => {
  const requests = []
  const backend = http.createServer((req, res) => {
    requests.push({ method: req.method, url: req.url, authorization: req.headers.authorization, principalKey: req.headers['x-fixvox-principal-key'] })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, role: 'owner' }))
  })
  await new Promise((resolve) => backend.listen(18988, '127.0.0.1', resolve))
  try {
    await withServer({
      FIXVOX_ADMIN_MOCK: '0',
      FIXVOX_ADMIN_ENV: 'local',
      FIXVOX_ADMIN_LOCAL_AUTH_FIXTURE: '1',
      FIXVOX_ADMIN_BASE_URL: 'http://127.0.0.1:18988',
      ADMIN_VIEW_API_KEY: 'local-view-fixture',
    }, async () => {
      const response = await fetch(`${baseUrl}/api/admin/rbac`)
      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { ok: true, role: 'owner' })
    })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, '/product/v1/control-room/session')
    assert.equal(requests[0].authorization, 'Bearer local-view-fixture')
    assert.match(requests[0].principalKey, /^arp_[a-f0-9]{64}$/)
  } finally {
    backend.close()
    await once(backend, 'close')
  }
})

test('local profile apply BFF maps the browser command to the canonical backend', async () => {
  const requests = []
  let applied = false
  let rolledBack = false
  const definition = { schemaVersion: 1, label: 'Local profile', access: { capabilities: ['dictation'] }, runtime: { transcription: { engineId: 'local-stt' }, postprocess: { engineId: 'local-chat' }, selectionTransform: { engineId: 'local-selection' } }, limits: { mode: 'block' }, userControls: {}, defaults: {} }
  const backend = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => { raw += chunk.toString() })
    req.on('end', () => {
      let parsedBody = null
      try { parsedBody = raw ? JSON.parse(raw) : null } catch { parsedBody = { invalid: true } }
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: parsedBody })
      res.writeHead(200, { 'content-type': 'application/json' })
      if (req.url === '/product/v1/control-room/session') return res.end(JSON.stringify({ ok: true, role: 'owner' }))
      if (req.url === '/product/v1/control-room/profiles/local/apply') { applied = true; return res.end(JSON.stringify({ ok: true, data: { audit: { id: 'audit-local', action: 'apply', result: 'success' } } })) }
      if (req.url === '/product/v1/control-room/profiles/local/rollback') { rolledBack = true; return res.end(JSON.stringify({ ok: true, data: { audit: { id: 'audit-rollback', action: 'rollback', result: 'success' } } })) }
      if (req.url === '/product/v1/control-room/profiles') {
        let version = 1
        let revision = 0
        if (applied) { version = 2; revision = 1 }
        if (rolledBack) { version = 3; revision = 2 }
        const label = applied && !rolledBack ? 'Local profile v2' : 'Local profile'
        return res.end(JSON.stringify({ ok: true, profiles: [{ profileId: 'local', label, revision, published: { ...definition, label, version, status: 'published' }, draft: null, history: [] }] }))
      }
      res.statusCode = 404
      res.end(JSON.stringify({ error: { code: 'not_found' } }))
    })
  })
  await new Promise((resolve) => backend.listen(18988, '127.0.0.1', resolve))
  try {
    await withServer({ FIXVOX_ADMIN_MOCK: '0', FIXVOX_ADMIN_ENV: 'local', FIXVOX_ADMIN_LOCAL_AUTH_FIXTURE: '1', FIXVOX_ADMIN_BASE_URL: 'http://127.0.0.1:18988', ADMIN_VIEW_API_KEY: 'local-view', ADMIN_PUBLISH_API_KEY: 'local-publish' }, async () => {
      const response = await fetch(`${baseUrl}/api/admin/profiles/apply`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId: 'local', expectedActiveVersion: 1, definition: { ...definition, label: 'Local profile v2' }, confirmation: 'APPLY local v1', actorKey: 'attacker' }) })
      assert.equal(response.status, 200)
      assert.equal((await response.json()).published.version, 2)
      const rollback = await fetch(`${baseUrl}/api/admin/profiles/rollback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId: 'local', version: 1, expectedActiveVersion: 2, confirmation: 'ROLLBACK local to v1', actorKey: 'attacker' }) })
      assert.equal(rollback.status, 200)
      assert.equal((await rollback.json()).published.version, 3)
    })
    const apply = requests.find((request) => request.url === '/product/v1/control-room/profiles/local/apply')
    assert.equal(apply.headers.authorization, 'Bearer local-publish')
    assert.match(apply.headers['x-fixvox-principal-key'], /^arp_[a-f0-9]{64}$/)
    assert.ok(apply.headers['x-fixvox-recent-google-at'])
    assert.deepEqual(apply.body.confirmation, { action: 'apply', profileKey: 'local', expectedRevision: 0, phrase: 'APPLY local REV 0' })
    assert.equal(apply.body.actorKey, undefined)
    const rollback = requests.find((request) => request.url === '/product/v1/control-room/profiles/local/rollback')
    assert.deepEqual(rollback.body, { targetVersion: 1, expectedRevision: 1, confirmation: { action: 'rollback', profileKey: 'local', targetVersion: 1, expectedRevision: 1, phrase: 'ROLLBACK local TO 1 REV 1' } })
  } finally {
    backend.close()
    await once(backend, 'close')
  }
})

test('local auth fixture fails closed outside loopback local mode', async () => {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: new URL('.', import.meta.url),
    env: { ...process.env, FIXVOX_ADMIN_SKIP_ENV_FILES: '1', FIXVOX_ADMIN_MOCK: '0', FIXVOX_ADMIN_ENV: 'production', FIXVOX_ADMIN_LOCAL_AUTH_FIXTURE: '1', FIXVOX_ADMIN_BASE_URL: 'https://auth-fixvox.jpsala.dev' },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  const [code] = await once(child, 'exit')
  assert.notEqual(code, 0)
  assert.match(stderr, /restricted to the local loopback backend/)
})

test('isolated and unrestricted Pi modes are mutually exclusive', async () => {
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('.', import.meta.url), env: { ...process.env, FIXVOX_ADMIN_SKIP_ENV_FILES: '1', FIXVOX_ADMIN_MOCK: '1', PI_CHAT_UNRESTRICTED_OWNER: '1', PI_CHAT_REMOTE_AGENT_ENABLED: '1' }, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
  const [code] = await once(child, 'exit')
  assert.notEqual(code, 0)
  assert.match(stderr, /cannot enable isolated and unrestricted modes together/)
})

test('unrestricted owner mode requires recent Google auth at the Pi perimeter', async () => {
  await withServer({ PI_CHAT_UNRESTRICTED_OWNER: '1', PI_CHAT_REMOTE_AGENT_ENABLED: '0', FIXVOX_ADMIN_MOCK_AUTHENTICATED_AT: String(Date.now() - 11 * 60 * 1000) }, async () => {
    const envResponse = await fetch(`${baseUrl}/api/admin/env`)
    assert.equal((await envResponse.json()).piMode, 'unrestricted-owner')
    assert.equal((await fetch(`${baseUrl}/api/pi-chat/health`)).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/pi-chat/command`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: { type: 'get_state' } }) })).status, 403)
    assert.equal((await fetch(`${baseUrl}/api/pi-chat/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'hello' }) })).status, 403)
  })
})

test('recent owner gets an exact unwrapped prompt in unrestricted mode', async () => {
  await withServer({ PI_CHAT_UNRESTRICTED_OWNER: '1', PI_CHAT_REMOTE_AGENT_ENABLED: '0' }, async () => {
    assert.equal((await fetch(`${baseUrl}/api/pi-chat/health`)).status, 200)
    assert.equal((await fetch(`${baseUrl}/api/pi-chat/command`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: { type: 'get_state' } }) })).status, 200)
    const envPayload = await (await fetch(`${baseUrl}/api/admin/env`)).json()
    assert.deepEqual(envPayload.guardrails, [])
    assert.match(envPayload.unrestrictedOwnerWarning, /misma autoridad/)
    const exactMessage = 'FIXVOX_ECHO_PROMPT: raw owner message'
    const prompt = await fetch(`${baseUrl}/api/pi-chat/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: exactMessage }) })
    assert.equal(prompt.status, 200)
    const stream = await prompt.text()
    assert.match(stream, new RegExp(exactMessage))
    assert.doesNotMatch(stream, /Guardrails: no push|confirmacion explicita/)
  })
})

test('owner Settings roles accept only an opaque listed linked principal', async () => {
  await withServer({}, async () => {
    const listed = await (await fetch(`${baseUrl}/api/admin/roles`)).json()
    const candidate = listed.principals.find((principal) => principal.emailRedacted === 'a…@example.com')
    const owner = listed.principals.find((principal) => principal.role === 'owner')
    assert.match(candidate.principalKey, /^arp_[a-f0-9]{64}$/)
    assert.doesNotMatch(JSON.stringify(listed), /alpha@example\.com|jpsala@gmail\.com/)
    const freeEmail = await fetch(`${baseUrl}/api/admin/roles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subjectEmail: 'attacker@example.com', role: 'owner' }),
    })
    assert.equal(freeEmail.status, 400)
    const arbitrary = await fetch(`${baseUrl}/api/admin/roles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ principalKey: 'arp_not_listed', role: 'owner' }),
    })
    assert.equal(arbitrary.status, 400)
    const created = await fetch(`${baseUrl}/api/admin/roles`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ principalKey: candidate.principalKey, role: 'publisher' }),
    })
    assert.equal(created.status, 200)
    assert.match(JSON.stringify(await created.json()), /a…@example\.com/)
    const removed = await fetch(`${baseUrl}/api/admin/roles/remove`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ principalKey: candidate.principalKey }),
    })
    assert.equal(removed.status, 200)
    const finalOwner = await fetch(`${baseUrl}/api/admin/roles/remove`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ principalKey: owner.principalKey }),
    })
    assert.equal(finalOwner.status, 403)
  })
})

test('viewer and editor sessions receive 403 before the publish broker', async () => {
  for (const role of ['viewer', 'editor']) {
    await withServer({
      FIXVOX_ADMIN_MOCK_EMAIL: `${role}@example.com`,
      FIXVOX_ADMIN_MOCK_ROLE: role,
    }, async () => {
      const response = await fetch(`${baseUrl}/api/admin/profiles/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileId: 'pro', confirmation: 'PUBLISH pro v2' }),
      })
      assert.equal(response.status, 403)
      assert.match(JSON.stringify(await response.json()), /Forbidden/)
    })
  }
})

test('Profile Composer drafts require an editor role before the broker', async () => {
  await withServer({ FIXVOX_ADMIN_MOCK_EMAIL: 'viewer@example.com', FIXVOX_ADMIN_MOCK_ROLE: 'viewer' }, async () => {
    const response = await fetch(`${baseUrl}/api/admin/profiles/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileId: 'pro' }),
    })
    assert.equal(response.status, 403)
    assert.match(JSON.stringify(await response.json()), /Forbidden/)
    const discard = await fetch(`${baseUrl}/api/admin/profiles/drafts`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileId: 'pro', expectedDraftVersion: 2, confirmation: 'DISCARD pro v2' }),
    })
    assert.equal(discard.status, 403)
  })
  await withServer({ FIXVOX_ADMIN_MOCK_EMAIL: 'editor@example.com', FIXVOX_ADMIN_MOCK_ROLE: 'editor' }, async () => {
    const response = await fetch(`${baseUrl}/api/admin/profiles/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileId: 'pro' }),
    })
    assert.equal(response.status, 200)
    const created = await response.json()
    const inventory = await fetch(`${baseUrl}/api/admin/profiles/legacy-drafts`)
    assert.equal(inventory.status, 200)
    assert.deepEqual(await inventory.json(), { drafts: [{ profileId: 'pro', draftVersion: created.draft.version, basedOnVersion: 1 }] })
    const policies = await fetch(`${baseUrl}/api/admin/policies`)
    const policyPayload = await policies.json()
    assert.equal(policyPayload.profileVersions.find((profile) => profile.profileId === 'pro').draft, undefined)
    const discard = await fetch(`${baseUrl}/api/admin/profiles/drafts`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileId: 'pro', expectedDraftVersion: created.draft.version, confirmation: `DISCARD pro v${created.draft.version}` }),
    })
    assert.equal(discard.status, 200)
    assert.deepEqual(await discard.json(), { ok: true, profileId: 'pro', discardedDraftVersion: created.draft.version, publishedVersion: 1 })
  })
})

test('drafts and preview accept a verified Google session without recent reauthentication', async () => {
  await withServer({
    FIXVOX_ADMIN_MOCK_EMAIL: 'editor@example.com',
    FIXVOX_ADMIN_MOCK_ROLE: 'editor',
    FIXVOX_ADMIN_MOCK_AUTHENTICATED_AT: String(Date.now() - 11 * 60 * 1000),
  }, async () => {
    const draft = await fetch(`${baseUrl}/api/admin/profiles/drafts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ profileId: 'pro' }),
    })
    assert.equal(draft.status, 200)
    const preview = await fetch(`${baseUrl}/api/admin/profiles/preview?profileId=pro`)
    assert.equal(preview.status, 200)
    const rbac = await fetch(`${baseUrl}/api/admin/rbac`)
    assert.deepEqual(await rbac.json(), { ok: true, role: 'editor' })
  })
})

test('stale OAuth receives 403 before the publish broker', async () => {
  let requests = 0
  const stub = http.createServer((_request, response) => {
    requests += 1
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
  })
  await new Promise((resolve) => stub.listen(18988, '127.0.0.1', resolve))
  try {
    await withServer({
      FIXVOX_ADMIN_BASE_URL: 'http://127.0.0.1:18988',
      ADMIN_PUBLISH_API_KEY: 'publish-secret',
      FIXVOX_ADMIN_MOCK_AUTHENTICATED_AT: String(Date.now() - 11 * 60 * 1000),
    }, async () => {
      const response = await fetch(`${baseUrl}/api/admin/profiles/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileId: 'pro', confirmation: 'PUBLISH pro v2' }),
      })
      assert.equal(response.status, 403)
      assert.equal(requests, 0)
    })
  } finally {
    stub.close()
    await once(stub, 'close')
  }
})

test('legacy token sessions cannot start or command the Pi subprocess', async () => {
  const probeFile = path.join(os.tmpdir(), `fixvox-pi-env-${process.pid}-${Date.now()}.txt`)
  const probeScript = path.join(os.tmpdir(), `fixvox-pi-env-${process.pid}-${Date.now()}.mjs`)
  await fs.writeFile(probeScript, `import fs from 'node:fs';\nconst file = process.env.PI_PROBE_FILE;\nif (file) fs.writeFileSync(file, process.env.ADMIN_PUBLISH_API_KEY || 'missing');\nif (process.argv.includes('--version')) process.exit(0);\nprocess.stdin.setEncoding('utf8');\nprocess.stdin.on('data', (chunk) => { for (const line of chunk.split('\\n')) { if (!line.trim()) continue; const message = JSON.parse(line); process.stdout.write(JSON.stringify({ type: 'response', id: message.id, success: true, response: { data: {} } }) + '\\n'); } });`)
  try {
    await withServer({
      FIXVOX_ADMIN_MOCK: '0',
      FIXVOX_ADMIN_ENV: 'local',
      FIXVOX_ADMIN_BASE_URL: 'http://127.0.0.1:18988',
      FIXVOX_ADMIN_WEB_TOKEN: 'local-token',
      FIXVOX_ADMIN_PASSWORD: 'local-token',
      ADMIN_PUBLISH_API_KEY: 'publish-secret',
      PI_CHAT_BIN: process.execPath,
      PI_CHAT_ARGS: probeScript,
      PI_PROBE_FILE: probeFile,
    }, async () => {
      const login = await fetch(`${baseUrl}/login`, { method: 'POST', body: new URLSearchParams({ token: 'local-token' }), redirect: 'manual' })
      assert.equal(login.status, 302)
      const cookie = login.headers.get('set-cookie')?.split(';', 1)[0]
      assert.ok(cookie)
      const health = await fetch(`${baseUrl}/api/pi-chat/health`, { headers: { cookie } })
      assert.equal(health.status, 403)
      const command = await fetch(`${baseUrl}/api/pi-chat/command`, {
        method: 'POST',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify({ command: { type: 'get_state' } }),
      })
      assert.equal(command.status, 403)
      await assert.rejects(() => fs.readFile(probeFile, 'utf8'), /ENOENT/)
    })
  } finally {
    await fs.rm(probeFile, { force: true })
    await fs.rm(probeScript, { force: true })
  }
})

test('viewer and editor roles cannot access Pi Chat routes', async () => {
  for (const role of ['viewer', 'editor']) {
    await withServer({ FIXVOX_ADMIN_MOCK_EMAIL: `${role}@example.com`, FIXVOX_ADMIN_MOCK_ROLE: role }, async () => {
      const health = await fetch(`${baseUrl}/api/pi-chat/health`)
      const prompt = await fetch(`${baseUrl}/api/pi-chat/prompt`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: 'blocked' }),
      })
      const command = await fetch(`${baseUrl}/api/pi-chat/command`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ command: { type: 'get_state' } }),
      })
      assert.deepEqual([health.status, prompt.status, command.status], [403, 403, 403])
    })
  }
})

test('privileged broker keeps the publish credential server-side and overwrites browser actor metadata', async () => {
  let authorization = ''
  let forwardedPath = ''
  let body = ''
  const stub = http.createServer((request, response) => {
    authorization = request.headers.authorization || ''
    forwardedPath = request.url || ''
    request.on('data', (chunk) => { body += chunk.toString() })
    request.on('end', () => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, published: { version: 2 }, audit: { result: 'success' } }))
    })
  })
  await new Promise((resolve) => stub.listen(18988, '127.0.0.1', resolve))
  try {
    await withServer({ FIXVOX_ADMIN_BASE_URL: 'http://127.0.0.1:18988', ADMIN_PUBLISH_API_KEY: 'publish-secret' }, async () => {
      const response = await fetch(`${baseUrl}/api/admin/profiles/publish`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileId: 'pro', expectedActiveVersion: 1, expectedDraftVersion: 2, confirmation: 'PUBLISH pro v2', actorKey: 'attacker' }),
      })
      assert.equal(response.status, 200)
      assert.equal(authorization, 'Bearer publish-secret')
      assert.equal(forwardedPath, '/admin/control-plane/profiles/publish')
      const forwarded = JSON.parse(body)
      assert.match(forwarded.actorKey, /^arp_[a-f0-9]{64}$/)
      assert.notEqual(forwarded.actorKey, 'attacker')
      assert.doesNotMatch(JSON.stringify(await response.json()), /publish-secret/)
    })
  } finally {
    stub.close()
    await once(stub, 'close')
  }
})

test('profile apply BFF enforces recent publisher RBAC before the broker', async () => {
  let requests = 0
  const stub = http.createServer((_request, response) => {
    requests += 1
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ ok: true }))
  })
  await new Promise((resolve) => stub.listen(18988, '127.0.0.1', resolve))
  try {
    for (const role of ['viewer', 'editor']) {
      await withServer({
        FIXVOX_ADMIN_BASE_URL: 'http://127.0.0.1:18988',
        ADMIN_PUBLISH_API_KEY: 'publish-secret',
        FIXVOX_ADMIN_MOCK_EMAIL: `${role}@example.com`,
        FIXVOX_ADMIN_MOCK_ROLE: role,
      }, async () => {
        const response = await fetch(`${baseUrl}/api/admin/profiles/apply`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ profileId: 'pro' }),
        })
        assert.equal(response.status, 403)
      })
    }
    assert.equal(requests, 0)
    await withServer({
      FIXVOX_ADMIN_BASE_URL: 'http://127.0.0.1:18988',
      ADMIN_PUBLISH_API_KEY: 'publish-secret',
      FIXVOX_ADMIN_MOCK_AUTHENTICATED_AT: String(Date.now() - 11 * 60 * 1000),
    }, async () => {
      const response = await fetch(`${baseUrl}/api/admin/profiles/apply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileId: 'pro' }),
      })
      assert.equal(response.status, 403)
    })
    assert.equal(requests, 0)
  } finally {
    stub.close()
    await once(stub, 'close')
  }
})

test('profile apply BFF overwrites browser actor and redacts broker failures', async () => {
  let authorization = ''
  let forwardedPath = ''
  let forwardedBody = ''
  const stub = http.createServer((request, response) => {
    authorization = request.headers.authorization || ''
    forwardedPath = request.url || ''
    let body = ''
    request.on('data', (chunk) => { body += chunk.toString() })
    request.on('end', () => {
      forwardedBody = body
      let payload
      try {
        payload = JSON.parse(body)
      } catch {
        response.writeHead(400, { 'content-type': 'application/json' })
        return response.end(JSON.stringify({ error: { code: 'invalid_payload' } }))
      }
      if (payload.expectedActiveVersion === 99) {
        response.writeHead(409, { 'content-type': 'application/json' })
        return response.end(JSON.stringify({ error: { code: 'profile_version_stale', message: 'raw stale detail' } }))
      }
      if (payload.expectedActiveVersion === 98) {
        response.writeHead(503, { 'content-type': 'application/json' })
        return response.end(JSON.stringify({ error: { code: 'profile_mutation_unavailable', message: 'publish-secret raw failure' } }))
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ ok: true, published: { version: 2 }, audit: { result: 'success' } }))
    })
  })
  await new Promise((resolve) => stub.listen(18988, '127.0.0.1', resolve))
  try {
    for (const role of ['publisher', 'owner']) {
      await withServer({
        FIXVOX_ADMIN_BASE_URL: 'http://127.0.0.1:18988',
        ADMIN_PUBLISH_API_KEY: 'publish-secret',
        FIXVOX_ADMIN_MOCK_EMAIL: `${role}@example.com`,
        FIXVOX_ADMIN_MOCK_ROLE: role,
      }, async () => {
        const response = await fetch(`${baseUrl}/api/admin/profiles/apply`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ profileId: 'pro', expectedActiveVersion: 1, definition: {}, confirmation: 'APPLY pro v1', actor: 'attacker', actorKey: 'attacker' }),
        })
        assert.equal(response.status, 200)
        assert.equal(authorization, 'Bearer publish-secret')
        assert.equal(forwardedPath, '/admin/control-plane/profiles/apply')
        const forwarded = JSON.parse(forwardedBody)
        assert.match(forwarded.actorKey, /^arp_[a-f0-9]{64}$/)
        assert.equal(forwarded.actor, undefined)
        assert.notEqual(forwarded.actorKey, 'attacker')
        assert.doesNotMatch(JSON.stringify(await response.json()), /publish-secret|attacker/)
      })
    }
    await withServer({ FIXVOX_ADMIN_BASE_URL: 'http://127.0.0.1:18988', ADMIN_PUBLISH_API_KEY: 'publish-secret' }, async () => {
      const stale = await fetch(`${baseUrl}/api/admin/profiles/apply`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId: 'pro', expectedActiveVersion: 99 }),
      })
      assert.equal(stale.status, 409)
      assert.deepEqual(await stale.json(), { ok: false, error: { code: 'profile_version_stale', message: 'La versión del perfil cambió. Recargá y revisá los cambios.' } })
      const transient = await fetch(`${baseUrl}/api/admin/profiles/apply`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ profileId: 'pro', expectedActiveVersion: 98 }),
      })
      assert.equal(transient.status, 503)
      assert.deepEqual(await transient.json(), { ok: false, error: { code: 'profile_apply_unavailable', message: 'No se pudieron aplicar los cambios. Intentá nuevamente.' } })
    })
  } finally {
    stub.close()
    await once(stub, 'close')
  }
})

test('usage endpoint and workbench expose only redacted bounded operational metrics', async () => {
  await withServer({}, async () => {
    const response = await fetch(`${baseUrl}/api/admin/usage`)
    assert.equal(response.status, 200)
    const payload = await response.json()
    assert.equal(payload.coverage.recentEventCap, 100)
    assert.equal(payload.coverage.prewarmRetentionDays, 7)
    assert.equal(payload.rows[0].prewarm.available, true)
    assert.equal(payload.rows[1].quota.transcription.state, 'blocked')
    assert.doesNotMatch(JSON.stringify(payload), /install-sensitive|account-sensitive|device-sensitive|raw content/i)
  })

  const appSource = await fs.readFile(new URL('./public/app.js', import.meta.url), 'utf8')
  assert.match(appSource, /prewarm no disponible/)
  assert.match(appSource, /Sin devices conocidos en la ventana actual/)
  assert.match(appSource, /quotaStatus/)
  assert.match(appSource, /cobertura parcial/)
})

test('Control Room keeps Pi Chat as a visible primary navigation area', async () => {
  const appSource = await fs.readFile(new URL('./public/app.js', import.meta.url), 'utf8')
  assert.match(appSource, /chat:\s*\{\s*label:\s*'Pi Chat'/)
  assert.ok(appSource.indexOf("if (key === 'chat')") < appSource.indexOf('const area = CONTROL_ROOM_AREAS[key]', appSource.indexOf('function wireDynamicEvents')))
})

test('Pi Chat renders only assistant messages and waits until the RPC run settles', async () => {
  const appSource = await fs.readFile(new URL('./public/app.js', import.meta.url), 'utf8')
  const serverSource = await fs.readFile(new URL('./server.mjs', import.meta.url), 'utf8')
  const handler = appSource.slice(appSource.indexOf('function handlePiEvent'), appSource.indexOf('function handleUiRequest'))
  const promptBridge = serverSource.slice(serverSource.indexOf('async prompt(message, onEvent)'), serverSource.indexOf('subscribe(handler)'))

  assert.match(appSource, /value\.role\s*&&\s*value\.role\s*!==\s*'assistant'/)
  assert.match(handler, /event\.message\?\.role\s*===\s*'assistant'/)
  assert.doesNotMatch(promptBridge, /event\.type\s*===\s*'agent_end'\)\s*finish/)
  assert.match(promptBridge, /event\.type\s*===\s*'agent_settled'\)\s*finish/)
})

test('Pi Chat owns the viewport and hides activity without affecting other Admin views', async () => {
  const appSource = await fs.readFile(new URL('./public/app.js', import.meta.url), 'utf8')
  const styles = await fs.readFile(new URL('./public/styles.css', import.meta.url), 'utf8')
  const chatShellRule = styles.indexOf('/* Pi Chat viewport shell:')

  assert.match(appSource, /document\.body\.dataset\.adminView\s*=\s*state\.activeView/)
  assert.ok(chatShellRule >= 0)
  assert.match(styles.slice(chatShellRule), /body\[data-admin-view="chat"\]\s*\{[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/)
  assert.match(styles.slice(chatShellRule), /body\[data-admin-view="chat"\]\s+\.activity-card\s*\{\s*display:\s*none;/)
  assert.match(styles.slice(chatShellRule), /body\[data-admin-view="chat"\]\s+\.pi-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.doesNotMatch(styles.slice(chatShellRule), /body:not\(\[data-admin-view="chat"\]\)/)
})
