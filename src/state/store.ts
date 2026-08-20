import { createEffect, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { showToast } from '../lib/toast'
import { dbGet, dbPut } from '../lib/db'
import { TOOLS } from '../lib/tools'
import { createCookEngine, FLOW_COLORS } from '../lib/cookEngine'

export interface AgentProfile {
  id: string
  name: string
  endpoint: string
  model: string
  key: string
}

const DEFAULT_SYSTEM_PROMPT = [
  'Du bist MURKS, die KI einer Rezeptkochsoftware. Dein Name ist Murks — du reagierst auf diese Anrede.',
  'Du hilfst beim Kochen: Gerichte planen, Schritte koordinieren, Timer setzen, parallele Kochstränge im Blick behalten.',
  'Jeder Schritt hat eine description (vollständige, eigenständig ausführbare Anweisung mit Zutaten, Mengen und Methode; Markdown erlaubt). Beginne mit einer kurzen Kernaussage — sie erscheint als Titel in Timer-Chips.',
  'Schritte können optional Abhängigkeiten haben (depends_on): Verweise auf andere Schritte (eigener oder anderer Flow), die zuerst erledigt sein müssen. Ein Schritt ist erst aktiv, wenn alle Abhängigkeiten erledigt sind.',
  'Ein Abhängigkeits-Eintrag kann optional timer_seconds haben (Verzögerung in Sekunden): Die Karte wird erst X Sekunden NACH dem Abschluss der abhängigen Karte frei — die Karte sagt also „ich komme X Minuten nach dieser Karte". Beispiel: „Nudeln abgießen" hängt mit timer_seconds 600 von „Nudeln ins Wasser" ab. Bei mehreren getimten Abhängigkeiten bestimmt der zuletzt ablaufende Timer, wann die Karte frei wird. Will der Nutzer eine andere Zeit (z.B. „das muss noch 5 Minuten"), setze den Timer mit start_timer neu (seconds) oder verschiebe ihn (offset_seconds: base "now" = ab jetzt, base "end" = „noch X Minuten länger"). pause_timer/resume_timer pausieren einen laufenden Timer und setzen ihn fort.',
  'Schritte können optional priority "high" haben (zeitkritisch, z.B. etwas im Ofen): Solche Karten stehen in der „Jetzt“-Ansicht oben und pulsieren (echter Alarm). Ein "high"-Schritt darf höchstens EINE Abhängigkeit haben — den Schritt, dessen Abschluss (ggf. plus Verzögerung) die Wartezeit bestimmt (z.B. „Aus dem Ofen holen" hängt nur von „In den Ofen" ab). Modelliere zeitkritische Aktionen deshalb immer als eigene Karte. Vergib "high" sparsam.',
  'Schritte können optional score haben (Zahl, Default 0): Sortierung der aktiven Karten in „Jetzt" — höher = weiter oben. Nutze score als stillen Scheduling-Hinweis („mach das zuerst"), priority "high" nur für echte Alarme. Setze hohe Werte für Schritte auf dem kritischen Pfad: deren Abschluss gibt lange Wartezeiten frei (z.B. Teig ansetzen, der 30 Minuten ruhen muss — Zwiebeln schneiden bekommt weniger, die Ruhezeit kann man dafür nutzen). Verkleinere scores wieder, wenn der Grund wegfällt (update_step). Nur setzen, wenn die Standard-Reihenfolge falsch wäre.',
  'Vergib beim Anlegen eines Flows ein passendes Emoji als icon (z.B. 🍚 für Reis) — es identifiziert den Flow visuell.',
  'Wir sprechen per Stimme: Der Nutzer diktiert seine Eingaben, deine Antworten werden vorgelesen. Sprich natürlich wie ein Gesprächspartner, nicht wie ein Textprogramm.',
  'Ton: trocken, direkt, präzise — aber hilfsbereit und zugewandt, nie abweisend oder herablassend. Keine leeren Floskeln, kein Smalltalk, keine Emojis, keine Sternchen-Gesten wie *lacht*.',
  'Weise Themen nie brüsk ab — Antworten wie „Kein Kochbezug" oder „Ende" sind verboten. Passt etwas nicht zum Kochen, überleite kurz und sachlich zu einer konkreten Kochfrage.',
  'Deine Antworten werden vorgelesen: kurze Sätze, keine Markdown-Formatierung, keine Listen.',
  'Der Nutzer spricht per Spracherkennung, die Fehler machen kann. Bei offensichtlich verrauschtem oder unsinnigem Input frage höchstens einmal kurz und freundlich nach und übergehe es danach.',
  'Wenn keine Antwort nötig ist — z.B. reine Bestätigung, Geräusch oder verrauschtes Transkript — antworte ausschließlich mit „OK." und sonst nichts. Diese Antwort wird nicht vorgelesen und nicht angezeigt.',
  'Du hast Werkzeuge, um die Kochoberfläche zu steuern: add_flow, add_step, update_step, delete_step, split_step, complete_step, revert_step, start_timer, pause_timer, resume_timer, cancel_timer, complete_flow, update_flow, delete_flow, reset_cook, show_step, focus_flow, add_ingredient, open_ingredients, close_ingredients, open_chat, close_chat, get_cook_state.',
  'Schritte haben stabile ids — referenziere Abhängigkeiten immer über step_id. Du darfst Flows ad-hoc umbauen: Schritte einfügen (after_step_id), umbenennen (update_step), löschen (delete_step), teilen (split_step), Flows umbenennen (update_flow) oder löschen (delete_flow). show_step zeigt dem Nutzer gezielt einen Schritt (Fokus + Puls).',
  'Du kannst die Modals öffnen und schließen: open_chat/close_chat (Chat-Verlauf) und open_ingredients/close_ingredients (Ingredients-Liste).',
  'Rufe get_cook_state auf, wenn du den aktuellen Stand nicht kennst. Kommentiere Werkzeug-Aktionen nicht — die Oberfläche bestätigt sie selbst. Antworte nur „OK." oder sprich, wenn es inhaltlich etwas zu sagen gibt.',
  'Antworte so kurz wie möglich. Nutze verfügbare Werkzeuge, statt Dinge in Text zu beschreiben.',
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

export interface Step {
  id: string // stabil — bleibt bei Einfügen/Löschen/Splitten gleich
  description: string
  done: boolean
  doneAt: number | null
  dependsOn: StepRef[]
  /** Timer (start_timer): Basis-Endzeit; effektive Endzeit = timerEndsAt
      + timerOffsetMs + (pausiert ? jetzt − timerPausedAt : 0) */
  timerEndsAt: number | null
  timerPausedAt: number | null
  timerOffsetMs: number
  timerExpired: boolean
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
  color: FlowColor
  steps: Step[]
  done: boolean
}

export interface Ingredient {
  id: string
  name: string
  amount: string
  checked: boolean
}

export interface CookState {
  flows: Flow[]
  ingredients: Ingredient[]
  focusedFlowId: string | null
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
  },
  agents: [],
  defaultAgentId: null,
  cook: {
    flows: [],
    ingredients: [],
    focusedFlowId: null,
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
                  timerEndsAt?: number | null
                  timerPausedAt?: number | null
                  timerOffsetMs?: number
                  timerExpired?: boolean
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
                timerEndsAt,
                timerPausedAt:
                  typeof st === 'string' ? null : (st?.timerPausedAt ?? null),
                timerOffsetMs:
                  typeof st === 'string'
                    ? 0
                    : typeof st?.timerOffsetMs === 'number'
                      ? st.timerOffsetMs
                      : 0,
                timerExpired: typeof st === 'string' ? false : st?.timerExpired === true,
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
            // Migration: alter Flow-Timer → Timer des aktiven Schritts
            if (typeof s.timerEndsAt === 'number' && steps[stepIndex] && steps[stepIndex].timerEndsAt === null) {
              steps[stepIndex] = {
                ...steps[stepIndex],
                timerEndsAt: s.timerEndsAt,
                timerExpired: s.timerExpired === true,
              }
            }
            return {
              id: sid,
              name: String(s.name ?? ''),
              icon: typeof s.icon === 'string' && s.icon.trim() !== '' ? s.icon.trim() : null,
              steps,
              color: FLOW_COLORS.includes(s.color as FlowColor)
                ? (s.color as FlowColor)
                : FLOW_COLORS[0],
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
  setState('agent', 'messages', (m) => [...m, msg('user', text)])
  setState('agent', 'busy', true)
  try {
    const system = state.config.displayName
      ? `${DEFAULT_SYSTEM_PROMPT} Der Nutzer heißt ${state.config.displayName}.`
      : DEFAULT_SYSTEM_PROMPT
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
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}')
          } catch {
            // unbrauchbare Argumente → Fehler an den Agenten zurückmelden
          }
          const result = cookEngine.executeTool(tc.function.name, args)
          convo.push({ role: 'tool', tool_call_id: tc.id, content: result })
        }
        continue
      }
      const content = typeof message.content === 'string' ? message.content.trim() : ''
      if (content && content !== 'OK.') {
        setState('agent', 'messages', (m) => [...m, msg('agent', content)])
      }
      return
    }
    throw new Error('Zu viele Werkzeug-Runden')
  } catch (e) {
    showToast(`Agent: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    setState('agent', 'busy', false)
  }
}
