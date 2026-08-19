# 0200 · Mobile Layout: Strips + Schritt-Karte (Spec B2)

**Prio: HOCH**

## Was
Mobile: feste Strips für alle Stränge oben, eine große Schritt-Karte für den fokussierten Strang.

## Tasks
- [x] Strips-Komponente: `🍚 Summary · Timer · x/y`, 44px Tap-Target, kein Name (Emoji + Farbe)
- [x] Strips: feste Reihenfolge (Anlegereihenfolge), Dringlichkeit via Farbe/Puls
- [x] Strip-Tap → Fokus wechseln
- [x] Schritt-Karte: Header (Name + Timer + x/y) + Description (Markdown, scrollt vertikal)
- [x] Timer auf der Karte (Pill, wenn läuft)
- [x] ◀ ▶ Navigation + Dots (`○○●○○`)
- [x] ✓ Weiter Button (set_step; letzter Schritt → complete_strang)
- [x] Browse-Modus: ◀ ▶ zeigt Nachbarschritte, setzt nichts aktiv
- [x] Browse-Badge (`[später]` / `[bereits erledigt]`)
- [x] `● Aktuell`-Chip springt zurück zum aktiven Schritt
- [x] `↩ Hierhin`-Button (set_step)
- [~] Bei ≥ 4 Strängen: Schritttitel weglassen → **verworfen**, Summary wird nie weggelassen (Spec)

## Abhängigkeit
→ 0100 (Step-Datenmodell)
