# 0210 · Mobile: Fokus-Modus („iPod-Layout")

**Prio: MITTEL**

## Problem
Das Board zeigt alles gleichzeitig (Timer-Chips, Flows, Wartezeiten, Topbar) —
zu viel Information auf einmal. Das Design ist stimmig, aber Power-User-Dichte;
es fehlt FOKUS. Am besten fühlt es sich an, wenn eine Karte ganz groß mit
großem Text dasteht.

Murks ist **Mobile-First**: Desktop ist dasselbe Layout wie Mobile, hat nur
zusätzlich die einblendbare Übersicht (Flow-Spalten). Der Fokus-Modus gilt
daher überall — Desktop unterscheidet sich nur durch die Übersicht.

## Konzept (iPod-artig)
- **Mitte:** eine große Karte — großer Text, großer Timer: die aktive Karte.
- **Oben/unten:** kleine Elemente (Timer-Chips, kleine skalierte Karten der
  nächsten Schritte, Composer) — nichts konkurriert mit der großen Karte.
- Alternative: kleine skalierte Karten oben UND unten, große Karte mittig.
- Desktop identisch, plus Übersicht als optionaler Zusatz.

## Tasks
- [ ] Kurzbeschreibung (summary) für Karten zurückholen — ursprünglicher
      Plan: eingeklappte Karten zeigen nur die Kurzform; ausgeklappte Karten
      wurden später zur Norm. Für kleine skalierte Karten ist die Kurzform
      nötig (Step-Datenmodell + Agent-Prompt um `summary` ergänzen)
- [ ] Fokus-View: eine Karte groß mittig — Mobile UND Desktop (Desktop =
      Mobile + Übersicht, sonst nichts)
- [ ] Kleine Karten (skaliert) als Vorschau oben/unten
- [ ] Übersicht (Flow-Spalten) bleibt als einziger Desktop-Zusatz
      einblendbar — aber nicht der Default
- [ ] **„Liebling töten": das Konzept „alle Karten gleich groß" weicht der
      Größen-Hierarchie** — eine große aktive Karte dominiert, der Rest
      wird klein (die Übersicht selbst darf bleiben)

## Notizen
- Design-Pass ggf. mit Claude Sonnet — eng scoped: nur Darstellung in
  Cook.tsx/CSS; Engine, Tools, Voice-Logik sind Tabu
- „Ein Liebling töten" heißt NICHT: Übersicht abschaffen — sondern die
  Gleichheit: statt N gleichgroßer Karten eine Hierarchie aus großer
  aktiver Karte und kleinen Karten darum herum
