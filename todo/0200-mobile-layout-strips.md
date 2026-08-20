# 0200 · Mobile: „Jetzt"-View + „Flow"-View (Konzept C)

**Prio: HOCH** — ersetzt B2 (Strips + eine Karte)

## Was
Mobile: View „Jetzt" (alle aktiven Karten über alle Flows) + View „Flow" (Karten eines Flows, ≈ Desktop-Spalte). Keine Flow-Leiste mehr — Titel-Tap auf einer Karte öffnet die Flow-View.

## Tasks
- [x] „Jetzt"-View: nur aktive Karten (Abhängigkeiten erfüllt, nicht done), mehrere pro Flow möglich, flacher Stapel
- [x] „Flow"-View: Zurück-Button + Kartenstapel des Flows (done/active/blocked sichtbar)
- [x] Karten nie verschachtelt, klein, gestapelt (siehe Spec „Kartendesign")
- [x] ✓-Button (rund, nur Häkchen) = complete_step + Navigation; blockierte Karte: ✓ deaktiviert + „Wartet auf …"
- [x] Reihenfolge der „Jetzt"-Karten: Reihenfolge des Auftauchens — neu aktive Karten unten anhängen (activatedAt), KI kann nicht umsortieren
- [x] Flow-Chips-Leiste entfernt; Karten-Titel öffnet Flow-View

## Abhängigkeit
→ 0100 (Step-Datenmodell)
