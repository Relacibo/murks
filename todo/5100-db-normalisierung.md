# 5100 · DB-Normalisierung (IndexedDB statt Mono-Struct)

**Prio: NIEDRIG** — technisches Fundament, kein Nutzer-Feature

## Was

Der komplette App-State liegt als **ein Struct unter einem Key** in
IndexedDB (`dbPut` schreibt alles, `dbGet` liest alles). Ziel: soweit mit
IndexedDB sinnvoll normalisieren — getrennte Stores/Keys je Bereich —
damit gezieltes Lesen/Schreiben möglich wird und nicht bei jeder Änderung
der Gesamt-State persistiert wird.

## Konzept

- Stores: `config` (Config/Agent/STT/TTS), `cook` (Flows/Ingredients),
  `messages` (Chat-Verlauf), später `recipes` (→ 7400), `secrets` (→ 5400)
- Persistenz je Bereich: nur Deltas schreiben statt Full-State-Save
- Hydration: pro Bereich async, `stateReady` bleibt globales Gate
- Migration: einmalig beim Start das bestehende Mono-Struct zerlegen
  (bzw. verwerfen, wie beim localStorage-Cleanup in → 5000)

## Tasks

- [ ] `db.ts`: Store pro Bereich, generische get/put-Helfer
- [ ] store.ts: Persistenz auf Deltas je Bereich umstellen
- [ ] Hydration je Bereich + Fehlerisolierung (ein kaputter Store
      killt nicht die ganze App)
- [ ] Migration bestehender Daten (oder bewusster Verwerf-Pfad)

## Abhängigkeit

→ 5000 (IndexedDB-Basis, erledigt), 7400 (Rezept-Sammlung), 5400 (Secrets)
