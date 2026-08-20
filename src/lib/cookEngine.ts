import { createContext, createSignal } from 'solid-js'
import type { CookState, Step, StepRef, Strang, StrangColor } from '../state/store'
import { showToast } from './toast'
import { fmtRemaining, stepLabel } from './tools'

export const STRANG_COLORS: StrangColor[] = ['cyan', 'violet', 'amber', 'emerald', 'rose', 'sky']

/** Navigation/Puls-Event an die UI (ephemer, wird nicht persistiert) */
export interface NavTarget {
  strangId: string
  stepId: string
  nonce: number
}

export interface CookEngine {
  readonly cook: CookState
  readonly navTarget: NavTarget | null
  executeTool(name: string, args: Record<string, unknown>, opts?: { silent?: boolean }): string
  expireTimers(): void
}

export const CookContext = createContext<CookEngine>()

type SetCookFn = (fn: (cook: CookState) => CookState) => void

/**
 * Kochlogik (Tools + Timer-Expiry) gegen einen injizierten CookState.
 * Echte App: globaler Store; Mock: eigener lokaler Store.
 * Schritte haben stabile IDs — Abhängigkeiten referenzieren per step_id.
 */
export function createCookEngine(getCook: () => CookState, setCook: SetCookFn): CookEngine {
  const [navTarget, setNavTarget] = createSignal<NavTarget | null>(null)

  function findStrang(id: string) {
    return getCook().strangs.find((s) => s.id === id)
  }

  function stepIndexOf(strangId: string, stepId: string): number {
    return findStrang(strangId)?.steps.findIndex((st) => st.id === stepId) ?? -1
  }

  function patchStrang(id: string, patch: Partial<Strang>) {
    setCook((c) => ({ ...c, strangs: c.strangs.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
  }

  function patchStep(strangId: string, stepId: string, patch: Partial<Step>) {
    setCook((c) => ({
      ...c,
      strangs: c.strangs.map((s) =>
        s.id === strangId
          ? { ...s, steps: s.steps.map((st) => (st.id === stepId ? { ...st, ...patch } : st)) }
          : s,
      ),
    }))
  }

  // Monoton wachsende Sequenz (Basis Date.now, damit Werte nach Reload > gespeicherte sind).
  let actSeq = Date.now()
  function nextAct(): number {
    return ++actSeq
  }

  // Auto-Timer: Endzeit aus deklarierter Dauer (null = kein Timer)
  function timerEndsFor(timerSeconds: number | null): number | null {
    return timerSeconds !== null ? Date.now() + timerSeconds * 1000 : null
  }

  function depsDone(deps: StepRef[]): boolean {
    return deps.every((d) => depStep(d)?.done === true)
  }

  function depStep(ref: StepRef): Step | undefined {
    return getCook()
      .strangs.find((x) => x.id === ref.strang_id)
      ?.steps.find((st) => st.id === ref.step_id)
  }

  // Timer läuft gerade (Schritt done, Timer noch nicht abgelaufen)
  function depPending(ref: StepRef): boolean {
    const d = depStep(ref)
    return !!d && d.done && d.timerEndsAt !== null && !d.timerExpired
  }

  // Abhängige neu in View 1 aufnehmen (alle Bedingungen done → active oder waiting)
  function activateDependents(refs: StepRef[]): void {
    for (const s of getCook().strangs) {
      s.steps.forEach((st) => {
        if (st.done || st.activatedAt !== null) return
        if (!st.dependsOn.some((d) => refs.some((r) => r.strang_id === d.strang_id && r.step_id === d.step_id))) return
        if (!depsDone(st.dependsOn)) return
        patchStep(s.id, st.id, { activatedAt: nextAct() })
      })
    }
  }

  // Alle noch nicht aktiven Steps neu bewerten (nach delete_step/delete_strang/update_step)
  function activateEligible(): void {
    for (const s of getCook().strangs) {
      s.steps.forEach((st) => {
        if (st.done || st.activatedAt !== null) return
        if (depsDone(st.dependsOn)) patchStep(s.id, st.id, { activatedAt: nextAct() })
      })
    }
  }

  // Abhängige aus View 1 entfernen (werden wieder blocked)
  function deactivateDependents(refs: StepRef[]): void {
    for (const s of getCook().strangs) {
      s.steps.forEach((st) => {
        if (st.done || st.activatedAt === null) return
        if (!st.dependsOn.some((d) => refs.some((r) => r.strang_id === d.strang_id && r.step_id === d.step_id))) return
        patchStep(s.id, st.id, { activatedAt: null })
      })
    }
  }

  function hasDoneDependents(strangId: string, stepId: string): boolean {
    return getCook().strangs.some((s) =>
      s.steps.some(
        (st) =>
          st.done &&
          st.dependsOn.some((d) => d.strang_id === strangId && d.step_id === stepId),
      ),
    )
  }

  // Alle dependsOn-Refs auf bestimmte Schritte entfernen (nach delete_step/delete_strang)
  function removeRefsTo(strangId: string, stepIds: string[]): void {
    for (const s of getCook().strangs) {
      s.steps.forEach((st) => {
        if (st.dependsOn.some((d) => d.strang_id === strangId && stepIds.includes(d.step_id))) {
          patchStep(s.id, st.id, {
            dependsOn: st.dependsOn.filter(
              (d) => !(d.strang_id === strangId && stepIds.includes(d.step_id)),
            ),
          })
        }
      })
    }
  }

  function parseDepRefs(raw: unknown): StepRef[] {
    if (!Array.isArray(raw)) return []
    return (raw as Record<string, unknown>[]).map((d) => ({
      strang_id: String(d?.strang_id ?? '').trim(),
      step_id: String(d?.step_id ?? '').trim(),
    }))
  }

  function parseTimerSeconds(raw: unknown): number | null {
    return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null
  }

  function parsePriority(raw: unknown): 'normal' | 'high' {
    return raw === 'high' ? 'high' : 'normal'
  }

  // Toasts nur bei KI-Aktionen / Engine-Events (Timer abgelaufen) — nicht bei
  // Nutzer-Aktionen aus der UI (der Nutzer sieht die Karte ja direkt).
  let silentToasts = false
  function toast(text: string) {
    if (!silentToasts) showToast(text)
  }

  function executeTool(name: string, args: Record<string, unknown>, opts: { silent?: boolean } = {}): string {
    silentToasts = opts.silent === true
    try {
      switch (name) {
        case 'get_cook_state':
          return JSON.stringify(getCook())
        case 'add_strang': {
          const strangName = String(args.name ?? '').trim()
          const icon = String(args.icon ?? '').trim()
          const rawSteps = Array.isArray(args.steps) ? args.steps : []
          if (!strangName) return JSON.stringify({ error: 'name fehlt' })
          if (rawSteps.length === 0) return JSON.stringify({ error: 'steps brauchen mindestens einen Schritt' })
          const parsed = rawSteps.map((st) => {
            const o = (st ?? {}) as Record<string, unknown>
            return {
              description: typeof st === 'string' ? st : String(o.description ?? '').trim(),
              dependsOn: typeof st === 'string' ? [] : parseDepRefs(o.depends_on),
              timerSeconds: typeof st === 'string' ? null : parseTimerSeconds(o.timer_seconds),
              priority: typeof st === 'string' ? 'normal' as const : parsePriority(o.priority),
            }
          })
          if (parsed.some((s) => s.description === '')) {
            return JSON.stringify({ error: 'steps brauchen mindestens eine description' })
          }
          if (parsed.some((s) => s.priority === 'high' && s.dependsOn.length > 1)) {
            return JSON.stringify({
              error: 'Ein Schritt mit priority "high" darf höchstens eine Abhängigkeit haben',
            })
          }
          // Refs dürfen nur auf bereits existierende Schritte zeigen (eigene neue Steps haben noch keine IDs)
          if (parsed.some((s) => s.dependsOn.some((d) => !depStep(d)))) {
            return JSON.stringify({
              error: 'Unbekannte Abhängigkeit — Schritte des neuen Strangs können nicht referenziert werden',
            })
          }
          const id = crypto.randomUUID()
          const color = STRANG_COLORS[getCook().strangs.length % STRANG_COLORS.length]
          setCook((c) => ({
            ...c,
            strangs: [
              ...c.strangs,
              {
                id,
                name: strangName,
                icon: icon || null,
                color,
                steps: parsed.map((st) => ({
                  id: crypto.randomUUID(),
                  description: st.description,
                  done: false,
                  dependsOn: st.dependsOn,
                  timerSeconds: st.timerSeconds,
                  timerEndsAt: null,
                  timerExpired: false,
                  activatedAt: depsDone(st.dependsOn) ? nextAct() : null,
                  priority: st.priority,
                })),
                done: false,
              },
            ],
          }))
          setCook((c) => ({ ...c, focusedStrangId: id }))
          toast(`Strang: ${strangName}`)
          return JSON.stringify({ id, name: strangName })
        }
        case 'add_step': {
          const id = String(args.strang_id ?? '')
          const description = String(args.description ?? '').trim()
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          if (!description) return JSON.stringify({ error: 'description fehlt' })
          const dependsOn = parseDepRefs(args.depends_on)
          if (dependsOn.some((d) => !depStep(d))) {
            return JSON.stringify({ error: 'Unbekannte Abhängigkeit' })
          }
          const timerSeconds = parseTimerSeconds(args.timer_seconds)
          const priority = parsePriority(args.priority)
          if (priority === 'high' && dependsOn.length > 1) {
            return JSON.stringify({
              error: 'Ein Schritt mit priority "high" darf höchstens eine Abhängigkeit haben',
            })
          }
          const step: Step = {
            id: crypto.randomUUID(),
            description,
            done: false,
            dependsOn,
            timerSeconds,
            timerEndsAt: null,
            timerExpired: false,
            activatedAt: depsDone(dependsOn) ? nextAct() : null,
            priority,
          }
          const afterId = typeof args.after_step_id === 'string' ? args.after_step_id : null
          const steps = [...strang.steps]
          if (afterId) {
            const pos = steps.findIndex((st) => st.id === afterId)
            if (pos < 0) return JSON.stringify({ error: 'Unbekannter after_step_id' })
            steps.splice(pos + 1, 0, step)
          } else {
            steps.push(step)
          }
          patchStrang(id, { steps })
          toast(`${strang.name}: + „${stepLabel(description)}"`)
          return JSON.stringify({ ok: true, step_id: step.id })
        }
        case 'update_step': {
          const id = String(args.strang_id ?? '')
          const stepId = String(args.step_id ?? '')
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          const step = strang.steps.find((st) => st.id === stepId)
          if (!step) return JSON.stringify({ error: 'Unbekannter Schritt' })
          const patch: Partial<Step> = {}
          if (typeof args.description === 'string') {
            const description = String(args.description).trim()
            if (!description) return JSON.stringify({ error: 'description darf nicht leer sein' })
            patch.description = description
          }
          if (Array.isArray(args.depends_on)) {
            const deps = parseDepRefs(args.depends_on)
            if (deps.some((d) => !depStep(d) || (d.strang_id === id && d.step_id === stepId))) {
              return JSON.stringify({ error: 'Ungültige Abhängigkeit' })
            }
            patch.dependsOn = deps
          }
          if (typeof args.timer_seconds === 'number') {
            patch.timerSeconds = parseTimerSeconds(args.timer_seconds)
          }
          if (args.priority === 'high' || args.priority === 'normal') {
            patch.priority = args.priority
          }
          const merged: Step = { ...step, ...patch }
          if (merged.priority === 'high' && merged.dependsOn.length > 1) {
            return JSON.stringify({
              error: 'Ein Schritt mit priority "high" darf höchstens eine Abhängigkeit haben',
            })
          }
          patchStep(id, stepId, patch)
          if (!merged.done && depsDone(merged.dependsOn) && merged.activatedAt === null) {
            patchStep(id, stepId, { activatedAt: nextAct() })
          } else if (!merged.done && !depsDone(merged.dependsOn) && merged.activatedAt !== null) {
            patchStep(id, stepId, { activatedAt: null })
          }
          return JSON.stringify({ ok: true })
        }
        case 'delete_step': {
          const id = String(args.strang_id ?? '')
          const stepId = String(args.step_id ?? '')
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          const idx = stepIndexOf(id, stepId)
          if (idx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          const name = stepLabel(strang.steps[idx].description)
          removeRefsTo(id, [stepId])
          patchStrang(id, { steps: strang.steps.filter((st) => st.id !== stepId) })
          activateEligible()
          toast(`${strang.name}: „${name}" entfernt`)
          return JSON.stringify({ ok: true })
        }
        case 'split_step': {
          const id = String(args.strang_id ?? '')
          const stepId = String(args.step_id ?? '')
          const first = String(args.first_description ?? '').trim()
          const second = String(args.second_description ?? '').trim()
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          const idx = stepIndexOf(id, stepId)
          if (idx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          if (!first || !second) {
            return JSON.stringify({ error: 'first_description und second_description nötig' })
          }
          const orig = strang.steps[idx]
          if (orig.done) {
            return JSON.stringify({ error: 'Nur nicht-abgeschlossene Schritte können geteilt werden' })
          }
          const secondStep: Step = {
            id: crypto.randomUUID(),
            description: second,
            done: false,
            dependsOn: [{ strang_id: id, step_id: orig.id }],
            timerSeconds: null,
            timerEndsAt: null,
            timerExpired: false,
            activatedAt: null,
            priority: 'normal',
          }
          const steps = strang.steps.map((st) =>
            st.id === stepId ? { ...st, description: first } : st,
          )
          steps.splice(idx + 1, 0, secondStep)
          // Alle, die auf den Original-Schritt zeigen, zeigen jetzt auf Teil 2
          const rewritten = steps.map((st) =>
            st.id === secondStep.id
              ? st
              : {
                  ...st,
                  dependsOn: st.dependsOn.map((d) =>
                    d.strang_id === id && d.step_id === stepId
                      ? { strang_id: id, step_id: secondStep.id }
                      : d,
                  ),
                },
          )
          patchStrang(id, { steps: rewritten })
          toast(`${strang.name}: „${stepLabel(orig.description)}" geteilt`)
          return JSON.stringify({ ok: true, second_step_id: secondStep.id })
        }
        case 'complete_step': {
          const id = String(args.strang_id ?? '')
          const stepId = String(args.step_id ?? '')
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          const stepIdx = stepIndexOf(id, stepId)
          if (stepIdx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          if (strang.steps[stepIdx].done) {
            return JSON.stringify({ error: 'Schritt ist bereits abgeschlossen' })
          }
          const steps = strang.steps.map((st) =>
            st.id === stepId
              ? {
                  ...st,
                  done: true,
                  // Timer läuft NACH dem Abschließen; Abhängige warten bis Ablauf
                  timerEndsAt: timerEndsFor(st.timerSeconds),
                  timerExpired: false,
                }
              : st,
          )
          const allDone = steps.every((st) => st.done)
          patchStrang(id, { steps, done: allDone ? true : strang.done })
          // Abhängige aufnehmen (active oder waiting — Zustand wird in der UI abgeleitet)
          activateDependents([{ strang_id: id, step_id: stepId }])
          toast(`${strang.name}: „${stepLabel(strang.steps[stepIdx].description)}" fertig`)
          return JSON.stringify({ ok: true })
        }
        case 'revert_step': {
          const id = String(args.strang_id ?? '')
          const stepId = String(args.step_id ?? '')
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          const stepIdx = stepIndexOf(id, stepId)
          if (stepIdx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          if (!strang.steps[stepIdx].done) {
            return JSON.stringify({ error: 'Schritt ist nicht abgeschlossen' })
          }
          if (hasDoneDependents(id, stepId)) {
            return JSON.stringify({
              error: 'Abhängige Karte ist bereits abgeschlossen — Schritt kann nicht zurückgenommen werden',
            })
          }
          // Eigener Timer entfällt; Abhängige werden wieder blocked
          patchStep(id, stepId, {
            done: false,
            activatedAt: nextAct(),
            timerEndsAt: null,
            timerExpired: false,
          })
          patchStrang(id, { done: false })
          deactivateDependents([{ strang_id: id, step_id: stepId }])
          toast(`${strang.name}: „${stepLabel(strang.steps[stepIdx].description)}" zurückgenommen`)
          return JSON.stringify({ ok: true })
        }
        case 'start_timer': {
          const id = String(args.strang_id ?? '')
          const stepId = String(args.step_id ?? '')
          const seconds = Number(args.seconds)
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          const stepIdx = stepIndexOf(id, stepId)
          if (stepIdx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          if (!Number.isFinite(seconds) || seconds <= 0) {
            return JSON.stringify({ error: 'seconds muss positiv sein' })
          }
          const endsAt = Date.now() + seconds * 1000
          patchStep(id, stepId, {
            timerEndsAt: endsAt,
            timerExpired: false,
          })
          toast(`⏱ Timer: ${fmtRemaining(endsAt)} (${strang.name}: ${stepLabel(strang.steps[stepIdx].description)})`)
          return JSON.stringify({ ok: true, endsAt })
        }
        case 'cancel_timer': {
          const id = String(args.strang_id ?? '')
          const stepId = String(args.step_id ?? '')
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          if (stepIndexOf(id, stepId) < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          patchStep(id, stepId, { timerEndsAt: null, timerExpired: false })
          toast('⏱ Timer abgebrochen')
          return JSON.stringify({ ok: true })
        }
        case 'complete_strang': {
          const id = String(args.strang_id ?? '')
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          patchStrang(id, {
            done: true,
            steps: strang.steps.map((st) => ({
              ...st,
              done: true,
              timerEndsAt: null,
              timerExpired: false,
            })),
          })
          toast(`Fertig: ${strang.name}`)
          // Abhängige aus anderen Strängen freigeben (alle Schritte sind jetzt done)
          activateDependents(strang.steps.map((st) => ({ strang_id: id, step_id: st.id })))
          const cur = getCook()
          const idx = cur.strangs.findIndex((s) => s.id === id)
          const rest = cur.strangs.slice(idx + 1).concat(cur.strangs.slice(0, idx))
          const next = rest.find((s) => !s.done)
          if (next) setCook((c) => ({ ...c, focusedStrangId: next.id }))
          return JSON.stringify({ ok: true })
        }
        case 'update_strang': {
          const id = String(args.strang_id ?? '')
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          const patch: Partial<Strang> = {}
          if (typeof args.name === 'string') {
            const name = String(args.name).trim()
            if (!name) return JSON.stringify({ error: 'name darf nicht leer sein' })
            patch.name = name
          }
          if (typeof args.icon === 'string') {
            patch.icon = String(args.icon).trim() || null
          }
          if (Object.keys(patch).length === 0) {
            return JSON.stringify({ error: 'name oder icon angeben' })
          }
          patchStrang(id, patch)
          return JSON.stringify({ ok: true })
        }
        case 'delete_strang': {
          const id = String(args.strang_id ?? '')
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          removeRefsTo(id, strang.steps.map((st) => st.id))
          const strangs = getCook().strangs.filter((s) => s.id !== id)
          setCook((c) => ({
            ...c,
            strangs,
            focusedStrangId: c.focusedStrangId === id ? (strangs[0]?.id ?? null) : c.focusedStrangId,
          }))
          activateEligible()
          toast(`Gelöscht: ${strang.name}`)
          return JSON.stringify({ ok: true })
        }
        case 'reset_cook': {
          setCook((c) => ({ ...c, strangs: [], zutaten: [], focusedStrangId: null, zutatenOpen: false }))
          toast('Alle Stränge gelöscht')
          return JSON.stringify({ ok: true })
        }
        case 'show_step': {
          const strangId = String(args.strang_id ?? '')
          const stepId = String(args.step_id ?? '')
          const strang = findStrang(strangId)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          if (!strang.steps.some((st) => st.id === stepId)) {
            return JSON.stringify({ error: 'Unbekannter Schritt' })
          }
          setCook((c) => ({ ...c, focusedStrangId: strangId }))
          setNavTarget({ strangId, stepId, nonce: Date.now() })
          return JSON.stringify({ ok: true })
        }
        case 'focus_strang': {
          const id = String(args.strang_id ?? '')
          if (!findStrang(id)) return JSON.stringify({ error: 'Unbekannter Strang' })
          setCook((c) => ({ ...c, focusedStrangId: id }))
          return JSON.stringify({ ok: true })
        }
        case 'add_zutaten': {
          const zName = String(args.name ?? '').trim()
          if (!zName) return JSON.stringify({ error: 'name fehlt' })
          const id = crypto.randomUUID()
          setCook((c) => ({
            ...c,
            zutaten: [
              ...c.zutaten,
              { id, name: zName, amount: args.amount ? String(args.amount) : '', checked: false },
            ],
          }))
          toast(`Zutat: ${zName}`)
          return JSON.stringify({ id, name: zName })
        }
        case 'toggle_zutaten': {
          // Nur UI-intern (Zutaten-Modal) — kein KI-Tool
          const id = String(args.id ?? '')
          let found = false
          setCook((c) => ({
            ...c,
            zutaten: c.zutaten.map((x) => {
              if (x.id !== id) return x
              found = true
              return { ...x, checked: !x.checked }
            }),
          }))
          if (!found) return JSON.stringify({ error: 'Unbekannte Zutat' })
          return JSON.stringify({ ok: true })
        }
        case 'open_zutaten':
          setCook((c) => ({ ...c, zutatenOpen: true }))
          return JSON.stringify({ ok: true })
        case 'close_zutaten':
          setCook((c) => ({ ...c, zutatenOpen: false }))
          return JSON.stringify({ ok: true })
        default:
          return JSON.stringify({ error: `Unbekanntes Tool: ${name}` })
      }
    } catch (e) {
      return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
    } finally {
      silentToasts = false
    }
  }

  function expireTimers(): void {
    const now = Date.now()
    for (const s of getCook().strangs) {
      s.steps.forEach((step) => {
        if (step.timerExpired || step.timerEndsAt === null || step.timerEndsAt > now) return
        patchStep(s.id, step.id, { timerEndsAt: null, timerExpired: true })
        showToast(`⏰ Timer abgelaufen: ${s.name} — ${stepLabel(step.description)}`)
      })
    }
  }

  return {
    get cook() {
      return getCook()
    },
    get navTarget() {
      return navTarget()
    },
    executeTool,
    expireTimers,
  }
}
