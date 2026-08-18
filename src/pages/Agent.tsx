import { For, Show, createMemo, createSignal, onCleanup, type Accessor, type Setter } from 'solid-js'
import { state, sendMessage, clearMessages, pushAgentMessage } from '../state/store'
import { transcribeAudio, createWebSpeechRecognition } from '../lib/stt'

interface AgentProps {
  configOpen: Accessor<boolean>
  setConfigOpen: Setter<boolean>
}

export function Agent(props: AgentProps) {
  const [input, setInput] = createSignal('')
  const [listening, setListening] = createSignal(false)

  const agent = createMemo(() => state.agents.find((a) => a.id === state.defaultAgentId))
  const ready = createMemo(() => Boolean(agent()?.endpoint && agent()?.model))

  let recorder: MediaRecorder | null = null
  let chunks: Blob[] = []
  let stream: MediaStream | null = null
  let recognition: ReturnType<typeof createWebSpeechRecognition> = null

  onCleanup(() => {
    recorder?.stop()
    stream?.getTracks().forEach((t) => t.stop())
    recognition?.stop()
  })

  function pushError(message: string) {
    pushAgentMessage('agent', `STT-Fehler: ${message}`)
  }

  function toggleMic() {
    if (listening()) {
      stopListening()
      return
    }
    startListening()
  }

  async function startListening() {
    if (state.stt.mode === 'webspeech') {
      recognition = createWebSpeechRecognition(
        (transcript) => setInput(transcript),
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

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recorder = new MediaRecorder(stream)
      chunks = []
      recorder.ondataavailable = (e) => chunks.push(e.data)
      recorder.onstop = async () => {
        const blob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' })
        try {
          const text = await transcribeAudio(blob)
          setInput(text)
        } catch (e) {
          pushError(e instanceof Error ? e.message : String(e))
        } finally {
          setListening(false)
        }
      }
      recorder.start()
      setListening(true)
    } catch (e) {
      pushError(e instanceof Error ? e.message : String(e))
    }
  }

  function stopListening() {
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    stream?.getTracks().forEach((t) => t.stop())
    stream = null
    recognition?.stop()
    recognition = null
    setListening(false)
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
    sendMessage(text)
    setInput('')
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
          class="text-xs text-zinc-500 hover:text-zinc-100 hover:underline transition-colors"
          onClick={clearMessages}
        >
          Verlauf löschen
        </button>
      </div>

      <button
        class="absolute top-3 right-3 z-10 rounded-full border border-zinc-700 w-11 h-11 flex items-center justify-center text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors md:hidden"
        onClick={() => props.setConfigOpen(true)}
        title="Konfiguration"
      >
        ⚙
      </button>

      {/* Desktop header: full row with agent name, clear button, ⚙ button */}
      <div class="hidden md:flex items-center gap-4 pt-3 border-b border-zinc-800 pb-3">
        <span class="text-sm text-zinc-400">{agent()?.name || '—'}</span>
        <div class="flex-1" />
        <button
          class="text-xs text-zinc-500 hover:text-zinc-100 hover:underline transition-colors"
          onClick={clearMessages}
        >
          Verlauf löschen
        </button>
        <button
          class="rounded-full border border-zinc-700 w-11 h-11 flex items-center justify-center text-zinc-400 hover:border-zinc-500 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          onClick={() => props.setConfigOpen(true)}
          title="Konfiguration"
        >
          ⚙
        </button>
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto py-4">
        <Show when={!ready()}>
          <p class="rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-400">
            Kein Agent konfiguriert. Über <b>⚙</b> oben rechts einen Agenten mit Endpoint und
            Modell anlegen.
          </p>
        </Show>
        <Show when={state.agent.messages.length === 0 && ready()}>
          <p class="text-sm text-zinc-600">Noch keine Nachrichten.</p>
        </Show>
        <For each={state.agent.messages}>
          {(m) => (
            <div
              class={`max-w-[85%] whitespace-pre-wrap rounded-lg p-3 text-sm ${
                m.role === 'user'
                  ? 'ml-auto bg-zinc-800 text-zinc-100'
                  : 'border border-zinc-700 bg-zinc-900 text-zinc-100'
              }`}
            >
              {m.text}
            </div>
          )}
        </For>
      </div>

      <form onSubmit={submit} class="flex items-center gap-2 border-t border-zinc-800 pt-3">
        <button
          type="button"
          onClick={toggleMic}
          disabled={state.agent.busy}
          title={
            listening()
              ? 'Aufnahme stoppen'
              : `Aufnahme starten (${state.stt.mode === 'wasm' ? 'lokal' : state.stt.mode})`
          }
          class={`h-11 w-11 shrink-0 rounded-full border text-base transition-colors ${
            listening()
              ? 'border-red-500 bg-red-500/20 text-red-400 animate-pulse ring-2 ring-red-500/40'
              : 'border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 active:scale-95'
          }`}
        >
          {listening() ? '■' : '🎤'}
        </button>
        <input
          class="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600 w-full"
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
