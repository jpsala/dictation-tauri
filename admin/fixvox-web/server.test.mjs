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
    env: { ...process.env, FIXVOX_ADMIN_MOCK: '1', FIXVOX_ADMIN_HOST: '127.0.0.1', FIXVOX_ADMIN_PORT: String(port), ...env },
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

test('owner Settings routes manage roles while returning only redacted bindings', async () => {
  await withServer({}, async () => {
    const created = await fetch(`${baseUrl}/api/admin/roles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subjectEmail: 'publisher@example.com', role: 'publisher' }),
    })
    assert.equal(created.status, 200)
    assert.match(JSON.stringify(await created.json()), /p…@example\.com/)
    const removed = await fetch(`${baseUrl}/api/admin/roles/remove`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subjectEmail: 'publisher@example.com' }),
    })
    assert.equal(removed.status, 200)
    const finalOwner = await fetch(`${baseUrl}/api/admin/roles/remove`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ subjectEmail: 'jpsala@gmail.com' }),
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

test('Pi Chat narrow layout stacks activity without horizontal overflow', async () => {
  const styles = await fs.readFile(new URL('./public/styles.css', import.meta.url), 'utf8')
  const finalResponsiveRule = styles.lastIndexOf('@media (max-width: 1180px)')
  const finalTwoColumnRule = styles.lastIndexOf('.pi-grid { grid-template-columns: minmax(0, 1fr) 340px; }')

  assert.ok(finalResponsiveRule > finalTwoColumnRule)
  assert.match(styles.slice(finalResponsiveRule), /\.pi-grid\s*\{\s*grid-template-columns:\s*minmax\(0,\s*1fr\)/)
  assert.match(styles.slice(finalResponsiveRule), /\.activity-card\s*\{[^}]*overflow:\s*visible/)
  assert.match(styles, /\.admin-main,\s*\.pi-page,\s*\.pi-grid,\s*\.chat-card,\s*\.activity-card\s*\{\s*min-width:\s*0/)
})
