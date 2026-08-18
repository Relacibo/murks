import { For, Show, createSignal } from 'solid-js'
import { state, sendMessage, clearMessages } from '../state/store'

export function Agent() {
  const [input, setInput] = createSignal('')

  function submit(e: Event) {
    e.preventDefault()
    const text = input().trim()
    if (!text) return
    sendMessage(text)
    setInput('')
  }

  return (
    <div class="flex h-[calc(100vh-8rem)] flex-col">
      <div class="mb-4 flex items-center justify-between">
        <h1 class="text-lg font-semibold">Agent</h1>
        <button
          class="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 hover:border-neutral-500"
          onClick={clearMessages}
        >
          Verlauf löschen
        </button>
      </div>

      <div class="flex-1 space-y-3 overflow-y-auto pb-4">
        <Show when={!state.config.agentUrl}>
          <p class="rounded border border-amber-900 bg-amber-950/50 p-3 text-sm text-amber-400">
            Keine Agent-URL konfiguriert. Unter <b>Config</b> eintragen.
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

      <form onSubmit={submit} class="flex gap-2 border-t border-neutral-800 pt-4">
        <input
          class="flex-1 rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-neutral-500"
          placeholder="Nachricht an den Agenten"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
        />
        <button
          type="submit"
          disabled={state.agent.busy || !state.config.agentUrl}
          class="rounded bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 disabled:opacity-40"
        >
          Senden
        </button>
      </form>
    </div>
  )
}
