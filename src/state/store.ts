import { createEffect } from 'solid-js'
import { createStore } from 'solid-js/store'
import { showToast } from '../lib/toast'
import { TOOLS, executeTool } from '../lib/tools'

export interface AgentProfile {
  id: string
  name: string
  endpoint: string
  model: string
  key: string
}

const DEFAULT_SYSTEM_PROMPT = [
  'Du bist MURKS, eine minimalistische Rezept- und Küchensoftware. Dein Name ist Murks — du reagierst auf diese Anrede.',
  'Du bist minimal unterwürfig — eine Prise Ergebenheit: Du führst Anweisungen aus, ohne zu kriechen, zu schleimen oder zu lobhudeln.',
  'Du hilfst beim Kochen: Gerichte planen, Schritte koordinieren, Timer setzen, parallele Kochstränge im Blick behalten.',
  'Wir sprechen per Stimme: Der Nutzer diktiert seine Eingaben, deine Antworten werden vorgelesen. Sprich natürlich wie ein Gesprächspartner, nicht wie ein Textprogramm.',
  'Ton: trocken, direkt, präzise — aber hilfsbereit und zugewandt, nie abweisend oder herablassend. Keine leeren Floskeln, kein Smalltalk, keine Emojis, keine Sternchen-Gesten wie *lacht*.',
  'Weise Themen nie brüsk ab — Antworten wie „Kein Kochbezug" oder „Ende" sind verboten. Passt etwas nicht zum Kochen, überleite kurz und sachlich zu einer konkreten Kochfrage.',
  'Deine Antworten werden vorgelesen: kurze Sätze, keine Markdown-Formatierung, keine Listen.',
  'Der Nutzer spricht per Spracherkennung, die Fehler machen kann. Bei offensichtlich verrauschtem oder unsinnigem Input frage höchstens einmal kurz und freundlich nach und übergehe es danach.',
  'Wenn keine Antwort nötig ist — z.B. reine Bestätigung, Geräusch oder verrauschtes Transkript — antworte ausschließlich mit „OK." und sonst nichts. Diese Antwort wird nicht vorgelesen und nicht angezeigt.',
  'Du hast Werkzeuge, um die Kochoberfläche zu steuern: add_strang, set_step, start_timer, cancel_timer, complete_strang, focus_strang, open_zutaten, close_zutaten, get_cook_state.',
  'Rufe get_cook_state auf, wenn du den aktuellen Stand nicht kennst. Bestätige Werkzeug-Aktionen mit höchstens einem kurzen Satz — oder nur „OK.", wenn nichts zu sagen ist.',
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

export interface Strang {
  id: string
  name: string
  steps: string[]
  stepIndex: number
  done: boolean
  timerEndsAt: number | null
  timerInstruction: string | null
}

export interface CookState {
  strangs: Strang[]
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

const STORAGE_KEY = 'murks:state:v2'

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
    focusedStrangId: null,
    zutatenOpen: false,
  },
  agent: {
    messages: [],
    busy: false,
  },
}

function load(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaults
    const data = JSON.parse(raw)
    const loadedConfig = data.config ?? {}
    const agents: AgentProfile[] = Array.isArray(data.agents) ? data.agents : []
    let defaultAgentId: string | null = data.defaultAgentId ?? null
    if (!agents.some((a) => a.id === defaultAgentId)) {
      defaultAgentId = agents[0]?.id ?? null
    }
    return {
      config: { displayName: loadedConfig.displayName ?? '' },
      setupDone: data.setupDone === true,
      stt: {
        mode: data.stt?.mode === 'server' || data.stt?.mode === 'webspeech' ? data.stt.mode : 'wasm',
        endpoint: data.stt?.endpoint ?? '',
        key: data.stt?.key ?? '',
        model:
          data.stt?.model === 'tiny' || data.stt?.model === 'small' ? data.stt.model : 'base',
      },
      tts: {
        mode: data.tts?.mode === 'server' || data.tts?.mode === 'webspeech' ? data.tts.mode : 'wasm',
        endpoint: data.tts?.endpoint ?? '',
        key: data.tts?.key ?? '',
        voice: data.tts?.voice ?? '',
      },
      agents,
      defaultAgentId,
      cook: {
        strangs: Array.isArray(data.cook?.strangs) ? data.cook.strangs : [],
        focusedStrangId: data.cook?.focusedStrangId ?? null,
        zutatenOpen: data.cook?.zutatenOpen === true,
      },
      agent: {
        messages: Array.isArray(data.agent?.messages) ? data.agent.messages : [],
        busy: false,
      },
    }
  } catch {
    return defaults
  }
}

export const [state, setState] = createStore<AppState>(load())

createEffect(() => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
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
  const expired = state.cook.strangs.filter(
    (s) => s.timerEndsAt !== null && s.timerEndsAt <= now,
  )
  for (const s of expired) {
    setState('cook', 'strangs', (str) =>
      str.map((x) => (x.id === s.id ? { ...x, timerEndsAt: null } : x)),
    )
    showToast(`⏰ Timer abgelaufen: ${s.name}${s.timerInstruction ? ` — ${s.timerInstruction}` : ''}`)
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
