# 9000 · Toasts dezenter: aus dem Weg statt mittig unten

**Prio: MITTEL**

## Was
Toasts lagen `fixed bottom-4` zentriert über der Composer-Bar (z-[70]) und
verdeckten Eingabezeile, Mic/Stopp und Send/Gesprächsmodus — bei mehreren
gleichzeitigen Toasts stapelten sie sich über die Bedienelemente. Zusätzlich
feuerte jeder Tool-Call des Agenten einen eigenen Toast (Schedule-Bau =
ein Toast pro Strang).

## Ziele
- Toasts sollen keine Interaktion blockieren: nicht über Composer/Input
  liegen, klickbar, aber kurzlebig und unaufdringlich
- Wichtig bleiben (Timer-Ablauf!), ohne den Hauptweg (Karte/Composer) zu verdecken
- Eine Agent-Tool-Welle (ein Turn, z.B. kompletter Schedule-Bau) = EINE Meldung

## Konzept (umgesetzt)
- Position: über der Composer-Bar inkl. Strips — Cook misst die Bar-Höhe
  per ResizeObserver in `--composer-h` auf :root, Toasts positionieren sich
  per `calc(var(--composer-h, 0px) + 0.75rem)` darüber. Im externen
  Modus (keine Bar) ist die Variable 0 → Toasts ganz unten.
- Bündelung: `executeTool` sammelt Meldungen einer Welle in einen Sink
  (`toasts`-Array), `sendMessage` zeigt danach EINEN Toast
  (max. 3 Einträge sichtbar, Rest als „… (+N)").

## Offen
- [ ] Stapel-Budget: max. N gleichzeitig sichtbar, Rest als „+N"-Zusammenfassung
      (betrifft noch Timer-/Fehler-Toasts, die einzeln feuern)
- [ ] Alarm-Toasts visuell absetzen (Icon/Akzent), normale Toasts neutraler
- [ ] Z-Index prüfen: über Modals (z-50) sinnvoll für Kopieren-Feedback;
      über Karten ja, Composer bleibt frei (Toasts schweben darüber)

## Abhängigkeit
→ 3300 (Lade-Badge — gleiche „aus dem Weg"-Strategie)
