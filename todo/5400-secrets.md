# 5400 · Secrets verschlüsselt speichern

**Prio: BACKLOG**

## Was

API-Keys (Agent, STT, TTS, später Such-Key aus → 3200) liegen heute im
Klartext im App-State und landen so in IndexedDB. Ziel: verschlüsselt at
rest, opt-in per Master-Passphrase.

## Bedrohungsmodell

- Schützt gegen: Kopie der IndexedDB/des Browser-Profils ohne Passphrase lesen.
- Nicht lösbar (client-only): Wer das entsperrte Gerät oder den Speicher zur
  Laufzeit hat, sieht alles. Echter Schutz bräuchte ein Backend, das die Keys
  hält (Proxy) — widerspricht der statischen Architektur (GitHub Pages).

## Konzept

- Web Crypto: AES-GCM, Schlüssel aus Passphrase via PBKDF2 (SHA-256,
  ~600k Runden) + zufälligem Salt.
- Persistenz: `{ salt, iv, ciphertext }` als Secrets-Bundle (agent.key,
  stt.key, tts.key) in IndexedDB; im State nur ein Flag `secretsLocked`
  statt der rohen Keys.
- Laufzeit: Nach dem Unlock liegen die Keys entschlüsselt im Memory-State
  (wie bisher) — nur der persistierte Zustand ist verschlüsselt.
- Unlock-Flow: kleine Sperr-Ansicht beim Start, wenn Passphrase gesetzt;
  Schlüssel bleibt nur im RAM (Session). Ohne Passphrase bleibt alles wie
  bisher (opt-in).
- Option „Auf diesem Gerät merken": non-extractable CryptoKey in IndexedDB
  (browser-gebunden, nicht exportierbar) statt Passwort-Eingabe — bequem,
  aber eine Profil-Kopie wäre damit wieder entschlüsselbar; bewusst abwägen.

## Tasks

- [ ] `src/lib/secrets.ts`: derive/encrypt/decrypt (Web Crypto)
- [ ] State: Schlüsselfelder aus dem Persistenz-Pfad, Bundle-Feld rein
- [ ] Settings-UI: Passphrase setzen/ändern/entfernen
- [ ] Unlock-Screen beim Start (nur wenn Passphrase gesetzt)
- [ ] Migration: erstes Setzen verschlüsselt bestehende Klartext-Keys
- [ ] Import/Export (→ 5200): verschlüsselter Export, Re-Keying bei neuer Passphrase
- [ ] Optional: „Gerät merken" via non-extractable Key

## Abhängigkeit

→ 5000 (IndexedDB), 5200 (Import/Export), 3200 (Such-Key kommt dazu)
