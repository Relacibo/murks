# 3450 · Score-Scheduling (Fallback bei Fehlplatzierung)

**Prio: BEDINGT** — nur aktiv, wenn die KI die Platzierung nicht zuverlässig trifft

## Was

`Step.score` (flach, agent-managt) sortiert die aktive Queue. Entscheidende Regel:
Der hohe Score gehört auf die Karte **vor** der Wartezeit (deren Abschluss den Timer
startet), nicht auf die wartende Karte.

## Bedingung

Beobachten, ob die KI die Teig-Situation zuverlässig richtig sortiert:
„Mehl und Eier verrühren" (→ 30 min Ruhen) vor „Zwiebeln schneiden". Verfehlt sie
die Platzierung regelmäßig, umstellen auf:

1. **Hybrid:** abgeleiteter Basiswert aus dem kritischen Pfad (max. Verzögerungskette
   über die Kanten) + expliziter `score` als Aufschlag/Override — automatisch korrekt
   und steuerbar.
2. **Rekursiv abgeleitet:** Score ganz aus dem Graphen berechnen — garantiert richtig,
   aber unsichtbar und blind für Weltwissen („Zwiebeln passen in die Ruhezeit-Lücke").

## Erwägungen (Stand der Diskussion)

- Agent-managt: Kontext/Weltwissen + Sichtbarkeit + Steuerbarkeit — aber fehleranfällig
  bei der Platzierung, verfällt bei Graph-Änderungen, willkürliche Skala.
- Rekursiv: automatisch aktuell und konsistent (echte Zeiten), weniger Oberfläche —
  aber nicht steuerbar, nicht nachvollziehbar, kein Kontext.
- `priority: high` ist für Scheduling verbrannt: pulsiert (Alarm) + Ein-Dep-Regel.
