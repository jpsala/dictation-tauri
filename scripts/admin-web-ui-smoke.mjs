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
  env: {
    ...process.env,
    FIXVOX_ADMIN_MOCK: '1',
    FIXVOX_ADMIN_PORT: String(port),
    FIXVOX_ADMIN_HOST: '127.0.0.1',
  },
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
    try {
      const response = await fetch(`${baseUrl}/healthz`)
      if (response.ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('admin web mock server did not become healthy')
}

const report = {
  ok: false,
  runId,
  baseUrl,
  outputDir: path.relative(repoRoot, outputDir).replace(/\\/g, '/'),
  checks: [],
  screenshot: '',
  screenshots: {},
}
function check(name, value, details = {}) {
  report.checks.push({ name, ok: Boolean(value), ...details })
  if (!value) throw new Error(`check failed: ${name}`)
}

let browser
try {
  await waitForHealth()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 1 })
  await page.goto(`${baseUrl}/admin/pi`, { waitUntil: 'networkidle' })

  check('chat title rendered', (await page.locator('.pi-header h1').innerText()) === 'Chat')
  check('composer send disabled empty', await page.locator('#send-button').isDisabled())
  check('abort disabled idle', await page.locator('#abort-button').isDisabled())

  await page.getByTitle('Dashboard').click()
  check('dashboard route renders', (await page.locator('.admin-workbench h2').innerText()) === 'Control room Fixvox')
  await page.getByTitle('Accounts').click()
  await page.getByRole('heading', { name: 'Cuentas' }).waitFor({ timeout: 10_000 })
  await page.locator('#messages').getByRole('heading', { name: 'jpsala@gmail.com' }).waitFor({ timeout: 10_000 })
  check('accounts workbench renders full email identity', await page.locator('#messages').getByText('jpsala@gmail.com').count() > 0)
  check('group runtime source visible in account table', await page.locator('#messages .accounts-table .source-chip.group', { hasText: 'Group targeting' }).first().isVisible())
  check('account detail renders linked devices', await page.locator('#messages').getByText('dev_redacted_owner').first().isVisible())
  await page.locator('#messages .policy-option', { hasText: 'alpha-full' }).click()
  await page.getByText('Preview de cambio').waitFor({ timeout: 10_000 })
  check('account policy preview shows impact', await page.getByText('Afecta esta cuenta').isVisible())
  await page.getByRole('button', { name: 'Aplicar cambio' }).click()
  await page.locator('#messages .account-detail .entity-card-head .policy-badge', { hasText: 'alpha-full' }).first().waitFor({ timeout: 10_000 })
  check('account policy apply updates selected account', await page.locator('#messages .account-detail .entity-card-head .policy-badge', { hasText: 'alpha-full' }).first().isVisible())
  check('effective profile source shows account override', await page.locator('#messages .effective-settings').getByText('source: Account override').isVisible())
  check('account budget override panel visible', await page.locator('#messages .account-budget').getByText('Budget override del usuario').isVisible())
  await page.locator('#messages .account-budget input[name="dailyUsd"]').fill('9')
  await page.locator('#messages .account-budget button[type="submit"]').click()
  await page.locator('#messages .account-budget input[name="dailyUsd"]').waitFor({ timeout: 10_000 })
  check('account budget override can be changed', (await page.locator('#messages .account-budget input[name="dailyUsd"]').inputValue()) === '9')
  check('account groups panel visible', await page.locator('#messages .groups-panel .eyebrow').getByText('Groups', { exact: true }).isVisible())
  check('account group shows runtime target', await page.locator('#messages .groups-panel .segment-option', { hasText: 'Paid' }).getByText('→ Pro').isVisible())
  await page.locator('#messages .groups-panel .segment-option', { hasText: 'Private alpha' }).click()
  await page.locator('#messages .groups-panel .segment-option.selected', { hasText: 'Private alpha' }).waitFor({ timeout: 10_000 })
  check('account group can be toggled', await page.locator('#messages .groups-panel .segment-option.selected', { hasText: 'Private alpha' }).isVisible())
  await page.locator('#messages .groups-panel .variant-create summary').click()
  const groupCreateForm = page.locator('#messages .groups-panel .variant-create form')
  await groupCreateForm.locator('input[name="label"]').fill('Beta testers')
  await groupCreateForm.locator('input[name="description"]').fill('grupo beta interno')
  await groupCreateForm.locator('button[type="submit"]').click()
  await page.locator('#messages .groups-panel .segment-option', { hasText: 'Beta testers' }).waitFor({ timeout: 10_000 })
  check('custom group creation appears in account groups', await page.locator('#messages .groups-panel .segment-option', { hasText: 'Beta testers' }).isVisible())
  check('account overrides panel visible', await page.locator('#messages .segment-row.active', { hasText: 'Debug tools' }).isVisible())
  await page.locator('#messages .segment-picker summary').click()
  await page.locator('#messages .segment-option', { hasText: '+ New UI' }).click()
  await page.locator('#messages .segment-row.active', { hasText: 'New UI' }).waitFor({ timeout: 10_000 })
  check('account override updates effective settings', await page.locator('#messages .effective-settings').getByText('New UI: habilita variantes nuevas de UI').isVisible())
  check('account override effects visible', await page.locator('#messages .effective-settings').getByText('uiVariant: next').isVisible())
  const accountsScreenshot = path.join(outputDir, 'fixvox-admin-accounts-detail.png')
  await page.screenshot({ path: accountsScreenshot, fullPage: true })
  report.screenshots.accounts = path.relative(repoRoot, accountsScreenshot).replace(/\\/g, '/')
  await page.locator('#messages [data-select-entity][data-entity-id="acc_jp_owner"]').click()
  await page.getByTitle('Chat').click()
  check('selected entity reaches chat context', (await page.locator('#main-subtitle').innerText()).includes('selección: jpsala@gmail.com'))
  await page.getByTitle('Devices').click()
  await page.getByRole('heading', { name: 'Dispositivos' }).waitFor({ timeout: 10_000 })
  check('cross-view account selection clears on devices', !(await page.locator('#main-subtitle').innerText()).includes('jpsala@gmail.com'))
  await page.locator('#messages').getByRole('heading', { name: 'dev_redacted_owner' }).waitFor({ timeout: 10_000 })
  check('devices workbench renders', await page.locator('#messages').getByText('dev_redacted_owner').count() > 0)
  check('device detail renders policy options', await page.locator('#messages .device-detail').getByText('Policy options').isVisible())
  const devicesScreenshot = path.join(outputDir, 'fixvox-admin-devices-detail.png')
  await page.screenshot({ path: devicesScreenshot, fullPage: true })
  report.screenshots.devices = path.relative(repoRoot, devicesScreenshot).replace(/\\/g, '/')
  await page.locator('#messages [data-select-entity][data-entity-id="dev_redacted_owner"]').click()
  await page.getByTitle('Chat').click()
  check('selected device reaches chat context', (await page.locator('#main-subtitle').innerText()).includes('selección: dev_redacted_owner'))
  await page.getByTitle('Profiles').click()
  await page.getByRole('heading', { name: 'Profiles y overrides' }).waitFor({ timeout: 10_000 })
  check('profiles workbench renders', await page.locator('.policy-detail h3').getByText('Pro').isVisible())
  check('engine catalog renders', await page.locator('#messages .engines-catalog').getByText('Motores editables').isVisible())
  check('engine pricing renders', await page.locator('#messages .engine-card', { hasText: 'Groq Whisper Turbo' }).locator('.price-badge').first().isVisible())
  check('prompt catalog renders', await page.locator('#messages .prompts-catalog').getByText('Prompts editables').isVisible())
  check('saved overrides catalog renders', await page.locator('#messages .variants-catalog').getByText('Overrides reutilizables').isVisible())
  check('profile engines panel renders', await page.locator('#messages .policy-engines').getByText('Motores de ejecución').isVisible())
  check('profile budget panel renders', await page.locator('#messages .policy-budget').getByText('Budget del profile').isVisible())
  await page.locator('#messages .policy-budget input[name="dailyUsd"]').fill('6')
  await page.locator('#messages .policy-budget button[type="submit"]').click()
  await page.locator('#messages .policy-budget input[name="dailyUsd"]').waitFor({ timeout: 10_000 })
  check('profile budget can be changed', (await page.locator('#messages .policy-budget input[name="dailyUsd"]').inputValue()) === '6')
  await page.locator('#messages .policy-engines select[data-policy-engine="postprocess"]').selectOption('postprocess-openrouter-premium')
  await page.waitForFunction(() => document.querySelector('#messages .policy-engines select[data-policy-engine="postprocess"]')?.value === 'postprocess-openrouter-premium', null, { timeout: 10_000 })
  check('profile engine can be changed', (await page.locator('#messages .policy-engines select[data-policy-engine="postprocess"]').inputValue()) === 'postprocess-openrouter-premium')
  check('profile included overrides panel renders', await page.locator('#messages .policy-default-variants').getByText('Overrides incluidos').isVisible())
  await page.locator('#messages .policy-default-variants .segment-option', { hasText: 'New UI' }).click()
  await page.locator('#messages .policy-default-variants .segment-option.selected', { hasText: 'New UI' }).waitFor({ timeout: 10_000 })
  check('profile included override can be toggled', await page.locator('#messages .policy-default-variants .segment-option.selected', { hasText: 'New UI' }).isVisible())
  await page.locator('#messages .engines-catalog .variant-create summary').click()
  const engineCreateForm = page.locator('#messages .engines-catalog .variant-create form')
  await engineCreateForm.locator('input[name="label"]').fill('Sonnet JP')
  await engineCreateForm.locator('select[name="kind"]').selectOption('postprocess')
  await engineCreateForm.locator('select[name="tier"]').selectOption('premium')
  await engineCreateForm.locator('input[name="provider"]').fill('openrouter')
  await engineCreateForm.locator('input[name="model"]').fill('anthropic/claude-sonnet-4')
  await engineCreateForm.locator('input[name="notes"]').fill('premium owner')
  await engineCreateForm.locator('button[type="submit"]', { hasText: 'Crear motor' }).click()
  await page.locator('#messages .engine-card', { hasText: 'Sonnet JP' }).waitFor({ timeout: 10_000 })
  check('custom engine creation appears in catalog', await page.locator('#messages .engine-card', { hasText: 'Sonnet JP' }).isVisible())
  await page.locator('#messages .prompts-catalog .variant-create summary').click()
  const promptCreateForm = page.locator('#messages .prompts-catalog .variant-create form')
  await promptCreateForm.locator('input[name="id"]').fill('postProcessBase.v2')
  await promptCreateForm.locator('input[name="label"]').fill('Post-process v2')
  await promptCreateForm.locator('select[name="kind"]').selectOption('postprocess')
  await promptCreateForm.locator('input[name="summary"]').fill('cleanup mas estricto')
  await promptCreateForm.locator('textarea[name="content"]').fill('Devuelve solo texto limpio.')
  await promptCreateForm.locator('button[type="submit"]', { hasText: 'Crear prompt' }).click()
  await page.locator('#messages .prompt-card', { hasText: 'Post-process v2' }).waitFor({ timeout: 10_000 })
  check('custom prompt creation appears in catalog', await page.locator('#messages .prompt-card', { hasText: 'Post-process v2' }).isVisible())
  await page.locator('#messages .variants-catalog .variant-create summary').click()
  const overrideCreateForm = page.locator('#messages .variants-catalog .variant-create form')
  await overrideCreateForm.locator('input[name="label"]').fill('Ultra fast')
  await overrideCreateForm.locator('input[name="description"]').fill('prioriza latencia baja')
  await overrideCreateForm.locator('select[name="preset"]').selectOption('lowCost')
  await overrideCreateForm.locator('button[type="submit"]').click()
  const ultraFastCard = page.locator('#messages .variant-card', { hasText: 'Ultra fast' })
  await ultraFastCard.waitFor({ timeout: 10_000 })
  check('custom override creation appears in catalog', await ultraFastCard.isVisible())
  check('override edit action visible', await page.locator('#messages .variant-card', { hasText: 'Owner' }).getByText('Editar').isVisible())
  check('custom override delete action visible', await ultraFastCard.getByRole('button', { name: 'Borrar' }).isVisible())
  page.once('dialog', (dialog) => dialog.accept())
  await ultraFastCard.getByRole('button', { name: 'Borrar' }).click()
  await page.locator('#messages .variant-card', { hasText: 'Ultra fast' }).waitFor({ state: 'hidden', timeout: 10_000 })
  check('custom variant delete removes card', await page.locator('#messages .variant-card', { hasText: 'Ultra fast' }).count() === 0)
  await page.getByTitle('Usage').click()
  await page.getByRole('heading', { name: 'Uso, costos y budgets' }).waitFor({ timeout: 10_000 })
  check('usage workbench renders', await page.locator('#messages').getByText('Requests hoy').first().isVisible())
  await page.locator('#messages .usage-breakdown', { hasText: 'Por engine' }).locator('tbody tr').first().waitFor({ timeout: 10_000 })
  check('usage engine breakdown renders', await page.locator('#messages .usage-breakdown', { hasText: 'Por engine' }).locator('tbody tr').count() > 0)
  check('usage prompt breakdown renders', await page.locator('#messages .usage-breakdown', { hasText: 'Por prompt' }).locator('tbody tr').count() > 0)
  check('usage profile breakdown renders', await page.locator('#messages .usage-breakdown', { hasText: 'Por profile' }).locator('tbody tr').count() > 0)
  const workbenchScreenshot = path.join(outputDir, 'fixvox-admin-workbench-usage.png')
  await page.screenshot({ path: workbenchScreenshot, fullPage: true })
  report.screenshots.workbench = path.relative(repoRoot, workbenchScreenshot).replace(/\\/g, '/')
  await page.getByTitle('Mi cuenta').click()
  check('account route renders', (await page.locator('#main-title').innerText()) === 'Mi cuenta')
  await page.getByTitle('Chat').click()
  check('chat context subtitle visible', (await page.locator('#main-subtitle').innerText()).includes('vista: Chat'))

  await page.locator('#prompt').fill('LINE1')
  await page.locator('#prompt').press('Shift+Enter')
  await page.locator('#prompt').pressSequentially('LINE2')
  check('shift enter inserts newline', (await page.locator('#prompt').inputValue()) === 'LINE1\nLINE2')
  await page.locator('#prompt').press('Enter')
  await page.getByText('Modo local mock listo').waitFor({ timeout: 10_000 })
  check('enter submits prompt', await page.getByText('Modo local mock listo').isVisible())

  await page.locator('#prompt').fill('FIXVOX_ADMIN_UI_SMOKE')
  check('composer send enabled with text', !(await page.locator('#send-button').isDisabled()))
  await page.locator('#send-button').click()
  await page.getByText('FIXVOX_LOCAL_MOCK_OK').waitFor({ timeout: 10_000 })
  check('mock prompt response visible', await page.getByText('FIXVOX_LOCAL_MOCK_OK').isVisible())
  check('tool activity visible', await page.getByText('fixvox.local_ui_probe').first().isVisible())
  check('tool card is details', await page.locator('.tool-card details').count() > 0)

  await page.locator('#prompt').fill('FIXVOX_FINAL_MESSAGE_EVENT')
  await page.locator('#send-button').click()
  await page.getByText('FIXVOX_FINAL_MESSAGE_OK').waitFor({ timeout: 10_000 })
  check('final message event rendered', await page.getByText('FIXVOX_FINAL_MESSAGE_OK').isVisible())

  await page.locator('#prompt').fill('FIXVOX_UI_REQUEST_SELECT')
  await page.locator('#send-button').click()
  await page.getByText('Pi necesita una respuesta: Elegí ambiente').waitFor({ timeout: 10_000 })
  check('select ui request rendered', await page.getByText('Pi necesita una respuesta: Elegí ambiente').isVisible())
  const requestScreenshot = path.join(outputDir, 'fixvox-admin-ui-request-card.png')
  await page.screenshot({ path: requestScreenshot, fullPage: true })
  report.screenshots.requestCard = path.relative(repoRoot, requestScreenshot).replace(/\\/g, '/')
  await page.locator('[data-request-action="option"][data-value="local"]').click()
  await page.getByText('Pi necesita una respuesta: Elegí ambiente').waitFor({ state: 'detached', timeout: 10_000 })
  check('select ui request response clears card', !(await page.getByText('Pi necesita una respuesta: Elegí ambiente').isVisible().catch(() => false)))

  await page.locator('#prompt').fill('FIXVOX_UI_REQUEST_INPUT')
  await page.locator('#send-button').click()
  await page.getByText('Pi necesita una respuesta: Nombre de sesión').waitFor({ timeout: 10_000 })
  await page.locator('.request-card textarea').last().fill('smoke session')
  await page.locator('.request-card [data-request-action="respond"]').last().click()
  await page.getByText('Pi necesita una respuesta: Nombre de sesión').waitFor({ state: 'detached', timeout: 10_000 })
  check('input ui request response clears card', !(await page.getByText('Pi necesita una respuesta: Nombre de sesión').isVisible().catch(() => false)))

  await page.locator('#prompt').fill('FIXVOX_UI_REQUEST_EDITOR')
  await page.locator('#send-button').click()
  await page.getByText('Pi necesita una respuesta: Editar prompt').waitFor({ timeout: 10_000 })
  check('editor ui request textarea rendered', await page.locator('.request-card textarea.editor').last().isVisible())
  await page.locator('.request-card [data-request-action="cancel"]').last().click()
  await page.getByText('Pi necesita una respuesta: Editar prompt').waitFor({ state: 'detached', timeout: 10_000 })

  await page.locator('#prompt').fill('FIXVOX_UI_REQUEST_CONFIRM')
  await page.locator('#send-button').click()
  await page.getByText('Pi necesita una respuesta: Confirmar acción').waitFor({ timeout: 10_000 })
  await page.locator('.request-card [data-request-action="confirm"]').last().click()
  await page.getByText('Pi necesita una respuesta: Confirmar acción').waitFor({ state: 'detached', timeout: 10_000 })
  check('confirm ui request response clears card', !(await page.getByText('Pi necesita una respuesta: Confirmar acción').isVisible().catch(() => false)))

  const screenshot = path.join(outputDir, 'fixvox-admin-ui-smoke.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  report.screenshot = path.relative(repoRoot, screenshot).replace(/\\/g, '/')
  report.screenshots.final = report.screenshot

  await page.setViewportSize({ width: 1000, height: 760 })
  await page.getByTitle('Chat').click()
  const drawerWidth = await page.locator('.admin-drawer').evaluate((element) => Math.round(element.getBoundingClientRect().width))
  check('tablet sidebar collapses to rail', drawerWidth <= 90, { drawerWidth })
  const tabletScreenshot = path.join(outputDir, 'fixvox-admin-tablet-rail.png')
  await page.screenshot({ path: tabletScreenshot, fullPage: true })
  report.screenshots.tablet = path.relative(repoRoot, tabletScreenshot).replace(/\\/g, '/')
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
