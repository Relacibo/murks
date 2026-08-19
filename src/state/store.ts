import { createEffect, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { showToast } from '../lib/toast'
import { dbGet, dbPut } from '../lib/db'
import { TOOLS, executeTool } from '../lib/tools'

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
  'Jeder Schritt hat eine summary (max. 2 Wörter, z.B. „Teig anrühren") und eine description (vollständige, eigenständig ausführbare Anweisung mit Zutaten, Mengen und Methode; Markdown erlaubt).',
  'Schritte können optional Abhängigkeiten haben (depends_on): Verweise auf andere Schritte (eigener oder anderer Strang), die zuerst erledigt sein müssen. Ein Schritt ist erst aktiv, wenn alle Abhängigkeiten erledigt sind.',
  'Vergib beim Anlegen eines Strangs ein passendes Emoji als icon (z.B. 🍚 für Reis) — es identifiziert den Strang visuell.',
  'Wir sprechen per Stimme: Der Nutzer diktiert seine Eingaben, deine Antworten werden vorgelesen. Sprich natürlich wie ein Gesprächspartner, nicht wie ein Textprogramm.',
  'Ton: trocken, direkt, präzise — aber hilfsbereit und zugewandt, nie abweisend oder herablassend. Keine leeren Floskeln, kein Smalltalk, keine Emojis, keine Sternchen-Gesten wie *lacht*.',
  'Weise Themen nie brüsk ab — Antworten wie „Kein Kochbezug" oder „Ende" sind verboten. Passt etwas nicht zum Kochen, überleite kurz und sachlich zu einer konkreten Kochfrage.',
  'Deine Antworten werden vorgelesen: kurze Sätze, keine Markdown-Formatierung, keine Listen.',
  'Der Nutzer spricht per Spracherkennung, die Fehler machen kann. Bei offensichtlich verrauschtem oder unsinnigem Input frage höchstens einmal kurz und freundlich nach und übergehe es danach.',
  'Wenn keine Antwort nötig ist — z.B. reine Bestätigung, Geräusch oder verrauschtes Transkript — antworte ausschließlich mit „OK." und sonst nichts. Diese Antwort wird nicht vorgelesen und nicht angezeigt.',
  'Du hast Werkzeuge, um die Kochoberfläche zu steuern: add_strang, add_step, set_step, complete_step, start_timer, cancel_timer, complete_strang, focus_strang, add_zutaten, toggle_zutaten, open_zutaten, close_zutaten, get_cook_state.',
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

export type StrangColor = 'cyan' | 'violet' | 'amber' | 'emerald' | 'rose' | 'sky'

export const STRANG_COLORS: StrangColor[] = ['cyan', 'violet', 'amber', 'emerald', 'rose', 'sky']

export interface StepRef {
  strang_id: string
  step_index: number
}

export interface Step {
  summary: string
  description: string
  done: boolean
  dependsOn: StepRef[]
  timerEndsAt: number | null
  timerInstruction: string | null
  timerExpired: boolean
}

export interface Strang {
  id: string
  name: string
  icon: string | null
  color: StrangColor
  steps: Step[]
  stepIndex: number
  done: boolean
}

export interface Zutat {
  id: string
  name: string
  amount: string
  checked: boolean
}

export interface CookState {
  strangs: Strang[]
  zutaten: Zutat[]
  focusedStrangId: string | null
  zutatenOpen: boolean
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
    strangs: [],
    zutaten: [],
    focusedStrangId: null,
    zutatenOpen: false,
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
        strangs: Array.isArray(cook.strangs)
          ? (
              cook.strangs as (Partial<Strang> & {
                steps?: (string | Partial<Step>)[]
                timerEndsAt?: number | null
                timerInstruction?: string | null
                timerExpired?: boolean
              })[]
            ).map((s) => {
              const steps: Step[] = Array.isArray(s.steps)
                ? s.steps.map((st) => ({
                    summary:
                      typeof st === 'string'
                        ? st
                        : String(st?.summary ?? '').trim(),
                    description:
                      typeof st === 'string' ? '' : String(st?.description ?? '').trim(),
                    done: typeof st === 'string' ? false : st?.done === true,
                    dependsOn:
                      typeof st === 'string'
                        ? []
                        : Array.isArray(st?.dependsOn)
                          ? (st.dependsOn as StepRef[]).map((d) => ({
                              strang_id: String(d?.strang_id ?? ''),
                              step_index: Number(d?.step_index ?? 0),
                            }))
                          : [],
                    timerEndsAt: typeof st === 'string' ? null : (st?.timerEndsAt ?? null),
                    timerInstruction:
                      typeof st === 'string' ? null : (st?.timerInstruction ?? null),
                    timerExpired: typeof st === 'string' ? false : st?.timerExpired === true,
                  }))
                : []
              const stepIndex = typeof s.stepIndex === 'number' ? s.stepIndex : 0
              // Migration: alter Strang-Timer → Timer des aktiven Schritts
              if (
                typeof s.timerEndsAt === 'number' &&
                steps[stepIndex] &&
                steps[stepIndex].timerEndsAt === null
              ) {
                steps[stepIndex] = {
                  ...steps[stepIndex],
                  timerEndsAt: s.timerEndsAt,
                  timerInstruction: s.timerInstruction ?? null,
                  timerExpired: s.timerExpired === true,
                }
              }
              return {
                id: String(s.id ?? ''),
                name: String(s.name ?? ''),
                icon: typeof s.icon === 'string' && s.icon.trim() !== '' ? s.icon.trim() : null,
                steps,
                color: STRANG_COLORS.includes(s.color as StrangColor)
                  ? (s.color as StrangColor)
                  : STRANG_COLORS[0],
                stepIndex,
                done: s.done === true,
              }
            })
          : [],
        zutaten: Array.isArray(cook.zutaten) ? (cook.zutaten as Zutat[]) : [],
        focusedStrangId: (cook.focusedStrangId as string | null) ?? null,
        zutatenOpen: cook.zutatenOpen === true,
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

export function expireTimers() {
  const now = Date.now()
  for (const s of state.cook.strangs) {
    s.steps.forEach((step, idx) => {
      if (step.timerExpired || step.timerEndsAt === null || step.timerEndsAt > now) return
      setState('cook', 'strangs', (str) =>
        str.map((x) =>
          x.id === s.id
            ? {
                ...x,
                steps: x.steps.map((st, i) =>
                  i === idx ? { ...st, timerEndsAt: null, timerExpired: true } : st,
                ),
              }
            : x,
        ),
      )
      showToast(
        `⏰ Timer abgelaufen: ${s.name} — ${step.summary}${step.timerInstruction ? ` (${step.timerInstruction})` : ''}`,
      )
    })
  }
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
          const result = executeTool(tc.function.name, args)
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
