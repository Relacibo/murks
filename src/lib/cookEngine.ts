import { createContext, createSignal } from 'solid-js'
import type { CookState, Step, StepRef, TimerOverride, Flow, FlowColor } from '../state/store'
import { showToast } from './toast'
import { fmtRemaining, stepLabel } from './tools'
import { speak } from './tts'

export const FLOW_COLORS: FlowColor[] = ['cyan', 'violet', 'amber', 'emerald', 'rose', 'sky']

/**
 * Effektive Endzeit eines Overrides: alarmAt; während einer Pause wandert die
 * effektive Endzeit mit der Uhr mit (alarmAt + jetzt − Pausenbeginn) — die
 * Restzeit friert ein und der Timer läuft nie ab.
 */
export function overrideEffectiveEnd(o: TimerOverride, now = Date.now()): number {
  return o.pausedAt !== null ? o.alarmAt + (now - o.pausedAt) : o.alarmAt
}

/* Effektiver Score: hohe Scores propagieren rückwärts durch die Dependency-Kette —
   jeder Schritt erbt den höchsten Score aller Schritte, die transitiv von ihm
   abhängen (rekursiv, auch über Wartezeiten hinweg). So wandern alle Vorgänger
   eines dringenden Schritts automatisch mit nach oben. */
function effectiveScores(cook: CookState): Map<string, number> {
  const all: { key: string; score: number; deps: StepRef[] }[] = []
  for (const s of cook.flows) {
    for (const st of s.steps) {
      all.push({ key: `${s.id}:${st.id}`, score: st.score, deps: st.dependsOn })
    }
  }
  const byKey = new Map(all.map((x) => [x.key, x]))
  const downstream = new Map<string, string[]>()
  for (const x of all) {
    for (const d of x.deps) {
      const k = `${d.flow_id}:${d.step_id}`
      if (!downstream.has(k)) downstream.set(k, [])
      downstream.get(k)!.push(x.key)
    }
  }
  const eff = new Map<string, number>()
  const visiting = new Set<string>()
  const visit = (key: string): number => {
    const cached = eff.get(key)
    if (cached !== undefined) return cached
    if (visiting.has(key)) return byKey.get(key)?.score ?? 0 // Zyklus-Schutz
    visiting.add(key)
    let best = byKey.get(key)?.score ?? 0
    for (const depKey of downstream.get(key) ?? []) {
      best = Math.max(best, visit(depKey))
    }
    visiting.delete(key)
    eff.set(key, best)
    return best
  }
  for (const x of all) visit(x.key)
  return eff
}

export interface QueueEntry {
  flowId: string
  stepId: string
  state: 'active' | 'waiting' | 'blocked'
  priority: 'normal' | 'high'
  /** Effektives Ende der Wartezeit (Epoch ms) — nur bei state "waiting" */
  endsAt: number | null
}

/**
 * Reihenfolge der „Jetzt"-View — die UI (Cook.tsx jetztCards) konsumiert genau
 * diese Funktion, damit der Agent dieselbe Reihenfolge sieht wie der Nutzer:
 * prio (active + high, FIFO nach activatedAt) → normal (effektiver Score absteigend,
 * Tiebreaker letzter Abschluss des Flows) → waiting (Timer-Ende aufsteigend,
 * high zuerst) → blocked (Anlage-Reihenfolge, nur mit „Blocked zeigen" sichtbar).
 * get_cook_state legt dem Agenten diese Reihenfolge als Feld "queue" bei.
 */
