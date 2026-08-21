# 3440 · Timer-Modell: abgeleitete Wartezeiten + Override (kein Timer-Objekt)

**Prio: MITTEL**

## Was
`Step.timer` (Spiegel-Timer + `gatesSelf`-Flag + `syncWaitTimers`-Kaskade)
komplett ersetzt: Wartezeiten sind eine **reine Ableitung aus den Fakten**
(`done`/`doneAt`/`timer_seconds` an den Kanten) und werden nie gespeichert.
Gespeichert wird nur noch, was Nutzer/KI explizit verlangen: `Step.override`
(`{alarmAt, pausedAt}`) — ein Timer gehört immer der Karte, auf der er liegt.

## Modell
- Kartenzustand ist IMMER abgeleitet: `blocked` = irgendeine Dep nicht done;
  `waiting` = effektives Ende (Kanten-Gates oder Timer) in der Zukunft;
  `active` sonst. Kein Code „setzt" den Progress — er fällt aus den Fakten.
- `set_timer` auf wartender Karte = ersetzt die Plan-Wartezeit;
  auf aktiver Karte = Sleep (die Karte selbst geht in den Wartezustand);
  auf blockierter/abgeschlossener Karte = Fehler.
- `pause` ohne Timer materialisiert die Plan-Wartezeit als Timer
  (friert ein); `resume` schlägt die Pausendauer auf `alarmAt` auf.
- `syncWaitTimers` + Max-Regel-Extension (3430) entfallen ersatzlos: neue,
  längere Bedingungen verlängern die Wartezeit automatisch, weil das Maximum
  stets frisch gerechnet wird.
- Einzige Wartung: `expireTimers` meldet ablaufende Timer (Toast/Alarm);
  abgeleitete Gates brauchen nichts (Übergangs-Toast im ±2-s-Fenster).
- Chips = eine pro wartender Karte (nicht mehr pro Timer-Objekt); Klick
  markiert die Karte selbst.

## Revision (nach Ghosttimer-Bug im Mock): Timer statt Override
Das Override-Konzept („explizite Übersteuerung + Plan greift nach Ablauf
wieder") war eine nie entschiedene Semantik und erzeugte den Ghost: Man
stellt 0:15 auf einer Karte mit 7-min-Plan-Wartezeit → Alarm nach 15 s,
danach übernahm der Plan wieder (6:45). Außerdem zeigte die UI `max(Plan,
Override)` statt des Overrides.

- [x] `Step.timer` = der gesetzte Timer (ersetzt das Override-Feld); setzen
      ÜBERSCHREIBT, Ablauf macht die Karte frei — kein Zurückfallen auf die
      Plan-Wartezeit. Abgelaufene Timer bleiben als Fakt stehen.
- [x] `cancel_timer` ersatzlos entfernt (kein Reset-Konzept).
- [x] `pendingUntil` zeigt Timer ?? Plan (nicht mehr max) — identisch zur
      Engine-Logik.
- [x] Warte-Menü-Commit gehärtet: Enter ruft commitMins direkt, editSecs
      wird beim Commit zurückgesetzt (kein Kleben alter Sekunden-Werte).
- [x] Design-Notiz Reset: falls je ein „zurück zum Plan" gewünscht wäre,
      braucht es KEIN startedAt — die Plan-Wartezeit ist eine reine Funktion
      der Fakten (doneAt + timer_seconds) und damit jederzeit frisch
      rekonstruierbar; Reset wäre schlicht Timer-löschen. Bewusst verworfen.
      Grenzfall: ändert sich doneAt (Trigger-Schritt zurückgenommen + neu
      abgeschlossen), liefert die Ableitung den Plan von JETZT, nicht das
      historische Original — das wäre nur mit gespeichertem Ende möglich,
      wird aber nicht gebraucht (der Koch will den aktuellen Plan).

## Tasks
- [x] `Step.timer` → `Step.override: TimerOverride | null`
- [x] `syncWaitTimers` entfernt (alle 10 Aufrufstellen), `syncTimers` raus
- [x] `queueOrder`/`stepState`: Zustand rein abgeleitet (queue-Memo liest tick)
- [x] Timer-Tools auf Override umgestellt (Fehler auf done/blocked)
- [x] `expireTimers`: Override-Sweep + Übergangs-Toast für abgeleitete Gates
- [x] Chips/Warte-Menü auf abgeleiteten Zustand
- [x] Migration: `gatesSelf:false`-Timer → Override (wenn in Zukunft),
      `gatesSelf:true`-Spiegel verworfen (fallen wieder aus den Kanten)
- [x] Prompt + spec.md umgeschrieben
- [x] `get_cook_state` um Zeit-Kontext ergänzt: `now_local` (lokale
      Gerätezeit mit Offset — enthält alles Nötige, kein Epoch nötig) +
      `waiting` (ref, `ends_in_s`, `ends_at_local`) — das Modell rechnet nie
      selbst mit Epoch-Werten; `set_timer` bleibt rein relativ

## Abhängigkeit
→ 3400 (Timer pro Schritt), ersetzt 3430 (Max-Regel)
