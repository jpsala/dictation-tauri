#!/usr/bin/env node
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chromium } from 'playwright'

const port = 8811
const baseUrl = `http://127.0.0.1:${port}`
const child = spawn(process.execPath, ['admin/fixvox-web/server.mjs'], { env: { ...process.env, FIXVOX_ADMIN_MOCK: '1', FIXVOX_ADMIN_PORT: String(port), FIXVOX_ADMIN_HOST: '127.0.0.1' }, stdio: 'ignore', windowsHide: true })
try {
  for (let i = 0; i < 80; i += 1) {
    try {
      // nosemgrep: local mock health check; this test never reaches a remote endpoint.
      const response = await fetch(`${baseUrl}/healthz`)
      if (response.ok) break
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  const legacyDraft = await fetch(`${baseUrl}/api/admin/profiles/drafts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profileId: 'pro', draftProfileId: 'legacy-only', label: 'Legacy draft aislado' }),
  })
  assert.equal(legacyDraft.status, 200)
  const inventory = await fetch(`${baseUrl}/api/admin/profiles/legacy-drafts`)
  assert.deepEqual(await inventory.json(), { drafts: [{ profileId: 'legacy-only', draftVersion: 1, basedOnVersion: 1 }] })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } })
  let applies = 0
  await page.route('**/api/admin/profiles/apply', async (route) => {
    applies += 1
    const body = JSON.parse(route.request().postData() || '{}')
    assert.equal(body.confirmation, `APPLY ${body.profileId} v${body.expectedActiveVersion}`)
    assert.equal(body.definition.version, undefined)
    await route.fulfill({ status: applies === 2 ? 409 : 200, contentType: 'application/json', body: JSON.stringify(applies === 2 ? { ok: false, error: { code: 'profile_version_stale', message: 'La versión del perfil cambió. Recargá y revisá los cambios.' } } : { ok: true, published: { version: 3 } }) })
  })
  await page.goto(`${baseUrl}/admin/pi`, { waitUntil: 'networkidle' })
  const piChat = page.getByRole('button', { name: 'Pi Chat', exact: true })
  assert.equal(await piChat.isVisible(), true)
  await piChat.click()
  assert.equal(await page.getByRole('heading', { name: 'Pi Chat', exact: true }).isVisible(), true)
  assert.equal(await page.locator('#composer').isVisible(), true)
  await page.getByTitle('Sistema avanzado').click()
  await page.getByRole('button', { name: 'Perfiles', exact: true }).click()
  assert.equal(await page.getByText('Legacy draft aislado', { exact: true }).count(), 0)
  assert.equal(await page.getByText('legacy-only', { exact: true }).count(), 0)
  await page.getByRole('button', { name: 'Editar cambios', exact: true }).click()
  const editor = page.locator('[data-profile-editor]')
  await editor.locator('input[name="label"]').fill('Pro local')
  assert.equal(applies, 0)
  await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
  await page.locator('.profile-review').waitFor()
  await page.getByRole('button', { name: 'Aplicar cambios', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar y aplicar', exact: true }).click()
  await page.getByText('Cambios aplicados como una nueva versión publicada.').waitFor()
  assert.equal(applies, 1)
  await page.getByRole('button', { name: 'Editar cambios', exact: true }).click()
  await page.locator('[data-profile-editor] input[name="label"]').fill('Pro stale')
  await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
  await page.getByRole('button', { name: 'Aplicar cambios', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmar y aplicar', exact: true }).click()
  await page.getByText('La versión cambió. Se recargó la autoridad; revisá los cambios nuevamente.').waitFor()
  assert.equal(applies, 2)
  assert.equal(await page.locator('[data-profile-editor]').count(), 0)
  await browser.close()
} finally { child.kill('SIGTERM'); await once(child, 'exit').catch(() => {}) }
