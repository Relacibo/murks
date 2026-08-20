# 0100 · Step-Datenmodell: description (summary entfernt)

**Prio: HOCH** — Fundament für alles andere in Spec B2

## Was
`steps: string[]` → `steps: Step[]` mit `{ description: string }` + `Strang.icon` (Emoji, LLM-vergeben).
`summary` wurde wieder entfernt: Karten sind immer ausgeklappt, Titel der „Jetzt"-Karten = Flow-Name; Timer-Chips/Toasts zeigen den Beschreibungsanfang.

## Tasks
- [x] `Strang.steps` in `store.ts` umstellen
- [x] Migration beim Laden: alte String-Steps → `{ description: s }`, altes `summary` als Fallback, wenn `description` leer
- [x] Alle `add_strang`-Tool-Calls in `tools.ts` anpassen
- [x] `add_step`-Tool: `description` statt `text`
- [x] KI-Prompt anpassen (Description beginnt mit kurzer Kernaussage — Titel in Timer-Chips; Strang bekommt Emoji)
- [x] CookMock-Daten updaten
- [x] State-Storage-Key bumpen (v2 → v3) wegen breaking change

## Hinweis
Bestehende Daten werden automatisch migriert (seit 5000: IndexedDB).
