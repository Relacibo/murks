import { Show } from 'solid-js'
import { state, setStt } from '../state/store'
import { inputCls, selectCls } from './fields'

export function SttSettings() {
  return (
    <>
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
    </>
  )
}
