#!/usr/bin/env node
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-')
const outputDir = path.join(repoRoot, 'artifacts', 'ui-spikes', 'admin-web-ui-smoke', runId)
const port = Number(process.env.FIXVOX_ADMIN_SMOKE_PORT || 8807)
const baseUrl = `http://127.0.0.1:${port}`

await fs.mkdir(outputDir, { recursive: true })
const serverLog = path.join(outputDir, 'server.log')
const serverLogHandle = await fs.open(serverLog, 'w')
const child = spawn(process.execPath, ['admin/fixvox-web/server.mjs'], {
  cwd: repoRoot,
  env: { ...process.env, FIXVOX_ADMIN_MOCK: '1', FIXVOX_ADMIN_PORT: String(port), FIXVOX_ADMIN_HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})
child.stdout.pipe(serverLogHandle.createWriteStream())
child.stderr.pipe(serverLogHandle.createWriteStream())

async function stopServer() {
  child.kill('SIGTERM')
  await serverLogHandle.close().catch(() => {})
}
async function waitForHealth() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try { if ((await fetch(`${baseUrl}/healthz`)).ok) return } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('admin web mock server did not become healthy')
}
const report = { ok: false, runId, baseUrl, outputDir: path.relative(repoRoot, outputDir).replace(/\\/g, '/'), checks: [], screenshot: '', screenshots: {} }
function check(name, value, details = {}) {
  report.checks.push({ name, ok: Boolean(value), ...details })
  if (!value) throw new Error(`check failed: ${name}`)
}
async function snap(page, name) {
  const target = path.join(outputDir, `fixvox-admin-${name}.png`)
  await page.screenshot({ path: target, fullPage: true })
  report.screenshots[name] = path.relative(repoRoot, target).replace(/\\/g, '/')
  return report.screenshots[name]
}

