# 3400 · Mehrere Timer pro Strang

**Prio: NIEDRIG**

## Was
Ein Strang kann mehrere gleichzeitig laufende Timer haben
(z.B. „Teig 30min ruhen" + „Ofen vorheizen 15min").

## Tasks
- [ ] `Strang.timers: Timer[]` statt einzelner Timer-Felder
- [ ] `start_timer`: kann mehrere Timer anlegen
- [ ] `cancel_timer`: `timer_id` required
- [ ] UI: mehrere Timer-Pills auf der Karte
- [ ] Migration: bestehende Einzel-Timer → `timers[0]`

## Abhängigkeit
→ State-Key-Bump
