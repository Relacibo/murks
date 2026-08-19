# 5000 · IndexedDB-Migration (statt localStorage)

**Prio: NIEDRIG** — technisches Fundament für größere Datenmengen

## Warum
- localStorage: ~5MB Limit, synchron, kein strukturierter Query
- IndexedDB: unbegrenzt (praktisch), async, strukturierte Objekte
- Nötig für: Rezept-Sammlung, Session-History, große Rezepte

## Tasks
- [x] Library evaluieren (idb, Dexie.js) → **kein Dependency nötig**: eigener Mini-Wrapper
      `src/lib/db.ts` (~40 Zeilen, 1 ObjectStore, 1 Key) reicht — idb/Dexie wären Overkill
- [x] Store-Migration: createStore + localStorage → IndexedDB
- [x] Async-Wrapper für bestehende sync-Zugriffe: Hydration beim Start (async),
      `stateReady`-Signal, Splash in App.tsx, persist per debounced Save (300ms)
- [x] Migration bestehender localStorage-Daten → **Legacy-Pfad wieder entfernt** (Cleanup):
      IndexedDB ist die einzige Quelle; alter localStorage-State wird verworfen
- [x] State-Key-Bump → entfällt (IndexedDB hat keinen Key)

## Hinweis
- Import/Export (5200) sollte später auf die IndexedDB aufsetzen.