let browser
try {
  await waitForHealth()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/admin/pi`, { waitUntil: 'networkidle' })

  check('people title rendered', (await page.locator('.pi-header h1').innerText()) === 'Personas')
  await page.getByRole('heading', { name: 'Cuentas' }).waitFor({ timeout: 10_000 })
  check('current admin identity rendered', await page.locator('#messages').getByText('Tu cuenta').first().isVisible())
  check('current email is masked', await page.locator('#messages').getByText('j…@gmail.com').first().isVisible())
  check('full email is absent', await page.locator('#messages').getByText('jpsala@gmail.com').count() === 0)
  check('linked devices render', await page.locator('#messages').getByText('dev_redacted_owner').first().isVisible())
  check('group runtime source renders', await page.locator('#messages .source-chip.group', { hasText: 'Group targeting' }).first().isVisible())
  check('account budget control renders', await page.locator('#messages .account-budget').isVisible())
  check('account groups render', await page.locator('#messages .groups-panel').isVisible())
  check('legacy overrides are read only', await page.locator('#messages [data-update-account-segments], #messages [data-create-account-variant]').count() === 0)
  await snap(page, 'people')

  await page.locator('#messages [data-select-entity]', { hasText: 'Tu cuenta' }).click()
  await page.getByTitle('Pi Chat').click()
  check('chat title rendered', (await page.locator('.pi-header h1').innerText()) === 'Pi Chat')
  check('selected person reaches chat', (await page.locator('#main-subtitle').innerText()).includes('selección: Juan Pablo Sala'))
  check('send disabled when empty', await page.locator('#send-button').isDisabled())
  check('abort disabled while idle', await page.locator('#abort-button').isDisabled())

  await page.getByTitle('Comportamiento').click()
  await page.getByRole('heading', { name: 'Comportamiento', level: 2 }).waitFor({ timeout: 10_000 })
  check('behavior renders preset sync', await page.locator('.presets-cloud-sync').getByText('Selection presets Cloud sync').isVisible())
  check('behavior excludes technical catalogs', await page.locator('.engines-catalog, .prompts-catalog').count() === 0)

  await page.getByTitle('Sistema avanzado').click()
  await page.getByRole('heading', { name: 'Sistema avanzado', level: 2 }).waitFor({ timeout: 10_000 })
  check('system defaults to engines', await page.locator('[data-configuration-tab="engines"]').getAttribute('aria-current') === 'page')
  check('engine catalog renders', await page.locator('.engines-catalog').getByText('Motores editables').isVisible())
  check('engine pricing renders', await page.locator('.engine-card', { hasText: 'Groq Whisper Turbo' }).locator('.price-badge').first().isVisible())
  await page.getByRole('button', { name: 'Instrucciones', exact: true }).click()
  check('prompt catalog renders', await page.locator('.prompts-catalog').getByText('Prompts editables').isVisible())
  await page.getByRole('button', { name: 'Perfiles', exact: true }).click()
  check('published profile summary renders', await page.locator('.profile-summary-card').getByRole('heading', { name: 'Resumen' }).isVisible())
  check('published profile access renders', await page.locator('.profile-summary-card').getByRole('heading', { name: 'Acceso' }).isVisible())
  check('published profile runtime renders', await page.locator('.profile-summary-card').getByRole('heading', { name: 'Runtime' }).isVisible())
  check('published profile limits render', await page.locator('.profile-summary-card').getByRole('heading', { name: 'Límites' }).isVisible())
  await page.getByRole('button', { name: 'Editar cambios', exact: true }).click()
  await page.locator('[data-profile-editor] input[name="label"]').fill('Pro local smoke')
  await page.getByRole('button', { name: 'Revisar cambios', exact: true }).click()
  check('local profile review renders diff', await page.locator('.profile-review .profile-diff').isVisible())
  check('review does not apply implicitly', await page.locator('.profile-review').getByText('La revisión no envía requests.').isVisible())
  await page.getByRole('button', { name: 'Cancelar edición', exact: true }).click()
  check('cancel restores published profile', await page.locator('.policy-detail h3').getByText('Pro', { exact: true }).isVisible())
  await snap(page, 'system-profiles')

  await page.getByTitle('Uso').click()
  await page.getByRole('heading', { name: 'Uso, costos y budgets' }).waitFor({ timeout: 10_000 })
  check('usage summary renders', await page.locator('#messages').getByText('Requests hoy').first().isVisible())
  check('usage dimensions render', await page.locator('.usage-breakdown').count() === 3 && await page.getByText('Por engine', { exact: true }).isVisible() && await page.getByText('Por prompt', { exact: true }).isVisible() && await page.getByText('Por profile', { exact: true }).isVisible())

  await page.getByTitle('Planes y acceso').click()
  await page.getByRole('heading', { name: 'Role bindings' }).waitFor({ timeout: 10_000 })
  await page.locator('.role-binding-row').first().waitFor({ timeout: 10_000 })
  check('RBAC bindings render', await page.locator('.settings-role-panel').first().isVisible())
  check('RBAC email is display-only and redacted', await page.locator('.role-binding-row').getByText('j…@gmail.com').isVisible() && await page.getByText('jpsala@gmail.com').count() === 0)
  check('RBAC mutation uses linked principal selector', await page.locator('[data-save-role] select[name="principalKey"]').isVisible())
  check('RBAC mutation accepts no email authority', await page.locator('[data-save-role] input[type="email"], [data-remove-role] input[type="email"]').count() === 0)
  const principalValues = await page.locator('[data-save-role] select[name="principalKey"] option').evaluateAll((options) => options.map((option) => option.value))
  check('linked principal keys are opaque', principalValues.length > 0 && principalValues.every((value) => /^arp_[a-f0-9]{64}$/.test(value)))
  const adminRoutes = await page.evaluate(() => performance.getEntriesByType('resource').map((entry) => new URL(entry.name).pathname).filter((item) => item.startsWith('/api/admin/')))
  check('browser uses only admin BFF routes', adminRoutes.length > 0 && adminRoutes.every((item) => item.startsWith('/api/admin/')), { routeCount: adminRoutes.length })
  await snap(page, 'access')

  await page.getByTitle('Auditoría').click()
  await page.getByRole('heading', { name: 'Historial de cambios' }).waitFor({ timeout: 10_000 })
  check('audit view is read only', await page.locator('#messages form, #messages button').count() === 0)

  await page.getByTitle('Pi Chat').click()
  check('chat context subtitle renders', (await page.locator('#main-subtitle').innerText()).includes('vista: Pi Chat'))
  await page.locator('#prompt').fill('LINE1')
  await page.locator('#prompt').press('Shift+Enter')
  await page.locator('#prompt').pressSequentially('LINE2')
  check('shift enter inserts newline', (await page.locator('#prompt').inputValue()) === 'LINE1\nLINE2')
  await page.locator('#prompt').press('Enter')
  await page.getByText('Modo local mock listo').waitFor({ timeout: 10_000 })
  check('enter submits prompt', await page.getByText('Modo local mock listo').isVisible())
  await page.locator('#prompt').fill('FIXVOX_ADMIN_UI_SMOKE')
  check('send enables with text', !(await page.locator('#send-button').isDisabled()))
  await page.locator('#send-button').click()
  await page.getByText('FIXVOX_LOCAL_MOCK_OK').waitFor({ timeout: 10_000 })
  check('mock response renders', await page.getByText('FIXVOX_LOCAL_MOCK_OK').isVisible())
  check('tool activity stays mounted while Activity is hidden', await page.locator('.tool-card', { hasText: 'fixvox.local_ui_probe' }).count() > 0 && await page.locator('.activity-card').isHidden())
  await page.locator('#prompt').fill('FIXVOX_FINAL_MESSAGE_EVENT')
  await page.locator('#send-button').click()
  await page.getByText('FIXVOX_FINAL_MESSAGE_OK').waitFor({ timeout: 10_000 })
  check('final message event renders', await page.getByText('FIXVOX_FINAL_MESSAGE_OK').isVisible())
  await page.locator('#prompt').fill('FIXVOX_UI_REQUEST_SELECT')
  await page.locator('#send-button').click()
  await page.getByText('Pi necesita una respuesta: Elegí ambiente').waitFor({ timeout: 10_000 })
  check('select request renders', await page.getByText('Pi necesita una respuesta: Elegí ambiente').isVisible())
  await page.locator('[data-request-action="option"][data-value="local"]').click()
  await page.getByText('Pi necesita una respuesta: Elegí ambiente').waitFor({ state: 'detached', timeout: 10_000 })
  check('select response clears request', !(await page.getByText('Pi necesita una respuesta: Elegí ambiente').isVisible().catch(() => false)))

  report.screenshot = await snap(page, 'ui-smoke')
  report.screenshots.final = report.screenshot
  await page.setViewportSize({ width: 1000, height: 760 })
  const drawerWidth = await page.locator('.admin-drawer').evaluate((element) => Math.round(element.getBoundingClientRect().width))
  check('tablet sidebar collapses to rail', drawerWidth <= 90, { drawerWidth })
  await snap(page, 'tablet-rail')
  report.ok = true
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error)
  process.exitCode = 1
} finally {
  if (browser) await browser.close().catch(() => {})
  await fs.writeFile(path.join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await stopServer()
  console.log(JSON.stringify(report, null, 2))
}
