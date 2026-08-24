import { createSignal, createMemo, createEffect, createContext, useContext, untrack, Show } from 'solid-js'
import type { Accessor, Setter } from 'solid-js'
import { Router, Route, useSearchParams } from '@solidjs/router'
import { CookMock } from './pages/CookMock'
import { Cook } from './pages/Cook'
import { Setup } from './pages/Setup'
import { Toasts } from './components/Toasts'
import { createAgentVoice } from './lib/agentVoice'
import { registerWebMCPTools } from './lib/webmcp'
import { setTtsExternalMode } from './lib/tts'
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

/** Hauptscreen = Cook. Chat, Ingredients und Konfiguration sind immer nur Modals — ihr Zustand steht in der URL (?modal=…). Genau eins ist offen: Öffnen schließt die anderen. */
function CookingRoute() {
  const [params, setParams] = useSearchParams<{
    modal?: string
    overview?: string
    prompt?: string
    reset?: string
    webmcp?: string
  }>()

  // Genau ein Modal: ?modal= enthält exakt einen bekannten Namen.
  const modals = () => {
    const v = params.modal
    return v === 'chat' || v === 'ingredients' || v === 'config' ? [v] : []
  }

  const overviewHidden = () => params.overview === 'hidden'
  const toggleOverview = () =>
    setParams({ overview: overviewHidden() ? undefined : 'hidden' })

  const setModal = (m: ModalName, open: boolean) => {
    if (open) {
      setParams({ modal: m })
      return
    }
    if (modals().includes(m)) setParams({ modal: undefined })
  }

  // Konfiguration ist auch nur ein URL-Modal — über den Context zugänglich
  const configOpen = () => modals().includes('config')
  const setConfigOpen: Setter<boolean> = (v) =>
    setModal('config', typeof v === 'function' ? v(configOpen()) : v)

  /* ── Externer Modus (WebMCP): Browser-Agent steuert die App ──────────
     Source of Truth = URL-Param ?webmcp=1 (überlebt Reload, teilbar).
     Einweg-Automatik: ruft ein externer Agent ein Tool auf, wird der
     Param gesetzt — zurück nur durch Entfernen des Params aus der URL. */
  const webmcpMode = () => params.webmcp === '1'
  const setWebmcpMode = (v: boolean) => {
    if (v === webmcpMode()) return
    // Einschalten schließt offene Modals — im externen Modus gibt es keine
    setParams(v ? { webmcp: '1', modal: undefined } : { webmcp: undefined })
  }

  // Setup nur nötig, wenn kein Agent konfiguriert ist UND der interne Modus
  // läuft — im externen Modus redet der Browser-Agent selbst mit dem Nutzer.
  const showSetup = createMemo(
    () => !state.setupDone && !hasValidAgent() && !webmcpMode(),
  )

  // WebMCP-Tools registrieren (einmal pro Dokument)
  let webmcpRegistered = false
  createEffect(() => {
    if (!stateReady() || webmcpRegistered) return
    webmcpRegistered = true
    void registerWebMCPTools({
      onExternalUse: () => {
        if (!webmcpMode()) untrack(() => setWebmcpMode(true))
      },
    })
  })

  // Internes TTS im externen Modus komplett aus (der externe Agent spricht)
  createEffect(() => setTtsExternalMode(webmcpMode()))

  // Eine gemeinsame Voice-Instanz für Koch-Screen (Composer-Bar) + Chat-Modal
  const voice = createAgentVoice({ configOpen })

  // KI öffnet/schließt Modals (open_chat / open_ingredients …) → URL spiegeln.
  // untrack: setModal liest params.modal — ohne untrack würde der Effekt auf
  // JEDE URL-Änderung reagieren und den letzten offenen ModalRequest erneut
  // anwenden (Modal öffnet sich nach dem Schließen sofort wieder).
  createEffect(() => {
    const r = cookEngine.modalRequest
    if (!r) return
    untrack(() => {
      // Chat gibt es im externen Modus nicht — ignorieren
      if (r.modal === 'chat' && webmcpMode()) return
      setModal(r.modal, r.open)
    })
  })

  // Deeplink: ?prompt=… startet eine Anfrage an den Agenten (z.B. Link aus
  // einem Gemini-Chat: „…/murks/?prompt=Nutzer will Pfannkuchen machen").
  // ?reset=1 verwirft zuvor alle Flows + Chat-Verlauf (frische Session).
  // Im externen Modus ignoriert — dort treibt der externe Agent den Dialog.
  let promptConsumed: string | null = null
  createEffect(() => {
    const p = typeof params.prompt === 'string' ? params.prompt.trim() : ''
    if (!p || p === promptConsumed) return
    if (!stateReady() || !state.setupDone || webmcpMode()) return
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

  return (
    <Show
      when={!showSetup()}
      fallback={<Setup />}
    >
      <ConfigContext.Provider value={{ configOpen, setConfigOpen }}>
        <Cook
          voice={voice}
          onOpenIngredients={() =>
            setModal('ingredients', !modals().includes('ingredients'))
          }
          onOpenChat={() => setModal('chat', !modals().includes('chat'))}
          ingredientsOpen={modals().includes('ingredients')}
          onCloseIngredients={() => setModal('ingredients', false)}
          chatOpen={!webmcpMode() && modals().includes('chat')}
          onCloseChat={() => setModal('chat', false)}
          overviewOpen={!overviewHidden()}
          onToggleOverview={toggleOverview}
          webmcpMode={webmcpMode()}
          onToggleWebmcp={() => setWebmcpMode(!webmcpMode())}
        />
      </ConfigContext.Provider>
    </Show>
  )
}

export default function App() {
  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100">
      <Show
        when={stateReady()}
        fallback={
          <div class="min-h-screen flex items-center justify-center">
            <span class="text-sm font-bold tracking-widest text-zinc-300">murks</span>
          </div>
        }
      >
        <CookContext.Provider value={cookEngine}>
          <Router base={base}>
            <Route path="/mock" component={CookMock} />
            <Route path="*" component={CookingRoute} />
          </Router>
        </CookContext.Provider>
      </Show>
      <Toasts />
    </div>
  )
}
