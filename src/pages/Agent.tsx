import { For, Show, createEffect, createMemo, createSignal, onCleanup, type Accessor, type Setter } from 'solid-js'
import { FiX } from 'solid-icons/fi'
import { state, sendMessage, clearMessages } from '../state/store'
import { createAgentVoice } from '../lib/agentVoice'
import { stopSpeaking } from '../lib/tts'

interface AgentModalProps {
  open: boolean
  onClose: () => void
  voice: ReturnType<typeof createAgentVoice>
  configOpen: Accessor<boolean>
  setConfigOpen: Setter<boolean>
}

/** Chat-Verlauf als Modal — Sichtbarkeit steuert die URL (?modal=…), KI über open/close_chat */
export function AgentModal(props: AgentModalProps) {
  const [input, setInput] = createSignal('')

  const agent = createMemo(() => state.agents.find((a) => a.id === state.defaultAgentId))
  const ready = createMemo(() => Boolean(agent()?.endpoint && agent()?.model))

  let feedRef: HTMLDivElement | undefined

  createEffect(() => {
    if (!props.open) return
    state.agent.messages.length
    queueMicrotask(() => {
      if (feedRef) feedRef.scrollTop = feedRef.scrollHeight
    })
  })

  createEffect(() => {
    if (!props.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  })

  function submit(e: Event) {
    e.preventDefault()
    const text = input().trim()
    if (!text) return
    stopSpeaking()
    sendMessage(text)
    setInput('')
  }

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
      >
        <div class="bg-zinc-950 rounded-t-2xl sm:rounded-2xl sm:border sm:border-zinc-600 sm:shadow-2xl sm:w-full sm:max-w-2xl h-[85vh] sm:h-[80vh] flex flex-col modal-pop">
          {/* Header */}
          <div class="flex items-center gap-3 px-5 py-3 border-b border-zinc-600 shrink-0">
            <span class="text-sm text-zinc-400 truncate flex-1">{agent()?.name || 'Chat'}</span>
            <button
              class="text-xs text-zinc-400 hover:text-zinc-100 hover:underline transition-colors"
              onClick={clearMessages}
            >
              Verlauf löschen
            </button>
            <button
              class="icon-btn"
              onClick={() => props.setConfigOpen(true)}
              title="Konfiguration"
            >
              ⚙
            </button>
            <button class="icon-btn" onClick={() => props.onClose()} title="Schließen" aria-label="Schließen">
              <FiX size={16} />
            </button>
          </div>

          {/* Feed */}
          <div ref={feedRef} class="flex-1 space-y-3 overflow-y-auto p-4">
            <Show when={!ready()}>
              <p class="rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-400">
                Kein Agent konfiguriert. Über <b>⚙</b> oben rechts einen Agenten mit Endpoint und
                Modell anlegen.
              </p>
            </Show>
            <Show when={state.agent.messages.length === 0 && ready()}>
              <p class="text-sm text-zinc-500">Noch keine Nachrichten.</p>
            </Show>
            <Show when={props.voice.transcribing()}>
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

          {/* Eingabe */}
          <form onSubmit={submit} class="flex items-center gap-2 border-t border-zinc-600 p-3 shrink-0">
            <button
              type="button"
              onClick={() => props.voice.toggleMic()}
              disabled={state.agent.busy || (!props.voice.sttReady() && !props.voice.listening())}
              title={props.voice.micTitle()}
              class={`h-11 w-11 shrink-0 rounded-full border text-base transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                props.voice.speaking()
                  ? 'border-red-500 bg-red-500/20 text-red-400 animate-pulse ring-2 ring-red-500/40'
                  : props.voice.listening()
                    ? 'border-zinc-300 text-zinc-100 bg-zinc-600'
                    : 'border-zinc-600 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 hover:bg-zinc-600 active:scale-95'
              }`}
            >
              {props.voice.transcribing() ? '…' : props.voice.listening() ? '■' : '🎤'}
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
    </Show>
  )
}
