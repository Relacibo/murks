import { createSignal, createMemo, onMount, createContext, useContext, Show } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'
import { Router, Route } from '@solidjs/router'
import { Agent } from './pages/Agent'
import { ConfigModal } from './pages/Config'
import { CookMock } from './pages/CookMock'
import { Setup } from './pages/Setup'
import { Toasts } from './components/Toasts'
import { state } from './state/store'

const base =
  import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/+$/, '')

function hasValidAgent() {
  const agent = state.agents.find((a) => a.id === state.defaultAgentId)
  return Boolean(agent?.endpoint && agent?.model)
}

interface ConfigCtx {
  configOpen: Accessor<boolean>
  setConfigOpen: Setter<boolean>
}

export const ConfigContext = createContext<ConfigCtx>({
  configOpen: () => false,
  setConfigOpen: () => {},
})

export function useConfig() {
  return useContext(ConfigContext)
}

function AgentPage() {
  const ctx = useConfig()
  return <Agent configOpen={ctx.configOpen} setConfigOpen={ctx.setConfigOpen} />
}

export default function App() {
  const [configOpen, setConfigOpen] = createSignal(false)
  const isMock = window.location.pathname.endsWith('/mock')
  const initialValid = hasValidAgent()

  const showSetup = createMemo(() => !isMock && !state.setupDone && !initialValid)

  onMount(() => {
    if (!isMock && !hasValidAgent() && state.setupDone) setConfigOpen(true)
  })

  const dismissible = createMemo(() => hasValidAgent())

  return (
    <ConfigContext.Provider value={{ configOpen, setConfigOpen }}>
      <div class="min-h-screen bg-zinc-950 text-zinc-100">
        <Show when={!showSetup()} fallback={<Setup />}>
          <Router base={base}>
            <Route path="/mock" component={CookMock} />
            <Route path="*" component={AgentPage} />
          </Router>
        </Show>
        <ConfigModal
          open={configOpen()}
          onClose={() => {
            if (dismissible()) setConfigOpen(false)
          }}
          dismissible={dismissible()}
        />
        <Toasts />
      </div>
    </ConfigContext.Provider>
  )
}
