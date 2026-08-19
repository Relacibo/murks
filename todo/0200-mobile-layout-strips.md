# 0200 · Mobile Layout: Strips + Schritt-Karte (Spec B2)

**Prio: HOCH**

## Was
Mobile: feste Strips für alle Stränge oben, eine große Schritt-Karte für den fokussierten Strang.

## Tasks
- [ ] Strips-Komponente: `▍ Name · Schritttitel · Timer · x/y`, 44px Tap-Target
- [ ] Strips: feste Reihenfolge (Anlegereihenfolge), Dringlichkeit via Farbe/Puls
- [ ] Strip-Tap → Fokus wechseln (Animation: Accordion)
- [ ] Schritt-Karte: Titel (groß) + Beschreibung (scrollt vertikal)
- [ ] Timer auf der Karte (wenn läuft)
- [ ] ◀ ▶ Navigation + Dots (`○○●○○`)
- [ ] ✓ Weiter Button (setzt Schritt aktiv)
- [ ] Browse-Modus: ◀ ▶ zeigt Nachbarschritte, setzt nichts aktiv
- [ ] Browse-Badge (`[später]` / `[bereits erledigt]`)
- [ ] `● Aktuell`-Chip springt zurück zum aktiven Schritt
- [ ] `↩ Hierhin springen`-Button (set_step)
- [ ] Bei ≥ 4 Strängen: Schritttitel in Strips weglassen

## Abhängigkeit
→ 0100 (Step-Datenmodell)
