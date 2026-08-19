# 0400 · Fix: StrangCard außerhalb von Cook definieren

**Prio: HOCH** — aktueller Bug: Expand funktioniert nicht beim ersten Klick

## Problem
`StrangCard` ist als Funktion *innerhalb* von `Cook` definiert.
Bei jedem reaktiven Update von `Cook` ändert sich die Funktionsreferenz →
SolidJS unmountet + remountet die Komponente → `<Show>`/`<For>` werden
als neue Computations außerhalb eines ReactiveRoot erstellt → reagieren nie.

## Fix
`StrangCard` als Top-Level-Komponente außerhalb von `Cook` definieren.
Benötigte Werte/Callbacks via Props übergeben:
- `tick: () => number`
- `previewStep: () => number | null`
- `setPreview: (idx: number | null) => void`
- `expanded: () => boolean`
- `toggleExpand: () => void`

## Hinweis
Wird mit 0200/0300 (Spec B2 Layout) ohnehin vollständig neu gebaut —
kann als Teil davon erledigt werden.
