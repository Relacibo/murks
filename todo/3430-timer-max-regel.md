# 3430 · Timer-Max-Regel: bestehenden Timer bei längerer Bedingung verlängern

**Prio: NIEDRIG (seltener Fall)**

## Was
Hat eine wartende Karte mehrere getimte Kanten, zählt die zuletzt ablaufende
(max). Lücke: `syncWaitTimers` materialisierte einen Timer nur, wenn noch
keiner existierte — kam NACH der Materialisierung eine neue, längere
Bedingung dazu (update_step/add_step), blieb der alte (zu kurze) Timer stehen
und die Karte wurde zu früh aktiv.

## Entscheidung
Eine Karte hat weiterhin **genau einen** Timer. Der Countdown läuft immer bis
zum maximalen Gate-Ende — läuft ein Gate dazwischen ab, ändert sich nichts
(vorhersehbar, auch wenn der Countdown dann „nur" weiterläuft). Die
Alternative (Countdown bis zum kürzesten verbleibenden Gate) wäre logisch
korrekt, aber verwirrend, weil der Timer an Zwischenpunkten neu anlaufen
müsste. Verworfen.

## Tasks
- [x] `syncWaitTimers`: läuft schon ein `gatesSelf`-Timer und das abgeleitete
      Ende liegt später, `durationMs` um die Differenz verlängern (wirkt auch
      pausiert, da die Verschiebung auf das effektive Ende wirkt); kürzere
      Bedingungen ändern nichts
- [x] `cancel_timer` vereinfacht: Timer löschen + `syncWaitTimers` — auf
      wartenden Karten kommt die ABGELEITETE Wartezeit zurück (Reset auf die
      letzte Gate-Endzeit = „die höchste Zeit", specconform), auf aktiven
      Karten werden Abhängige frei. Vorher startete der Reset die volle
      nominale `max(timer_seconds)` ab jetzt neu (verstrichene Zeit ging
      verloren; auf aktiven Karten mit abgelaufenen getimten Kanten startete
      er sogar versehentlich die eigene Wartezeit neu). `originalWaitDurationMs`
      ersatzlos entfernt.
