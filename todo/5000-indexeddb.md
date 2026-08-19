# 5000 · IndexedDB-Migration (statt localStorage)

**Prio: NIEDRIG** — technisches Fundament für größere Datenmengen

## Warum
- localStorage: ~5MB Limit, synchron, kein strukturierter Query
- IndexedDB: unbegrenzt (praktisch), async, strukturierte Objekte
- Nötig für: Rezept-Sammlung, Session-History, große Rezepte

## Tasks
- [ ] Library evaluieren (idb, Dexie.js)
- [ ] Store-Migration: createStore + localStorage → IndexedDB
- [ ] Async-Wrapper für bestehende sync-Zugriffe
- [ ] Migration bestehender localStorage-Daten
- [ ] State-Key-Bump

## Hinweis
Sinnvoll NACH Sessions/Deeplinks (1200) angehen, da dann klar ist
welche Daten wie strukturiert werden müssen.
