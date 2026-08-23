# 9000 · Toasts dezenter: aus dem Weg statt mittig unten

**Prio: MITTEL**

## Was
Toasts liegen aktuell `fixed bottom-4` zentriert über der Composer-Bar
(z-[70]) und verdecken damit Eingabezeile, Mic/Stopp und Send/Gesprächsmodus
— bei mehreren gleichzeitigen Toasts stapeln sie sich über die Bedienelemente.

## Ziele
- Toasts sollen keine Interaktion blockieren: nicht über Composer/Input
  liegen, klickbar, aber kurzlebig und unaufdringlich
- Wichtig bleiben (Timer-Ablauf!), ohne den Hauptweg (Karte/Composer) zu verdecken

## Konzept (Vorschlag)
- Position: oben rechts/links unter der Topbar (`top-14 right-3`), oder am
  unteren Rand nur im leeren Desktop-Eck (wie der Lade-Badge in 3300) —
  mobil über dem Input statt darüber
- Gestapelt max. 2–3 sichtbar, ältere kollabieren zu einer Zeile („+2 …")
- Timer-Alarme unterscheidbar (Alarm-Icon/Akzentfarbe) statt generisches rot
- Auto-Dismiss beibehalten; Hover pausiert den Countdown; Tippen dismissen
- Pointer-Events nur auf dem Toast selbst — nichts daneben blockieren

## Tasks
- [ ] Position festlegen (Desktop-Ecke vs. mobil über Input) und CSS umstellen
- [ ] Stapel-Budget (max. N sichtbar, Rest als „+N"-Zusammenfassung)
- [ ] Alarm-Toasts visuell absetzen (Icon/Akzent), normale Toasts neutraler
- [ ] Z-Index prüfen: unter Modals bleiben, aber über Karten; Composer (z-[60]) frei lassen
- [ ] Mobile: nicht über Composer/Safe-Area

## Abhängigkeit
→ 3300 (Lade-Badge — gleiche „aus dem Weg"-Strategie)
