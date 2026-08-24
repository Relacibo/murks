import { For, Show, createEffect, createSignal, onMount } from 'solid-js'
import {
  state,
  setConfig,
  setSetupDone,
  addAgent,
  updateAgent,
  removeEmptyAgents,
  setStt,
  setTts,
} from '../state/store'
import { inputCls } from '../components/fields'
import { ModelPicker } from '../components/ModelPicker'
import { SttSettings } from '../components/SttSettings'
import { TtsSettings } from '../components/TtsSettings'
import { webSttAvailable, webTtsAvailable } from '../lib/webSpeech'
import { isSttModelCached, downloadSttModel } from '../lib/stt'
import { isTtsModelCached, downloadTtsModel } from '../lib/tts'
import type { DownloadProgress } from '../lib/modelProgress'

const STEPS = ['Name', 'Agent', 'Stimme', 'Modelle']

const STT_SIZES: Record<string, string> = {
  tiny: '~41 MB',
  base: '~145 MB',
  small: '~250 MB',
}

function fmtMb(b: number): string {
  return (b / 1048576).toFixed(0)
}

// ── Download-Row ──────────────────────────────────────────────────────────────

interface DownloadRowProps {
  title: string
  size: string
  cached: () => boolean | null
  download: (cb: (p: DownloadProgress) => void) => Promise<void>
  onDone: () => void
}

