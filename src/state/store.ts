import { createEffect } from 'solid-js'
import { createStore } from 'solid-js/store'

export interface AgentProfile {
  id: string
  name: string
  endpoint: string
  model: string
  key: string
}

export interface Config {
  displayName: string
}

export interface AgentMessage {
  role: 'user' | 'agent'
  text: string
}

export interface AppState {
  config: Config
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
    return {
      config: { displayName: loadedConfig.displayName ?? '' },
      agents: Array.isArray(data.agents) ? data.agents : [],
      defaultAgentId: data.defaultAgentId ?? null,
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

export function defaultAgent(): AgentProfile | undefined {
  return state.agents.find((a) => a.id === state.defaultAgentId)
}

export function addAgent(): string {
  const id = crypto.randomUUID()
  setState('agents', (a) => [...a, { id, name: '', endpoint: '', model: '', key: '' }])
  setState('defaultAgentId', id)
  return id
}

export function updateAgent(id: string, patch: Partial<AgentProfile>) {
  setState('agents', (a) => a.map((x) => (x.id === id ? { ...x, ...patch } : x)))
}

export function removeAgent(id: string) {
  setState('agents', (a) => a.filter((x) => x.id !== id))
  if (state.defaultAgentId === id) setState('defaultAgentId', null)
}

export function setDefaultAgent(id: string | null) {
  setState('defaultAgentId', id)
}

export function clearMessages() {
  setState('agent', 'messages', [])
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
    const res = await fetch(`${agent.endpoint.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(agent.key ? { Authorization: `Bearer ${agent.key}` } : {}),
      },
      body: JSON.stringify({
        model: agent.model,
        stream: false,
        messages: state.agent.messages.map((m) => ({
          role: m.role === 'agent' ? 'assistant' : 'user',
          content: m.text,
        })),
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
