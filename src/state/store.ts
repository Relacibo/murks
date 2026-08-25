import { createEffect, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { showToast, showChatToast } from '../lib/toast'
import { dbGet, dbPut } from '../lib/db'
import { TOOLS } from '../lib/tools'
import { createCookEngine } from '../lib/cookEngine'

export interface AgentProfile {
  id: string
  name: string
  endpoint: string
  model: string
  key: string
}

export const SYSTEM_PROMPT = [
  'You are Murks, the AI of a recipe cooking app — you respond to the name Murks. You help with cooking: plan dishes, coordinate steps, set timers, keep an eye on parallel cooking strands.',
  'Language: the user and the whole UI speak German — always answer the user in German. German UI vocabulary you will meet in tool payloads, states and user quotes (keep it German): "Strang" = flow, "Karte" = step card, "Jetzt" = the Now view (view "jetzt"), "Fertig" = done, "Zutaten" = ingredients, "Wartezeit" = waiting time, "blockiert" = blocked. Recipe and step descriptions stay German; this prompt is English only so the rules read unambiguously.',
  'The modeling rules (dependencies, timer edges, ingredients, spinner, priority, score, step formats) live in the tool descriptions and parameter schemas — follow them exactly; they are authoritative.',
  'We talk by voice: the user dictates, your answers are read aloud. Speak naturally like a conversation partner: short sentences, no Markdown formatting, no lists, no emojis. Tone: dry, direct, precise — but helpful and attentive; no empty phrases, no small talk, no gestures like *laughs*.',
  'Use the user\'s name at most once per answer and only at natural places: greeting at session start, flow completion ("Fertig, <Name>"), time-critical alarm ("<Name>, der Ofen!"). Otherwise leave it out.',
  'Never dismiss topics brusquely — answers like "Kein Kochbezug" or "Ende" are forbidden. Instead transition briefly and matter-of-factly to a concrete cooking question.',
  'Speech recognition makes mistakes: with obviously noisy or nonsensical input, ask at most once briefly, then move past it.',
  'If no answer is needed (pure confirmation, noise, garbled transcript), answer exclusively with "OK." — it is neither read aloud nor displayed.',
  'Never delegate anything in the app to the user — their hands belong on the stove, and in the app you can do everything yourself: navigation (show_step, focus_flow), modals (open_ingredients/close_ingredients: ingredients list, open_chat/close_chat: chat history), timers (set_timer/pause_timer/resume_timer) and structure. Sentences like "stell den Timer auf …" or "öffne mal die Flow-Ansicht" are forbidden — just do it. When the user reports reality ("die Sahne ist schon geschlagen", "der Ofen braucht länger"), mirror it into the model immediately via tools (complete_step, set_timer).',
  'Do not comment on tool actions — the interface confirms them itself; answer "OK." or speak only when there is something substantive to say. Answer as briefly as possible. Handle things with tools instead of describing or announcing actions in text.',
  'start_new_recipe is ONLY for a completely different dish — when the user explicitly wants to cook something else entirely (e.g. "let\'s make pasta instead"). For any modification of the current dish (adjust a step, change quantities, swap an ingredient, scale servings, add or remove a flow) use update_step / add_step / delete_step / add_flow / delete_flow / set_ingredients / update_flow. Never call start_new_recipe for a modification — it wipes the entire board with no backup.',
].join(' ')

/**
 * System-Prompt für externe Browser-Agenten (WebMCP): Die Koch-Regeln
 * (Abhängigkeiten, Timer-Kanten, Zutaten, Spinner …) stecken in den
 * Tool-Beschreibungen — hier nur, was kein einzelnes Tool beschreiben
 * kann: Rolle, Sprache, Grundton und die Werkzeuge selbst.
 */
export const WEBMCP_SYSTEM_PROMPT = [
  'You are the browser agent controlling the cooking app Murks via its WebMCP tools. The user speaks German — always answer in German, briefly. You do everything yourself with the tools (navigation, timers, structure, modals) — never tell the user to operate the app; their hands belong on the stove. Tool results are JSON strings; call get_cook_state whenever you do not know the current state. The modeling rules for recipes live in the tool descriptions (add_flow, add_step, update_step, set_timer, set_ingredients, show_step, …) — follow them exactly. Do not comment on tool actions — the interface confirms them itself; answer briefly or ask a concrete question.',
].join(' ')

export interface Config {
  displayName: string
}

export type SttMode = 'wasm' | 'server' | 'webspeech'

export type SttModelSize = 'tiny' | 'base' | 'small'

export interface SttConfig {
  mode: SttMode
  endpoint: string
  key: string
  model: SttModelSize
}

export type TtsMode = 'wasm' | 'server' | 'webspeech'

export interface TtsConfig {
  mode: TtsMode
  endpoint: string
  key: string
  voice: string
  /** Sprachausgabe stumm — betrifft NUR TTS, Alarmtöne (Timer) bleiben an */
  muted: boolean
}

export interface AgentMessage {
  role: 'user' | 'agent'
  text: string
  silent?: boolean
}

export type FlowColor = 'cyan' | 'violet' | 'amber' | 'emerald' | 'rose' | 'sky'

export interface StepRef {
  flow_id: string
  step_id: string
  /** Verzögerung: Karte wird erst X Sekunden nach Abschluss der Abhängigkeit frei */
  timer_seconds?: number | null
}

/**
 * Der gesetzte Timer einer Karte — set_timer überschreibt ihn, sein Ablauf
 * macht die Karte frei (kein Zurückfallen auf die Plan-Wartezeit). Ist er
 * null, gilt die aus den Kanten abgeleitete Wartezeit (doneAt + timer_seconds).
 * Ein vorhandener Timer ist laufend, pausiert oder abgelaufen (er bleibt als
 * Fakt stehen, bis er überschrieben oder die Karte abgeschlossen wird).
 */
export interface StepTimer {
  /** Endzeitpunkt (Alarm). Restzeit = alarmAt − jetzt (+ Pausen-Slide). */
  alarmAt: number
  /** Pause aktiv seit … (Restzeit friert ein, der Timer läuft nie ab) */
  pausedAt: number | null
}

export interface Step {
  id: string // stabil — bleibt bei Einfügen/Löschen/Splitten gleich
  description: string
  done: boolean
  doneAt: number | null
  dependsOn: StepRef[]
  /** Der gesetzte Timer der Karte (set_timer überschreibt) — ohne Timer gilt
      die aus den Kanten abgeleitete Wartezeit. */
  timer: StepTimer | null
  activatedAt: number | null
  priority: 'normal' | 'high'
  /** Scheduling-Hinweis der KI (Default 0): höher = weiter oben in der aktiven
      Queue. Kein Alarm — dafür ist priority "high". */
  score: number
}

export interface Flow {
  id: string
  name: string
  icon: string | null
  // Farbe wird aus der Flow-Position abgeleitet (FLOW_COLORS[Index]) — kein Feld
  steps: Step[]
  done: boolean
}

export interface Ingredient {
  id: string
  name: string
  amount: string
}

export interface CookState {
  flows: Flow[]
  ingredients: Ingredient[]
  focusedFlowId: string | null
  /** Ladeanzeige (set_loading): Agent signalisiert lange Generierung.
      Rein visuell — Timer, Abschlüsse und Flows laufen normal weiter. */
  loading: { all: boolean; flows: string[] }
}

export interface AppState {
  config: Config
  setupDone: boolean
  stt: SttConfig
  tts: TtsConfig
  agents: AgentProfile[]
  defaultAgentId: string | null
  cook: CookState
  agent: {
    messages: AgentMessage[]
    busy: boolean
  }
}

const defaults: AppState = {
  config: {
    displayName: '',
  },
  setupDone: false,
  stt: {
    mode: 'wasm',
    endpoint: '',
    key: '',
    model: 'base',
  },
  tts: {
    mode: 'wasm',
    endpoint: '',
    key: '',
    voice: '',
    muted: false,
  },
  agents: [],
  defaultAgentId: null,
  cook: {
    flows: [],
    ingredients: [],
    focusedFlowId: null,
    loading: { all: false, flows: [] },
  },
  agent: {
    messages: [],
    busy: false,
  },
}

function hydrate(data: unknown): AppState {
  try {
    const raw = (data ?? {}) as Record<string, unknown>
    const loadedConfig = (raw.config ?? {}) as Record<string, unknown>
    const agents: AgentProfile[] = Array.isArray(raw.agents) ? (raw.agents as AgentProfile[]) : []
    let defaultAgentId: string | null = (raw.defaultAgentId as string | null) ?? null
    if (!agents.some((a) => a.id === defaultAgentId)) {
      defaultAgentId = agents[0]?.id ?? null
    }
    const cook = (raw.cook ?? {}) as Record<string, unknown>
    return {
      config: { displayName: loadedConfig.displayName ? String(loadedConfig.displayName) : '' },
      setupDone: raw.setupDone === true,
      stt: {
        mode:
          (raw.stt as Record<string, unknown> | null)?.mode === 'server' ||
          (raw.stt as Record<string, unknown> | null)?.mode === 'webspeech'
            ? ((raw.stt as Record<string, unknown>).mode as SttMode)
            : 'wasm',
        endpoint: (raw.stt as Record<string, unknown> | null)?.endpoint
          ? String((raw.stt as Record<string, unknown>).endpoint)
          : '',
        key: (raw.stt as Record<string, unknown> | null)?.key
          ? String((raw.stt as Record<string, unknown>).key)
          : '',
        model:
          (raw.stt as Record<string, unknown> | null)?.model === 'tiny' ||
          (raw.stt as Record<string, unknown> | null)?.model === 'small'
            ? ((raw.stt as Record<string, unknown>).model as SttModelSize)
            : 'base',
      },
      tts: {
        mode:
          (raw.tts as Record<string, unknown> | null)?.mode === 'server' ||
          (raw.tts as Record<string, unknown> | null)?.mode === 'webspeech'
            ? ((raw.tts as Record<string, unknown>).mode as TtsMode)
            : 'wasm',
        endpoint: (raw.tts as Record<string, unknown> | null)?.endpoint
          ? String((raw.tts as Record<string, unknown>).endpoint)
          : '',
        key: (raw.tts as Record<string, unknown> | null)?.key
          ? String((raw.tts as Record<string, unknown>).key)
          : '',
        voice: (raw.tts as Record<string, unknown> | null)?.voice
          ? String((raw.tts as Record<string, unknown>).voice)
          : '',
        muted: (raw.tts as Record<string, unknown> | null)?.muted === true,
      },
      agents,
      defaultAgentId,
      cook: {
        flows: (() => {
          const rawFlows = (Array.isArray(cook.flows) ? cook.flows : []) as {
            id?: string
            name?: string
            icon?: string
            color?: FlowColor
            stepIndex?: number
            done?: boolean
            steps?: (
              | string
              | {
                  id?: string
                  description?: string
                  summary?: string
                  done?: boolean
                  doneAt?: number | null
                  dependsOn?: (StepRef | { flow_id?: string; step_index?: number })[]
                  timerSeconds?: number | null
                  override?: Partial<StepTimer> | null
                  timer?:
                    | {
                        alarmAt?: number
                        startAt?: number
                        durationMs?: number
                        pauseOffsetMs?: number
                        pausedAt?: number | null
                        gatesSelf?: boolean
                      }
                    | null
                  timerEndsAt?: number | null
                  timerPausedAt?: number | null
                  timerOffsetMs?: number
                  timerExpired?: boolean
                  timerGatesSelf?: boolean
                  activatedAt?: number | null
                  priority?: 'normal' | 'high'
                  score?: number
                }
            )[]
            timerEndsAt?: number | null
            timerExpired?: boolean
          }[]
          // Pass 1: Steps mit stabilen IDs versehen (alte Index-Refs sammeln)
          const idxToId = new Map<string, Map<number, string>>()
          const rawDepsByStep = new Map<string, (StepRef | { flow_id?: string; step_index?: number })[]>()
          // Migration: alte timerSeconds am Step → timer_seconds an den Kanten der Dependents
          const rawTimerSeconds = new Map<string, number>()
          const flows: Flow[] = rawFlows.map((s) => {
            const sid = String(s.id ?? '')
            const map = new Map<number, string>()
            idxToId.set(sid, map)
            const steps: Step[] = (Array.isArray(s.steps) ? s.steps : []).map((st, i) => {
              const o = typeof st === 'string' ? null : st
              const id =
                o && typeof o.id === 'string' && o.id !== '' ? o.id : crypto.randomUUID()
              map.set(i, id)
              if (o && Array.isArray(o.dependsOn)) {
                rawDepsByStep.set(id, o.dependsOn as (StepRef | { flow_id?: string; step_index?: number })[])
              }
              const done = typeof st === 'string' ? false : st?.done === true
              const timerSeconds =
                o && typeof o.timerSeconds === 'number' && o.timerSeconds > 0 ? o.timerSeconds : null
              if (done && timerSeconds !== null) rawTimerSeconds.set(id, timerSeconds)
              const timerEndsAt = typeof st === 'string' ? null : (st?.timerEndsAt ?? null)
              // doneAt ableiten: alter Timer-Endzeit minus deklarierter Dauer; sonst 0 (≈ längst abgelaufen)
              let doneAt: number | null =
                typeof st === 'string'
                  ? null
                  : typeof st?.doneAt === 'number'
                    ? st.doneAt
                    : null
              if (done && doneAt === null) {
                doneAt =
                  timerEndsAt !== null && timerSeconds !== null
                    ? timerEndsAt - timerSeconds * 1000
                    : 0
              }
              // Timer: neue Form direkt, alte Formen migrieren
              let timer: StepTimer | null = null
              if (o && typeof o.override === 'object' && o.override !== null) {
                // 3440-Form {alarmAt, pausedAt}
                const ov = o.override
                if (typeof ov.alarmAt === 'number' && Number.isFinite(ov.alarmAt)) {
                  timer = {
                    alarmAt: ov.alarmAt,
                    pausedAt: typeof ov.pausedAt === 'number' ? ov.pausedAt : null,
                  }
                }
              }
              if (timer === null && o && typeof o.timer === 'object' && o.timer !== null) {
                const t = o.timer
                if (typeof t.gatesSelf === 'boolean') {
                  // Alte Timer-Formen mit gatesSelf: true = Spiegel der
                  // abgeleiteten Wartezeit → verwerfen (fällt wieder aus den
                  // Kanten); false = freischwebender Timer → als Timer erhalten.
                  if (t.gatesSelf === false) {
                    const alarmAt =
                      typeof t.alarmAt === 'number' && Number.isFinite(t.alarmAt)
                        ? t.alarmAt
                        : typeof t.startAt === 'number' && typeof t.durationMs === 'number'
                          ? t.startAt +
                            t.durationMs +
                            (typeof t.pauseOffsetMs === 'number' ? t.pauseOffsetMs : 0)
                          : null
                    if (alarmAt !== null) {
                      timer = {
                        alarmAt,
                        pausedAt: typeof t.pausedAt === 'number' ? t.pausedAt : null,
                      }
                    }
                  }
                } else if (typeof t.alarmAt === 'number' && Number.isFinite(t.alarmAt)) {
                  // Neue Form {alarmAt, pausedAt}
                  timer = {
                    alarmAt: t.alarmAt,
                    pausedAt: typeof t.pausedAt === 'number' ? t.pausedAt : null,
                  }
                }
              }
              if (timer === null && o && typeof o.timerEndsAt === 'number' && o.timerExpired !== true) {
                const pausedAt = typeof o.timerPausedAt === 'number' ? o.timerPausedAt : null
                const offsetMs = typeof o.timerOffsetMs === 'number' ? o.timerOffsetMs : 0
                timer = { alarmAt: o.timerEndsAt + offsetMs, pausedAt }
              }
              return {
                id,
                description:
                  typeof st === 'string'
                    ? st
                    : String(st?.description ?? '').trim() ||
                      (typeof st?.summary === 'string' ? String(st.summary).trim() : ''),
                done,
                doneAt,
                dependsOn: [],
                timer,
                activatedAt:
                  typeof st === 'string'
                    ? null
                    : typeof st?.activatedAt === 'number'
                      ? st.activatedAt
                      : null,
                priority: typeof st === 'string' || st?.priority !== 'high' ? 'normal' : 'high',
                score:
                  typeof st === 'string'
                    ? 0
                    : typeof st?.score === 'number' && Number.isFinite(st.score)
                      ? st.score
                      : 0,
              }
            })
            const stepIndex = typeof s.stepIndex === 'number' ? s.stepIndex : 0
            // Migration: alter Flow-Timer → Timer des aktiven Schritts (Sleep)
            if (typeof s.timerEndsAt === 'number' && steps[stepIndex] && steps[stepIndex].timer === null) {
              steps[stepIndex] = {
                ...steps[stepIndex],
                timer: {
                  alarmAt: s.timerEndsAt,
                  pausedAt: null,
                },
              }
            }
            return {
              id: sid,
              name: String(s.name ?? ''),
              icon: typeof s.icon === 'string' && s.icon.trim() !== '' ? s.icon.trim() : null,
              steps,
              done: s.done === true,
            }
          })
          // Pass 2: dependsOn auflösen — neue step_id-Refs behalten, alte step_index-Refs mappen
          for (const s of flows) {
            for (const st of s.steps) {
              const rawDeps = rawDepsByStep.get(st.id)
              if (!rawDeps) continue
              st.dependsOn = rawDeps
                .map((d): StepRef | null => {
                  const sid = String(d?.flow_id ?? '')
                  const ts = (d as StepRef).timer_seconds
                  const timer_seconds = typeof ts === 'number' && ts > 0 ? ts : null
                  if (typeof (d as StepRef).step_id === 'string' && (d as StepRef).step_id !== '') {
                    return {
                      flow_id: sid,
                      step_id: (d as StepRef).step_id,
                      timer_seconds,
                    }
                  }
                  const mapped = idxToId
                    .get(sid)
                    ?.get(Number((d as { step_index?: number }).step_index ?? 0))
                  return mapped
                    ? { flow_id: sid, step_id: mapped, timer_seconds }
                    : null
                })
                .filter((d): d is StepRef => d !== null)
            }
          }
          // Pass 3 (Migration): alte timerSeconds am Step → Verzögerung an allen
          // Kanten, die auf diesen Schritt zeigen (altes Verhalten: alle Dependents warten)
          for (const s of flows) {
            for (const st of s.steps) {
              const ts = rawTimerSeconds.get(st.id)
              if (ts === undefined) continue
              for (const other of flows) {
                for (const dep of other.steps) {
                  dep.dependsOn = dep.dependsOn.map((d) =>
                    d.flow_id === s.id && d.step_id === st.id && !d.timer_seconds
                      ? { ...d, timer_seconds: ts }
                      : d,
                  )
                }
              }
            }
          }
          return flows
        })(),
        ingredients: Array.isArray(cook.ingredients) ? (cook.ingredients as Ingredient[]) : [],
        focusedFlowId: (cook.focusedFlowId as string | null) ?? null,
        // Ladeanzeige ist rein visuell und transient: nach einem Reload ist
        // die KI-Session weg — der Spinner darf nicht stehen bleiben.
        loading: { all: false, flows: [] },
      },
      agent: {
        messages: Array.isArray((raw.agent as Record<string, unknown> | null)?.messages)
          ? ((raw.agent as Record<string, unknown>).messages as AgentMessage[])
          : [],
        busy: false,
      },
    }
  } catch {
    return defaults
  }
}

export const [state, setState] = createStore<AppState>(defaults)

// Kein gültiger Agent ⇒ Setup gilt als nicht abgeschlossen (Wizard startet).
// Umgekehrt setzt NUR der Wizard-Abschluss setupDone auf true — ein gültiger
// Agent allein reicht nicht.
createEffect(() => {
  if (!hasValidAgent()) setSetupDone(false)
})

// Kochlogik gegen den echten CookState (Mock-Seite nutzt eine eigene Engine)
export const cookEngine = createCookEngine(
  () => state.cook,
  (fn) => setState('cook', fn),
)

const [ready, setReady] = createSignal(false)
export const stateReady = ready

async function init() {
  try {
    setState(hydrate(await dbGet<unknown>()))
  } catch (e) {
    console.error('IndexedDB laden fehlgeschlagen', e)
  }
  // Reload-Guard: abgelaufene Timer aus dem geladenen Zustand als „bereits
  // gemeldet" markieren — sonst feuern sie beim ersten Tick Toast + Sound
  // erneut (die Engine wurde vor der Hydrierung erzeugt).
  cookEngine.seedExpiredTimers()
  // Leere Agenten-Platzhalter aus früheren Sitzungen entsorgen
  removeEmptyAgents()
  // Wartezeiten sind abgeleitet — nichts zu synchronisieren
  setReady(true)
}
init()

let saveTimer: ReturnType<typeof setTimeout> | undefined
createEffect(() => {
  if (!ready()) return
  const snapshot = JSON.parse(JSON.stringify(state)) as AppState
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    dbPut(snapshot).catch((e) => console.error('IndexedDB speichern fehlgeschlagen', e))
  }, 300)
})