function DownloadRow(props: DownloadRowProps) {
  const [busy, setBusy] = createSignal(false)
  const [progress, setProgress] = createSignal<number | null>(null)
  const [statusText, setStatusText] = createSignal<string | null>(null)
  const [error, setError] = createSignal<string | null>(null)

  async function start() {
    if (busy()) return
    setBusy(true)
    setError(null)
    setProgress(null)
    setStatusText('Starte …')
    try {
      await props.download((p) => {
        if (p.status === 'progress') {
          setProgress(p.progress ?? null)
          if (p.loaded != null && p.total != null) {
            setStatusText(`${fmtMb(p.loaded)} / ${fmtMb(p.total)} MB — ${p.file ?? ''}`)
          }
        } else if (p.status === 'initiate' || p.status === 'download') {
          setStatusText(`Lädt ${p.file ?? '…'}`)
        } else if (p.status === 'done' || p.status === 'ready') {
          setProgress(100)
          setStatusText('Verarbeitet')
        }
      })
      props.onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="rounded-xl border border-zinc-600 bg-zinc-800 px-4 py-3">
      <div class="flex items-center justify-between gap-3">
        <div class="min-w-0 flex-1">
          <p class="text-sm text-zinc-200">{props.title}</p>
          <p class="text-xs text-zinc-500 mt-0.5">
            {props.cached() === null
              ? 'Prüfe Cache …'
              : props.cached()
                ? 'Bereits im Browser-Cache'
                : `Noch nicht geladen (${props.size})`}
          </p>
        </div>
        <Show when={props.cached() === false && !busy()}>
          <button
            class="shrink-0 h-9 rounded-lg border border-zinc-600 px-3 text-sm text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 transition-colors"
            onClick={start}
          >
            Laden
          </button>
        </Show>
        <Show when={props.cached() === true}>
          <span class="shrink-0 text-sm text-green-400">✓</span>
        </Show>
      </div>
      <Show when={busy() || error()}>
        <div class="mt-2">
          <Show when={busy()}>
            <div class="h-2 w-full overflow-hidden rounded-full bg-zinc-700">
              <div
                class="h-full bg-zinc-300 transition-all duration-300"
                style={{ width: `${progress() ?? 5}%` }}
              />
            </div>
            <p class="text-xs text-zinc-500 mt-1 truncate">{statusText()}</p>
          </Show>
          <Show when={error()}>
            <p class="text-xs text-red-400 mt-1">{error()}</p>
          </Show>
        </div>
      </Show>
    </div>
  )
}

// ── Setup Wizard ──────────────────────────────────────────────────────────────

export function Setup() {
  const [step, setStep] = createSignal(0)
  const [agentId, setAgentId] = createSignal<string | null>(null)
  const [sttCached, setSttCached] = createSignal<boolean | null>(null)
  const [ttsCached, setTtsCached] = createSignal<boolean | null>(null)

  /* Browser kann Spracherkennung UND -ausgabe → keine Sprach-Schritte nötig
     (werden automatisch gesetzt), Wizard = Name + Agent. Sonst kommen
     „Stimme" und „Modelle" als OPTIONALE Schritte dazu (überspringbar bzw.
     ohne Downloads abschließbar). */
  const steps =
    webSttAvailable() && webTtsAvailable() ? STEPS.slice(0, 2) : STEPS

  onMount(() => {
    // Keinen Agenten vorab anlegen — erst wenn der Agent-Schritt betreten
    // wird. Überspringen hinterlässt sonst eine leere Agenten-Zeile.
    const existing = state.agents[0]
    setAgentId(existing ? existing.id : null)
    /* Browser-Sprachfunktionen vorhanden → vorauswählen (online ohne Key,
       über die Server des Browser-Herstellers). Nur der unberührte
       wasm-Default wird überschrieben — explizite Auswahl bleibt. */
    if (state.stt.mode === 'wasm' && webSttAvailable()) setStt({ mode: 'webspeech' })
    if (state.tts.mode === 'wasm' && webTtsAvailable()) setTts({ mode: 'webspeech' })
  })

  createEffect(() => {
    state.stt.model
    if (step() !== steps.length - 1) return
    setSttCached(null)
    setTtsCached(null)
    if (state.stt.mode === 'wasm') void isSttModelCached().then(setSttCached)
    if (state.tts.mode === 'wasm') void isTtsModelCached().then(setTtsCached)
  })

  const agent = () => state.agents.find((a) => a.id === agentId())
  const agentValid = () => Boolean(agent()?.endpoint && agent()?.model)

  const needsDownloads = () => state.stt.mode === 'wasm' || state.tts.mode === 'wasm'

  function next() {
    if (step() === 0 && !agentId()) setAgentId(addAgent())
    setStep((s) => Math.min(s + 1, steps.length - 1))
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0))
  }

  function finish() {
    // Sicherheitsnetz: keine leeren Agenten-Platzhalter hinterlassen.
    removeEmptyAgents()
    setSetupDone(true)
  }

  function handleContinue() {
    if (lastStep()) finish()
    else next()
  }

  const canContinue = () => {
    if (step() === 1) return agentValid()
    return true
  }

  const lastStep = () => step() === steps.length - 1

  return (
    <div class="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-8">
      <div class="w-full max-w-lg">
        {/* Header */}
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 class="text-xl font-semibold text-zinc-100">Willkommen bei Murks</h1>
            <p class="text-sm text-zinc-400 mt-1">
              Schritt {step() + 1} von {steps.length}: {steps[step()]}
            </p>
          </div>
          {/* Überspringen überspringt nur DIESEN Schritt — der Agent-Schritt (1)
              ist Pflicht (kein Skip), auf dem letzten Schritt übernimmt „Fertig" */}
          <Show when={step() !== 1 && !lastStep()}>
            <button
              class="text-xs text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 pt-1"
              onClick={next}
            >
              Überspringen
            </button>
          </Show>
        </div>

        {/* Dots */}
        <div class="mb-5 flex gap-1.5">
          <For each={steps}>
            {(_, i) => (
              <div
                class={`h-1 flex-1 rounded-full transition-colors ${
                  i() <= step() ? 'bg-zinc-200' : 'bg-zinc-700'
                }`}
              />
            )}
          </For>
        </div>

        {/* Card */}
        <div class="rounded-2xl border border-zinc-700 bg-zinc-900 p-5 md:p-6">
          <Show when={step() === 0}>
            <div class="space-y-4">
              <div>
                <h2 class="text-lg font-semibold text-zinc-100">Wie heißt du?</h2>
                <p class="text-sm text-zinc-400 mt-1">
                  Der Agent nutzt deinen Namen in seinen Antworten. Kann leer bleiben.
                </p>
              </div>
              <input
                class={inputCls}
                placeholder="Dein Name"
                value={state.config.displayName}
                onInput={(e) => setConfig({ displayName: e.currentTarget.value })}
              />
            </div>
          </Show>

          <Show when={step() === 1}>
            <Show when={agent()}>
              {(a) => (
                <div class="space-y-4">
                  <div>
                    <h2 class="text-lg font-semibold text-zinc-100">Dein Agent</h2>
                    <p class="text-sm text-zinc-400 mt-1">
                      OpenAI-kompatibles Endpoint, z.B. Ollama unter{' '}
                      <span class="text-zinc-300">http://localhost:11434/v1</span>.
                    </p>
                  </div>
                  <label class="block space-y-1.5">
                    <span class="text-xs text-zinc-400">Name (optional)</span>
                    <input
                      class={inputCls}
                      placeholder="Küchenagent"
                      value={a().name}
                      onInput={(e) =>
                        updateAgent(agentId()!, { name: e.currentTarget.value })
                      }
                    />
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-xs text-zinc-400">Endpoint (Base-URL)</span>
                    <input
                      class={inputCls}
                      type="url"
                      placeholder="http://localhost:11434/v1"
                      value={a().endpoint}
                      onInput={(e) =>
                        updateAgent(agentId()!, { endpoint: e.currentTarget.value })
                      }
                    />
                  </label>
                  <label class="block space-y-1.5">
                    <span class="text-xs text-zinc-400">API-Key (optional)</span>
                    <input
                      class={inputCls}
                      type="password"
                      value={a().key}
                      onInput={(e) =>
                        updateAgent(agentId()!, { key: e.currentTarget.value })
                      }
                    />
                  </label>
                  <ModelPicker
                    endpoint={a().endpoint}
                    apiKey={a().key}
                    model={a().model}
                    onChange={(m) => updateAgent(agentId()!, { model: m })}
                  />
                  <Show when={!agentValid()}>
                    <p class="text-xs text-zinc-500">
                      Endpoint und Modell sind nötig, um fortzufahren.
                    </p>
                  </Show>
                </div>
              )}
            </Show>
          </Show>

          <Show when={step() === 2}>
            <div class="space-y-5">
              <div>
                <h2 class="text-lg font-semibold text-zinc-100">Stimme</h2>
                <p class="text-sm text-zinc-400 mt-1">
                  Lokal läuft komplett im Browser und funktioniert offline. Kann dein
                  Browser die Spracherkennung, ist „Browser" automatisch vorausgewählt —
                  läuft dann online ohne Key, sonst nimmst du Lokal.
                </p>
              </div>
              <div class="space-y-4">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Erkennung (STT)
                </h3>
                <SttSettings />
              </div>
              <div class="space-y-4 border-t border-zinc-600 pt-4">
                <h3 class="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Ausgabe (TTS)
                </h3>
                <TtsSettings />
              </div>
            </div>
          </Show>

          <Show when={step() === 3}>
            <div class="space-y-4">
              <div>
                <h2 class="text-lg font-semibold text-zinc-100">Modelle laden</h2>
                <p class="text-sm text-zinc-400 mt-1">
                  Einmalig herunterladen, danach komplett offline. Überspringen geht
                  jederzeit — nachholbar in der Konfiguration.
                </p>
              </div>
              <Show
                when={needsDownloads()}
                fallback={
                  <p class="text-sm text-zinc-500">
                    Keine Downloads nötig — deine Sprach-Modi nutzen Server oder Browser.
                  </p>
                }
              >
                <Show when={state.stt.mode === 'wasm'}>
                  <DownloadRow
                    title={`Whisper ${state.stt.model} (Spracherkennung)`}
                    size={STT_SIZES[state.stt.model] ?? ''}
                    cached={sttCached}
                    download={(cb) => downloadSttModel(cb)}
                    onDone={() => void isSttModelCached().then(setSttCached)}
                  />
                </Show>
                <Show when={state.tts.mode === 'wasm'}>
                  <DownloadRow
                    title="MMS-TTS Deutsch (Sprachausgabe)"
                    size="~80 MB"
                    cached={ttsCached}
                    download={(cb) => downloadTtsModel(cb)}
                    onDone={() => void isTtsModelCached().then(setTtsCached)}
                  />
                </Show>
              </Show>
            </div>
          </Show>
        </div>

        {/* Footer */}
        <div class="mt-5 flex items-center justify-between">
          <button
            class="h-11 rounded-lg border border-zinc-600 px-4 text-sm text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 transition-colors disabled:opacity-40"
            disabled={step() === 0}
            onClick={back}
          >
            Zurück
          </button>
          <button
            class="h-11 rounded-lg bg-zinc-100 px-5 text-sm font-medium text-zinc-900 transition-colors enabled:hover:bg-zinc-300 enabled:active:scale-95 disabled:opacity-40"
            disabled={!canContinue()}
            onClick={handleContinue}
          >
            {lastStep() ? 'Fertig' : 'Weiter'}
          </button>
        </div>
      </div>
    </div>
  )
}
