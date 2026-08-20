import { batch, createContext, createSignal } from 'solid-js'
import type { CookState, Step, StepRef, StepTimer, Flow, FlowColor } from '../state/store'
import { showToast } from './toast'
import { fmtRemaining, stepLabel } from './tools'

export const FLOW_COLORS: FlowColor[] = ['cyan', 'violet', 'amber', 'emerald', 'rose', 'sky']

/**
 * Effektive Endzeit eines Timers: startAt + durationMs + akkumulierte Pausen
 * + (pausiert: jetzt − Pausenbeginn). Während einer Pause wandert die effektive
 * Endzeit mit der Uhr mit — die Restzeit friert ein und der Timer läuft nie ab.
 */
export function timerEffectiveEnd(timer: StepTimer, now = Date.now()): number {
  return (
    timer.startAt +
    timer.durationMs +
    timer.pauseOffsetMs +
    (timer.pausedAt !== null ? now - timer.pausedAt : 0)
  )
}

/** Navigation/Puls-Event an die UI (ephemer, wird nicht persistiert) */
export interface NavTarget {
  flowId: string
  stepId: string
  nonce: number
}

/** Modal öffnen/schließen (Chat, Ingredients) — UI spiegelt das in die URL */
export interface ModalRequest {
  modal: 'chat' | 'ingredients'
  open: boolean
  nonce: number
}

export interface CookEngine {
  readonly cook: CookState
  readonly navTarget: NavTarget | null
  readonly modalRequest: ModalRequest | null
  executeTool(name: string, args: Record<string, unknown>, opts?: { silent?: boolean }): string
  expireTimers(): void
  /** Spiegel-Timer für wartende Karten nachziehen (nach Hydrate/Reload) */
  syncTimers(): void
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
  const [modalRequest, setModalRequest] = createSignal<ModalRequest | null>(null)

  function findFlow(id: string) {
    return getCook().flows.find((s) => s.id === id)
  }

  function stepIndexOf(flowId: string, stepId: string): number {
    return findFlow(flowId)?.steps.findIndex((st) => st.id === stepId) ?? -1
  }

  function patchFlow(id: string, patch: Partial<Flow>) {
    setCook((c) => ({ ...c, flows: c.flows.map((s) => (s.id === id ? { ...s, ...patch } : s)) }))
  }

