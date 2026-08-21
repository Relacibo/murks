# 3420 · Timer-UI: Scroll auf Mobile, Eingabe auf Desktop

**Prio: MITTEL**

## Was

Im Warte-Menü sollen Minuten **und** Sekunden auf Mobile per Scroll
(Touch-Drag-Wheel) einstellbar sein — wie ursprünglich vorgesehen. Aktuell:
Minuten nur per Tap → Texteingabe, Sekunden nur per Klick/Wheel in
15-Sekunden-Schritten (Touch-Geräte haben kein Wheel). Desktop: direkte
Eingabe — vermutlich schon funktionierend, verifizieren.

## Tasks

- [ ] Mobile: Minuten-Scroller (Touch-Drag), analog zu Sekunden
- [ ] Desktop: Eingabe für Minuten verifizieren, ggf. Sekunden-Eingabefeld ergänzen
- [ ] Umschaltung Scroll (Touch) vs. Input (Desktop) z.B. via
      `pointer: coarse/fine`-Media-Query — kein Modus-Umschalten nötig
- [ ] 15-Sekunden-Raster beibehalten oder freie Sekunden erlauben? (klären)

## Abhängigkeit

→ 3400 (Timer pro Schritt, erledigt)
