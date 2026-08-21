# 3460 · set_timer mit absolutem Wanduhr-Ziel (`at`) — VERWORFEN

**Status: verworfen** — Timer sind fast immer feste DAUERN (`seconds`/`delta_seconds`),
Wanduhr-Ziele gibt es nur beim Scheduling („fertig um 14:00"), und dort fällt die
Roundtrip-Drift (LLM-Latenz, 30–90 s) in die ohnehin vorhandene Unsicherheit:
transkription, variable Schritt-Dauern, der Mensch im Loop. So genau kann man es
einfach nicht machen — ein neuer Parameter + Parsing (HH:MM/ISO/Vergangenheit)
lohnt nicht.

Escape hatch, falls es je nervt: `set_timer(at: "HH:MM")` — Engine rechnet
`alarmAt = at − jetzt` im Ausführungsmoment, Drift = null. 10-Minuten-Fix.

## Problem (historisch)
„Stell den Timer auf 14:00" lief über selbst gerechnete Offsets: KI liest
`now_local`, rechnet Delta, `set_timer(seconds=…)` führt Latenz später aus →
Timer daneben.

## Konzept (verworfen)
- `set_timer` optional `at` (Wanduhr, lokale Gerätezeit, Formate „HH:MM" oder
  ISO mit Offset) — Engine löst im Ausführungsmoment auf.
- Vergangenheit → Fehler; Prompt-Regel „exakte Uhrzeit → `at`".
- Rückwärts-Scheduling bleibt Modell-Planung; Drift nur am ersten Anker.
