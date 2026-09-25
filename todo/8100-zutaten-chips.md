# 8100 · Zutaten als Chips (in Text + Liste)

**Prio: ERLEDIGT (2026-09-25)**

## Was (umgesetzt)
Zutaten sind strukturierte Chips mit Menge — klickbar, Liste als Ableitung:

- **Modell:** `Step.ingredients[]` (`{name, amount}`) — Mengen leben im Chip,
  nicht im Schritttext. Agent setzt sie via `ingredients`-Parameter bei
  `add_flow`/`add_step`; `update_step` ersetzt die Chips komplett.
- **Karten:** Chips unter dem Beschreibungstext, Flow-Farbe via `data-color`
  der Karte; **Klick blendet die Menge ein** (toggle, pro Chip).
- **Zutaten-Modal als Ableitung:** `deriveIngredients()` gruppiert alle
  Karten-Chips über normalisierte Namen, dedupliziert pro Kontext (gleiche
  Menge im gleichen Strang). Freistehende Zutaten (`set_ingredients`, jetzt
  nur noch für Grundausstattung ohne Schritt-Zuordnung) erscheinen neutral.
- **Farben von der App berechnet:** Karten-Chips = Flow-Farbe; Liste =
  Farb-Gradient über die beteiligten Stränge, **Anteile proportional zur
  Nutzungshäufigkeit** (`ingredientGradient()`, Farb-Hex = --flow-border-Werte).
- **TTS:** Mengen werden mit vorgelesen (`stepSpokenText()`: Beschreibung +
  „Zutaten: Mehl 250 g, …") — auto-vorlesen, pregenCard, show_step speak.
- **Serialisierung:** Rezept-Links speichern Chips pro Schritt
  (`step.ingredients`); Top-Level-`ingredients` (alte Links) → freistehend.
  Import tolerant (ungültige Chip-Einträge fallen weg).
- **Export:** Markdown-Checkliste aus der Ableitung (`- [ ] Name — Menge1, Menge2`).

## Dateien
- `src/lib/ingredients.ts` — Ableitung, Gradient, Spachtext (neu)
- `src/components/IngredientChip.tsx` — Karten-Chip (neu)
- `src/components/IngredientsModal.tsx` — abgeleitete Liste
- `src/lib/tools.ts` — `ingredientsSchema` an add_flow/add_step/update_step,
  set_ingredients neu (nur freistehend), start_new_recipe-Ablauf
- `src/lib/cookEngine.ts` — Parsing, split_step (`ingredients: []`),
  speak mit Mengen
- `src/state/store.ts` — Typen + Hydration-Sanitizer (Legacy ohne Chips = [])
- `src/lib/serializeRecipe.ts` / `src/lib/recipeImport.ts` — Chips im Format
- `src/index.css` — `.ing-chip` (Klick/Menge/neutral)
- `src/pages/CookMock.tsx` — Mock mit Chips (inkl. Öl in zwei Strängen → Gradient)

## Bewusste Abweichung von der ursprünglichen Fragestellung
Kategorien (Gemüse/Milchprodukt/…) verworfen — der Agent müsste sie fälschbar
vergeben. Stattdessen Flow-Farben: berechenbar, stabil, ohne Prompt-Aufwand
(vgl. alte „Offene Fragen" hier unten).

## Archiv der ursprünglichen Fragen
- ~~Farb-Mapping: Kategorien oder neutral?~~ → Flow-Farben, von der App berechnet
- ~~Chips im Text: welches Markup?~~ → kein Markup im Text; Chips hängen
  strukturiert am Schritt (`ingredients[]`)
- ~~Klick auf Chip = was?~~ → Menge ein/ausblenden (das Kern-Feature)
