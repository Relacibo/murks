import { For, Show, createEffect, createMemo, onCleanup } from 'solid-js'
import { FiPlay, FiPause, FiX } from 'solid-icons/fi'
import { state, clearMessages } from '../state/store'
import { speak, stopSpeaking } from '../lib/tts'
import type { AgentVoice } from '../lib/agentVoice'

interface AgentModalProps {
  open: boolean
  onClose: () => void
  voice?: AgentVoice
}

/** Chat-Verlauf als Modal (nur Feed) — die Eingabe ist global in der Composer-Bar.
    Sichtbarkeit steuert die URL (?modal=…), KI über open/close_chat */
export function AgentModal(props: AgentModalProps) {
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

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col justify-end pb-[max(4.5rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center sm:p-4"
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
            <button class="icon-btn" onClick={() => props.onClose()} title="Schließen" aria-label="Schließen">
              <FiX size={16} />
            </button>
          </div>

          {/* Feed */}
          <div ref={feedRef} class="flex-1 space-y-3 overflow-y-auto p-4">
            <Show when={!ready()}>
              <p class="rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-400">
                Kein Agent konfiguriert. Über <b>⚙</b> in der Topbar (Hauptscreen) einen Agenten
                mit Endpoint und Modell anlegen.
              </p>
            </Show>
            <Show when={state.agent.messages.length === 0 && ready()}>
              <p class="text-sm text-zinc-500">Noch keine Nachrichten.</p>
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
                  <Show when={m.role === 'agent' && props.voice && !state.tts.muted}>
                    <button
                      type="button"
                      class="mt-2 inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-zinc-100 transition-colors"
                      onClick={() =>
                        props.voice!.ttsSpeaking()
                          ? stopSpeaking()
                          : void speak(m.text)
                      }
                      title={
                        props.voice!.ttsSpeaking()
                          ? 'Sprachausgabe stoppen'
                          : 'Antwort abspielen'
                      }
                    >
                      <Show
                        when={props.voice!.ttsSpeaking()}
                        fallback={<FiPlay size={12} />}
                      >
                        <FiPause size={12} />
                      </Show>
                      {props.voice!.ttsSpeaking() ? 'Stopp' : 'Abspielen'}
                    </button>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>
    </Show>
  )
}