export function queueOrder(cook: CookState): QueueEntry[] {
  const cards: { s: Flow; st: Step }[] = []
  for (const s of cook.flows) {
    if (s.done || s.steps.every((st) => st.done)) continue
    for (const st of s.steps) {
      if (!st.done) cards.push({ s, st })
    }
  }
  const now = Date.now()
  const depDone = (ref: StepRef) =>
    cook.flows.some(
      (f) => f.id === ref.flow_id && f.steps.some((st) => st.id === ref.step_id && st.done),
    )
  const gateEndsAt = (d: StepRef): number | null => {
    const dep = cook.flows
      .find((f) => f.id === d.flow_id)
      ?.steps.find((st) => st.id === d.step_id)
    if (!dep?.done) return null
    if (d.timer_seconds && dep.doneAt !== null) return dep.doneAt + d.timer_seconds * 1000
    return null
  }
  const effEnd = (st: Step): number | null => {
    if (st.override) return overrideEffectiveEnd(st.override, now)
    let max: number | null = null
    for (const d of st.dependsOn) {
      const end = gateEndsAt(d)
      if (end !== null && (max === null || end > max)) max = end
    }
    return max
  }
  const stateOf = (st: Step): QueueEntry['state'] =>
    st.dependsOn.some((d) => !depDone(d))
      ? 'blocked'
      : (() => {
          const e = effEnd(st)
          return e !== null && e > now ? 'waiting' : 'active'
        })()
  const flowRecency = new Map<string, number>()
  for (const s of cook.flows) {
    let max = 0
    for (const st of s.steps) if (st.doneAt !== null && st.doneAt > max) max = st.doneAt
    flowRecency.set(s.id, max)
  }
  const eff = effectiveScores(cook)
  const prio = cards
    .filter((c) => stateOf(c.st) === 'active' && c.st.priority === 'high')
    .sort((a, b) => (a.st.activatedAt ?? 0) - (b.st.activatedAt ?? 0))
  const normal = cards
    .filter((c) => stateOf(c.st) === 'active' && c.st.priority !== 'high')
    .sort((a, b) => {
      const ds =
        (eff.get(`${b.s.id}:${b.st.id}`) ?? 0) - (eff.get(`${a.s.id}:${a.st.id}`) ?? 0)
      if (ds !== 0) return ds
      const ra = flowRecency.get(a.s.id) ?? 0
      const rb = flowRecency.get(b.s.id) ?? 0
      if (ra !== rb) return rb - ra
      return 0
    })
  const waiting = cards
    .filter((c) => stateOf(c.st) === 'waiting')
    .sort((a, b) => {
      const ta = effEnd(a.st) ?? Infinity
      const tb = effEnd(b.st) ?? Infinity
      if (ta !== tb) return ta - tb
      if (a.st.priority !== b.st.priority) return a.st.priority === 'high' ? -1 : 1
      return 0
    })
  const blocked = cards.filter((c) => stateOf(c.st) === 'blocked')
  return [...prio, ...normal, ...waiting, ...blocked].map((c) => {
    const st = stateOf(c.st)
    return {
      flowId: c.s.id,
      stepId: c.st.id,
      state: st,
      priority: c.st.priority,
      endsAt: st === 'waiting' ? effEnd(c.st) : null,
    }
  })
}

/** Navigation/Puls-Event an die UI (ephemer, wird nicht persistiert) */
export interface NavTarget {
  flowId: string
  stepId: string
  nonce: number
  view?: 'jetzt' | 'flow'
}

/** Modal öffnen/schließen (Chat, Ingredients) — UI spiegelt das in die URL */
export interface ModalRequest {
  modal: 'chat' | 'ingredients'
  open: boolean
  nonce: number
}

/** Timer-Ablauf-Event an die UI (ephemer) — die Band-Uhr blinkt dazu auf,
    prio-Karten klingeln wie ein mechanischer Wecker */
export interface AlarmEvent {
  flowId: string
  stepId: string
  at: number
  prio: boolean
}

export interface CookEngine {
  readonly cook: CookState
  readonly navTarget: NavTarget | null
  readonly modalRequest: ModalRequest | null
  /** Kürzlich abgelaufene Timer (letzte ~6 s) — fürs Alarm-Feedback der Karten */
  readonly alarmEvents: AlarmEvent[]
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
  const [modalRequest, setModalRequest] = createSignal<ModalRequest | null>(null)
  const [alarmEvents, setAlarmEvents] = createSignal<AlarmEvent[]>([])

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

  // Endzeit des Gates, das eine Abhängigkeit erzeugt: Kanten-Verzögerung
  // (doneAt + timer_seconds). Null = kein Gate. (Timer anderer Karten spielen
  // hier keine Rolle — jede Wartezeit gehört der Karte selbst.)
  function gateEndsAt(d: StepRef): number | null {
    const dep = depStep(d)
    if (!dep?.done) return null
    if (d.timer_seconds && dep.doneAt !== null) {
      return dep.doneAt + d.timer_seconds * 1000
    }
    return null
  }

