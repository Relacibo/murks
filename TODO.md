# Todos

- [ ] **Schritttexte vorlesen** — der aktive Schritt wird vom TTS vorgelesen (ggf. beim Aktiv-Werden). Möglicherweise vorgenerieren (pre-render der Sprachausgabe, damit sie sofort da ist).
- [x] **Mute-Button** — schaltet die Sprachausgabe stumm; solange gemutet wird kein TTS gemacht (STT/Voice-Erkennung bleibt unberührt). Mute betrifft NUR TTS — Timer-Alarmtöne bleiben an (Alarm = Sicherheitsnetz, Stimme = Komfort).
- [ ] **Timer-Ablauf-Sound** — wenn ein Timer abläuft, ertönt ein Sound (zusätzlich zum Toast). Läuft NICHT über den Mute-Button — Alarme bleiben immer an.
- [ ] **Desktop: Flow-Name-Klick blendet Übersicht ein** — klickt man im Desktop-Modus auf einen Flow-Namen und die Übersicht (Flow-Spalten) ist ausgeblendet, muss sie eingeblendet werden.
- [ ] **Timer-System überarbeiten** — **Implizite Kanten-Timer sind umgesetzt** (`timer_seconds` am `depends_on`-Eintrag, `Step.doneAt`; Karte sagt „ich komme X nach Abschluss dieser Karte"). Offen:
  - [x] Mehrere getimte Bedingungen: den **maximalen Timer** nehmen (der zuletzt ablaufende bestimmt, wann die Karte frei wird); Countdown zeigt den Maximalwert. Gilt auch für die implizite Variante.
  - [x] Während dem Braten nach 5 min einen Schritt hinzufügen — der Brat-Timer (`set_timer`) läuft einfach weiter.
  - [x] Spaghetti + Soße ungefähr gleichzeitig fertig: unterschiedliche Offsets an derselben Kante (Soße +0, Spaghetti +10).
  - [ ] Verknüpfung an einen **laufenden** Timer (z.B. „wenn der Timer bei 5 min ist") — negative Offsets / Bedingungen statt fester Verzögerung.
