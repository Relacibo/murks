# 3500 · Batches & Wiederholungen in Schritten („Loops")

**Prio: NIEDRIG** (Standardfall = Prosa, Mechanik nur wenn sie sich wirklich meldet)

## Was
Wiederholende Arbeit soll nicht in N Einzelschritte zerfallen („Pfannkuchen 1/2/3").
Standard: EIN Schritt, Menge als Prosa („8 Pfannkuchen ausbacken", „6 Toasts toasten").
Seltener Sonderfall mit Timing: mehrere identische Runden mit eigenem Timer —
3 Pizzen, Ofen EINMAL vorgeheizt, je 5 min pro Pizza. Dafür ein Runden-Zähler
an der Karte statt eines Engine-Loops.

## Warum
Pro-Iteration-Schritte sind Usability-Müll: zu feingranular abzuhaken, die
„Jetzt"-Queue flutet. Echte Loop-Konstrukte (repeat N) im Engine sind Overkill —
beim Kochen unterscheiden sich Iterationen fast nie in Abhängigkeiten oder Timern.

## Konzept
1. **Standard: Prosa** — System-Prompt-Regel: wiederholende Arbeit in einen
   Schritt bündeln, Menge in Titel/Beschreibung („Pfannkuchen ausbacken (8 Stück)").
   Kein neues Feld, keine Mechanik.
2. **Selten: Timer-Runden in einer Karte** — optional `rounds: N`, Karte zeigt
   „Runde 1/N"; erneutes set_timer rückt den Zähler weiter (Klick aufs Uhr-Icon
   oder neuer set_timer-Aufruf). Deckt den Pizza-Fall (3 × 5 min) und den
   Toaster-Fall (6 Toasts, 2 Slots → 3 Runden). Bewusst schlank: Zähler an der
   Karte, KEINE Engine-Zustandsmaschine.

## Nicht machen
- Lint gegen gleichnamige Sibling-Schritte (zu magisch — Prompt-Regel reicht)
- Loop-Expandierung in N Schritte (wäre genau das Feingranulare, das vermieden
  werden soll)
- quantity-Feld voreilig einführen — erst wenn Prosa nachweislich nicht reicht

## Offen
- [ ] Brauchen wir Runden überhaupt, oder decken Prosa + manuelles Re-Armen
      des Timers die seltenen Fälle? (erst bauen, wenn ein echter
      Pizza-/Toaster-Fall auftaucht)
- [ ] Manuelle Korrektur des Zählers (Runde übersprungen/vermasselt)?

## Abhängigkeit
→ 3490 (Planungs-Fakten an Schritten, gleiche Domäne)
