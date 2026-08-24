import { For, Show, createSignal, onMount } from 'solid-js'
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
import { webSttAvailable, webTtsAvailable } from '../lib/webSpeech'

const STEPS = ['Name', 'Agent']

// ── Setup Wizard ──────────────────────────────────────────────────────────────

export function Setup() {
  const [step, setStep] = createSignal(0)
  const [agentId, setAgentId] = createSignal<string | null>(null)

  onMount(() => {
    // Keinen Agenten vorab anlegen — erst wenn der Agent-Schritt betreten
    // wird. Überspringen hinterlässt sonst eine leere Agenten-Zeile.
    const existing = state.agents[0]
    setAgentId(existing ? existing.id : null)
    /* Browser-Sprachfunktionen vorhanden → automatisch setzen (online ohne
       Key, über die Server des Browser-Herstellers) — kein manueller
       Stimme-Schritt mehr im Wizard. Nur der unberührte wasm-Default wird
       überschrieben — explizite Auswahl bleibt. */
    if (state.stt.mode === 'wasm' && webSttAvailable()) setStt({ mode: 'webspeech' })
    if (state.tts.mode === 'wasm' && webTtsAvailable()) setTts({ mode: 'webspeech' })
  })

  const agent = () => state.agents.find((a) => a.id === agentId())
  const agentValid = () => Boolean(agent()?.endpoint && agent()?.model)

  function next() {
    if (step() === 0 && !agentId()) setAgentId(addAgent())
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
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

  const lastStep = () => step() === STEPS.length - 1

  return (
    <div class="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-8">
      <div class="w-full max-w-lg">
        {/* Header */}
        <div class="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 class="text-xl font-semibold text-zinc-100">Willkommen bei Murks</h1>
            <p class="text-sm text-zinc-400 mt-1">
              Schritt {step() + 1} von {STEPS.length}: {STEPS[step()]}
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
          <For each={STEPS}>
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
