import { createContext } from 'solid-js'
import type { CookState, Step, StepRef, Strang, StrangColor } from '../state/store'
import { showToast } from './toast'
import { fmtRemaining, stepLabel } from './tools'

export const STRANG_COLORS: StrangColor[] = ['cyan', 'violet', 'amber', 'emerald', 'rose', 'sky']

export interface CookEngine {
  readonly cook: CookState
  executeTool(name: string, args: Record<string, unknown>): string
  expireTimers(): void
}

export const CookContext = createContext<CookEngine>()

type SetCookFn = (fn: (cook: CookState) => CookState) => void

/**
 * Kochlogik (Tools + Timer-Expiry) gegen einen injizierten CookState.
 * Echte App: globaler Store; Mock: eigener lokaler Store.
 */
export function createCookEngine(getCook: () => CookState, setCook: SetCookFn): CookEngine {
  function findStrang(id: string) {
    return getCook().strangs.find((s) => s.id === id)
  }

  function patchStrang(id: string, patch: Partial<Strang>) {
    setCook((c) => ({ ...c, strangs: c.strangs.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
  }

  function patchStep(strangId: string, stepIndex: number, patch: Partial<Step>) {
    setCook((c) => ({
      ...c,
      strangs: c.strangs.map((s) =>
        s.id === strangId
          ? { ...s, steps: s.steps.map((st, i) => (i === stepIndex ? { ...st, ...patch } : st)) }
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
    return getCook().strangs.find((x) => x.id === ref.strang_id)?.steps[ref.step_index]
  }

  // Timer läuft gerade (Schritt done, Timer noch nicht abgelaufen)
  function depPending(ref: StepRef): boolean {
    const d = depStep(ref)
    return !!d && d.done && d.timerEndsAt !== null && !d.timerExpired
  }

  // Abhängige neu in View 1 aufnehmen (alle Bedingungen done → active oder waiting)
  function activateDependents(refs: StepRef[]): void {
    for (const s of getCook().strangs) {
      s.steps.forEach((st, j) => {
        if (st.done || st.activatedAt !== null) return
        if (!st.dependsOn.some((d) => refs.some((r) => r.strang_id === d.strang_id && r.step_index === d.step_index))) return
        if (!depsDone(st.dependsOn)) return
        patchStep(s.id, j, { activatedAt: nextAct() })
      })
    }
  }

  // Abhängige aus View 1 entfernen (werden wieder blocked)
  function deactivateDependents(refs: StepRef[]): void {
    for (const s of getCook().strangs) {
      s.steps.forEach((st, j) => {
        if (st.done || st.activatedAt === null) return
        if (!st.dependsOn.some((d) => refs.some((r) => r.strang_id === d.strang_id && r.step_index === d.step_index))) return
        patchStep(s.id, j, { activatedAt: null })
      })
    }
  }

  function hasDoneDependents(strangId: string, stepIndex: number): boolean {
    return getCook().strangs.some((s) =>
      s.steps.some(
        (st) =>
          st.done &&
          st.dependsOn.some((d) => d.strang_id === strangId && d.step_index === stepIndex),
      ),
    )
  }

  function executeTool(name: string, args: Record<string, unknown>): string {
    try {
      switch (name) {
        case 'get_cook_state':
          return JSON.stringify(getCook())
        case 'add_strang': {
          const strangName = String(args.name ?? '').trim()
          const icon = String(args.icon ?? '').trim()
          const steps = Array.isArray(args.steps)
            ? args.steps.map((st) => {
                if (typeof st === 'string')
                  return {
                    description: st,
                    dependsOn: [],
                    timerSeconds: null,
                    priority: 'normal' as 'normal' | 'high',
                  }
                const o = (st ?? {}) as Record<string, unknown>
                const timerSeconds =
                  typeof o.timer_seconds === 'number' && Number.isFinite(o.timer_seconds) && o.timer_seconds > 0
                    ? Math.round(o.timer_seconds)
                    : null
                return {
                  description: String(o.description ?? '').trim(),
                  priority: (o.priority === 'high' ? 'high' : 'normal') as 'normal' | 'high',
                  dependsOn: Array.isArray(o.depends_on)
                    ? (o.depends_on as Record<string, unknown>[]).map((d) => ({
                        strang_id: String(d?.strang_id ?? '').trim(),
                        step_index: Number(d?.step_index ?? 0),
                      }))
                    : [],
                  timerSeconds,
                }
              })
            : []
          if (!strangName) return JSON.stringify({ error: 'name fehlt' })
          if (steps.length === 0 || steps.some((s) => s.description === '')) {
            return JSON.stringify({ error: 'steps brauchen mindestens eine description' })
          }
          if (steps.some((s) => s.priority === 'high' && s.dependsOn.length > 1)) {
            return JSON.stringify({
              error: 'Ein Schritt mit priority "high" darf höchstens eine Abhängigkeit haben',
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
                steps: steps.map((st) => ({
                  description: st.description,
                  done: false,
                  dependsOn: st.dependsOn,
                  timerSeconds: st.timerSeconds,
                  timerEndsAt: null,
                  timerExpired: false,
                  activatedAt: depsDone(st.dependsOn) ? nextAct() : null,
                  priority: st.priority,
                })),
                stepIndex: 0,
                done: false,
              },
            ],
          }))
          setCook((c) => ({ ...c, focusedStrangId: id }))
          showToast(`Strang: ${strangName}`)
          return JSON.stringify({ id, name: strangName })
        }
        case 'add_step': {
          const id = String(args.strang_id ?? '')
          const description = String(args.description ?? '').trim()
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          if (!description) return JSON.stringify({ error: 'description fehlt' })
          const dependsOn: StepRef[] = Array.isArray(args.depends_on)
            ? (args.depends_on as Record<string, unknown>[]).map((d) => ({
                strang_id: String(d?.strang_id ?? '').trim(),
                step_index: Number(d?.step_index ?? 0),
              }))
            : []
          const timerSeconds =
            typeof args.timer_seconds === 'number' &&
            Number.isFinite(args.timer_seconds) &&
            args.timer_seconds > 0
              ? Math.round(args.timer_seconds)
              : null
          const priority: 'normal' | 'high' = args.priority === 'high' ? 'high' : 'normal'
          if (priority === 'high' && dependsOn.length > 1) {
            return JSON.stringify({
              error: 'Ein Schritt mit priority "high" darf höchstens eine Abhängigkeit haben',
            })
          }
          const step = {
            description,
            done: false,
            dependsOn,
            timerSeconds,
            timerEndsAt: null,
            timerExpired: false,
            activatedAt: depsDone(dependsOn) ? nextAct() : null,
            priority,
          }
          patchStrang(id, { steps: [...strang.steps, step] })
          showToast(`${strang.name}: + „${stepLabel(description)}"`)
          return JSON.stringify({ ok: true, step_index: strang.steps.length })
        }
        case 'complete_step': {
          const id = String(args.strang_id ?? '')
          const stepIdx = Number(args.step_index)
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          if (!Number.isInteger(stepIdx) || stepIdx < 0 || stepIdx >= strang.steps.length) {
            return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
          }
          if (strang.steps[stepIdx].done) {
            return JSON.stringify({ error: 'Schritt ist bereits abgeschlossen' })
          }
          const steps = strang.steps.map((st, i) =>
            i === stepIdx
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
          activateDependents([{ strang_id: id, step_index: stepIdx }])
          showToast(`${strang.name}: „${stepLabel(strang.steps[stepIdx].description)}" fertig`)
          return JSON.stringify({ ok: true })
        }
        case 'revert_step': {
          const id = String(args.strang_id ?? '')
          const stepIdx = Number(args.step_index)
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          if (!Number.isInteger(stepIdx) || stepIdx < 0 || stepIdx >= strang.steps.length) {
            return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
          }
          if (!strang.steps[stepIdx].done) {
            return JSON.stringify({ error: 'Schritt ist nicht abgeschlossen' })
          }
          if (hasDoneDependents(id, stepIdx)) {
            return JSON.stringify({
              error: 'Abhängige Karte ist bereits abgeschlossen — Schritt kann nicht zurückgenommen werden',
            })
          }
          // Eigener Timer entfällt; Abhängige werden wieder blocked (verlassen View 1)
          patchStep(id, stepIdx, {
            done: false,
            activatedAt: nextAct(),
            timerEndsAt: null,
            timerExpired: false,
          })
          patchStrang(id, { done: false })
          deactivateDependents([{ strang_id: id, step_index: stepIdx }])
          showToast(`${strang.name}: „${stepLabel(strang.steps[stepIdx].description)}" zurückgenommen`)
          return JSON.stringify({ ok: true })
        }
        case 'set_step_priority': {
          const id = String(args.strang_id ?? '')
          const stepIdx = Number(args.step_index)
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          if (!Number.isInteger(stepIdx) || stepIdx < 0 || stepIdx >= strang.steps.length) {
            return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
          }
          const prio: 'normal' | 'high' = args.priority === 'high' ? 'high' : 'normal'
          if (prio === 'high' && strang.steps[stepIdx].dependsOn.length > 1) {
            return JSON.stringify({
              error: 'Ein Schritt mit priority "high" darf höchstens eine Abhängigkeit haben',
            })
          }
          patchStep(id, stepIdx, { priority: prio })
          return JSON.stringify({ ok: true })
        }
        case 'set_step': {
          const id = String(args.strang_id ?? '')
          const idx = Number(args.step_index)
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          if (!Number.isInteger(idx) || idx < 0 || idx >= strang.steps.length) {
            return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
          }
          patchStrang(id, { stepIndex: idx })
          return JSON.stringify({ ok: true })
        }
        case 'start_timer': {
          const id = String(args.strang_id ?? '')
          const stepIdx = Number(args.step_index)
          const seconds = Number(args.seconds)
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          if (!Number.isInteger(stepIdx) || stepIdx < 0 || stepIdx >= strang.steps.length) {
            return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
          }
          if (!Number.isFinite(seconds) || seconds <= 0) {
            return JSON.stringify({ error: 'seconds muss positiv sein' })
          }
          const endsAt = Date.now() + seconds * 1000
          patchStep(id, stepIdx, {
            timerEndsAt: endsAt,
            timerExpired: false,
          })
          showToast(`⏱ Timer: ${fmtRemaining(endsAt)} (${strang.name}: ${stepLabel(strang.steps[stepIdx].description)})`)
          return JSON.stringify({ ok: true, endsAt })
        }
        case 'cancel_timer': {
          const id = String(args.strang_id ?? '')
          const stepIdx = Number(args.step_index)
          const strang = findStrang(id)
          if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
          if (!Number.isInteger(stepIdx) || stepIdx < 0 || stepIdx >= strang.steps.length) {
            return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
          }
          patchStep(id, stepIdx, { timerEndsAt: null, timerExpired: false })
          showToast('⏱ Timer abgebrochen')
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
          showToast(`Fertig: ${strang.name}`)
          // Abhängige aus anderen Strängen freigeben (alle Schritte sind jetzt done)
          activateDependents(strang.steps.map((_, i) => ({ strang_id: id, step_index: i })))
          const cur = getCook()
          const idx = cur.strangs.findIndex((s) => s.id === id)
          const rest = cur.strangs.slice(idx + 1).concat(cur.strangs.slice(0, idx))
          const next = rest.find((s) => !s.done)
          if (next) setCook((c) => ({ ...c, focusedStrangId: next.id }))
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
          showToast(`Zutat: ${zName}`)
          return JSON.stringify({ id, name: zName })
        }
        case 'toggle_zutaten': {
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
    }
  }

  function expireTimers(): void {
    const now = Date.now()
    for (const s of getCook().strangs) {
      s.steps.forEach((step, idx) => {
        if (step.timerExpired || step.timerEndsAt === null || step.timerEndsAt > now) return
        setCook((c) => ({
          ...c,
          strangs: c.strangs.map((x) =>
            x.id === s.id
              ? {
                  ...x,
                  steps: x.steps.map((st, i) =>
                    i === idx ? { ...st, timerEndsAt: null, timerExpired: true } : st,
                  ),
                }
              : x,
          ),
        }))
        showToast(`⏰ Timer abgelaufen: ${s.name} — ${stepLabel(step.description)}`)
      })
    }
  }

  return {
    get cook() {
      return getCook()
    },
    executeTool,
    expireTimers,
  }
}
