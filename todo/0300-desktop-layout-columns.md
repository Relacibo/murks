# 0300 · Desktop Layout: Spalten pro Strang (Konzept C)

**Prio: HOCH**

## Was
Desktop: eine Spalte pro Strang (nur Gliederung — **keine Karte**), alle Schritt-Karten als flacher Stapel.

## Tasks
- [x] Spalten-Header: Emoji + Name (+ ✓ bei done) — reine Gliederung, keine Karte
- [x] Schritt-Karten vertikal gestapelt, **nie verschachtelt**
- [x] Alle Karten ausgeklappt (Description immer sichtbar)
- [x] Karten-Header: ⏱ Timer + x/y (kein Titel — Flow-Name steht im Spalten-Header)
- [x] Zustände: active (hervorgehoben), done (gedimmt, durchgestrichen), blocked (dashed + 🔒 + „Wartet auf …")
- [x] Mehrere Karten pro Strang können gleichzeitig Timer laufen lassen
- [x] Klick auf Karte = set_step (Navigation, kein Abschluss)
- [x] Spaltenreihenfolge fix (Anlegereihenfolge), horizontales Scrollen

## Verworfen
- B2-Variante „Spalte als Karte mit Unterkarten" (verschachtelt) — Commit `e6a6011` (v0.4.0)

## Abhängigkeit
→ 0100, 0200
