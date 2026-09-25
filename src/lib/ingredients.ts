import type { CookState, FlowColor, IngredientUse, Step } from '../state/store'
import { FLOW_COLORS } from './cookEngine'

/** Ein Zutaten-"Nutzen": Menge + Flow-Farbe (null = freistehend aus
    set_ingredients, gehört zu keinem Strang). */
export interface IngredientUseRef {
  amount: string
  color: FlowColor | null
}

/** Eintrag der abgeleiteten Zutatenliste: eine Zutat (Identität über
    normalisierten Namen) mit allen Nutzungen über alle Stränge. */
export interface IngredientEntry {
  key: string
  name: string
  uses: IngredientUseRef[]
}

/** Mittlere Farbtöne (die --flow-border-Werte aus index.css) für die
    Farb-Unterkunft der Listeneinträge — dunkel genug für helle Schrift. */
const COLOR_HEX: Record<FlowColor, string> = {
  cyan: '#155e75',
  violet: '#5b21b6',
  amber: '#92400e',
  emerald: '#065f46',
  rose: '#9f1239',
  sky: '#075985',
}

export function flowColorOf(cook: CookState, flowId: string): FlowColor | null {
  const idx = cook.flows.findIndex((f) => f.id === flowId)
  return idx >= 0 ? FLOW_COLORS[idx % FLOW_COLORS.length] : null
}

/**
 * Zutatenliste als Ableitung der Chips: alle Karten-Chips (in Flow-Reihenfolge,
 * Farbe = Flow-Farbe) + freistehende Zutaten aus set_ingredients (neutral).
 * Identität über normalisierten Namen; gleiche Menge im gleichen Kontext
 * wird dedupliziert, verschiedene Mengen bleiben nebeneinander.
 */
export function deriveIngredients(cook: CookState): IngredientEntry[] {
  const byKey = new Map<string, IngredientEntry>()
  const entry = (name: string): IngredientEntry => {
    const key = name.trim().toLowerCase()
    let e = byKey.get(key)
    if (!e) {
      e = { key, name: name.trim(), uses: [] }
      byKey.set(key, e)
    }
    return e
  }
  const push = (name: string, amount: string, color: FlowColor | null) => {
    const e = entry(name)
    if (!e.uses.some((u) => u.color === color && u.amount === amount)) {
      e.uses.push({ amount, color })
    }
  }
  for (const flow of cook.flows) {
    const color = flowColorOf(cook, flow.id)
    for (const step of flow.steps) {
      for (const use of step.ingredients) push(use.name, use.amount, color)
    }
  }
  for (const ing of cook.ingredients) push(ing.name, ing.amount, null)
  return [...byKey.values()]
}

/**
 * Farb-Träger eines Listeneintrags: Linear-Gradient über die beteiligten
 * Flow-Farben, Anteile proportional zur Anzahl der Nutzungen pro Flow.
 * null = keine Flow-Nutzung (nur freistehend), Hex = genau ein Flow.
 */
export function ingredientGradient(uses: IngredientUseRef[]): string | null {
  const counts = new Map<FlowColor, number>()
  for (const u of uses) {
    if (u.color === null) continue
    counts.set(u.color, (counts.get(u.color) ?? 0) + 1)
  }
  const entries = [...counts.entries()]
  if (entries.length === 0) return null
  if (entries.length === 1) return COLOR_HEX[entries[0][0]]
  const total = entries.reduce((n, [, c]) => n + c, 0)
  let acc = 0
  const stops = entries.map(([c, n]) => {
    const from = (acc / total) * 100
    acc += n
    const to = (acc / total) * 100
    return `${COLOR_HEX[c]} ${from.toFixed(1)}% ${to.toFixed(1)}%`
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

/** Alle Mengen eines Eintrags (in Nutzungs-Reihenfolge, dedupliziert). */
export function entryAmounts(e: IngredientEntry): string[] {
  const out: string[] = []
  for (const u of e.uses) {
    if (u.amount && !out.includes(u.amount)) out.push(u.amount)
  }
  return out
}

/** Text zum Vorlesen: Beschreibung + die Mengen der Chips — die stehen
    absichtlich NICHT im Beschreibungstext, beim Sprechen gehören sie dazu. */
export function stepSpokenText(step: Step): string {
  const amounts = step.ingredients
    .filter((u) => u.amount)
    .map((u) => `${u.name} ${u.amount}`)
  if (amounts.length === 0) return step.description
  return `${step.description} Zutaten: ${amounts.join(', ')}.`
}

/** Chips einer Karte als kompakte Nennung (für Tool-Ergebnisse/Logs). */
export function ingredientUsesLabel(uses: IngredientUse[]): string {
  return uses.map((u) => (u.amount ? `${u.name} (${u.amount})` : u.name)).join(', ')
}
