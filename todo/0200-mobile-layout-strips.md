# 0200 · Mobile: „Jetzt"-View + „Flow"-View (Konzept C)

**Prio: HOCH** — ersetzt B2 (Strips + eine Karte)

## Was
Mobile: View „Jetzt" (alle aktiven Karten über alle Flows) + View „Flow" (Karten eines Flows, ≈ Desktop-Spalte). Flow-Leiste oben (alle Flows, wie B-Strips).

## Tasks
- [x] Flow-Leiste: alle Flows oben (Emoji + Name, done gedimmt), Tap → Flow-View
- [x] „Jetzt"-View: nur aktive Karten (Abhängigkeiten erfüllt, nicht done), mehrere pro Flow möglich, flacher Stapel
- [x] „Flow"-View: Zurück-Button + Kartenstapel des Flows (done/active/blocked sichtbar)
- [x] Karten nie verschachtelt, klein, gestapelt (siehe Spec „Kartendesign")
- [x] ✓ Weiter = complete_step + Navigation; blockierte Karte: ✓ deaktiviert + „Wartet auf …"
- [~] Reihenfolge der „Jetzt"-Karten: **offen** (aktuell Anlegereihenfolge)

## Abhängigkeit
→ 0100 (Step-Datenmodell)
