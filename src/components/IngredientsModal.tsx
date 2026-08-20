import { For, Show, createEffect, onCleanup, useContext } from 'solid-js'
import { FiCheck, FiX } from 'solid-icons/fi'
import { CookContext } from '../lib/cookEngine'

/** Ingredients-Liste als Modal — Sichtbarkeit steuert die URL (?modal=…), KI über open/close_ingredients */
export function IngredientsModal(props: { open: boolean; onClose: () => void }) {
  const engine = useContext(CookContext)!

  createEffect(() => {
    if (!props.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  })

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
      >
        <div class="bg-zinc-950 rounded-t-2xl sm:rounded-2xl sm:border sm:border-zinc-600 sm:shadow-2xl sm:w-full sm:max-w-md max-h-[80vh] overflow-y-auto modal-pop">
          <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-600 sticky top-0 bg-zinc-950">
            <h2 class="text-base font-semibold">Zutaten</h2>
            <button class="icon-btn" onClick={() => props.onClose()}>
              <FiX size={16} />
            </button>
          </div>
          <div class="px-4 py-2 pb-6 flex flex-col">
            <Show
              when={engine.cook.ingredients.length > 0}
              fallback={<p class="text-sm text-zinc-500 py-2">Noch keine Zutaten.</p>}
            >
              <For each={engine.cook.ingredients}>
                {(item) => (
                  <button
                    class="flex items-center gap-3 py-3 px-1 border-b border-zinc-600 last:border-0 w-full text-left"
                    onClick={() =>
                      engine.executeTool('toggle_ingredient', { id: item.id }, { silent: true })
                    }
                  >
                    <div
                      class={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        item.checked ? 'border-zinc-400 bg-zinc-700' : 'border-zinc-600 bg-zinc-700'
                      }`}
                    >
                      <Show when={item.checked}>
                        <FiCheck size={12} class="text-zinc-100" />
                      </Show>
                    </div>
                    <span
                      class={`flex-1 text-sm ${
                        item.checked ? 'text-zinc-400 line-through' : 'text-zinc-100'
                      }`}
                    >
                      {item.name}
                    </span>
                    <span class="text-xs text-zinc-400 shrink-0">{item.amount}</span>
                  </button>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}
