# TODO: Timer-Verhalten in der Cook View

## Gelöst

- **Mehrere Timer gleichzeitig**: Alle laufenden Timer sind parallel in der Topbar-Leiste sichtbar (Countdown in Strangfarbe, gelb <2min, rot + 🔔 abgelaufen); Auslösung betrifft nur den jeweiligen Strang
- **Ein Timer löst aus, man ist woanders**: Kein automatischer Kartenwechsel — der Strang wird visuell deutlich (rote Karten-Border + „Timer abgelaufen! Jetzt: …", roter Chip), die Topbar-Leiste zeigt 🔔; ein Tipp springt hin
- **Agent kennt den Karten-Zustand**: `get_cook_state` liefert Stränge, Schritte, Timer, Zutaten — der Agent weiß immer, was offen/fertig ist
- **Fehler-Rücksprung**: Schritt-Punkte als Vorschau + „Schritt X aktiv setzen" (set_step), auch rückwärts

## Offen

- **Agent darf Karten vollständig verändern**: `set_step`, Timer, `complete_strang`, `focus_strang`, Zutaten existieren — aber `update_strang` (Schritte/Timer/Reihenfolge ändern) und `remove_strang` (löschen) fehlen (siehe todo/cook-ux/todo.md)