  // Abgeleitete Wartezeit einer Karte aus ihren Abhängigkeiten — reine
  // Funktion der Fakten (done/doneAt/timer_seconds), nie gespeichert.
  function derivedWaitEnd(step: Step): number | null {
    let max: number | null = null
    for (const d of step.dependsOn) {
      const end = gateEndsAt(d)
      if (end !== null && (max === null || end > max)) max = end
    }
    return max
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
        case 'get_cook_state': {
          const cook = getCook()
          const now = Date.now()
          // Lokale Wanduhr mit Zeitzonen-Offset — für Zeitfragen („um 14:30"),
          // damit das Modell nie selbst Epoch ↔ Wanduhr rechnen muss.
          const localISO = (d: number) => {
            const t = new Date(d)
            const pad = (n: number) => String(n).padStart(2, '0')
            const off = -t.getTimezoneOffset()
            const sign = off >= 0 ? '+' : '-'
            return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
          }
          const queue = queueOrder(cook)
          return JSON.stringify({
            ...cook,
            now_local: localISO(now),
            queue: queue
              .filter((q) => q.state !== 'blocked')
              .map((q) => `${q.flowId}:${q.stepId}`),
            waiting: queue
              .filter((q) => q.state === 'waiting' && q.endsAt !== null)
              .map((q) => ({
                ref: `${q.flowId}:${q.stepId}`,
                ends_in_s: Math.max(0, Math.round((q.endsAt! - now) / 1000)),
                ends_at_local: localISO(q.endsAt!),
              })),
          })
        }
        case 'add_flow': {
          const flowName = String(args.name ?? '').trim()
          const icon = String(args.icon ?? '').trim()
          const rawSteps = Array.isArray(args.steps) ? args.steps : []
          if (!flowName) return JSON.stringify({ error: 'name fehlt' })
          if (rawSteps.length === 0) return JSON.stringify({ error: 'steps brauchen mindestens einen Schritt' })

          // Erst alle UUIDs vergeben, damit interne Abhängigkeiten (step_index) aufgelöst werden können
          const ids = rawSteps.map(() => crypto.randomUUID())
          const flowId = crypto.randomUUID()

          const parsed = rawSteps.map((st, i) => {
            const o = (st ?? {}) as Record<string, unknown>
            const rawDeps = Array.isArray(o.depends_on) ? o.depends_on : []
            const dependsOn: StepRef[] = rawDeps.flatMap((d: unknown) => {
              if (!d || typeof d !== 'object') return []
              const entry = d as Record<string, unknown>
              // step_index: Verweis auf einen Schritt innerhalb desselben neuen Flows (0-basiert)
              if (typeof entry.step_index === 'number') {
                const idx = entry.step_index
                if (idx < 0 || idx >= ids.length || idx === i) return []
                const ref: StepRef = { flow_id: flowId, step_id: ids[idx] }
                if (typeof entry.timer_seconds === 'number' && entry.timer_seconds > 0) {
                  ref.timer_seconds = entry.timer_seconds
                }
                return [ref]
              }
              // Externe Abhängigkeit (anderer, bereits existierender Flow)
              return parseDepRefs([d])
            })
            return {
              description: typeof st === 'string' ? st : String(o.description ?? '').trim(),
              dependsOn,
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
          // Externe Refs müssen auf existierende Schritte zeigen
          if (parsed.some((s) => s.dependsOn.some((d) => d.flow_id !== flowId && !depStep(d)))) {
            return JSON.stringify({
              error: 'Unbekannte externe Abhängigkeit',
            })
          }

          const steps = parsed.map((st, i) => ({
            id: ids[i],
            description: st.description,
            done: false,
            doneAt: null,
            dependsOn: st.dependsOn,
            override: null,
            activatedAt: depsDone(st.dependsOn) ? nextAct() : null,
            priority: st.priority,
            score: st.score,
          }))
          setCook((c) => ({
            ...c,
            flows: [
              ...c.flows,
              { id: flowId, name: flowName, icon: icon || null, steps, done: false },
            ],
          }))
          setCook((c) => ({ ...c, focusedFlowId: flowId }))
          toast(`Strang: ${flowName}`)
          return JSON.stringify({ id: flowId, name: flowName })
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
            override: null,
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
            override: null,
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
                  doneAt: Date.now(),
                  override: null,
                }
              : st,
          )
          const allDone = steps.every((st) => st.done)
          batch(() => {
            patchFlow(id, { steps, done: allDone ? true : flow.done })
            activateDependents([{ flow_id: id, step_id: stepId }])
          })

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
          batch(() => {
            patchStep(id, stepId, {
              done: false,
              doneAt: null,
              activatedAt: nextAct(),
              override: null,
            })
            patchFlow(id, { done: false })
            deactivateDependents([{ flow_id: id, step_id: stepId }])
          })

          toast(`${flow.name}: „${stepLabel(flow.steps[stepIdx].description)}" zurückgenommen`)
          return JSON.stringify({ ok: true })
        }
        case 'set_timer': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const stepIdx = stepIndexOf(id, stepId)
          if (stepIdx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          const step = flow.steps[stepIdx]
          if (step.done) {
            return JSON.stringify({
              error: 'Schritt ist abgeschlossen — Timer sind dort nicht möglich (verlängere stattdessen timer_seconds an den Kanten der Folgekarten)',
            })
          }
          if (!depsDone(step.dependsOn)) {
            return JSON.stringify({
              error: 'Karte ist noch blockiert — Wartezeit gehört als timer_seconds an die Kante zur Karte',
            })
          }
          const now = Date.now()
          // Timer gehört immer der Karte selbst: auf einer wartenden Karte
          // übersteuert er die abgeleitete Wartezeit, auf einer aktiven
          // Karte versetzt er sie in den Wartezustand (Sleep).
          let override: TimerOverride
          if (typeof args.delta_seconds === 'number') {
            const delta = Number(args.delta_seconds)
            if (!Number.isFinite(delta)) {
              return JSON.stringify({ error: 'delta_seconds muss eine Zahl sein' })
            }
            const base =
              step.override !== null
                ? overrideEffectiveEnd(step.override, now)
                : derivedWaitEnd(step)
            if (base === null) return JSON.stringify({ error: 'Kein laufender Timer' })
            override = {
              alarmAt: Math.max(now, base + delta * 1000),
              pausedAt: null,
            }
          } else {
            const seconds = Number(args.seconds)
            if (!Number.isFinite(seconds) || seconds <= 0) {
              return JSON.stringify({ error: 'seconds muss positiv sein' })
            }
            override = {
              alarmAt: now + seconds * 1000,
              pausedAt: null,
            }
          }
          patchStep(id, stepId, { override })
          toast(
            `⏱ Timer: ${fmtRemaining(overrideEffectiveEnd(override, now))} (${flow.name}: ${stepLabel(step.description)})`,
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
          if (step.done) return JSON.stringify({ error: 'Schritt ist abgeschlossen' })
          const now = Date.now()
          if (step.override) {
            if (step.override.pausedAt !== null) {
              return JSON.stringify({ error: 'Timer ist bereits pausiert' })
            }
            patchStep(id, stepId, { override: { ...step.override, pausedAt: now } })
          } else {
            // Wartende Karte ohne Override: abgeleitete Wartezeit einfrieren
            const end =
              depsDone(step.dependsOn) ? derivedWaitEnd(step) : null
            if (end === null || end <= now) {
              return JSON.stringify({ error: 'Kein laufender Timer' })
            }
            patchStep(id, stepId, {
              override: { alarmAt: end, pausedAt: now },
            })
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
          if (!step.override || step.override.pausedAt === null) {
            return JSON.stringify({ error: 'Timer ist nicht pausiert' })
          }
          const now = Date.now()
          const o: TimerOverride = {
            alarmAt: step.override.alarmAt + (now - step.override.pausedAt),
            pausedAt: null,
          }
          patchStep(id, stepId, { override: o })
          toast(
            `▶ Timer läuft weiter: ${fmtRemaining(overrideEffectiveEnd(o, now))} (${flow.name}: ${stepLabel(step.description)})`,
          )
          return JSON.stringify({ ok: true })
        }
        case 'cancel_timer': {
          const id = String(args.flow_id ?? '')
          const stepId = String(args.step_id ?? '')
          const flow = findFlow(id)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const stepIdx = stepIndexOf(id, stepId)
          if (stepIdx < 0) return JSON.stringify({ error: 'Unbekannter Schritt' })
          // Override entfernen — auf einer wartenden Karte übernimmt sofort
          // wieder die ABGELEITETE Wartezeit (Reset auf die letzte Gate-Endzeit,
          // „die höchste Zeit"); auf einer aktiven Karte wird sie aktiv.
          patchStep(id, stepId, { override: null })
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
              override: null,
            })),
          })
          toast(`Fertig: ${flow.name}`)
          // Abhängige aus anderen Flows freigeben (alle Schritte sind jetzt done)
          activateDependents(flow.steps.map((st) => ({ flow_id: id, step_id: st.id })))

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
          // Farben sind abgeleitet (FLOW_COLORS[Flow-Index]) — kein Feld zu pflegen
          const flows = getCook().flows.filter((s) => s.id !== id)
          setCook((c) => ({
            ...c,
            flows,
            focusedFlowId: c.focusedFlowId === id ? (flows[0]?.id ?? null) : c.focusedFlowId,
          }))
          activateEligible()

