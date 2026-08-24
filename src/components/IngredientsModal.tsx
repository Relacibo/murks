import { For, Show, createEffect, onCleanup, useContext } from 'solid-js'
import { FiCopy, FiX } from 'solid-icons/fi'
import { CookContext } from '../lib/cookEngine'
import { showToast } from '../lib/toast'

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

  /* Zutaten als Markdown-Checkliste in die Zwischenablage —
     Abhaken passiert beim Einkaufen, nicht in der App */
  const exportIngredients = async () => {
    const lines = engine.cook.ingredients.map((it) =>
      it.amount ? `- [ ] ${it.name} — ${it.amount}` : `- [ ] ${it.name}`,
    )
    const text = `Zutaten\n\n${lines.join('\n')}\n`
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        ok = document.execCommand('copy')
        ta.remove()
      } catch {
        ok = false
      }
    }
    if (ok) showToast('Markdown-Checkliste in die Zwischenablage kopiert.')
    else showToast('Kopieren fehlgeschlagen.')
  }

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col justify-end pb-[max(4.5rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center sm:p-4"
        onClick={(e) => e.target === e.currentTarget && props.onClose()}
      >
        <div class="bg-zinc-950 rounded-t-2xl sm:rounded-2xl sm:border sm:border-zinc-600 sm:shadow-2xl sm:w-full sm:max-w-md max-h-[80vh] overflow-y-auto modal-pop">
          <div class="flex items-center gap-2 px-5 py-4 border-b border-zinc-600 sticky top-0 bg-zinc-950">
            <h2 class="text-base font-semibold flex-1">Zutaten</h2>
            <button
              class="w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-40 bg-black text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
              onClick={() => void exportIngredients()}
              disabled={engine.cook.ingredients.length === 0}
              title="Als Markdown-Checkliste kopieren"
            >
              <FiCopy size={16} />
            </button>
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
                  <div class="flex items-baseline gap-3 py-3 px-1 border-b border-zinc-600 last:border-0">
                    <span class="flex-1 text-sm text-zinc-100">{item.name}</span>
                    <Show when={item.amount}>
                      <span class="text-xs text-zinc-400 shrink-0">{item.amount}</span>
                    </Show>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </div>
      </div>
    </Show>
  )
}
