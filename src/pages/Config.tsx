import { For, Show, createSignal, onMount } from 'solid-js'
import {
  state,
  setConfig,
  setStt,
  setTts,
  addAgent,
  updateAgent,
  removeAgent,
  setDefaultAgent,
} from '../state/store'
import { isSttModelCached, downloadSttModel, deleteSttModel } from '../lib/stt'
import { isTtsModelCached, downloadTtsModel, deleteTtsModel } from '../lib/tts'

const inputCls =
  'bg-zinc-700 border border-zinc-600 rounded-lg px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-zinc-500 placeholder:text-zinc-500 w-full transition-colors hover:border-zinc-500'

const selectCls = `${inputCls} cursor-pointer`

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
        <span class="text-xs text-zinc-400">Modell</span>
        <button
          class={`text-xs px-2 py-0.5 rounded border transition-colors ${
            canFetch()
              ? 'border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200'
              : 'border-zinc-600 text-zinc-700 cursor-not-allowed'
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
          class={selectCls}
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
        props.expanded ? 'border-zinc-500 bg-zinc-700' : 'border-zinc-600 bg-zinc-700'
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
            <div class="text-xs text-zinc-400 truncate mt-0.5">
              {props.model || '—'} · {props.endpoint || '—'}
            </div>
          </Show>
        </div>
        <Show when={props.isDefault}>
          <span class="text-xs text-zinc-400 shrink-0">Standard</span>
        </Show>
        <Show when={!props.isDefault}>
          <button
            class="w-11 h-11 flex items-center justify-center rounded-full text-zinc-500 hover:text-red-400 hover:bg-red-500/10 shrink-0 transition-colors"
            onClick={(e) => { e.stopPropagation(); props.onDelete() }}
            aria-label="Agent löschen"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.8"
              stroke-linecap="round"
              stroke-linejoin="round"
              class="h-5 w-5"
            >
              <path d="M3 6h18" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </Show>
        <span
          class={`flex h-11 w-11 shrink-0 items-center justify-center text-sm text-zinc-400 transition-transform duration-200 ${
            props.expanded ? 'rotate-180' : ''
          }`}
        >
          ▾
        </span>
      </div>

      {/* Expanded form */}
      <Show when={props.expanded}>
        <div class="px-3 pb-4 space-y-3 border-t border-zinc-600 pt-3">
          <label class="block space-y-1.5">
            <span class="text-xs text-zinc-400">Name</span>
            <input
              class={inputCls}
              placeholder="Ollama lokal"
              value={props.name}
              onInput={(e) => updateAgent(props.id, { name: e.currentTarget.value })}
            />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-zinc-400">Endpoint (Base-URL)</span>
            <input
              class={inputCls}
              type="url"
              placeholder="http://localhost:11434/v1"
              value={props.endpoint}
              onInput={(e) => updateAgent(props.id, { endpoint: e.currentTarget.value })}
            />
          </label>
          <label class="block space-y-1.5">
            <span class="text-xs text-zinc-400">API-Key (optional)</span>
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
  const [sttCached, setSttCached] = createSignal<boolean | null>(null)
  const [sttBusy, setSttBusy] = createSignal(false)
  const [sttCacheError, setSttCacheError] = createSignal<string | null>(null)
  const [ttsCached, setTtsCached] = createSignal<boolean | null>(null)
  const [ttsBusy, setTtsBusy] = createSignal(false)
  const [ttsCacheError, setTtsCacheError] = createSignal<string | null>(null)

  onMount(() => {
    isSttModelCached().then(setSttCached)
    isTtsModelCached().then(setTtsCached)
  })

  async function handleSttCache() {
    if (sttBusy()) return
    setSttBusy(true)
    setSttCacheError(null)
    try {
      if (sttCached()) {
        await deleteSttModel()
        setSttCached(false)
      } else {
        await downloadSttModel()
        setSttCached(true)
      }
    } catch (e) {
      setSttCacheError(e instanceof Error ? e.message : String(e))
    } finally {
      setSttBusy(false)
    }
  }

  async function handleTtsCache() {
    if (ttsBusy()) return
    setTtsBusy(true)
    setTtsCacheError(null)
    try {
      if (ttsCached()) {
        await deleteTtsModel()
        setTtsCached(false)
      } else {
        await downloadTtsModel()
        setTtsCached(true)
      }
    } catch (e) {
      setTtsCacheError(e instanceof Error ? e.message : String(e))
    } finally {
      setTtsBusy(false)
    }
  }

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
        <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-600 sticky top-0 bg-zinc-950 z-10">
          <h1 class="text-base font-semibold text-zinc-100">Konfiguration</h1>
          <Show when={props.dismissible}>
            <button
              class="w-11 h-11 flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-600 text-xl transition-colors"
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
            <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">Agenten</h2>
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
              class="w-full rounded-xl border border-dashed border-zinc-600 px-3 py-3 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 hover:bg-zinc-600 active:bg-zinc-700 transition-colors"
              onClick={handleAddAgent}
            >
              + Neuer Agent
            </button>
          </section>

          {/* Sprache (STT) — flat, always visible */}
          <section class="space-y-4">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">Sprache</h2>
            <label class="block space-y-1.5">
              <span class="text-sm text-zinc-400">Modus</span>
              <select
                class={selectCls}
                value={state.stt.mode}
                onChange={(e) =>
                  setStt({ mode: e.currentTarget.value as 'wasm' | 'server' | 'webspeech' })
                }
              >
                <option value="wasm">Lokal (Whisper, offline)</option>
                <option value="server">Server (OpenAI-kompatibel)</option>
                <option value="webspeech">Browser-Spracherkennung (online)</option>
              </select>
            </label>

            <Show when={state.stt.mode === 'wasm'}>
              <label class="block space-y-1.5">
                <span class="text-sm text-zinc-400">Modell</span>
                <select
                  class={selectCls}
                  value={state.stt.model}
                  onChange={(e) =>
                    setStt({ model: e.currentTarget.value as 'tiny' | 'base' | 'small' })
                  }
                >
                  <option value="tiny">tiny — ~41 MB, schnell, schwächste Erkennung</option>
                  <option value="base">base — ~145 MB, guter Kompromiss</option>
                  <option value="small">small — ~250 MB, beste Qualität</option>
                </select>
              </label>
              <div class="flex items-center gap-3 rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-zinc-300">
                    Whisper {state.stt.model}
                  </p>
                  <p class="text-xs text-zinc-500 mt-0.5">
                    {sttBusy()
                      ? 'Bitte warten …'
                      : sttCached() === null
                        ? 'Prüfe Cache …'
                        : sttCached()
                          ? 'Im Browser-Cache vorhanden'
                          : 'Noch nicht heruntergeladen'}
                  </p>
                </div>
                <button
                  class="shrink-0 h-9 rounded-lg border border-zinc-600 px-3 text-sm text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-40"
                  disabled={sttBusy() || sttCached() === null}
                  onClick={handleSttCache}
                >
                  {sttBusy() ? '…' : sttCached() ? 'Löschen' : 'Laden'}
                </button>
              </div>
              <Show when={sttCacheError()}>
                <p class="text-xs text-red-400">{sttCacheError()}</p>
              </Show>
              <p class="text-xs text-zinc-500">
                Läuft im Browser (WebGPU oder WASM). Ohne WebGPU: tiny oder base wählen.
              </p>
            </Show>

            <Show when={state.stt.mode === 'server'}>
              <label class="block space-y-1.5">
                <span class="text-sm text-zinc-400">Endpoint (Base-URL)</span>
                <input
                  class={inputCls}
                  type="url"
                  placeholder="http://localhost:8000/v1"
                  value={state.stt.endpoint}
                  onInput={(e) => setStt({ endpoint: e.currentTarget.value })}
                />
              </label>
              <label class="block space-y-1.5">
                <span class="text-sm text-zinc-400">API-Key (optional)</span>
                <input
                  class={inputCls}
                  type="password"
                  placeholder="sk-…"
                  value={state.stt.key}
                  onInput={(e) => setStt({ key: e.currentTarget.value })}
                />
              </label>
            </Show>

            {/* TTS */}
            <div class="space-y-4 border-t border-zinc-600 pt-4">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Ausgabe (TTS)
              </h3>
              <label class="block space-y-1.5">
                <span class="text-sm text-zinc-400">Modus</span>
                <select
                  class={selectCls}
                  value={state.tts.mode}
                  onChange={(e) =>
                    setTts({ mode: e.currentTarget.value as 'wasm' | 'server' | 'webspeech' })
                  }
                >
                  <option value="wasm">Lokal (Piper, offline)</option>
                  <option value="server">Server (OpenAI-kompatibel)</option>
                  <option value="webspeech">Browser-Stimme</option>
                </select>
              </label>

              <Show when={state.tts.mode === 'wasm'}>
                <div class="flex items-center gap-3 rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-zinc-300">Piper · Thorsten (Deutsch)</p>
                    <p class="text-xs text-zinc-500 mt-0.5">
                      {ttsBusy()
                        ? 'Bitte warten …'
                        : ttsCached() === null
                          ? 'Prüfe Cache …'
                          : ttsCached()
                            ? 'Im Browser-Cache vorhanden'
                            : 'Noch nicht heruntergeladen'}
                    </p>
                  </div>
                  <button
                    class="shrink-0 h-9 rounded-lg border border-zinc-600 px-3 text-sm text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-40"
                    disabled={ttsBusy() || ttsCached() === null}
                    onClick={handleTtsCache}
                  >
                    {ttsBusy() ? '…' : ttsCached() ? 'Löschen' : 'Laden'}
                  </button>
                </div>
                <Show when={ttsCacheError()}>
                  <p class="text-xs text-red-400">{ttsCacheError()}</p>
                </Show>
                <p class="text-xs text-zinc-500">
                  ~70 MB. Feste Stimme — klingt über alle Antworten identisch. Agenten-Antworten
                  werden automatisch vorgelesen; sprichst du, stoppt die Wiedergabe.
                </p>
              </Show>

              <Show when={state.tts.mode === 'server'}>
                <label class="block space-y-1.5">
                  <span class="text-sm text-zinc-400">Endpoint (Base-URL)</span>
                  <input
                    class={inputCls}
                    type="url"
                    placeholder="http://localhost:8000/v1"
                    value={state.tts.endpoint}
                    onInput={(e) => setTts({ endpoint: e.currentTarget.value })}
                  />
                </label>
                <label class="block space-y-1.5">
                  <span class="text-sm text-zinc-400">API-Key (optional)</span>
                  <input
                    class={inputCls}
                    type="password"
                    placeholder="sk-…"
                    value={state.tts.key}
                    onInput={(e) => setTts({ key: e.currentTarget.value })}
                  />
                </label>
                <label class="block space-y-1.5">
                  <span class="text-sm text-zinc-400">Stimme</span>
                  <input
                    class={inputCls}
                    placeholder="alloy"
                    value={state.tts.voice}
                    onInput={(e) => setTts({ voice: e.currentTarget.value })}
                  />
                </label>
              </Show>
            </div>
          </section>

          {/* Persönlich */}
          <section class="space-y-4">
            <h2 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">Persönlich</h2>
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

          <p class="text-xs text-zinc-500 pb-2">Alles lokal gespeichert · Kein Backend</p>
        </div>
      </div>
    </div>
  )
}
