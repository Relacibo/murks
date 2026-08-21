# 3470 · Timer-Edit-Screen: Sekundenanzeige nur beim Scrollen auf 15 s einrasten

**Prio: NIEDRIG (UI-Politur)**

## Problem
Im Warte-Menü zeigt die Sekunden-Anzeige immer 15-s-Schritte
(`Math.round(rest / 15) * 15`) — bei „12:47" springt die Anzeige also wild
(„random"), obwohl der Timer in Echtzeit läuft. Das Einrasten soll nur beim
aktiven Verstellen gelten (Klick/Wheel auf die Sekunden), die passive Anzeige
soll echte Sekunden zeigen.

## Konzept
- Passive Anzeige: echte Sekunden (`floor(restMs / 1000) % 60`), 1-s-Update
  über das bestehende tick-Signal.
- **Kein Klick-Steppen**: Klick auf die Sekunden öffnet die Text-Eingabe
  (wie bei den Minuten).
- Einrasten auf 15-s-Schritte (0/15/30/45) NUR beim Verstellen per Mausrad
  oder Drag-Scroll; Ausgangsbasis: aktuelle Restzeit.
- Minuten-Eingabe bleibt unverändert (absolut, 0–99).

## Tasks
- [ ] Anzeige-Sekunden in der Modal: `currentSecs()` entknappen, Snap nur im
      Wheel/Drag-Handler
- [ ] Sekunden-Klick → Text-Eingabe statt cycleSecs-Steppen
- [ ] Prüfen: kein Flackern durch tick-Update beim Editieren (editSecs hat
      Vorrang)

## Abhängigkeit
→ 3440 (derived-Wartezeiten — die Modal liest `pendingUntil`)
