import { createEffect } from 'solid-js'
import { createStore } from 'solid-js/store'

export interface Config {
  displayName: string
  defaultServings: number
  units: 'metric' | 'imperial'
  agentUrl: string
  agentKey: string
}

export interface AgentMessage {
  role: 'user' | 'agent'
  text: string
}

export interface AppState {
  config: Config
  agent: {
    messages: AgentMessage[]
    busy: boolean
  }
}

const STORAGE_KEY = 'murks:state:v1'

const defaults: AppState = {
  config: {
    displayName: '',
    defaultServings: 2,
    units: 'metric',
    agentUrl: '',
    agentKey: '',
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
    return { ...defaults, ...JSON.parse(raw) }
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

export function clearMessages() {
  setState('agent', 'messages', [])
}

function msg(role: AgentMessage['role'], text: string): AgentMessage {
  return { role, text }
}

export async function sendMessage(text: string) {
  const { agentUrl } = state.config
  if (!agentUrl || state.agent.busy) return
  setState('agent', 'messages', (m) => [...m, msg('user', text)])
  setState('agent', 'busy', true)
  try {
    const res = await fetch(agentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.text()) || '(leere Antwort)'
    setState('agent', 'messages', (m) => [...m, msg('agent', body)])
  } catch (e) {
    setState('agent', 'messages', (m) => [
      ...m,
      msg('agent', `Fehler: ${e instanceof Error ? e.message : String(e)}`),
    ])
  } finally {
    setState('agent', 'busy', false)
  }
}
