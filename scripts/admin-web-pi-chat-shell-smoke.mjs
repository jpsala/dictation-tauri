#!/usr/bin/env node
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { chromium } from 'playwright'

const repoRoot = path.resolve(new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]:))/, '$1'))
const port = 8812
const baseUrl = `http://127.0.0.1:${port}`
const runId = new Date().toISOString().replace(/[:.]/g, '-')
const outputDir = path.join(repoRoot, 'artifacts', 'admin-web-pi-chat-shell', runId)
await fs.mkdir(outputDir, { recursive: true })

const child = spawn(process.execPath, ['admin/fixvox-web/server.mjs'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    FIXVOX_ADMIN_SKIP_ENV_FILES: '1',
    FIXVOX_ADMIN_MOCK: '1',
    FIXVOX_ADMIN_PORT: String(port),
    FIXVOX_ADMIN_HOST: '127.0.0.1',
  },
  stdio: 'ignore',
  windowsHide: true,
})

async function waitForHealth() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${baseUrl}/healthz`)).ok) return
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('admin web mock server did not become healthy')
}

const viewports = [
  { name: 'desktop-low', width: 1128, height: 622, minimumTranscriptHeight: 340 },
  { name: 'tablet-low', width: 871, height: 625, minimumTranscriptHeight: 300 },
  { name: 'mobile', width: 390, height: 844, minimumTranscriptHeight: 360 },
]

let browser
try {
  await waitForHealth()
  browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: viewports[0] })
  await page.goto(`${baseUrl}/admin/pi`, { waitUntil: 'networkidle' })
  await page.getByTitle('Pi Chat').click()

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    await page.locator('#composer').waitFor({ state: 'visible' })
    const geometry = await page.evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect()
      const composer = rect('#composer')
      const messages = rect('#messages')
      const topbar = rect('#topbar')
      const activity = document.querySelector('.activity-card')
      return {
        view: document.body.dataset.adminView,
        documentFitsViewport: document.documentElement.scrollHeight <= document.documentElement.clientHeight,
        noHorizontalOverflow: document.documentElement.scrollWidth <= document.documentElement.clientWidth,
        composerVisible: Boolean(composer && composer.top >= 0 && composer.bottom <= window.innerHeight),
        transcriptHeight: Math.round(messages?.height || 0),
        topbarHeight: Math.round(topbar?.height || 0),
        activityHidden: activity ? getComputedStyle(activity).display === 'none' : false,
      }
    })

    assert.equal(geometry.view, 'chat', `${viewport.name}: chat view marker`)
    assert.equal(geometry.documentFitsViewport, true, `${viewport.name}: document must not scroll`)
    assert.equal(geometry.noHorizontalOverflow, true, `${viewport.name}: horizontal overflow`)
    assert.equal(geometry.composerVisible, true, `${viewport.name}: composer must remain visible`)
    assert.equal(geometry.activityHidden, true, `${viewport.name}: Activity must be hidden by default`)
    assert.ok(geometry.topbarHeight >= 48 && geometry.topbarHeight <= 64, `${viewport.name}: topbar height ${geometry.topbarHeight}px`)
    assert.ok(geometry.transcriptHeight >= viewport.minimumTranscriptHeight, `${viewport.name}: transcript height ${geometry.transcriptHeight}px`)
    await page.screenshot({ path: path.join(outputDir, `${viewport.name}.png`) })
  }

  console.log(JSON.stringify({ ok: true, outputDir: path.relative(repoRoot, outputDir).replace(/\\/g, '/') }, null, 2))
} finally {
  await browser?.close().catch(() => {})
  child.kill('SIGTERM')
  await once(child, 'exit').catch(() => {})
}
