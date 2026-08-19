# 3000 · Fehlende Strang-Tools: update, remove, merge

**Prio: MITTEL-NIEDRIG**

## Was
- `update_strang(strang_id, patch)`: Schritte/Timer/Reihenfolge ändern
- `remove_strang(strang_id)`: Strang löschen
- `merge_strang(a_id, b_id, name?, steps?)`: zwei Stränge zusammenführen
  (z.B. Teig + Füllung → Fertigstellen)

## Offene Fragen bei merge
- Timer beim Merge: längsten übernehmen? Neuen setzen?
- Schritte kombinieren: anhängen oder mischen?

## Tasks
- [ ] `update_strang` in tools.ts + Store
- [ ] `remove_strang` in tools.ts + Store
- [ ] `merge_strang` in tools.ts + Store (Konzept erst klären)
- [ ] Tools in KI-Prompt dokumentieren
