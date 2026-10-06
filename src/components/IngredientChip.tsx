import { Show } from 'solid-js'

/** Zutaten-Chip (8100): Name + Menge — die Menge steht immer sichtbar am
    Chip (kein Klicken mehr). Rendert inline im Textfluss der Karte; die
    Farbe kommt vom umgebenden data-color-Träger (Karte → Flow-Farbe). */
export function IngredientChip(props: { name: string; amount: string }) {
  return (
    <span class="ing-chip">
      <span>{props.name}</span>
      <Show when={props.amount !== ''}>
        <span class="ing-chip-amount">{props.amount}</span>
      </Show>
    </span>
  )
}
