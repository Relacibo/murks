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
  `waiting` = effektives Ende (Kanten-Gates oder Override) in der Zukunft;
  `active` sonst. Kein Code „setzt" den Progress — er fällt aus den Fakten.
- `set_timer` auf wartender Karte = Übersteuerung der abgeleiteten Wartezeit;
  auf aktiver Karte = Sleep (die Karte selbst geht in den Wartezustand);
  auf blockierter/abgeschlossener Karte = Fehler.
- `pause` ohne Override materialisiert die abgeleitete Wartezeit als Override
  (friert ein); `cancel_timer` = Override löschen → abgeleitete Wartezeit
  übernimmt sofort (Reset).
- `syncWaitTimers` + Max-Regel-Extension (3430) entfallen ersatzlos: neue,
  längere Bedingungen verlängern die Wartezeit automatisch, weil das Maximum
  stets frisch gerechnet wird.
- Einzige Wartung: `expireTimers` sammelt abgelaufene Overrides ein (Toast);
  abgeleitete Gates brauchen nichts (Übergangs-Toast im ±2-s-Fenster).
- Chips = eine pro wartender Karte (nicht mehr pro Timer-Objekt); Klick
  markiert die Karte selbst.

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
