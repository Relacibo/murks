import { For, Show, useContext } from 'solid-js'
import { FiCopy } from 'solid-icons/fi'
import { CookContext } from '../lib/cookEngine'
import { showToast } from '../lib/toast'
import { SheetModal } from './SheetModal'

/** Ingredients-Liste als Modal — Sichtbarkeit steuert die URL (?modal=…), KI über open/close_ingredients */
export function IngredientsModal(props: { open: boolean; onClose: () => void }) {
  const engine = useContext(CookContext)!

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
    <SheetModal
      open={props.open}
      onClose={props.onClose}
      title="Zutaten"
      sheetClass="sm:h-auto sm:max-w-md"
      bodyClass="px-4 py-2 pb-6"
      headerActions={
        <button
          class="w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-40 bg-black text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          onClick={() => void exportIngredients()}
          disabled={engine.cook.ingredients.length === 0}
          title="Als Markdown-Checkliste kopieren"
        >
          <FiCopy size={16} />
        </button>
      }
    >
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
    </SheetModal>
  )
}
