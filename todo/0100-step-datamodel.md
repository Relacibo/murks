# 0100 · Step-Datenmodell: summary + description

**Prio: HOCH** — Fundament für alles andere in Spec B2

## Was
`steps: string[]` → `steps: Step[]` mit `{ summary: string; description: string }` + `Strang.icon` (Emoji, LLM-vergeben)

## Tasks
- [x] `Strang.steps` in `store.ts` umstellen
- [x] Migration beim Laden: alte String-Steps → `{ summary: s, description: "" }`
- [x] Alle `add_strang`-Tool-Calls in `tools.ts` anpassen
- [x] `add_step`-Tool: `summary` + `description` statt `text`
- [x] KI-Prompt anpassen (Schritte haben Summary + Beschreibung, Strang bekommt Emoji)
- [x] CookMock-Daten updaten (echte Titel + Beschreibungen)
- [x] State-Storage-Key bumpen (v2 → v3) wegen breaking change

## Hinweis
Bestehende Daten werden automatisch migriert (seit 5000: IndexedDB).