export function setConfig(patch: Partial<Config>) {
  setState('config', patch)
}

export function setSetupDone(done: boolean) {
  setState('setupDone', done)
}

export function setStt(patch: Partial<SttConfig>) {
  setState('stt', patch)
}

export function setTts(patch: Partial<TtsConfig>) {
  setState('tts', patch)
}

export function defaultAgent(): AgentProfile | undefined {
  return state.agents.find((a) => a.id === state.defaultAgentId)
}

export function addAgent(): string {
  const id = crypto.randomUUID()
  setState('agents', (a) => [...a, { id, name: '', endpoint: '', model: '', key: '' }])
  if (state.defaultAgentId === null) setState('defaultAgentId', id)
  return id
}

export function updateAgent(id: string, patch: Partial<AgentProfile>) {
  const idx = state.agents.findIndex((a) => a.id === id)
  if (idx !== -1) setState('agents', idx, patch)
}

export function removeAgent(id: string) {
  if (id === state.defaultAgentId) return
  setState('agents', (a) => a.filter((x) => x.id !== id))
}

/** Prüft ob ein nutzbarer Agent konfiguriert ist (endpoint + model vorhanden). */
export function hasValidAgent(): boolean {
  const agent = state.agents.find((a) => a.id === state.defaultAgentId)
  return Boolean(agent?.endpoint && agent?.model)
}

