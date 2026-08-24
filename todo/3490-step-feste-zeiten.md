# 3490 · Feste Zeiten an Schritten fürs Scheduling

**Prio: NIEDRIG (optional)**

## Was
Schritte können eine feste geplante Zeit tragen (geplanter Start oder Ziel-Uhrzeit),
damit die KI leichter vor- und rückwärts planen kann: „Wir essen um 18:00" →
Modelle rechnen zurück, wann welcher Schritt starten muss, und schreiben die
Zeiten als Fakten an die Karten statt sie im Kopf zu behalten.

## Konzept (Idee)
- Optionales Feld am Schritt, z.B. `planned_at: "17:30"` (Wanduhr, lokal) —
  vom Agenten beim Planen gesetzt (add_flow/update_step), nicht vom Nutzer
- Anzeige in der Karte/Chips: „geplant 17:30" als stiller Hinweis; überfällig
  (> geplant + Puffer) → dezente Warnung (kein Alarm — dafür ist priority da)
- Scheduling bleibt Modell-Planung: Zeiten sind Planungs-Fakten, keine
  Timer-Mechanik (Timer = timer_seconds/set_timer, unverändert)
- Abgrenzung zu 3460 (verworfen): dort ging es um exakte Timer-Ziele mit
  Drift-Problem — hier um grobe Planzeiten, wo Minuten-Drift egal ist

## Offen
- [ ] UI: wo und wie anzeigen (Band? Chip? eigener Tag am Kartenkopf?)
- [ ] Muss der Nutzer die Zeiten sehen oder nur die KI (get_cook_state)?
- [ ] Lint: geplante Zeiten vs. getimte Kanten — Widersprüche melden?

## Abhängigkeit
→ 3460 (verworfen, aber gleiche Domäne)
