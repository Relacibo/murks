# 0100 · Step-Datenmodell: title + description

**Prio: HOCH** — Fundament für alles andere in Spec B2

## Was
`steps: string[]` → `steps: Step[]` mit `{ title: string; description: string }`

## Tasks
- [ ] `Strang.steps` in `store.ts` umstellen
- [ ] Migration beim Laden: alte String-Steps → `{ title: s, description: "" }`
- [ ] Alle `add_strang`-Tool-Calls in `tools.ts` anpassen
- [ ] `add_step`-Tool: `title` + `description` statt `text`
- [ ] KI-Prompt anpassen (Schritte haben Titel + Beschreibung)
- [ ] CookMock-Daten updaten (echte Titel + Beschreibungen)
- [ ] State-Storage-Key bumpen (v2 → v3) wegen breaking change

## Hinweis
Bestehende Daten im localStorage werden automatisch migriert.