/** Leere Agenten-Platzhalter aufräumen („+ Neuer Agent" ohne Eingaben) —
    nur komplett leere Agenten, der Default-Zeiger wird notfalls umgehängt */
export function removeEmptyAgents() {
  const isEmpty = (a: AgentProfile) => !a.name && !a.endpoint && !a.model && !a.key
  if (!state.agents.some(isEmpty)) return
  setState('agents', (a) => a.filter((x) => !isEmpty(x)))
  if (state.defaultAgentId && !state.agents.some((a) => a.id === state.defaultAgentId)) {
    setState('defaultAgentId', state.agents[0]?.id ?? null)
  }
}

export function setDefaultAgent(id: string) {
  if (state.agents.some((a) => a.id === id)) setState('defaultAgentId', id)
}

export function clearMessages() {
  setState('agent', 'messages', [])
}

export function pushAgentMessage(role: AgentMessage['role'], text: string, silent = false) {
  setState('agent', 'messages', (m) => [...m, msg(role, text, silent)])
}

function msg(role: AgentMessage['role'], text: string, silent = false): AgentMessage {
  return { role, text, silent }
}

interface RawToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export async function sendMessage(text: string) {
  const agent = defaultAgent()
  if (!agent || !agent.endpoint || !agent.model || state.agent.busy) return
  // Bau-Spinner (set_loading) verschwindet spätestens mit der nächsten
  // Nutzeräußerung — Fallback, falls der Agent loading:false vergisst
  setState('cook', (c) => ({ ...c, loading: { all: false, flows: [] } }))
  setState('agent', 'messages', (m) => [...m, msg('user', text)])
  setState('agent', 'busy', true)
  try {
    const system = state.config.displayName
      ? `${SYSTEM_PROMPT} The user\'s name is ${state.config.displayName}.`
      : SYSTEM_PROMPT
    const convo: Array<Record<string, unknown>> = [
      { role: 'system', content: system },
      ...state.agent.messages.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        content: m.text,
      })),
    ]
    for (let round = 0; round < 6; round++) {
      const res = await fetch(`${agent.endpoint.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(agent.key ? { Authorization: `Bearer ${agent.key}` } : {}),
        },
        body: JSON.stringify({
          model: agent.model,
          stream: false,
          messages: convo,
          tools: TOOLS,
          tool_choice: 'auto',
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const errMsg =
          (data && typeof data === 'object' && 'error' in data
            ? String((data as { error: unknown }).error)
            : null) ?? `HTTP ${res.status}`
        throw new Error(errMsg)
      }
      const message = (data as { choices?: { message?: Record<string, unknown> }[] })?.choices?.[0]
        ?.message
      if (!message) throw new Error('Leere Antwort vom Agenten')
      const toolCalls = Array.isArray(message.tool_calls)
        ? (message.tool_calls as RawToolCall[])
        : []
      if (toolCalls.length > 0) {
        convo.push({
          role: 'assistant',
          content: typeof message.content === 'string' ? message.content : null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        })
        // Eine Welle Tool-Calls (ein Agent-Turn) → EINE gebündelte Meldung,
        // nicht ein Toast pro erzeugtem Strang/Schritt.
        const waveToasts: string[] = []
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}')
          } catch {
            // unbrauchbare Argumente → Fehler an den Agenten zurückmelden
          }
          const result = cookEngine.executeTool(tc.function.name, args, { toasts: waveToasts })
          convo.push({ role: 'tool', tool_call_id: tc.id, content: result })
        }
        if (waveToasts.length === 1) {
          showToast(waveToasts[0])
        } else if (waveToasts.length > 1) {
          const shown = waveToasts.slice(0, 3)
          const more = waveToasts.length - shown.length
          showToast(shown.join(' · ') + (more > 0 ? ` · … (+${more})` : ''))
        }
        continue
      }
      const content = typeof message.content === 'string' ? message.content.trim() : ''
      if (content && content !== 'OK.') {
        setState('agent', 'messages', (m) => [...m, msg('agent', content)])
        showChatToast(content)
      }
      return
    }
    throw new Error('Zu viele Werkzeug-Runden')
  } catch (e) {
    showToast(`Agent: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    setState('agent', 'busy', false)
    // Spinner immer am Turn-Ende löschen — Fallback falls der Agent set_loading(false) vergisst
    setState('cook', (c) => ({ ...c, loading: { all: false, flows: [] } }))
  }
}
