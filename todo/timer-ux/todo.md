# TODO: Timer-Verhalten in der Cook View

## Offene Fragen / zu klären

- **Mehrere Timer gleichzeitig**: Was passiert, wenn mehrere Timer zur selben Zeit auslösen? Reihenfolge? Priorisierung? Optik (Karten-Stapel? Chip-Alert)?

- **Ein Timer löst aus, man ist in einem anderen Schritt**: Was passiert?
  - Denkbar: **kein automatischer Kartenwechsel** — die auslösende Karte wird visuell deutlich (orange Alert-State im Chip + Karte), und der **Agent fragt**, ob man auf die offene Timer-Karte wechseln will.

- **Agent kennt den Karten-Zustand**: Der Agent sollte immer wissen,
  - welche Karten gerade offen sind (inkl. Timer-Karten),
  - welche abgeschlossen sind.
  → Zustand gehört in den Cook-State (nicht nur UI).

- **Fehler-Rücksprung**: Man muss bei einem Fehler (z.B. Schritt übersprungen, falsch abgehakt) zurückspringen können. Wie weit? Pro Strang? Global?

- **Agent darf Karten verändern**: Während des Kochens kann der Agent Karten hinzufügen, löschen und ändern (Schritte, Timer, Reihenfolge) — betrifft auch laufende Timer (abbrechen/ersetzen).

## Status

Offen — Entscheidung im Zuge der Cook-View-Implementierung (Cook-State + Tool-Calls).
