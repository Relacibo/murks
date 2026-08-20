import { For, Show, createSignal, onMount } from 'solid-js'
import { FiX, FiExternalLink } from 'solid-icons/fi'
import {
  state,
  setConfig,
  addAgent,
  updateAgent,
  removeAgent,
  setDefaultAgent,
} from '../state/store'
import { isSttModelCached, downloadSttModel, deleteSttModel } from '../lib/stt'
import { isTtsModelCached, downloadTtsModel, deleteTtsModel } from '../lib/tts'
import { inputCls } from '../components/fields'
import { ModelPicker } from '../components/ModelPicker'
import { SttSettings } from '../components/SttSettings'
import { TtsSettings } from '../components/TtsSettings'

interface ConfigModalProps {
  open: boolean
  onClose: () => void
  dismissible: boolean
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
            endpoint={props.endpoint}
            apiKey={props.key}
            model={props.model}
            onChange={(m) => updateAgent(props.id, { model: m })}
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
  const [sttProgress, setSttProgress] = createSignal<number | null>(null)
  const [sttCacheError, setSttCacheError] = createSignal<string | null>(null)
  const [ttsCached, setTtsCached] = createSignal<boolean | null>(null)
  const [ttsBusy, setTtsBusy] = createSignal(false)
  const [ttsProgress, setTtsProgress] = createSignal<number | null>(null)
  const [ttsCacheError, setTtsCacheError] = createSignal<string | null>(null)

  onMount(() => {
    isSttModelCached().then(setSttCached)
    isTtsModelCached().then(setTtsCached)
  })

  async function handleSttCache() {
    if (sttBusy()) return
    setSttBusy(true)
    setSttProgress(null)
    setSttCacheError(null)
    try {
      if (sttCached()) {
        await deleteSttModel()
        setSttCached(false)
      } else {
        await downloadSttModel((p) => {
          if (p.status === 'progress' && p.progress != null) setSttProgress(p.progress)
        })
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
    setTtsProgress(null)
    setTtsCacheError(null)
    try {
      if (ttsCached()) {
        await deleteTtsModel()
        setTtsCached(false)
      } else {
        await downloadTtsModel((p) => {
          if (p.status === 'progress' && p.progress != null) setTtsProgress(p.progress)
        })
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
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget && props.dismissible) props.onClose()
        }}
      >
        <div
          class="bg-zinc-950 w-full max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl sm:border sm:border-zinc-600 sm:shadow-2xl sm:max-w-lg sm:max-h-[85vh] modal-pop"
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
      >
        {/* Header */}
        <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-600 sticky top-0 bg-zinc-950 z-10">
          <h1 class="text-base font-semibold text-zinc-100">Konfiguration</h1>
          <Show when={props.dismissible}>
            <button
              class="icon-btn"
              onClick={() => props.onClose()}
              title="Schließen"
              aria-label="Schließen"
            >
              <FiX size={16} />
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
            <SttSettings />

            <Show when={state.stt.mode === 'wasm'}>
              <div class="flex items-center gap-3 rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-zinc-300">
                    Whisper {state.stt.model}
                  </p>
                  <p class="text-xs text-zinc-500 mt-0.5">
                    {sttBusy()
                      ? sttProgress() !== null
                        ? `Lädt … ${Math.round(sttProgress() ?? 0)} %`
                        : 'Bitte warten …'
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

            {/* TTS */}
            <div class="space-y-4 border-t border-zinc-600 pt-4">
              <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Ausgabe (TTS)
              </h3>
              <TtsSettings />

              <Show when={state.tts.mode === 'wasm'}>
                <div class="flex items-center gap-3 rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-3">
                  <div class="min-w-0 flex-1">
                    <p class="text-sm text-zinc-300">Piper · Thorsten (Deutsch)</p>
                    <p class="text-xs text-zinc-500 mt-0.5">
                      {ttsBusy()
                        ? ttsProgress() !== null
                          ? `Lädt … ${Math.round(ttsProgress() ?? 0)} %`
                          : 'Bitte warten …'
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
          <a
            href="https://github.com/Relacibo/murks/issues"
            target="_blank"
            rel="noopener noreferrer"
            class="flex items-center justify-center gap-2 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
          >
            <FiExternalLink size={14} />
            Feedback / Bug melden
          </a>
        </div>
      </div>
    </div>
    </Show>
  )
}
