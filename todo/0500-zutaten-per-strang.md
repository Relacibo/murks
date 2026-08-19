# 0500 · Zutaten: per Strang statt global

**Prio: HOCH** — Spec B2

## Was
Zutaten gehören zum Strang, nicht zur globalen CookState.

## Tasks
- [ ] `CookState.zutaten` entfernen, `Strang.zutaten` ergänzen
- [ ] `add_zutaten`: `strang_id` required
- [ ] `open_zutaten`: `strang_id` required
- [ ] `toggle_zutaten`: bleibt (id reicht, da global unique)
- [ ] Migration: bestehende globale Zutaten dem ersten Strang zuordnen
- [ ] UI: Zutaten-Button im Strang-Header statt global in Topbar
- [ ] Globale Einkaufsliste (alle aggregiert) als separate View — späteres Todo

## Abhängigkeit
→ State-Key-Bump (0100)
