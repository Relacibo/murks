import { createSignal, createMemo, onMount } from 'solid-js'
import { Router, Route } from '@solidjs/router'
import { Agent } from './pages/Agent'
import { ConfigModal } from './pages/Config'
import { CookMock } from './pages/CookMock'
import { state } from './state/store'

const base =
  import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/+$/, '')

function hasValidAgent() {
  const agent = state.agents.find((a) => a.id === state.defaultAgentId)
  return Boolean(agent?.endpoint && agent?.model)
}

export default function App() {
  const [configOpen, setConfigOpen] = createSignal(false)

  onMount(() => {
    const isMock = window.location.pathname.endsWith('/mock')
    if (!hasValidAgent() && !isMock) setConfigOpen(true)
  })

  const dismissible = createMemo(() => hasValidAgent())

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100">
      <Router base={base}>
        <Route path="/mock" component={CookMock} />
        <Route
          path="*"
          component={() => (
            <Agent configOpen={configOpen} setConfigOpen={setConfigOpen} />
          )}
        />
      </Router>
      <ConfigModal
        open={configOpen()}
        onClose={() => {
          if (dismissible()) setConfigOpen(false)
        }}
        dismissible={dismissible()}
      />
    </div>
  )
}
