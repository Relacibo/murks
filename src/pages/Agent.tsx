import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor, type Setter } from 'solid-js'
import type { MicVAD } from '@ricky0123/vad-web'
import { state, sendMessage, clearMessages } from '../state/store'
import { transcribeAudio, createWebSpeechRecognition, isSttModelCached } from '../lib/stt'
import { createVoice } from '../lib/voice'
import { speak, stopSpeaking } from '../lib/tts'
import { showToast } from '../lib/toast'

interface AgentProps {
  configOpen: Accessor<boolean>
  setConfigOpen: Setter<boolean>
}

export function Agent(props: AgentProps) {
  const [input, setInput] = createSignal('')
  const [listening, setListening] = createSignal(false)
  const [speaking, setSpeaking] = createSignal(false)
  const [transcribing, setTranscribing] = createSignal(false)
  const [sttReady, setSttReady] = createSignal(false)

  const agent = createMemo(() => state.agents.find((a) => a.id === state.defaultAgentId))
  const ready = createMemo(() => Boolean(agent()?.endpoint && agent()?.model))

  let vad: MicVAD | null = null
  let recognition: ReturnType<typeof createWebSpeechRecognition> = null
  let feedRef: HTMLDivElement | undefined
  let lastSpoken: { text: string } | undefined = state.agent.messages[state.agent.messages.length - 1]
  let sttCheckToken = 0

  createEffect(() => {
    const mode = state.stt.mode
    state.stt.model
    props.configOpen()
    const token = ++sttCheckToken
    void (async () => {
      let ready = true
      if (mode === 'server') ready = Boolean(state.stt.endpoint)
      else if (mode === 'wasm') ready = await isSttModelCached()
      if (token === sttCheckToken) setSttReady(ready)
    })()
  })

  createEffect(() => {
    state.agent.messages.length
    queueMicrotask(() => {
      if (feedRef) feedRef.scrollTop = feedRef.scrollHeight
    })
  })

  createEffect(() => {
    const messages = state.agent.messages
    const last = messages[messages.length - 1]
    if (last && last.role === 'agent' && !last.silent && last !== lastSpoken) {
      lastSpoken = last
      speak(last.text)
    }
  })

  onCleanup(() => {
    recognition?.stop()
    vad?.destroy()
    stopSpeaking()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  function onVisibilityChange() {
    if (document.hidden) {
      stopVoice()
      stopSpeaking()
    }
  }
  document.addEventListener('visibilitychange', onVisibilityChange)

  function pushError(message: string) {
    showToast(`STT: ${message}`)
  }

  function finishUtterance(text: string) {
    if (!text) return
    if (ready()) sendMessage(text)
    else setInput(text)
  }

  function toggleMic() {
    if (listening()) {
      stopVoice()
      return
    }
    startVoice()
  }

  async function startVoice() {
    if (state.stt.mode === 'webspeech') {
      recognition = createWebSpeechRecognition(
        (transcript, isFinal) => {
          if (isFinal) finishUtterance(transcript)
        },
        pushError,
        () => {
          recognition = null
          setListening(false)
        },
      )
      if (recognition) {
        recognition.start()
        setListening(true)
      }
      return
    }

    if (!vad) {
      try {
        vad = await createVoice({
          onSpeechStart: () => {
            stopSpeaking()
            setSpeaking(true)
          },
          onMisfire: () => setSpeaking(false),
          onSpeechEnd: async (audio) => {
            setSpeaking(false)
            setTranscribing(true)
            try {
              const text = await transcribeAudio(audio)
              finishUtterance(text)
            } catch (e) {
              pushError(e instanceof Error ? e.message : String(e))
            } finally {
              setTranscribing(false)
              if (listening()) await vad?.start()
            }
          },
          onError: pushError,
        })
      } catch (e) {
        pushError(e instanceof Error ? e.message : String(e))
        return
      }
    }
    try {
      await vad.start()
      setListening(true)
    } catch (e) {
      pushError(e instanceof Error ? e.message : String(e))
    }
  }

  async function stopVoice() {
    setListening(false)
    setSpeaking(false)
    recognition?.stop()
    recognition = null
    await vad?.pause()
  }

  let touchStartY = 0
  function onTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY
  }
  function onTouchEnd(e: TouchEvent) {
    if (e.changedTouches[0].clientY - touchStartY < -80) props.setConfigOpen(true)
  }

  function submit(e: Event) {
    e.preventDefault()
    const text = input().trim()
    if (!text) return
    stopSpeaking()
    sendMessage(text)
    setInput('')
  }

  function sttHint() {
    if (state.stt.mode === 'server') return 'Kein STT-Endpoint konfiguriert'
    if (state.stt.mode === 'wasm') return 'STT-Modell nicht geladen'
    return null
  }

  function micTitle() {
    if (transcribing()) return 'Transkribiere …'
    if (speaking()) return 'Sprache erkannt'
    if (listening()) return 'Höre zu — tippen zum Stoppen'
    const hint = sttHint()
    if (hint) return `${hint} — in der Konfiguration`
    return `Hören starten (${state.stt.mode === 'wasm' ? 'lokal' : state.stt.mode})`
  }

  return (
    <div class="flex justify-center min-h-screen bg-zinc-950">
    <div
      class="relative flex h-screen w-full max-w-3xl flex-col px-4 pb-4"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {/* Mobile header: agent name + clear button, with absolute ⚙ button */}
      <div class="flex items-center justify-between pt-3 pr-14 md:hidden">
        <span class="text-sm text-zinc-400">{agent()?.name || '—'}</span>
        <button
          class="text-xs text-zinc-400 hover:text-zinc-100 hover:underline transition-colors"
          onClick={clearMessages}
        >
          Verlauf löschen
        </button>
      </div>

      <button
        class="absolute top-3 right-3 z-10 rounded-full border border-zinc-600 w-11 h-11 flex items-center justify-center text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 hover:bg-zinc-600 transition-colors md:hidden"
        onClick={() => props.setConfigOpen(true)}
        title="Konfiguration"
      >
        ⚙
      </button>

      {/* Desktop header: full row with agent name, clear button, ⚙ button */}
      <div class="hidden md:flex items-center gap-4 pt-3 border-b border-zinc-600 pb-3">
        <span class="text-sm text-zinc-400">{agent()?.name || '—'}</span>
        <div class="flex-1" />
        <button
          class="text-xs text-zinc-400 hover:text-zinc-100 hover:underline transition-colors"
          onClick={clearMessages}
        >
          Verlauf löschen
        </button>
        <button
          class="rounded-full border border-zinc-600 w-11 h-11 flex items-center justify-center text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 hover:bg-zinc-600 transition-colors"
          onClick={() => props.setConfigOpen(true)}
          title="Konfiguration"
        >
          ⚙
        </button>
      </div>

      <div ref={feedRef} class="flex-1 space-y-3 overflow-y-auto py-4">
        <Show when={!ready()}>
          <p class="rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-400">
            Kein Agent konfiguriert. Über <b>⚙</b> oben rechts einen Agenten mit Endpoint und
            Modell anlegen.
          </p>
        </Show>
        <Show when={state.agent.messages.length === 0 && ready()}>
          <p class="text-sm text-zinc-500">Noch keine Nachrichten.</p>
        </Show>
        <Show when={transcribing()}>
          <p class="text-sm text-zinc-500 animate-pulse">Transkribiere …</p>
        </Show>
        <For each={state.agent.messages}>
          {(m) => (
            <div
              class={`max-w-[85%] whitespace-pre-wrap rounded-lg p-3 text-sm ${
                m.role === 'user'
                  ? 'ml-auto bg-zinc-700 text-zinc-100'
                  : 'border border-zinc-600 bg-zinc-700 text-zinc-100'
              }`}
            >
              {m.text}
            </div>
          )}
        </For>
      </div>

      <form onSubmit={submit} class="flex items-center gap-2 border-t border-zinc-600 pt-3">
        <button
          type="button"
          onClick={toggleMic}
          disabled={state.agent.busy || (!sttReady() && !listening())}
          title={micTitle()}
          class={`h-11 w-11 shrink-0 rounded-full border text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            speaking()
              ? 'border-red-500 bg-red-500/20 text-red-400 animate-pulse ring-2 ring-red-500/40'
              : listening()
                ? 'border-zinc-300 text-zinc-100 bg-zinc-600'
                : 'border-zinc-600 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 hover:bg-zinc-600 active:scale-95'
          }`}
        >
          {transcribing() ? '…' : listening() ? '■' : '🎤'}
        </button>
        <input
          class="flex-1 bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-500 w-full"
          placeholder="Nachricht an den Agenten …"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
        />
        <button
          type="submit"
          disabled={state.agent.busy || !ready()}
          class="h-11 flex items-center rounded-lg bg-zinc-100 px-4 text-sm font-medium text-zinc-900 transition-colors disabled:opacity-40 enabled:hover:bg-zinc-300 enabled:active:scale-95"
        >
          Senden
        </button>
      </form>
    </div>
    </div>
  )
}
