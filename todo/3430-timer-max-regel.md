# 3430 · Timer-Max-Regel: bestehenden Timer bei längerer Bedingung verlängern

**ÜBERHOLT durch 3440 (abgeleitete Wartezeiten)** — aber die Frage lebt in
anderer Form weiter:

- **Abgeleitete Wartezeit:** das Maximum (`max(doneAt + timer_seconds)`) wird
  bei jedem Lesen frisch gerechnet — eine neue, längere Bedingung verlängert
  die Wartezeit automatisch, ohne dass irgendwer einen Alarm verschiebt.
  Der imperative Verlängerungs-Code ist damit ersatzlos weg.
- **Override:** hier gilt die Max-Regel bewusst NICHT. Ein Override ist eine
  explizite Aussage („+1 min", „5 min ab jetzt") und wird von der Engine nie
  angefasst — geändert wird es nur auf Nutzer-Zuruf (Prompt-Regel). Kommt
  eine längere Bedingung dazu, berührt sie nur die abgeleitete Wartezeit.
- **Übergang:** läuft ein Override ab, während das abgeleitete Gate noch
  läuft, sammelt `expireTimers` es ein und die Karte wartet weiter auf die
  abgeleitete Zeit — der „nicht vor dem Plan freigeben"-Schutz steckt damit
  strukturell im abgeleiteten Anteil, nicht in einer Verlängerungslogik.

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
