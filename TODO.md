# Todos

- [ ] **Schritttexte vorlesen** — der aktive Schritt wird vom TTS vorgelesen (ggf. beim Aktiv-Werden). Möglicherweise vorgenerieren (pre-render der Sprachausgabe, damit sie sofort da ist).
- [ ] **Mute-Button** — schaltet die Sprachausgabe stumm; solange gemutet wird kein TTS gemacht (STT/Voice-Erkennung bleibt unberührt).
- [ ] **Timer-Ablauf-Sound** — wenn ein Timer abläuft, ertönt ein Sound (zusätzlich zum Toast; respektiert vermutlich den Mute-Button).
- [ ] **Desktop: Flow-Name-Klick blendet Übersicht ein** — klickt man im Desktop-Modus auf einen Flow-Namen und die Übersicht (Flow-Spalten) ist ausgeblendet, muss sie eingeblendet werden.
- [ ] **Timer-System überarbeiten** — Timer sind aktuell fest am Step kodiert (`timerSeconds` startet beim Abschluss). Szenarien:
  - Während dem Braten muss nach 5 min ein Schritt hinzugefügt werden — der Brat-Timer muss dabei einfach weiterlaufen.
  - Spaghetti + Soße sollen ungefähr gleichzeitig fertig sein: Die Soße kocht schon, bevor die Spaghetti reinkommen — Verknüpfung an einen Timer muss komplexer möglich sein (z.B. „wenn der Timer bei 5 min ist").
  - Timer ggf. vom Step entkoppeln: Ein Step kann beim Abschluss einen Timer starten, aber nicht so festkodiert wie jetzt. Evtl. Bedingungen statt explizitem Timer („nach Abschluss des Steps" — Timer implizit hergeleitet).
  - **Mehrere getimte Bedingungen**: den **maximalen Timer** nehmen (der zuletzt ablaufende bestimmt, wann die Karte frei wird). Den Countdown erst anzeigen, wenn der letzte Timer tatsächlich läuft. Gilt auch für die implizite Variante, falls wir sie wählen.
