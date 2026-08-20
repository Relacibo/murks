# 3400 · Mehrere Timer pro Strang (Timer pro Schritt)

**Prio: NIEDRIG**

## Was
Ein Strang kann mehrere gleichzeitig laufende Timer haben — umgesetzt als **Timer pro Schritt (Karte)**:
mehrere Schritte eines Strangs können parallel Timer laufen lassen.

## Tasks
- [x] `Step.timerEndsAt / timerInstruction / timerExpired` (statt `Strang.timer*`)
- [x] `start_timer`: `strang_id` + `step_index`
- [x] `cancel_timer`: `strang_id` + `step_index`
- [x] UI: Timer in der Schritt-Karte + Topbar-Chips (Emoji + Beschreibungsanfang + Zeit)
- [x] Migration: alter Strang-Timer → Timer des aktiven Schritts
- [x] `complete_step` / `complete_strang` brechen Schritt-Timer ab
- [x] `expireTimers` über alle Schritte, Toast mit Strang + Beschreibungsanfang

## Abhängigkeit
→ 0100
