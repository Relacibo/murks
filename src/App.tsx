import { createSignal, createMemo, createEffect, createContext, useContext, untrack, Show } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'
import { Router, Route, useSearchParams } from '@solidjs/router'
import { CookMock } from './pages/CookMock'
import { Cook } from './pages/Cook'
import { Setup } from './pages/Setup'
import { Toasts } from './components/Toasts'
import { createAgentVoice } from './lib/agentVoice'
import { registerWebMCPTools } from './lib/webmcp'
import { state, stateReady, cookEngine, sendMessage, clearMessages, hasValidAgent } from './state/store'
import { CookContext } from './lib/cookEngine'

const base =
  import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/+$/, '')

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

type ModalName = 'chat' | 'ingredients' | 'config'

/** Hauptscreen = Cook. Chat, Ingredients und Konfiguration sind immer nur Modals — ihr Zustand steht in der URL (?modal=chat,ingredients). */
function CookingRoute() {
  const [params, setParams] = useSearchParams<{
    modal?: string
    overview?: string
    prompt?: string
    reset?: string
  }>()

  const modals = () =>
    (typeof params.modal === 'string' ? params.modal.split(',').filter(Boolean) : []) as ModalName[]

  const overviewHidden = () => params.overview === 'hidden'
  const toggleOverview = () =>
    setParams({ overview: overviewHidden() ? undefined : 'hidden' })

  const setModal = (m: ModalName, open: boolean) => {
    const cur = new Set(modals())
    if (open) cur.add(m)
    else cur.delete(m)
    const val = [...cur].join(',')
    setParams(val ? { modal: val } : { modal: undefined })
  }

  // Konfiguration ist auch nur ein URL-Modal — über den Context zugänglich
  const configOpen = () => modals().includes('config')
  const setConfigOpen: Setter<boolean> = (v) =>
    setModal('config', typeof v === 'function' ? v(configOpen()) : v)

  // Eine gemeinsame Voice-Instanz für Koch-Screen (Composer-Bar) + Chat-Modal
  const voice = createAgentVoice({ configOpen })

  // KI öffnet/schließt Modals (open_chat / open_ingredients …) → URL spiegeln.
  // untrack: setModal liest params.modal — ohne untrack würde der Effekt auf
  // JEDE URL-Änderung reagieren und den letzten offenen ModalRequest erneut
  // anwenden (Modal öffnet sich nach dem Schließen sofort wieder).
  createEffect(() => {
    const r = cookEngine.modalRequest
    if (r) untrack(() => setModal(r.modal, r.open))
  })

  // Deeplink: ?prompt=… startet eine Anfrage an den Agenten (z.B. Link aus
  // einem Gemini-Chat: „…/murks/?prompt=Nutzer will Pfannkuchen machen").
  // ?reset=1 verwirft zuvor alle Flows + Chat-Verlauf (frische Session).
  let promptConsumed: string | null = null
  createEffect(() => {
    const p = typeof params.prompt === 'string' ? params.prompt.trim() : ''
    if (!p || p === promptConsumed) return
    if (!stateReady() || !state.setupDone) return
    promptConsumed = p
    setParams({ prompt: undefined, reset: undefined })
    if (params.reset === '1') {
      cookEngine.executeTool('start_new_recipe', {}, { silent: true })
      clearMessages()
    }
    if (!hasValidAgent()) return
    setModal('chat', true)
    void sendMessage(p)
  })

  // Kein gültiger Agent → Konfiguration aufpoppen
  createEffect(() => {
    if (!stateReady()) return
    if (!hasValidAgent() && state.setupDone && !modals().includes('config')) setModal('config', true)
  })

  return (
    <ConfigContext.Provider value={{ configOpen, setConfigOpen }}>
      <Cook
        voice={voice}
        onOpenIngredients={() =>
          setModal('ingredients', !modals().includes('ingredients'))
        }
        onOpenChat={() => setModal('chat', !modals().includes('chat'))}
        ingredientsOpen={modals().includes('ingredients')}
        onCloseIngredients={() => setModal('ingredients', false)}
        chatOpen={modals().includes('chat')}
        onCloseChat={() => setModal('chat', false)}
        overviewOpen={!overviewHidden()}
        onToggleOverview={toggleOverview}
      />
    </ConfigContext.Provider>
  )
}

export default function App() {
  const isMock = window.location.pathname.endsWith('/mock')
  const initialValid = hasValidAgent()

  const showSetup = createMemo(() => !isMock && !state.setupDone && !initialValid)

  // WebMCP: Cook-Tools für Browser-Agenten registrieren (einmal pro Dokument).
  // Externer Modus — der Agent redet selbst mit dem Nutzer, kein Config-Zwang nötig.
  let webmcpRegistered = false
  createEffect(() => {
    if (!stateReady() || webmcpRegistered) return
    webmcpRegistered = true
    void registerWebMCPTools()
  })

  return (
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
      <Toasts />
    </div>
  )
}
