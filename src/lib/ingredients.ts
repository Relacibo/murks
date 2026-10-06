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
 * Identität über normalisierten Namen; JEDE Nutzung zählt (Summen!). 
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
    entry(name).uses.push({ amount, color })
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

/** Mengen zusammenaddieren (8100): gleiche Einheiten werden pro Zutat summiert,
    verschiedene Einheiten bleiben als eigene Summen nebeneinander.
    "250 g" + "50 g" → "300 g"; "100 g" + "1 EL" → "100 g + 1 EL".
    Nicht interpretierbare Mengen ("nach Geschmack") bleiben dedupliziert stehen. */
const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gr: 'g', gramm: 'g',
  kg: 'kg',
  ml: 'ml', milliliter: 'ml',
  l: 'l', liter: 'l',
  el: 'EL', esslöffel: 'EL', essloeffel: 'EL',
  tl: 'TL', teelöffel: 'TL', teeloeffel: 'TL',
  prise: 'Prise', prisen: 'Prise',
  stück: 'Stück', stueck: 'Stück', stk: 'Stück',
  zehe: 'Zehe', zehen: 'Zehe',
  bund: 'Bund', dosen: 'Dosen', dose: 'Dose', glas: 'Glas', gläser: 'Glas',
  packung: 'Packung', pack: 'Packung', becher: 'Becher', zweige: 'Zweige', blatt: 'Blatt',
}

const VULGAR: Record<string, number> = {
  '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125, '⅜': 0.375, '⅝': 0.625, '⅞': 0.875,
}

const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einen: 1, einem: 1, einer: 1, zwei: 2, drei: 3,
}

/** Zahl am String-Anfang: Bruch, Unicode-Bruch, Dezimal (Punkt oder Komma) oder Wortzahl */
function parseNumber(s: string): { value: number; raw: string } | null {
  const frac = s.match(/^(\d+)\s*\/\s*(\d+)/)
  if (frac) return { value: Number(frac[1]) / Number(frac[2]), raw: frac[0] }
  const vulgar = s.match(/^[½¼¾⅓⅔⅛⅜⅝⅞]/)
  if (vulgar) return { value: VULGAR[vulgar[0]], raw: vulgar[0] }
  const dec = s.match(/^(\d+(?:[.,]\d+)?)/)
  if (dec) return { value: Number.parseFloat(dec[1].replace(',', '.')), raw: dec[1] }
  const word = s.match(/^(ein|eine|einen|einem|einer|zwei|drei)\b/)
  if (word) return { value: NUMBER_WORDS[word[1]], raw: word[1] }
  return null
}

function parseAmount(raw: string): { value: number; unit: string } | null {
  const s = raw.trim().toLowerCase()
  if (!s) return null
  const num = parseNumber(s)
  if (num === null || !Number.isFinite(num.value)) return null
  const unitRaw = s.slice(num.raw.length).trim().split(/\s+/)[0]?.replace(/[().,]/g, '') ?? ''
  return { value: num.value, unit: UNIT_ALIASES[unitRaw] ?? unitRaw }
}

function fmtAmount(v: number): string {
  const rounded = Math.round(v * 100) / 100
  return String(rounded).replace('.', ',')
}

export function sumAmounts(amounts: string[]): string[] {
  const sums = new Map<string, number>()
  const passthrough: string[] = []
  for (const raw of amounts) {
    const parsed = parseAmount(raw)
    if (parsed === null) {
      const clean = raw.trim()
      if (clean && !passthrough.includes(clean)) passthrough.push(clean)
      continue
    }
    sums.set(parsed.unit, (sums.get(parsed.unit) ?? 0) + parsed.value)
  }
  const out = [...sums.entries()].map(([unit, total]) => `${fmtAmount(total)}${unit ? ` ${unit}` : ''}`)
  return [...out, ...passthrough]
}

/** Mengen eines Eintrags, pro Einheit zusammenaddiert (Einkaufsliste). */
export function entryAmounts(e: IngredientEntry): string[] {
  return sumAmounts(e.uses.map((u) => u.amount))
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
