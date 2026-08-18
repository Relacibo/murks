import { For, Show, createSignal } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import { state, defaultAgent, sendMessage, clearMessages } from '../state/store'

export function Agent() {
  const navigate = useNavigate()
  const [input, setInput] = createSignal('')
  const agent = defaultAgent()
  const ready = () => Boolean(agent?.endpoint && agent?.model)

  let touchStartY = 0
  function onTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY
  }
  function onTouchEnd(e: TouchEvent) {
    if (e.changedTouches[0].clientY - touchStartY < -80) navigate('/config')
  }

  function submit(e: Event) {
    e.preventDefault()
    const text = input().trim()
    if (!text) return
    sendMessage(text)
    setInput('')
  }

  return (
    <div
      class="relative flex h-screen flex-col px-4 pb-4"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        class="absolute top-3 right-3 z-10 rounded border border-neutral-800 px-2.5 py-1 text-sm text-neutral-500 hover:border-neutral-600"
        onClick={() => navigate('/config')}
        title="Config"
      >
        ⚙
      </button>

      <div class="flex items-center justify-between pt-3 pr-12">
        <span class="text-sm text-neutral-500">{agent?.name || '—'}</span>
        <button
          class="text-xs text-neutral-600 hover:text-neutral-400"
          onClick={clearMessages}
        >
          Verlauf löschen
        </button>
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto py-4">
        <Show when={!ready()}>
          <p class="rounded border border-amber-900 bg-amber-950/50 p-3 text-sm text-amber-400">
            Kein Agent konfiguriert. Über <b>⚙</b> oben rechts einen Agenten mit Endpoint und
            Model anlegen. Lokale AIs (z.B. Ollama unter http://localhost:11434/v1) funktionieren
            auch offline.
          </p>
        </Show>
        <Show when={state.agent.messages.length === 0}>
          <p class="text-sm text-neutral-600">Noch keine Nachrichten.</p>
        </Show>
        <For each={state.agent.messages}>
          {(m) => (
            <div
              class={`max-w-[85%] whitespace-pre-wrap rounded-lg p-3 text-sm ${
                m.role === 'user'
                  ? 'ml-auto bg-neutral-800'
                  : 'border border-neutral-800 bg-neutral-900'
              }`}
            >
              {m.text}
            </div>
          )}
        </For>
      </div>

      <form onSubmit={submit} class="flex gap-2 border-t border-neutral-800 pt-3">
        <input
          class="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          placeholder="Nachricht an den Agenten"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
        />
        <button
          type="submit"
          disabled={state.agent.busy || !ready()}
          class="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-40"
        >
          Senden
        </button>
      </form>
    </div>
  )
}
