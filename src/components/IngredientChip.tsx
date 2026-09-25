import { createSignal, Show } from 'solid-js'

/** Zutaten-Chip auf einer Karte: zeigt den Namen, Klick blendet die Menge
    ein (8100 — Mengen leben im Modell, nicht im Schritttext). Farbe kommt
    vom umgebenden data-color-Träger (Karte → Flow-Farbe); ohne Menge ist
    der Chip ein statischer Span. */
export function IngredientChip(props: { name: string; amount: string }) {
  const [revealed, setRevealed] = createSignal(false)
  return (
    <Show
      when={props.amount !== ''}
      fallback={<span class="ing-chip">{props.name}</span>}
    >
      <button
        type="button"
        classList={{ 'ing-chip': true, 'is-revealed': revealed() }}
        title={`${props.name}: ${props.amount}`}
        onClick={(e) => {
          e.stopPropagation()
          setRevealed((v) => !v)
        }}
      >
        <span>{props.name}</span>
        <Show when={revealed()}>
          <span class="ing-chip-amount">{props.amount}</span>
        </Show>
      </button>
    </Show>
  )
}