          toast(`Gelöscht: ${flow.name}`)
          return JSON.stringify({ ok: true })
        }
        case 'reset_cook': {
          setCook((c) => ({ ...c, flows: [], ingredients: [], focusedFlowId: null }))
          toast('Alle Stränge gelöscht')
          return JSON.stringify({ ok: true })
        }
        case 'show_step': {
          // flow_id optional — step_id (UUID) reicht zur Identifikation
          const stepId = String(args.step_id ?? '')
          let flowId = String(args.flow_id ?? '')
          if (!flowId) {
            const found = getCook().flows.find((f) => f.steps.some((st) => st.id === stepId))
            if (!found) return JSON.stringify({ error: 'Unbekannter Schritt' })
            flowId = found.id
          }
          const flow = findFlow(flowId)
          if (!flow) return JSON.stringify({ error: 'Unbekannter Flow' })
          const step = flow.steps.find((st) => st.id === stepId)
          if (!step) return JSON.stringify({ error: 'Unbekannter Schritt' })
          setCook((c) => ({ ...c, focusedFlowId: flowId }))
          const view = args.view === 'jetzt' ? 'jetzt' : 'flow'
          setNavTarget({ flowId, stepId, nonce: Date.now(), view })
          if (args.speak === true) speak(step.description)
          return JSON.stringify({ ok: true })
        }
        case 'focus_flow': {
          const id = String(args.flow_id ?? '')
          if (!findFlow(id)) return JSON.stringify({ error: 'Unbekannter Flow' })
          setCook((c) => ({ ...c, focusedFlowId: id }))
          return JSON.stringify({ ok: true })
        }
        case 'set_ingredients': {
          const raw = Array.isArray(args.ingredients) ? args.ingredients : []
          const items = raw.flatMap((x) => {
            if (!x || typeof x !== 'object') return []
            const o = x as Record<string, unknown>
            const name = String(o.name ?? '').trim()
            if (!name) return []
            return { name, amount: o.amount ? String(o.amount) : '' }
          })
          setCook((c) => ({
            ...c,
            ingredients: items.map((it) => ({
              id: crypto.randomUUID(),
              name: it.name,
              amount: it.amount,
            })),
          }))
          toast(`Zutaten: ${items.length}`)
          return JSON.stringify({ ok: true, count: items.length })
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

  /* Einzige Wartung: explizite Overrides einsammeln, sobald sie ablaufen —
     abgeleitete Wartezeiten brauchen nichts (die Karte wird von selbst aktiv,
     sobald ihr Gate in der Vergangenheit liegt). Invariante: ein vorhandenes
     Override ist pausiert oder liegt in der Zukunft. Für abgelaufene
     abgeleitete Gates: Übergangs-Toast (Fenster ±2 s, damit er genau einmal
     kommt und nach Reload nicht nachhallt) — dedupliziert pro Karte und
     Endzeit, sonst feuert er auf jedem Tick im Fenster doppelt. */
  const toastedEnds = new Map<string, number>()
  function fireAlarm(sId: string, stepId: string, now: number, prio: boolean) {
    setAlarmEvents([
      ...alarmEvents().filter((e) => now - e.at < 6000),
      { flowId: sId, stepId, at: now, prio },
    ])
  }
  function expireTimers(): void {
    const now = Date.now()
    for (const s of getCook().flows) {
      s.steps.forEach((step) => {
        const ov = step.override
        if (ov) {
          if (ov.pausedAt !== null) return // pausiert läuft nie ab
          if (ov.alarmAt > now) return
          patchStep(s.id, step.id, { override: null })
          showToast(`⏰ Timer abgelaufen: ${s.name} — ${stepLabel(step.description)}`)
          fireAlarm(s.id, step.id, now, step.priority === 'high')
          return
        }
        if (step.done || !depsDone(step.dependsOn)) return
        const end = derivedWaitEnd(step)
        if (end !== null && end <= now && end > now - 2000) {
          const key = `${s.id}:${step.id}`
          if (toastedEnds.get(key) !== end) {
            toastedEnds.set(key, end)
            showToast(`⏰ Timer abgelaufen: ${s.name} — ${stepLabel(step.description)}`)
            fireAlarm(s.id, step.id, now, step.priority === 'high')
          }
        }
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
    get modalRequest() {
      return modalRequest()
    },
    get alarmEvents() {
      return alarmEvents()
    },
    executeTool,
    expireTimers,
  }
}
