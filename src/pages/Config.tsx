import { For, Show } from 'solid-js'
import { useNavigate } from '@solidjs/router'
import {
  state,
  setConfig,
  defaultAgent,
  addAgent,
  updateAgent,
  removeAgent,
  setDefaultAgent,
} from '../state/store'

const inputCls =
  'w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500'

export function Config() {
  const navigate = useNavigate()
  const agent = defaultAgent()

  let touchStartY = 0
  function onTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY
  }
  function onTouchEnd(e: TouchEvent) {
    if (e.changedTouches[0].clientY - touchStartY > 80) navigate('/agent')
  }

  return (
    <div
      class="mx-auto max-w-2xl space-y-8 px-4 py-6"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div class="flex items-center gap-3">
        <button
          class="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-400 hover:border-neutral-500"
          onClick={() => navigate('/agent')}
        >
          ←
        </button>
        <h1 class="text-lg font-semibold">Config</h1>
      </div>

      <section class="space-y-2">
        <h2 class="text-sm font-semibold text-neutral-400">Agenten</h2>
        <For each={state.agents}>
          {(a) => (
            <div
              class={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm ${
                a.id === state.defaultAgentId
                  ? 'border-neutral-400 bg-neutral-900'
                  : 'border-neutral-800 hover:border-neutral-600'
              }`}
              onClick={() => setDefaultAgent(a.id)}
            >
              <div class="min-w-0 flex-1">
                <div class="truncate">{a.name || '(ohne Name)'}</div>
                <div class="truncate text-xs text-neutral-500">
                  {a.model || '—'} · {a.endpoint || '—'}
                </div>
              </div>
              {a.id === state.defaultAgentId && (
                <span class="text-xs text-neutral-400">Default</span>
              )}
              <button
                class="rounded px-2 py-1 text-neutral-600 hover:text-red-400"
                onClick={(e) => {
                  e.stopPropagation()
                  removeAgent(a.id)
                }}
              >
                ×
              </button>
            </div>
          )}
        </For>
        <button
          class="rounded border border-dashed border-neutral-700 px-3 py-2 text-sm text-neutral-400 hover:border-neutral-500"
          onClick={() => addAgent()}
        >
          + Neuer Agent
        </button>
      </section>

      <Show when={agent}>
        {(a) => (
          <section class="space-y-4">
            <h2 class="text-sm font-semibold text-neutral-400">
              Agent bearbeiten: {a().name || '(ohne Name)'}
            </h2>
            <label class="block space-y-1">
              <span class="text-sm text-neutral-500">Name</span>
              <input
                class={inputCls}
                placeholder="Ollama lokal"
                value={a().name}
                onInput={(e) => updateAgent(a().id, { name: e.currentTarget.value })}
              />
            </label>
            <label class="block space-y-1">
              <span class="text-sm text-neutral-500">Endpoint (Base-URL)</span>
              <input
                class={inputCls}
                type="url"
                placeholder="http://localhost:11434/v1"
                value={a().endpoint}
                onInput={(e) => updateAgent(a().id, { endpoint: e.currentTarget.value })}
              />
            </label>
            <label class="block space-y-1">
              <span class="text-sm text-neutral-500">Model</span>
              <input
                class={inputCls}
                placeholder="llama3.2"
                value={a().model}
                onInput={(e) => updateAgent(a().id, { model: e.currentTarget.value })}
              />
            </label>
            <label class="block space-y-1">
              <span class="text-sm text-neutral-500">API-Key (optional)</span>
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

      <section class="space-y-4">
        <h2 class="text-sm font-semibold text-neutral-400">Persönlich</h2>
        <label class="block space-y-1">
          <span class="text-sm text-neutral-500">Name</span>
          <input
            class={inputCls}
            value={state.config.displayName}
            onInput={(e) => setConfig({ displayName: e.currentTarget.value })}
          />
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-neutral-500">Portionen (Standard)</span>
          <input
            class={inputCls}
            type="number"
            min="1"
            value={state.config.defaultServings}
            onInput={(e) => setConfig({ defaultServings: Number(e.currentTarget.value) || 1 })}
          />
        </label>
        <label class="block space-y-1">
          <span class="text-sm text-neutral-500">Einheiten</span>
          <select
            class={inputCls}
            value={state.config.units}
            onChange={(e) => setConfig({ units: e.currentTarget.value as 'metric' | 'imperial' })}
          >
            <option value="metric">metrisch</option>
            <option value="imperial">imperial</option>
          </select>
        </label>
      </section>

      <p class="text-xs text-neutral-600">
        Alles wird lokal im Browser gespeichert (localStorage). Kein Backend, keine Cloud.
      </p>
    </div>
  )
}