  function patchStep(flowId: string, stepId: string, patch: Partial<Step>) {
    setCook((c) => ({
      ...c,
      flows: c.flows.map((s) =>
        s.id === flowId
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

  function depsDone(deps: StepRef[]): boolean {
    return deps.every((d) => depStep(d)?.done === true)
  }

  function depStep(ref: StepRef): Step | undefined {
    return getCook()
      .flows.find((x) => x.id === ref.flow_id)
      ?.steps.find((st) => st.id === ref.step_id)
  }

  // Endzeit des Gates, das eine Abhängigkeit erzeugt: deren Timer oder die
  // Kanten-Verzögerung (doneAt + timer_seconds). Null = kein Gate.
  function gateEndsAt(d: StepRef): number | null {
    const dep = depStep(d)
    if (!dep?.done) return null
    let end: number | null = null
    if (dep.timer) end = timerEffectiveEnd(dep.timer)
    if (d.timer_seconds && dep.doneAt !== null) {
      const e = dep.doneAt + d.timer_seconds * 1000
      if (end === null || e > end) end = e
    }
    return end
  }

  // Abgeleitete Wartezeit einer Karte aus ihren Abhängigkeiten (ohne eigenen Timer)
  function derivedWaitEnd(step: Step): number | null {
    let max: number | null = null
    for (const d of step.dependsOn) {
      const end = gateEndsAt(d)
      if (end !== null && (max === null || end > max)) max = end
    }
    return max
  }

  // Wartende Karten bekommen einen eigenen Timer („Spiegel" der abgeleiteten
  // Wartezeit) — Ziel des Warte-Menüs und der Timer-Chips. Ein Timer gehört
  // genau einem Step. Erzeugt, wenn eine Karte wartet und noch keinen hat;
  // entfernt, wenn kein Gate mehr läuft.
  function syncWaitTimers(): void {
    const now = Date.now()
    for (const s of getCook().flows) {
      s.steps.forEach((step) => {
        if (step.done || !depsDone(step.dependsOn)) return
        const end = derivedWaitEnd(step)
        if (end === null) {
          if (step.timer?.gatesSelf) patchStep(s.id, step.id, { timer: null })
          return
        }
        if (end <= now) return
        if (step.timer === null) {
          patchStep(s.id, step.id, {
            timer: {
              startAt: now,
              durationMs: end - now,
              pausedAt: null,
              pauseOffsetMs: 0,
              gatesSelf: true,
            },
          })
        }
      })
    }
  }

  // Abhängige neu in View 1 aufnehmen (alle Bedingungen done → active oder waiting)
  function activateDependents(refs: StepRef[]): void {
    for (const s of getCook().flows) {
      s.steps.forEach((st) => {
        if (st.done || st.activatedAt !== null) return
        if (!st.dependsOn.some((d) => refs.some((r) => r.flow_id === d.flow_id && r.step_id === d.step_id))) return
        if (!depsDone(st.dependsOn)) return
        patchStep(s.id, st.id, { activatedAt: nextAct() })
      })
    }
  }

  // Alle noch nicht aktiven Steps neu bewerten (nach delete_step/delete_flow/update_step)
  function activateEligible(): void {
    for (const s of getCook().flows) {
      s.steps.forEach((st) => {
        if (st.done || st.activatedAt !== null) return
        if (depsDone(st.dependsOn)) patchStep(s.id, st.id, { activatedAt: nextAct() })
      })
    }
  }

  // Abhängige aus View 1 entfernen (werden wieder blocked)
  function deactivateDependents(refs: StepRef[]): void {
    for (const s of getCook().flows) {
      s.steps.forEach((st) => {
        if (st.done || st.activatedAt === null) return
        if (!st.dependsOn.some((d) => refs.some((r) => r.flow_id === d.flow_id && r.step_id === d.step_id))) return
        patchStep(s.id, st.id, { activatedAt: null })
      })
    }
  }

  function hasDoneDependents(flowId: string, stepId: string): boolean {
    return getCook().flows.some((s) =>
      s.steps.some(
        (st) =>
          st.done &&
          st.dependsOn.some((d) => d.flow_id === flowId && d.step_id === stepId),
      ),
    )
  }

  // Alle dependsOn-Refs auf bestimmte Schritte entfernen (nach delete_step/delete_flow)
  function removeRefsTo(flowId: string, stepIds: string[]): void {
    for (const s of getCook().flows) {
      s.steps.forEach((st) => {
        if (st.dependsOn.some((d) => d.flow_id === flowId && stepIds.includes(d.step_id))) {
          patchStep(s.id, st.id, {
            dependsOn: st.dependsOn.filter(
              (d) => !(d.flow_id === flowId && stepIds.includes(d.step_id)),
            ),
          })
        }
      })
    }
  }

  function parseDepRefs(raw: unknown): StepRef[] {
    if (!Array.isArray(raw)) return []
    return (raw as Record<string, unknown>[]).map((d) => {
      const ts = d?.timer_seconds
      return {
        flow_id: String(d?.flow_id ?? '').trim(),
        step_id: String(d?.step_id ?? '').trim(),
        timer_seconds:
          typeof ts === 'number' && Number.isFinite(ts) && ts > 0 ? Math.round(ts) : null,
      }
    })
  }

  function parsePriority(raw: unknown): 'normal' | 'high' {
    return raw === 'high' ? 'high' : 'normal'
  }

  function parseScore(raw: unknown): number {
    return typeof raw === 'number' && Number.isFinite(raw) ? raw : 0
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
        case 'add_flow': {
          const flowName = String(args.name ?? '').trim()
          const icon = String(args.icon ?? '').trim()
          const rawSteps = Array.isArray(args.steps) ? args.steps : []
          if (!flowName) return JSON.stringify({ error: 'name fehlt' })
          if (rawSteps.length === 0) return JSON.stringify({ error: 'steps brauchen mindestens einen Schritt' })
          const parsed = rawSteps.map((st) => {
            const o = (st ?? {}) as Record<string, unknown>
            return {
              description: typeof st === 'string' ? st : String(o.description ?? '').trim(),
              dependsOn: typeof st === 'string' ? [] : parseDepRefs(o.depends_on),
              priority: typeof st === 'string' ? 'normal' as const : parsePriority(o.priority),
              score: typeof st === 'string' ? 0 : parseScore(o.score),
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
              error: 'Unbekannte Abhängigkeit — Schritte des neuen Flows können nicht referenziert werden',
            })
          }
          const id = crypto.randomUUID()
          const color = FLOW_COLORS[getCook().flows.length % FLOW_COLORS.length]
          setCook((c) => ({
            ...c,
            flows: [
              ...c.flows,
              {
                id,
                name: flowName,
                icon: icon || null,
                color,
                steps: parsed.map((st) => ({
                  id: crypto.randomUUID(),
                  description: st.description,
                  done: false,
                  doneAt: null,
                  dependsOn: st.dependsOn,
                  timer: null,
                  activatedAt: depsDone(st.dependsOn) ? nextAct() : null,
                  priority: st.priority,
                  score: st.score,
                })),
                done: false,
              },
            ],
          }))
          setCook((c) => ({ ...c, focusedFlowId: id }))
          toast(`Strang: ${flowName}`)
          return JSON.stringify({ id, name: flowName })
        }
        case 'add_step': {
          const id = String(args.flow_id ?? '')
          const description = String(args.description ?? '').trim()
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          if (!description) return JSON.stringify({ error: 'description fehlt' })
          const dependsOn = parseDepRefs(args.depends_on)
          if (dependsOn.some((d) => !depStep(d))) {
            return JSON.stringify({ error: 'Unbekannte Abhängigkeit' })
          }
          const priority = parsePriority(args.priority)
          const score = parseScore(args.score)
          if (priority === 'high' && dependsOn.length > 1) {
            return JSON.stringify({
              error: 'Ein Schritt mit priority "high" darf höchstens eine Abhängigkeit haben',
            })
          }
          const step: Step = {
            id: crypto.randomUUID(),
            description,
            done: false,
            doneAt: null,
            dependsOn,
            timer: null,
            activatedAt: depsDone(dependsOn) ? nextAct() : null,
            priority,
            score,
          }
          const afterId = typeof args.after_step_id === 'string' ? args.after_step_id : null
          const steps = [...flow.steps]
          if (afterId) {
            const pos = steps.findIndex((st) => st.id === afterId)
            if (pos < 0) return JSON.stringify({ error: 'Unbekannter after_step_id' })
            steps.splice(pos + 1, 0, step)
          } else {
            steps.push(step)
          }
          patchFlow(id, { steps })
          syncWaitTimers()
          toast(`${flow.name}: + „${stepLabel(description)}"`)
          return JSON.stringify({ ok: true, step_id: step.id })
        }
        case 'update_step': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const step = flow.steps.find((st) => st.id === stepId)
          if (!step) return JSON.stringify({ error: 'Unbekannter Schritt' })
          const patch: Partial<Step> = {}
          if (typeof args.description === 'string') {
            const description = String(args.description).trim()
            if (!description) return JSON.stringify({ error: 'description darf nicht leer sein' })
            patch.description = description
          }
          if (Array.isArray(args.depends_on)) {
            const deps = parseDepRefs(args.depends_on)
            if (deps.some((d) => !depStep(d) || (d.flow_id === id && d.step_id === stepId))) {
              return JSON.stringify({ error: 'Ungültige Abhängigkeit' })
            }
            patch.dependsOn = deps
          }
          if (args.priority === 'high' || args.priority === 'normal') {
            patch.priority = args.priority
          }
          if (typeof args.score === 'number') {
            patch.score = parseScore(args.score)
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
          syncWaitTimers()
          return JSON.stringify({ ok: true })
        }
        case 'delete_step': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const idx = stepIndexOf(id, stepId)
          if (idx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          const name = stepLabel(flow.steps[idx].description)
          removeRefsTo(id, [stepId])
          patchFlow(id, { steps: flow.steps.filter((st) => st.id !== stepId) })
          activateEligible()
          syncWaitTimers()
          toast(`${flow.name}: „${name}" entfernt`)
          return JSON.stringify({ ok: true })
        }
        case 'split_step': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const first = String(args.first_description ?? '').trim()
          const second = String(args.second_description ?? '').trim()
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const idx = stepIndexOf(id, stepId)
          if (idx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          if (!first || !second) {
            return JSON.stringify({ error: 'first_description und second_description nötig' })
          }
          const orig = flow.steps[idx]
          if (orig.done) {
            return JSON.stringify({ error: 'Nur nicht-abgeschlossene Schritte können geteilt werden' })
          }
          const secondStep: Step = {
            id: crypto.randomUUID(),
            description: second,
            done: false,
            doneAt: null,
            dependsOn: [{ flow_id: id, step_id: orig.id }],
            timer: null,
            activatedAt: null,
            priority: 'normal',
            score: 0,
          }
          const steps = flow.steps.map((st) =>
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
                    d.flow_id === id && d.step_id === stepId
                      ? { flow_id: id, step_id: secondStep.id }
                      : d,
                  ),
                },
          )
          patchFlow(id, { steps: rewritten })
          toast(`${flow.name}: „${stepLabel(orig.description)}" geteilt`)
          return JSON.stringify({ ok: true, second_step_id: secondStep.id })
        }
        case 'complete_step': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const stepIdx = stepIndexOf(id, stepId)
          if (stepIdx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          if (flow.steps[stepIdx].done) {
            return JSON.stringify({ error: 'Schritt ist bereits abgeschlossen' })
          }
          const steps = flow.steps.map((st) =>
            st.id === stepId
              ? {
                  ...st,
                  done: true,
                  // Verzögerungen der Dependents laufen ab diesem Zeitpunkt;
                  // eigener Timer endet mit dem Abschluss
                  doneAt: Date.now(),
                  timer: null,
                }
              : st,
          )
          const allDone = steps.every((st) => st.done)
          patchFlow(id, { steps, done: allDone ? true : flow.done })
          // Abhängige aufnehmen (active oder waiting — Zustand wird in der UI abgeleitet)
          activateDependents([{ flow_id: id, step_id: stepId }])
          syncWaitTimers()
          toast(`${flow.name}: „${stepLabel(flow.steps[stepIdx].description)}" fertig`)
          return JSON.stringify({ ok: true })
        }
        case 'revert_step': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const stepIdx = stepIndexOf(id, stepId)
          if (stepIdx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          if (!flow.steps[stepIdx].done) {
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
            doneAt: null,
            activatedAt: nextAct(),
            timer: null,
          })
          patchFlow(id, { done: false })
          deactivateDependents([{ flow_id: id, step_id: stepId }])
          syncWaitTimers()
          toast(`${flow.name}: „${stepLabel(flow.steps[stepIdx].description)}" zurückgenommen`)
          return JSON.stringify({ ok: true })
        }
        case 'start_timer': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const stepIdx = stepIndexOf(id, stepId)
          if (stepIdx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          const step = flow.steps[stepIdx]
          const now = Date.now()
          // Wartende Karte (oder schon eigener Warte-Timer): Timer übersteuert DIESE Karte
          const waiting =
            !step.done && depsDone(step.dependsOn) && derivedWaitEnd(step) !== null
          const keepSelf = step.timer?.gatesSelf === true || waiting
          let newTimer: StepTimer
          if (typeof args.offset_seconds === 'number') {
            const delta = Number(args.offset_seconds)
            if (!Number.isFinite(delta)) {
              return JSON.stringify({ error: 'offset_seconds muss eine Zahl sein' })
            }
            if (args.offset_base === 'end') {
              // Aufschlagen: Restzeit ± delta
              const cur = step.timer
              if (cur) {
                newTimer = { ...cur, durationMs: Math.max(0, cur.durationMs + delta * 1000) }
              } else {
                const end = derivedWaitEnd(step)
                if (end === null) return JSON.stringify({ error: 'Kein laufender Timer' })
                newTimer = {
                  startAt: now,
                  durationMs: Math.max(0, end - now + delta * 1000),
                  pausedAt: null,
                  pauseOffsetMs: 0,
                  gatesSelf: true,
                }
              }
            } else {
              // Neu setzen ab jetzt — Startzeitpunkt wird komplett zurückgesetzt
              const cur = step.timer
              newTimer = {
                startAt: cur?.pausedAt ?? now,
                durationMs: Math.max(0, delta * 1000),
                pausedAt: cur?.pausedAt ?? null,
                pauseOffsetMs: 0,
                gatesSelf: keepSelf,
              }
            }
          } else {
            const seconds = Number(args.seconds)
            if (!Number.isFinite(seconds) || seconds <= 0) {
              return JSON.stringify({ error: 'seconds muss positiv sein' })
            }
            newTimer = {
              startAt: now,
              durationMs: seconds * 1000,
              pausedAt: null,
              pauseOffsetMs: 0,
              gatesSelf: keepSelf,
            }
          }
          batch(() => {
            patchStep(id, stepId, { timer: newTimer })
            syncWaitTimers()
          })
          toast(
            `⏱ Timer: ${fmtRemaining(timerEffectiveEnd(newTimer))} (${flow.name}: ${stepLabel(step.description)})`,
          )
          return JSON.stringify({ ok: true })
        }
        case 'pause_timer': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const stepIdx = stepIndexOf(id, stepId)
          if (stepIdx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          const step = flow.steps[stepIdx]
          if (step.timer && step.timer.pausedAt !== null) {
            return JSON.stringify({ error: 'Timer ist bereits pausiert' })
          }
          const now = Date.now()
          if (!step.timer) {
            // Wartende Karte ohne eigenen Timer: Wartezeit materialisieren und einfrieren
            const end =
              !step.done && depsDone(step.dependsOn) ? derivedWaitEnd(step) : null
            if (end === null) return JSON.stringify({ error: 'Kein laufender Timer' })
            patchStep(id, stepId, {
              timer: {
                startAt: now,
                durationMs: Math.max(0, end - now),
                pausedAt: now,
                pauseOffsetMs: 0,
                gatesSelf: true,
              },
            })
          } else {
            patchStep(id, stepId, { timer: { ...step.timer, pausedAt: now } })
          }
          toast(`⏸ Timer pausiert: ${flow.name} — ${stepLabel(step.description)}`)
          return JSON.stringify({ ok: true })
        }
        case 'resume_timer': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const stepIdx = stepIndexOf(id, stepId)
          if (stepIdx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          const step = flow.steps[stepIdx]
          if (!step.timer || step.timer.pausedAt === null) {
            return JSON.stringify({ error: 'Timer ist nicht pausiert' })
          }
          const now = Date.now()
          const t: StepTimer = {
            ...step.timer,
            pauseOffsetMs: step.timer.pauseOffsetMs + (now - step.timer.pausedAt),
            pausedAt: null,
          }
          patchStep(id, stepId, { timer: t })
          toast(
            `▶ Timer läuft weiter: ${fmtRemaining(timerEffectiveEnd(t))} (${flow.name}: ${stepLabel(step.description)})`,
          )
          return JSON.stringify({ ok: true })
        }
        case 'cancel_timer': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          if (stepIndexOf(id, stepId) < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          batch(() => {
            patchStep(id, stepId, { timer: null })
            syncWaitTimers()
          })
          toast('⏱ Timer zurückgesetzt')
          return JSON.stringify({ ok: true })
        }
        case 'complete_flow': {
          const id = String(args.flow_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          patchFlow(id, {
            done: true,
            steps: flow.steps.map((st) => ({
              ...st,
              done: true,
              doneAt: st.done ? st.doneAt : Date.now(),
              timer: null,
            })),
          })
          toast(`Fertig: ${flow.name}`)
          // Abhängige aus anderen Flows freigeben (alle Schritte sind jetzt done)
          activateDependents(flow.steps.map((st) => ({ flow_id: id, step_id: st.id })))
          syncWaitTimers()
          const cur = getCook()
          const idx = cur.flows.findIndex((s) => s.id === id)
          const rest = cur.flows.slice(idx + 1).concat(cur.flows.slice(0, idx))
          const next = rest.find((s) => !s.done)
          if (next) setCook((c) => ({ ...c, focusedFlowId: next.id }))
          return JSON.stringify({ ok: true })
        }
        case 'update_flow': {
          const id = String(args.flow_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const patch: Partial<Flow> = {}
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
          patchFlow(id, patch)
          return JSON.stringify({ ok: true })
        }
        case 'delete_flow': {
          const id = String(args.flow_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          removeRefsTo(id, flow.steps.map((st) => st.id))
          const flows = getCook().flows.filter((s) => s.id !== id)
          setCook((c) => ({
            ...c,
            flows,
            focusedFlowId: c.focusedFlowId === id ? (flows[0]?.id ?? null) : c.focusedFlowId,
          }))
          activateEligible()
          syncWaitTimers()
          toast(`Gelöscht: ${flow.name}`)
          return JSON.stringify({ ok: true })
        }
        case 'reset_cook': {
          setCook((c) => ({ ...c, flows: [], ingredients: [], focusedFlowId: null }))
          toast('Alle Stränge gelöscht')
          return JSON.stringify({ ok: true })
        }
        case 'show_step': {
          const flowId = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(flowId)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          if (!flow.steps.some((st) => st.id === stepId)) {
            return JSON.stringify({ error: 'Unbekannter Schritt' })
          }
          setCook((c) => ({ ...c, focusedFlowId: flowId }))
          setNavTarget({ flowId, stepId, nonce: Date.now() })
          return JSON.stringify({ ok: true })
        }
        case 'focus_flow': {
          const id = String(args.flow_id ?? '')
          if (!findFlow(id)) return JSON.stringify({ error: 'Unbekannter Flow' })
          setCook((c) => ({ ...c, focusedFlowId: id }))
          return JSON.stringify({ ok: true })
        }
        case 'add_ingredient': {
          const zName = String(args.name ?? '').trim()
          if (!zName) return JSON.stringify({ error: 'name fehlt' })
          const id = crypto.randomUUID()
          setCook((c) => ({
            ...c,
            ingredients: [
              ...c.ingredients,
              { id, name: zName, amount: args.amount ? String(args.amount) : '', checked: false },
            ],
          }))
          toast(`Zutat: ${zName}`)
          return JSON.stringify({ id, name: zName })
        }
        case 'toggle_ingredient': {
          // Nur UI-intern (Ingredients-Modal) — kein KI-Tool
          const id = String(args.id ?? '')
          let found = false
          setCook((c) => ({
            ...c,
            ingredients: c.ingredients.map((x) => {
              if (x.id !== id) return x
              found = true
              return { ...x, checked: !x.checked }
            }),
          }))
          if (!found) return JSON.stringify({ error: 'Unbekannte Ingredient' })
          return JSON.stringify({ ok: true })
        }
        case 'open_ingredients':
          setModalRequest({ modal: 'ingredients', open: true, nonce: Date.now() })
          return JSON.stringify({ ok: true })
        case 'close_ingredients':
          setModalRequest({ modal: 'ingredients', open: false, nonce: Date.now() })
          return JSON.stringify({ ok: true })
        case 'open_chat':
          setModalRequest({ modal: 'chat', open: true, nonce: Date.now() })
          return JSON.stringify({ ok: true })
        case 'close_chat':
          setModalRequest({ modal: 'chat', open: false, nonce: Date.now() })
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
    for (const s of getCook().flows) {
      s.steps.forEach((step) => {
        const t = step.timer
        if (!t) return
        if (timerEffectiveEnd(t, now) > now) return
        patchStep(s.id, step.id, { timer: null })
        showToast(`⏰ Timer abgelaufen: ${s.name} — ${stepLabel(step.description)}`)
      })
    }
    syncWaitTimers()
  }

  // Initialer Sync: wartende Karten aus dem persistierten Zustand bekommen
  // ihre Spiegel-Timer (auch im Mock)
  syncWaitTimers()

  return {
    get cook() {
      return getCook()
    },
    get navTarget() {
      return navTarget()
    },
    get modalRequest() {
      return modalRequest()
    },
    executeTool,
    expireTimers,
    syncTimers: syncWaitTimers,
  }
}
