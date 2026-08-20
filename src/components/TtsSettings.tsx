import { Show } from 'solid-js'
import { state, setTts } from '../state/store'
import { webTtsAvailable } from '../lib/webSpeech'
import { inputCls, selectCls } from './fields'

export function TtsSettings() {
  return (
    <>
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
          <Show when={webTtsAvailable() || state.tts.mode === 'webspeech'}>
            <option value="webspeech">Browser-Stimme (online, ohne Key)</option>
          </Show>
        </select>
      </label>

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
    </>
  )
}
