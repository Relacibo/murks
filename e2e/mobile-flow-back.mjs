/* e2e: Mobile Flow-View + Zurück-Button — echte Route (URL-Params), nicht /mock.
 *
 * Szenarien:
 *  1. Aus „Jetzt" per Kartentitel in die Flow-View (?view=flow&flow=…)
 *  2. In-App Zurück-Button („Zurück zu Jetzt") → zurück in der Queue, URL ok
 *  3. Erneut rein, dann Browser-History zurück (Android-Zurück) → ebenfalls raus
 *
 * Ausführen: npm run build && node e2e/mobile-flow-back.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright-core'

const PORT = 4198
const BASE = `http://localhost:${PORT}`

/* AppState-Seed in IndexedDB — setupDone + gültiger Agent, damit der
   Wizard ausbleibt und CookingRoute (URL-getrieben) rendert. */
function seedState() {
  const now = Date.now()
  const step = (id, description) => ({
    id,
    description,
    ingredients: [],
    done: false,
    doneAt: null,
    dependsOn: [],
    timer: null,
    activatedAt: 1,
    priority: 'normal',
    score: 0,
  })
  return {
    config: { displayName: 'Test', alarmNotify: true },
    setupDone: true,
    stt: { mode: 'webspeech', endpoint: '', key: '', model: 'base' },
    tts: { mode: 'webspeech', endpoint: '', key: '', voice: '', muted: true },
    agents: [
      { id: 'a1', name: 'Test', endpoint: 'http://localhost:9/v1', model: 'test', key: 'k' },
    ],
    defaultAgentId: 'a1',
    cook: {
      flows: [
        {
          id: 'f1',
          name: 'Reis',
          icon: '🍚',
          done: false,
          steps: [step('s1', 'Reis in kochendem Wasser 10 Minuten garen.')],
        },
        {
          id: 'f2',
          name: 'Sauce',
          icon: '🍅',
          done: false,
          steps: [step('s2', `Tomaten anrühren. (t=${now})`)],
        },
      ],
      ingredients: [],
      focusedFlowId: 'f1',
      loading: { all: false, flows: [] },
    },
    agent: { messages: [], busy: false },
  }
}

let failed = 0
function check(name, cond, detail = '') {
  const ok = Boolean(cond)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

const server = spawn(
  process.execPath,
  [new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname, 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore' },
)
let up = false
for (let i = 0; i < 60 && !up; i++) {
  await sleep(250)
  up = await fetch(`${BASE}/`).then((r) => r.ok).catch(() => false)
}
if (!up) {
  console.error('Preview-Server nicht erreichbar')
  server.kill()
  process.exit(1)
}

let browser
try {
  browser = await chromium.launch()
} catch {
  browser = await chromium.launch({ executablePath: '/usr/bin/chromium-browser' })
}
const context = await browser.newContext({
  viewport: { width: 375, height: 812 }, // Mobile (iPhone X)
  hasTouch: true,
  isMobile: true,
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.addInitScript((state) => {
  return new Promise((resolve) => {
    const req = indexedDB.open('murks', 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains('state')) req.result.createObjectStore('state')
    }
    req.onsuccess = () => {
      const tx = req.result.transaction('state', 'readwrite')
      tx.objectStore('state').put(state, 'app')
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    }
    req.onerror = () => resolve()
  })
}, seedState())

await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })

/* Karte in „Jetzt" sichtbar? (View 1 = Queue) */
await page.locator('[data-card-key="f1:s1"]').locator('visible=true').first().waitFor({ timeout: 15_000 })

/* 0 · Safe-Area-Regression: Header trägt das Safe-Area-Padding (headless ohne
   Cutout = env() 0 → Fallback 8px) — ohne es liegt der Zurück-Button in der
   installierten PWA unter der System-Statusleiste und frisst die Taps. */
const headerPadTop = await page
  .locator('header')
  .evaluate((el) => parseFloat(getComputedStyle(el).paddingTop))
check('Header-Safe-Area-Padding vorhanden', headerPadTop >= 8, `padding-top: ${headerPadTop}px`)

const inFlowView = async (flowId) => {
  const url = page.url()
  const detail = await page
    .locator('button[aria-label="Zurück zu Jetzt"]')
    .locator('visible=true')
    .count()
  return url.includes(`view=flow`) && url.includes(`flow=${flowId}`) && detail > 0
}
const inJetzt = async () => {
  const url = page.url()
  const back = await page.locator('button[aria-label="Zurück zu Jetzt"]').locator('visible=true').count()
  const card = await page.locator('[data-card-key="f1:s1"]').locator('visible=true').count()
  return !url.includes('view=flow') && back === 0 && card > 0
}

/* 1 · Karte-Titel → Flow-View */
await page.locator('[data-card-key="f1:s1"] .step-card-title-btn').locator('visible=true').first().click()
await sleep(400)
check('Kartentitel öffnet Flow-View', await inFlowView('f1'), page.url())

/* 2 · In-App Zurück-Button */
await page.locator('button[aria-label="Zurück zu Jetzt"]').locator('visible=true').first().click()
await sleep(400)
check('Zurück-Button schließt Flow-View', await inJetzt(), page.url())

/* 3 · Erneut rein → Browser-History zurück (Android-Zurück) */
await page.locator('[data-card-key="f1:s1"] .step-card-title-btn').locator('visible=true').first().click()
await sleep(400)
check('Erneut in Flow-View', await inFlowView('f1'), page.url())
await page.goBack()
await sleep(400)
check('Browser-Zurück verlässt Flow-View', await inJetzt(), page.url())

/* ── show_step-Yank-Regression (echter Bug: Agent markiert Karte → jede
   Zustandsänderung/zurück-Klick sprang zurück auf die markierte Karte) ──
   Über /mock: dort gibt es Mock-Buttons, die show_step/complete_step
   direkt über die Engine auslösen. */
await page.goto(`${BASE}/mock`, { waitUntil: 'domcontentloaded' })
const backBtn = () => page.locator('button[aria-label="Zurück zu Jetzt"]').locator('visible=true')
await backBtn().first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})

// show_step auf S1 Schritt 5 (blockiert → Flow-View öffnet)
await page.locator('button:has-text("Schritt 5 zeigen")').click()
await sleep(400)
check('show_step öffnet Flow-View', (await backBtn().count()) > 0)

// Zurück — und der Effekt darf NICHT zurückziehen (früher: Sofort-Yank)
await backBtn().first().click()
await sleep(400)
check('Zurück nach show_step bleibt Zurück', (await backBtn().count()) === 0)
await sleep(1600)
check('kein Yank nach 1,6 s', (await backBtn().count()) === 0)

// State-Änderung (complete_step → flows-Patch) — früher ebenfalls Yank-Auslöser
await page.locator('button:has-text("Schritt 4 früh fertig")').click()
await sleep(400)
await page.locator('button:has-text("Timer S1 überspringen")').click()
await sleep(400)
check('kein Yank nach State-Änderung', (await backBtn().count()) === 0)

// Neue show_step-Navigation funktioniert weiterhin
await page.locator('button:has-text("Schritt 5 zeigen")').click()
await sleep(400)
check('erneutes show_step öffnet Flow-View', (await backBtn().count()) > 0)

check('keine Seiten-Fehler', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
server.kill()
console.log(failed === 0 ? '\nAlle Checks bestanden.' : `\n${failed} Check(s) fehlgeschlagen.`)
process.exit(failed === 0 ? 0 : 1)
