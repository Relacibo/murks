import { For, Show, createMemo, createSignal, type Accessor, type Setter } from 'solid-js'
import { state, sendMessage, clearMessages } from '../state/store'

interface AgentProps {
  configOpen: Accessor<boolean>
  setConfigOpen: Setter<boolean>
}

export function Agent(props: AgentProps) {
  const [input, setInput] = createSignal('')

  const agent = createMemo(() => state.agents.find((a) => a.id === state.defaultAgentId))
  const ready = createMemo(() => Boolean(agent()?.endpoint && agent()?.model))

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
    <div
      class="relative flex h-screen flex-col px-4 pb-4"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div class="flex items-center justify-between pt-3 pr-14">
        <span class="text-sm text-zinc-400">{agent()?.name || '—'}</span>
        <button
          class="text-xs text-zinc-600 hover:text-zinc-400"
          onClick={clearMessages}
        >
          Verlauf löschen
        </button>
      </div>

      <button
        class="absolute top-3 right-3 z-10 rounded-full border border-zinc-700 w-8 h-8 flex items-center justify-center text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
        onClick={() => props.setConfigOpen(true)}
        title="Konfiguration"
      >
        ⚙
      </button>

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

      <form onSubmit={submit} class="flex gap-2 border-t border-zinc-800 pt-3">
        <input
          class="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600 w-full"
          placeholder="Nachricht an den Agenten …"
          value={input()}
          onInput={(e) => setInput(e.currentTarget.value)}
        />
        <button
          type="submit"
          disabled={state.agent.busy || !ready()}
          class="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 disabled:opacity-40"
        >
          Senden
        </button>
      </form>
    </div>
  )
}
