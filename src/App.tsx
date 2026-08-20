import { createSignal, createMemo, createEffect, onMount, createContext, useContext, Show } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'
import { Router, Route, useSearchParams } from '@solidjs/router'
import { AgentModal } from './pages/Agent'
import { ConfigModal } from './pages/Config'
import { CookMock } from './pages/CookMock'
import { Cook } from './pages/Cook'
import { Setup } from './pages/Setup'
import { Toasts } from './components/Toasts'
import { IngredientsModal } from './components/IngredientsModal'
import { createAgentVoice } from './lib/agentVoice'
import { state, stateReady, cookEngine } from './state/store'
import { CookContext } from './lib/cookEngine'

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

type ModalName = 'chat' | 'ingredients'

/** Hauptscreen = Cook. Chat und Ingredients sind immer nur Modals — ihr Zustand steht in der URL (?modal=chat,ingredients). */
function CookingRoute() {
  const ctx = useConfig()
  const [params, setParams] = useSearchParams<{ modal?: string }>()
  // Eine gemeinsame Voice-Instanz für Koch-Screen (Overlay) + Chat-Modal
  const voice = createAgentVoice({ configOpen: ctx.configOpen })

  const modals = () =>
    (typeof params.modal === 'string' ? params.modal.split(',').filter(Boolean) : []) as ModalName[]

  const setModal = (m: ModalName, open: boolean) => {
    const cur = new Set(modals())
    if (open) cur.add(m)
    else cur.delete(m)
    const val = [...cur].join(',')
    setParams(val ? { modal: val } : { modal: undefined })
  }

  // KI öffnet/schließt Modals (open_chat / open_ingredients …) → URL spiegeln
  createEffect(() => {
    const r = cookEngine.modalRequest
    if (r) setModal(r.modal, r.open)
  })

  // Ohne Flows direkt den Chat öffnen (da entstehen die ersten Flows)
  onMount(() => {
    if (state.cook.flows.length === 0 && !modals().includes('chat')) setModal('chat', true)
  })

  return (
    <>
      <Cook voice={voice} onOpenIngredients={() => setModal('ingredients', true)} />
      <IngredientsModal
        open={modals().includes('ingredients')}
        onClose={() => setModal('ingredients', false)}
      />
      <AgentModal
        open={modals().includes('chat')}
        onClose={() => setModal('chat', false)}
        voice={voice}
        configOpen={ctx.configOpen}
        setConfigOpen={ctx.setConfigOpen}
      />
    </>
  )
}

export default function App() {
  const [configOpen, setConfigOpen] = createSignal(false)
  const isMock = window.location.pathname.endsWith('/mock')
  const initialValid = hasValidAgent()

  const showSetup = createMemo(() => !isMock && !state.setupDone && !initialValid)

  onMount(() => {
    createEffect(() => {
      if (!stateReady()) return
      if (!isMock && !hasValidAgent() && state.setupDone) setConfigOpen(true)
    })
  })

  const dismissible = createMemo(() => hasValidAgent())

  return (
    <ConfigContext.Provider value={{ configOpen, setConfigOpen }}>
      <div class="min-h-screen bg-zinc-950 text-zinc-100">
        <Show
          when={stateReady()}
          fallback={
            <div class="min-h-screen flex items-center justify-center">
              <span class="text-sm font-bold tracking-widest uppercase text-zinc-300">MURKS</span>
            </div>
          }
        >
          <Show when={!showSetup()} fallback={<Setup />}>
            <CookContext.Provider value={cookEngine}>
              <Router base={base}>
                <Route path="/mock" component={CookMock} />
                <Route path="*" component={CookingRoute} />
              </Router>
            </CookContext.Provider>
          </Show>
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
