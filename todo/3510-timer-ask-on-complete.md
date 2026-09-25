# 3510 · Timer vom Nutzer stellen lassen (Ask-on-Complete)

**Prio: MITTEL**

## Was
Option „Timer muss vom Benutzer gestellt werden": Ist sich das LLM bei der
Wartezeit unsicher, hängt es an der Kante eine Ask-Markierung (plus sinnvoller
Vorgabe). Beim Abhaken der auslösenden Karte poppt der Timer-Editor auf —
vorausgefüllt mit dem Vorschlag, der Nutzer bestätigt oder korrigiert.
Erst nach dem Bestätigen beginnt die Wartezeit (Karte wird wartend).

## Hintergrund
Heute muss der Agent JEDE Zeitangabe als `timer_seconds` an die Kante
schreiben — bei unsicherer Dauer raten („Quelle: „ca. 10–20 Minuten").
Der Timer läuft dann falsch, alarmiert zu früh/spät und der Nutzer muss
hinterher manuell korrigieren (set_timer im Wait-Menü). Besser: Unsicherheit
explizit modellieren und den Moment des Abhakens nutzen — der Nutzer weiß
genau dann, was er gerade in die Pfanne/Ofen getan hat.

## Konzept
- **Modell am Edge** (Wartezeit lebt dort, konsistent mit `timer_seconds`):
  `depends_on`-Eintrag bekommt z.B. `timer_ask: true`; `timer_seconds` bleibt
  als **Vorgabe** stehen (kann grob sein). Alternativ `timer_mode: 'fixed' | 'ask'`.
- **Abhaken (Check-Button)**: existiert eine Folgekarte mit Ask-Kante →
  statt sofortigem Abschluss-Freigeben öffnet der Timer-Editor (WaitMenu-
  Variante) mit Vorgabe vorausgefüllt; Bestätigung = `set_timer` auf der
  Folgekarte + Abschluss. Mehrere Ask-Folgekarten → nacheinander (Offen).
- **Vorgabe sichtbar**: Editor zeigt „Vorschlag: 15 min" — direkt bestätigbar
  (großer ✓-Button), Ändern bleibt die Ausnahme.
- **Agent-Loop**: `complete_step` auf einer Karte mit Ask-Folgekarte:
  Optionen (a) Tool-Ergebnis sagt „warte auf Nutzer-Eingabe am Editor",
  (b) Popup erscheint trotzdem (Nutzer sitzt davor). Ergebnis-Feld reicht
  als Info; Verhalten (Offen).
- **Lint**: Beschreibung mit Zeitangabe + Ask-Kante ist LEGAL (kein Warning) —
  die unsichere Zeit steckt ja in der Vorgabe.
- **get_cook_state**: Ask-Kanten als solche sichtbar machen (Agent weiß dann,
  dass der Nutzer die Dauer stellen wird — nicht nachfragen/set_timer).
- Kein neues UI-Prinzip: Editor ist dieselbe Minuten/Sekunden-Maske wie im
  Wait-Menü, nur als „Bestätigen mit Vorschlag"-Dialog.

## Tasks
- [ ] Schema: `timer_ask` (oder timer_mode) in `depends_on` (depRefSchema +
      addFlowDepRefSchema), Tool-Beschreibungen (wann ask statt fixed raten)
- [ ] Engine: Ask-Kante durchreichen (StepRef), complete_step-Hook → Modal-
      Request an UI statt sofortiger Freigabe der Folgekarte
- [ ] UI: Editor-Dialog am Abhaken (Vorgabe vorausgefüllt, bestätigen/ändern);
      mehrere Ask-Folgekarten: Queue der Dialoge
- [ ] complete_step-Tool-Ergebnis um Hinweis ergänzen (Agent-Loop)
- [ ] Lint-Anpassung (Zeitangabe + Ask-Kante = ok)
- [ ] get_cook_state: Ask-Kanten repräsentieren

## Offen
- [ ] Verhalten bei Agent-Abschluss (complete_step): Popup auch dort, oder
      meldet das Tool nur „Nutzer muss Timer stellen"?
- [ ] Mehrere Ask-Folgekarten: nacheinander Dialoge oder ein Dialog pro Kante?
- [ ] Ask-Karte ohne Vorgabe (timer_seconds fehlt): Editor leer starten?
- [ ] Ohne Interaktion (Nutzer weg): Vorgabe nach X Sek. automatisch übernehmen?

## Abhängigkeit
→ Timer-Editor existiert (WaitMenu, Minuten/Sekunden-Maske) — Wiederverwendung
→ 3430 (Timer-Max-Regel) gilt auch für die Vorgabe
