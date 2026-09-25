import { For, Show, createMemo, createSignal, useContext } from 'solid-js'
import { FiCopy } from 'solid-icons/fi'
import { CookContext } from '../lib/cookEngine'
import {
  deriveIngredients,
  entryAmounts,
  ingredientGradient,
  type IngredientEntry,
} from '../lib/ingredients'
import { showToast } from '../lib/toast'
import { SheetModal } from './SheetModal'

/** Ein Listeneintrag als klickbarer Chip: Name sichtbar, Klick blendet die
    Menge(n) ein. Hintergrund = Farb-Gradient über die beteiligten Stränge
    (Anteile proportional zur Nutzung); ohne Strang-Zuordnung neutral. */
function IngredientListChip(props: { entry: IngredientEntry }) {
  const [revealed, setRevealed] = createSignal(false)
  const amounts = () => entryAmounts(props.entry)
  const grad = () => ingredientGradient(props.entry.uses)
  const style = () =>
    grad() !== null
      ? ({ background: grad()!, 'border-color': 'rgba(255,255,255,0.14)', color: '#f4f4f5' } as const)
      : undefined
  const classList = () => ({
    'ing-chip': true,
    'is-neutral': grad() === null,
    'is-revealed': revealed() && grad() === null,
  })
  return (
    <Show
      when={amounts().length > 0}
      fallback={
        <span classList={classList()} style={style()}>
          {props.entry.name}
        </span>
      }
    >
      <button
        type="button"
        classList={classList()}
        style={style()}
        title={`${props.entry.name}: ${amounts().join(' · ')}`}
        onClick={() => setRevealed((v) => !v)}
      >
        <span>{props.entry.name}</span>
        <Show when={revealed()}>
          <span class="ing-chip-amount">{amounts().join(' · ')}</span>
        </Show>
      </button>
    </Show>
  )
}

/** Ingredients-Liste als Modal — Sichtbarkeit steuert die URL (?modal=…), KI über open/close_ingredients.
    Die Liste ist eine Ableitung der Zutaten-Chips auf den Karten (8100):
    Farbe nach Strang, freistehende Zutaten (set_ingredients) neutral. */
export function IngredientsModal(props: { open: boolean; onClose: () => void }) {
  const engine = useContext(CookContext)!
  const entries = createMemo(() => deriveIngredients(engine.cook))

  /* Zutaten als Markdown-Checkliste in die Zwischenablage —
     Abhaken passiert beim Einkaufen, nicht in der App */
  const exportIngredients = async () => {
    const lines = entries().map((e) => {
      const amounts = entryAmounts(e)
      return amounts.length > 0 ? `- [ ] ${e.name} — ${amounts.join(', ')}` : `- [ ] ${e.name}`
    })
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
          disabled={entries().length === 0}
          title="Als Markdown-Checkliste kopieren"
        >
          <FiCopy size={16} />
        </button>
      }
    >
      <Show
        when={entries().length > 0}
        fallback={<p class="text-sm text-zinc-500 py-2">Noch keine Zutaten.</p>}
      >
        <div class="ing-chip-row py-2">
          <For each={entries()}>{(e) => <IngredientListChip entry={e} />}</For>
        </div>
      </Show>
    </SheetModal>
  )
}
