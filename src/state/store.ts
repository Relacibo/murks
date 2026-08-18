import { createEffect } from 'solid-js'
import { createStore } from 'solid-js/store'

export interface AgentProfile {
  id: string
  name: string
  endpoint: string
  model: string
  key: string
}

const DEFAULT_SYSTEM_PROMPT = [
  'Du bist MURKS, eine minimalistische Rezept- und Küchensoftware.',
  'Du hilfst beim Kochen: Gerichte planen, Schritte koordinieren, Timer setzen, parallele Kochstränge im Blick behalten.',
  'Ton: trocken, direkt, präzise. Keine Höflichkeitsfloskeln, keine Emojis, kein Smalltalk.',
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

export interface AgentMessage {
  role: 'user' | 'agent'
  text: string
}

export interface AppState {
  config: Config
  stt: SttConfig
  agents: AgentProfile[]
  defaultAgentId: string | null
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
  stt: {
    mode: 'wasm',
    endpoint: '',
    key: '',
    model: 'base',
  },
  agents: [],
  defaultAgentId: null,
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
      stt: {
        mode: data.stt?.mode === 'server' || data.stt?.mode === 'webspeech' ? data.stt.mode : 'wasm',
        endpoint: data.stt?.endpoint ?? '',
        key: data.stt?.key ?? '',
        model:
          data.stt?.model === 'tiny' || data.stt?.model === 'small' ? data.stt.model : 'base',
      },
      agents,
      defaultAgentId,
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

export function setStt(patch: Partial<SttConfig>) {
  setState('stt', patch)
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

export function pushAgentMessage(role: AgentMessage['role'], text: string) {
  setState('agent', 'messages', (m) => [...m, msg(role, text)])
}

function msg(role: AgentMessage['role'], text: string): AgentMessage {
  return { role, text }
}

export async function sendMessage(text: string) {
  const agent = defaultAgent()
  if (!agent || !agent.endpoint || !agent.model || state.agent.busy) return
  setState('agent', 'messages', (m) => [...m, msg('user', text)])
  setState('agent', 'busy', true)
  try {
    const chatMessages = [
      { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
      ...state.agent.messages.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        content: m.text,
      })),
    ]
    const res = await fetch(`${agent.endpoint.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(agent.key ? { Authorization: `Bearer ${agent.key}` } : {}),
      },
      body: JSON.stringify({
        model: agent.model,
        stream: false,
        messages: chatMessages,
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
    const content =
      (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]?.message?.content ??
      '(leere Antwort)'
    setState('agent', 'messages', (m) => [...m, msg('agent', content)])
  } catch (e) {
    setState('agent', 'messages', (m) => [
      ...m,
      msg('agent', `Fehler: ${e instanceof Error ? e.message : String(e)}`),
    ])
  } finally {
    setState('agent', 'busy', false)
  }
}
