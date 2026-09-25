/* e2e: Timer-Einstellmenü (WaitMenu) — läuft gegen `vite preview` + /mock.
 *
 * Szenarien (todo: klassisch predictables Timer-Verhalten):
 *  1. Live-Anzeige: initial korrekt (mm:ss der echten Restzeit) und läuft pro Sekunde runter
 *  2. Erster Eingriff friert die Anzeige ein — sie läuft nicht mehr weg
 *  3. Dialog zu + wieder auf → Anzeige lebt wieder (keine Alt-Werte)
 *  4. Pausierter Timer (konstant 5:44): Raster-Schritte relativ zum WERT —
 *     runter → 5:30, hoch → 5:45, hoch → 6:00, runter → 5:45 (kein Wrap auf 0)
 *  5. Minuten tippen: Commit kombiniert getippte Minuten mit eingefrorenen Sekunden
 *  6. +1 min wirft den Editierzustand weg → Anzeige läuft wieder
 *
 * Ausführen: npm run build && node e2e/timer-menu.mjs
 */
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { chromium } from 'playwright-core'

const PORT = 4199
const MOCK_URL = `http://localhost:${PORT}/mock`

/* ── deterministischer Mock-State in localStorage (murks-mock-state-v2) ── */
function mockState() {
  const now = Date.now()
  const step = (id, description, timer) => ({
    id,
    description,
    ingredients: [],
    done: false,
    doneAt: null,
    dependsOn: [],
    timer,
    activatedAt: 1,
    priority: 'normal',
    score: 0,
  })
  return {
    flows: [
      {
        id: 'tfast',
        name: 'Eier kochen',
        icon: '🥚',
        done: false,
        // laufender Timer: 1:50 Rest — für Live/Tick/Freeze-Tests
        steps: [step('sfast', 'Eier 1:50 ziehen lassen.', { alarmAt: now + 110_000, pausedAt: null })],
      },
      {
        id: 'tpause',
        name: 'Pausiert',
        icon: '⏸',
        done: false,
        // pausierter Timer: konstant 5:44 Rest — für exakte Raster-Schritte
        steps: [step('spause', 'Ruht bei 5:44.', { alarmAt: now + 344_000, pausedAt: now })],
      },
    ],
    ingredients: [],
    focusedFlowId: 'tfast',
    loading: { all: false, flows: [] },
  }
}

/* ── Mini-Runner ─────────────────────────────────────────────────────── */
let failed = 0
function check(name, cond, detail = '') {
  const ok = Boolean(cond)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failed++
}

async function readDisplay(page) {
  const mins = await page.locator('[data-timer-mins] button').textContent()
  const secs = await page.locator('[data-timer-secs]').textContent()
  return { m: (mins ?? '').trim(), s: (secs ?? '').trim(), total: parseInt(mins, 10) * 60 + parseInt(secs, 10) }
}
const openMenu = (page, card) =>
  page.locator(`[data-card-key="${card}"] .clock-btn`).locator('visible=true').first().click()
const closeMenu = (page) => page.mouse.click(30, 80) // Backdrop links neben dem Dialog

/* ── Preview-Server ──────────────────────────────────────────────────── */
const server = spawn(process.execPath, [new URL('../node_modules/vite/bin/vite.js', import.meta.url).pathname, 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' })
let up = false
for (let i = 0; i < 60 && !up; i++) {
  await sleep(250)
  up = await fetch(`http://localhost:${PORT}/`).then((r) => r.ok).catch(() => false)
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
const page = await browser.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.addInitScript((state) => {
  localStorage.setItem('murks-mock-state-v2', JSON.stringify(state))
}, mockState())

await page.goto(MOCK_URL, { waitUntil: 'domcontentloaded' })
await page
  .locator('[data-card-key="tfast:sfast"]')
  .locator('visible=true')
  .first()
  .waitFor({ timeout: 15_000 })

/* 1 · Live-Anzeige: initial mm:ss und runterlaufend */
await openMenu(page, 'tfast:sfast')
const d1 = await readDisplay(page)
check('initial: Minuten 01', d1.m === '01', `got ${d1.m}:${d1.s}`)
check('initial: Sekunden nahe 50', parseInt(d1.s, 10) >= 42 && parseInt(d1.s, 10) <= 50, `got ${d1.s}`)
await sleep(1600)
const d2 = await readDisplay(page)
check('läuft runter', d2.total < d1.total, `${d1.total} → ${d2.total}`)

/* 2 · Erster Eingriff friert ein */
const expectedUp = (Math.floor(d2.total / 15) + 1) * 15
await page.locator('[data-timer-secs]').click()
const d3 = await readDisplay(page)
check('Schritt hoch = Raster über Restzeit', d3.total === expectedUp, `got ${d3.total}, expected ${expectedUp}`)
await sleep(1700)
const d4 = await readDisplay(page)
check('eingefroren nach Eingriff', d4.total === d3.total, `${d3.total} → ${d4.total}`)

/* 3 · Zu + auf: Anzeige lebt wieder */
await closeMenu(page)
await openMenu(page, 'tfast:sfast')
const d5 = await readDisplay(page)
check('reopen: kein Alt-Wert', d5.total !== d4.total && d5.total < 120, `got ${d5.total}, frozen war ${d4.total}`)
await closeMenu(page)

/* 4 · Pausiert 5:44 — Raster relativ zum Wert (kein Wrap auf 0) */
await openMenu(page, 'tpause:spause')
let p = await readDisplay(page)
check('pausiert initial exakt 05:44', p.m === '05' && p.s === '44', `got ${p.m}:${p.s}`)
const wheel = (page, dir) =>
  page.locator('[data-timer-secs]').dispatchEvent('wheel', { deltaY: dir === 1 ? -10 : 10 })
await wheel(page, -1) // Rad runter
p = await readDisplay(page)
check('von 05:44 runter → 05:30 (nicht 45-Wrap)', p.m === '05' && p.s === '30', `got ${p.m}:${p.s}`)
const stepAndCheck = async (m, s) => {
  await page.locator('[data-timer-secs]').click()
  p = await readDisplay(page)
  check(`Schritt → ${m}:${s}`, p.m === m && p.s === s, `got ${p.m}:${p.s}`)
}
await stepAndCheck('05', '45')
await stepAndCheck('06', '00')
await wheel(page, -1) // Rad runter
p = await readDisplay(page)
check('von 06:00 runter → 05:45', p.m === '05' && p.s === '45', `got ${p.m}:${p.s}`)

/* 5 · Minuten tippen: kombiniert mit eingefrorenen Sekunden */
await page.locator('[data-timer-mins] button').click()
await page.locator('[data-timer-mins] input').fill('7')
await page.keyboard.press('Enter')
p = await readDisplay(page)
check('Minuten commit → 07:45', p.m === '07' && p.s === '45', `got ${p.m}:${p.s}`)

/* 6 · +1 min → Editierzustand weg, Anzeige läuft wieder */
await page.locator('button[title="+1 Minute"]').click()
const l1 = await readDisplay(page)
await sleep(1500)
const l2 = await readDisplay(page)
check('+1 min: 08:xx live', l1.m === '08' && l2.total < l1.total, `${l1.m}:${l1.s} → ${l2.m}:${l2.s}`)

check('keine Seiten-Fehler', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
server.kill()
console.log(failed === 0 ? '\nAlle Checks bestanden.' : `\n${failed} Check(s) fehlgeschlagen.`)
process.exit(failed === 0 ? 0 : 1)
