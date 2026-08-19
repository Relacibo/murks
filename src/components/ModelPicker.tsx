import { For, Show, createSignal } from 'solid-js'
import { inputCls, selectCls } from './fields'

interface ModelPickerProps {
  endpoint: string
  apiKey: string
  model: string
  onChange: (model: string) => void
}

export function ModelPicker(props: ModelPickerProps) {
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
      if (!props.model && ids[0]) props.onChange(ids[0])
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
            onInput={(e) => props.onChange(e.currentTarget.value)}
          />
        }
      >
        <select
          class={selectCls}
          value={props.model}
          onChange={(e) => props.onChange(e.currentTarget.value)}
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
