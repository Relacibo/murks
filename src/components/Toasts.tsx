import { For } from 'solid-js'
import { toasts, dismissToast } from '../lib/toast'

export function Toasts() {
  return (
    <div class="fixed bottom-4 left-1/2 z-[70] flex w-full max-w-sm -translate-x-1/2 flex-col gap-2 px-4">
      <For each={toasts()}>
        {(t) => (
          <button
            class="rounded-lg border border-red-800 bg-zinc-900/95 px-4 py-3 text-left text-sm text-zinc-100 shadow-lg backdrop-blur-sm"
            onClick={() => dismissToast(t.id)}
          >
            {t.text}
          </button>
        )}
      </For>
    </div>
  )
}
