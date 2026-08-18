import { For, Show, createMemo, createSignal } from 'solid-js'
import {
  state,
  setConfig,
  setStt,
  addAgent,
  updateAgent,
  removeAgent,
  setDefaultAgent,
} from '../state/store'

const inputCls =
  'bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-600 w-full'

interface ConfigModalProps {
  open: boolean
  onClose: () => void
  dismissible: boolean
}

export function ConfigModal(props: ConfigModalProps) {
  const [selectedId, setSelectedId] = createSignal<string | null>(null)

  const selectedAgent = createMemo(() =>
    state.agents.find((a) => a.id === (selectedId() ?? state.defaultAgentId))
  )

  let touchStartY = 0
  function onTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY
  }
  function onTouchEnd(e: TouchEvent) {
    if (e.changedTouches[0].clientY - touchStartY > 80 && props.dismissible) props.onClose()
  }

  function handleAddAgent() {
    const id = addAgent()
    setSelectedId(id)
  }

  function handleSelectAgent(id: string) {
    setSelectedId(id)
    setDefaultAgent(id)
  }

  return (
    <div
      class={`fixed inset-0 z-50 flex flex-col justify-end transition-all duration-300 ${
        props.open
          ? 'bg-zinc-950/80 backdrop-blur-sm pointer-events-auto'
          : 'bg-transparent pointer-events-none'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget && props.dismissible) props.onClose()
      }}
    >
      <div
        class={`bg-zinc-950 rounded-t-2xl max-h-[90vh] overflow-y-auto transition-transform duration-300 ease-out ${
          props.open ? 'translate-y-0' : 'translate-y-full'
        }`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
          {/* Header */}
          <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
            <h1 class="text-base font-semibold text-zinc-100">Konfiguration</h1>
            <Show when={props.dismissible}>
              <button
                class="w-8 h-8 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-lg"
                onClick={props.onClose}
                aria-label="Schließen"
              >
                ×
              </button>
            </Show>
          </div>

          <div class="px-5 py-5 space-y-8">
            {/* Agents list */}
            <section class="space-y-3">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Agenten</h2>
              <For each={state.agents}>
                {(a) => {
                  const isSelected = createMemo(
                    () => a.id === (selectedId() ?? state.defaultAgentId)
                  )
                  return (
                    <div
                      class={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                        isSelected()
                          ? 'border-zinc-400 bg-zinc-800'
                          : 'border-zinc-700 hover:border-zinc-600'
                      }`}
                      onClick={() => handleSelectAgent(a.id)}
                    >
                      <div class="min-w-0 flex-1">
                        <div class="truncate text-zinc-100">{a.name || 'Neuer Agent'}</div>
                        <div class="truncate text-xs text-zinc-500">
                          {a.model || '—'} · {a.endpoint || '—'}
                        </div>
                      </div>
                      <Show when={a.id === state.defaultAgentId}>
                        <span class="text-xs text-zinc-400 shrink-0">Standard</span>
                      </Show>
                      <button
                        class="rounded-full w-6 h-6 flex items-center justify-center text-zinc-600 hover:text-red-400 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (selectedId() === a.id) setSelectedId(null)
                          removeAgent(a.id)
                        }}
                        aria-label="Agent löschen"
                      >
                        ×
                      </button>
                    </div>
                  )
                }}
              </For>
              <button
                class="w-full rounded-lg border border-dashed border-zinc-700 px-3 py-2.5 text-sm text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                onClick={handleAddAgent}
              >
                + Neuer Agent
              </button>
            </section>

            {/* Agent edit form */}
            <Show when={selectedAgent()}>
              {(a) => (
                <section class="space-y-4">
                  <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Agent bearbeiten
                  </h2>
                  <label class="block space-y-1.5">
                    <span class="text-sm text-zinc-400">Name</span>
                    <input
                      class={inputCls}
                      placeholder="Ollama lokal"
                      value={a().name}
                      onInput={(e) => updateAgent(a().id, { name: e.currentTarget.value })}
                    />
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-sm text-zinc-400">Endpoint (Base-URL)</span>
                    <input
                      class={inputCls}
                      type="url"
                      placeholder="http://localhost:11434/v1"
                      value={a().endpoint}
                      onInput={(e) => updateAgent(a().id, { endpoint: e.currentTarget.value })}
                    />
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-sm text-zinc-400">Modell</span>
                    <input
                      class={inputCls}
                      placeholder="llama3.2"
                      value={a().model}
                      onInput={(e) => updateAgent(a().id, { model: e.currentTarget.value })}
                    />
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-sm text-zinc-400">API-Key (optional)</span>
                    <input
                      class={inputCls}
                      type="password"
                      value={a().key}
                      onInput={(e) => updateAgent(a().id, { key: e.currentTarget.value })}
                    />
                  </label>
                </section>
              )}
            </Show>

            {/* Spracherkennung */}
            <section class="space-y-4">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Spracherkennung (STT)
              </h2>
              <label class="block space-y-1.5">
                <span class="text-sm text-zinc-400">Modus</span>
                <select
                  class={inputCls}
                  value={state.stt.mode}
                  onChange={(e) =>
                    setStt({ mode: e.currentTarget.value as 'wasm' | 'server' | 'webspeech' })
                  }
                >
                  <option value="wasm">Lokal (Whisper small, ~250 MB Download, offline)</option>
                  <option value="server">Server (OpenAI-kompatibel)</option>
                  <option value="webspeech">Browser-Spracherkennung (online)</option>
                </select>
              </label>
              <Show when={state.stt.mode === 'server'}>
                <label class="block space-y-1.5">
                  <span class="text-sm text-zinc-400">STT-Endpoint (Base-URL)</span>
                  <input
                    class={inputCls}
                    type="url"
                    placeholder="http://localhost:8000/v1"
                    value={state.stt.endpoint}
                    onInput={(e) => setStt({ endpoint: e.currentTarget.value })}
                  />
                </label>
              </Show>
              <Show when={state.stt.mode === 'wasm'}>
                <p class="text-xs text-zinc-600">
                  Whisper small läuft direkt im Browser (WebGPU, sonst WASM). Modell wird beim
                  ersten Start geladen und gecacht.
                </p>
              </Show>
            </section>

            {/* Personal */}
            <section class="space-y-4">
              <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Persönlich</h2>
              <label class="block space-y-1.5">
                <span class="text-sm text-zinc-400">Wie heißt du?</span>
                <input
                  class={inputCls}
                  placeholder="Dein Name"
                  value={state.config.displayName}
                  onInput={(e) => setConfig({ displayName: e.currentTarget.value })}
                />
              </label>
            </section>

            <p class="text-xs text-zinc-600 pb-2">
              Alles lokal gespeichert · Kein Backend
            </p>
          </div>
        </div>
      </div>
  )
}
