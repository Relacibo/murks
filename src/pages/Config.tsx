import { For, Show, createSignal } from 'solid-js'
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

// ── Model picker ──────────────────────────────────────────────────────────────

interface ModelPickerProps {
  agentId: string
  endpoint: string
  apiKey: string
  model: string
}

function ModelPicker(props: ModelPickerProps) {
  const [models, setModels] = createSignal<string[]>([])
  const [loading, setLoading] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [fetched, setFetched] = createSignal(false)

  const canFetch = () => Boolean(props.endpoint)

  async function fetchModels() {
    setLoading(true)
    setError(null)
    try {
      const base = props.endpoint.replace(/\/+$/, '')
      const res = await fetch(`${base}/models`, {
        headers: props.apiKey ? { Authorization: `Bearer ${props.apiKey}` } : {},
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { data?: { id: string }[] }
      const ids = (data.data ?? []).map((m) => m.id).sort()
      if (ids.length === 0) throw new Error('Keine Modelle gefunden')
      setModels(ids)
      setFetched(true)
      if (!props.model && ids[0]) updateAgent(props.agentId, { model: ids[0] })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setFetched(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div class="space-y-1.5">
      <div class="flex items-center justify-between">
        <span class="text-xs text-zinc-500">Modell</span>
        <button
          class={`text-xs px-2 py-0.5 rounded border transition-colors ${
            canFetch()
              ? 'border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'
              : 'border-zinc-800 text-zinc-700 cursor-not-allowed'
          }`}
          disabled={!canFetch() || loading()}
          onClick={fetchModels}
        >
          {loading() ? '…' : 'Abrufen'}
        </button>
      </div>
      <Show
        when={fetched() && models().length > 0}
        fallback={
          <input
            class={inputCls}
            placeholder="llama3.2"
            value={props.model}
            onInput={(e) => updateAgent(props.agentId, { model: e.currentTarget.value })}
          />
        }
      >
        <select
          class={inputCls}
          value={props.model}
          onChange={(e) => updateAgent(props.agentId, { model: e.currentTarget.value })}
        >
          <For each={models()}>
            {(m) => <option value={m}>{m}</option>}
          </For>
        </select>
      </Show>
      <Show when={error()}>
        <p class="text-xs text-red-400">{error()}</p>
      </Show>
    </div>
  )
}

// ── Agent accordion row ───────────────────────────────────────────────────────

interface AgentRowProps {
  id: string
  name: string
  model: string
  endpoint: string
  key: string
  isDefault: boolean
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
  onSetDefault: () => void
}

function AgentRow(props: AgentRowProps) {
  return (
    <div
      class={`rounded-xl border transition-colors ${
        props.expanded ? 'border-zinc-500 bg-zinc-900' : 'border-zinc-700 bg-zinc-900'
      }`}
    >
      {/* Row header — always visible */}
      <div
        class="flex items-center gap-2 px-3 py-3 cursor-pointer"
        onClick={props.onToggle}
      >
        <div class="min-w-0 flex-1">
          <div class="text-sm text-zinc-100 truncate">{props.name || 'Neuer Agent'}</div>
          <Show when={!props.expanded}>
            <div class="text-xs text-zinc-500 truncate mt-0.5">
              {props.model || '—'} · {props.endpoint || '—'}
            </div>
          </Show>
        </div>
        <Show when={props.isDefault}>
          <span class="text-xs text-zinc-400 shrink-0">Standard</span>
        </Show>
        <Show when={!props.isDefault}>
          <button
            class="w-7 h-7 flex items-center justify-center rounded-full text-zinc-600 hover:text-red-400 shrink-0 transition-colors"
            onClick={(e) => { e.stopPropagation(); props.onDelete() }}
            aria-label="Agent löschen"
          >
            ×
          </button>
        </Show>
        <span class={`text-zinc-500 text-xs transition-transform ${props.expanded ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </div>

      {/* Expanded form */}
      <Show when={props.expanded}>
        <div class="px-3 pb-4 space-y-3 border-t border-zinc-800 pt-3">
          <label class="block space-y-1.5">
            <span class="text-xs text-zinc-500">Name</span>
            <input
              class={inputCls}
              placeholder="Ollama lokal"
              value={props.name}
              onInput={(e) => updateAgent(props.id, { name: e.currentTarget.value })}
            />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-zinc-500">Endpoint (Base-URL)</span>
            <input
              class={inputCls}
              type="url"
              placeholder="http://localhost:11434/v1"
              value={props.endpoint}
              onInput={(e) => updateAgent(props.id, { endpoint: e.currentTarget.value })}
            />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-zinc-500">API-Key (optional)</span>
            <input
              class={inputCls}
              type="password"
              value={props.key}
              onInput={(e) => updateAgent(props.id, { key: e.currentTarget.value })}
            />
          </label>
          <ModelPicker
            agentId={props.id}
            endpoint={props.endpoint}
            apiKey={props.key}
            model={props.model}
          />
          <Show when={!props.isDefault}>
            <button
              class="text-xs text-zinc-400 hover:text-zinc-100 transition-colors pt-1"
              onClick={props.onSetDefault}
            >
              Als Standard setzen
            </button>
          </Show>
        </div>
      </Show>
    </div>
  )
}

// ── ConfigModal ───────────────────────────────────────────────────────────────

export function ConfigModal(props: ConfigModalProps) {
  const [expandedId, setExpandedId] = createSignal<string | null>(null)
  const [advancedOpen, setAdvancedOpen] = createSignal(false)

  function toggle(id: string) {
    setExpandedId((cur) => (cur === id ? null : id))
  }

  function handleAddAgent() {
    const id = addAgent()
    setExpandedId(id)
  }

  function handleDelete(id: string) {
    if (expandedId() === id) setExpandedId(null)
    removeAgent(id)
  }

  let touchStartY = 0
  function onTouchStart(e: TouchEvent) { touchStartY = e.touches[0].clientY }
  function onTouchEnd(e: TouchEvent) {
    if (e.changedTouches[0].clientY - touchStartY > 80 && props.dismissible) props.onClose()
  }

  return (
    <div
      class={`fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center transition-all duration-300 ${
        props.open
          ? 'bg-zinc-950/80 backdrop-blur-sm pointer-events-auto'
          : 'bg-transparent pointer-events-none'
      }`}
      onClick={(e) => {
        if (e.target === e.currentTarget && props.dismissible) props.onClose()
      }}
    >
      {/* Mobile: slide up from bottom. Desktop: scale in centered dialog */}
      <div
        class={`bg-zinc-950 w-full max-h-[90vh] overflow-y-auto transition-all duration-300 ease-out
          rounded-t-2xl md:rounded-2xl md:max-w-lg md:max-h-[85vh] md:shadow-2xl ${
          props.open
            ? 'translate-y-0 md:translate-y-0 md:scale-100 md:opacity-100'
            : 'translate-y-full md:translate-y-0 md:scale-95 md:opacity-0'
        }`}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-950 z-10">
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
          {/* Agents */}
          <section class="space-y-2">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Agenten</h2>
            <For each={state.agents}>
              {(a) => (
                <AgentRow
                  id={a.id}
                  name={a.name}
                  model={a.model}
                  endpoint={a.endpoint}
                  key={a.key}
                  isDefault={a.id === state.defaultAgentId}
                  expanded={expandedId() === a.id}
                  onToggle={() => toggle(a.id)}
                  onDelete={() => handleDelete(a.id)}
                  onSetDefault={() => setDefaultAgent(a.id)}
                />
              )}
            </For>
            <button
              class="w-full rounded-xl border border-dashed border-zinc-700 px-3 py-2.5 text-sm text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
              onClick={handleAddAgent}
            >
              + Neuer Agent
            </button>
          </section>

          {/* Persönlich */}
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

          {/* Erweitert */}
          <section class="space-y-4">
            <button
              class="flex w-full items-center justify-between py-1"
              onClick={() => setAdvancedOpen((o) => !o)}
            >
              <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-500">Erweitert</h2>
              <span class="text-zinc-600">{advancedOpen() ? '▾' : '▸'}</span>
            </button>
            <Show when={advancedOpen()}>
              <div class="space-y-4">
                <label class="block space-y-1.5">
                  <span class="text-sm text-zinc-400">STT-Modus</span>
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
              </div>
            </Show>
          </section>

          <p class="text-xs text-zinc-600 pb-2">Alles lokal gespeichert · Kein Backend</p>
        </div>
      </div>
    </div>
  )
}
