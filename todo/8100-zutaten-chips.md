# 8100 · Zutaten als Chips (in Text + Liste)

**Prio: NIEDRIG**

## Was
Zutaten werden nicht nur als Text dargestellt, sondern als (farblich
unterschiedliche) Chips:

- **In der Zutatenliste (Modal):** jede Zutat als Chip — Name + Menge,
  Farbe ggf. nach Kategorie (Gemüse, Milchprodukt, Gewürz, …) oder neutral.
- **In den Schritt-Beschreibungen:** Zutatennamen im Markdown-Text als
  Chips rendern (z.B. „250 g **Mehl**" → Mehl als farbiger Chip).

## Offene Fragen
- Farb-Mapping: Kategorien (wer vergibt sie — Agent, feste Liste?) oder
  neutral ohne Farbe? Flow-Farbe wäre irreführend (Zutaten ≠ Strang).
- Chips im Text: welches Markup (fett, custom `[[zutat]]`, …) und wie
  erkennen, ohne das Rendering zu verlangsamen?
- Klick auf Chip = was? (Hervorheben der Zutat in der Liste? Nichts?)

## Abhängigkeit
→ 0500 (Zutaten per Strang) — erst dann sind Kategorien/Aggregation sinnvoll.
