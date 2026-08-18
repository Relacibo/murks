import { setConfig, state } from '../state/store'

const inputCls =
  'w-full rounded border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 outline-none focus:border-neutral-500'

export function Config() {
  return (
    <div class="space-y-6">
      <h1 class="text-lg font-semibold">Config</h1>

      <label class="block space-y-1">
        <span class="text-sm text-neutral-400">Name</span>
        <input
          class={inputCls}
          value={state.config.displayName}
          onInput={(e) => setConfig({ displayName: e.currentTarget.value })}
        />
      </label>

      <label class="block space-y-1">
        <span class="text-sm text-neutral-400">Portionen (Standard)</span>
        <input
          class={inputCls}
          type="number"
          min="1"
          value={state.config.defaultServings}
          onInput={(e) => setConfig({ defaultServings: Number(e.currentTarget.value) || 1 })}
        />
      </label>

      <label class="block space-y-1">
        <span class="text-sm text-neutral-400">Einheiten</span>
        <select
          class={inputCls}
          value={state.config.units}
          onChange={(e) => setConfig({ units: e.currentTarget.value as 'metric' | 'imperial' })}
        >
          <option value="metric">metrisch</option>
          <option value="imperial">imperial</option>
        </select>
      </label>

      <label class="block space-y-1">
        <span class="text-sm text-neutral-400">Agent-URL</span>
        <input
          class={inputCls}
          type="url"
          placeholder="https://example.com/agent"
          value={state.config.agentUrl}
          onInput={(e) => setConfig({ agentUrl: e.currentTarget.value })}
        />
      </label>

      <label class="block space-y-1">
        <span class="text-sm text-neutral-400">Agent-Key</span>
        <input
          class={inputCls}
          type="password"
          value={state.config.agentKey}
          onInput={(e) => setConfig({ agentKey: e.currentTarget.value })}
        />
      </label>

      <p class="text-xs text-neutral-600">
        Alles wird lokal im Browser gespeichert (localStorage). Kein Backend, keine Cloud.
      </p>
    </div>
  )
}
