# 8000 · Play-Store-Release (erst interner Test, dann öffentlich)

**Prio: MITTEL**

## Was

MURKS als Android-App im Play Store veröffentlichen — als TWA (PWABuilder),
zuerst privat im Internen Test (bis 100 Tester, kein Review), erst nach
Polish-Schleife öffentlich.

## Erledigt

- [x] Keystore erzeugt (`murks-release.keystore`, alias `murks`)
- [x] `assetlinks.json` mit Upload-Key-Fingerprint (deployed)
- [x] Play-Entwicklerkonto (25 $, Identitätsbestätigung)

## Tasks

- [ ] PWABuilder: Manifest-URL `https://relacibo.github.io/murks/manifest.webmanifest`,
      Paketname `de.relacibo.murks`, Signing mit eigenem Keystore
- [ ] AAB bauen (PWABuilder Cloud-Signierung oder lokal)
- [ ] Play Console: App anlegen, AAB in den **Internen Test** hochladen
- [ ] Play App Signing: Fingerprint des Play-Keys aus *App-Integrität* als
      zweiten Eintrag in `assetlinks.json` ergänzen
- [ ] Privacy Policy hosten (GitHub Pages) — Pflicht fürs Listing
- [ ] Listing vorbereiten: Beschreibung, Screenshots, Alterseinstufung,
      Datensicherheit-Formular (Mikrofon deklarieren)
- [ ] Interner Test: auf eigenem Gerät installieren, TWA-Verifikation +
      Deeplink `?prompt=` testen
- [ ] Polish-Schleife: offene Issues abarbeiten, bevor irgendetwas öffentlich wird
- [ ] Geschlossener Test: 12 Tester × 14 Tage (Play-Voraussetzung für
      Produktion bei privaten Konten)
- [ ] Produktion veröffentlichen (erst nach Review)

## Hinweise

- Web Speech (STT/TTS) läuft in der TWA, weil echtes Chrome drinsteckt —
  der neue webspeech-Default funktioniert also auch in der App.
- Keystore + Passwort sicher verwahren — ohne ihn keine Updates mehr.

## Abhängigkeit

→ Polish-Issues, 1200 (Deeplinks, teilweise erledigt)
