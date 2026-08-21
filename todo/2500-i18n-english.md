# 2500 · i18n: Englisch

**Prio: BACKLOG** — sinnvoll, moderater Aufwand, kein Nutzer-Feature

## Was

App von Deutsch-only auf Deutsch + Englisch heben. Sprache steckt an vier
Stellen: UI-Strings, System-Prompt, STT-Lang, TTS-Lang.

## Tasks

- [ ] UI-Strings: hartkodierte deutsche Labels über ein `t()`-Dictionary
      (de/en) — Aufwand überschaubar, Strings sind übersichtlich verteilt
- [ ] System-Prompt: **eine englische Variante reicht** (keine Zwei-Sprachen-Pflege) —
      mit deutschem Vokabular-Glossar („Strang" = flow/component, Warte-Menü etc.,
      damit Tool-Namen/UI-Begriffe auf Deutsch bleiben können) und dem Hinweis,
      dass mit dem Nutzer Deutsch gesprochen wird (Antworten auf Deutsch)
- [ ] STT: `rec.lang = 'de-DE'` (stt.ts) → aus Config (`en-US`/`de-DE`);
      Whisper-WASM ist mehrsprachig, kein neues Modell nötig
- [ ] TTS: `utterance.lang = 'de-DE'` (tts.ts) → aus Config; Piper hat ein
      deutsches Modell — für Englisch entweder Web-Speech (kostenlos) oder
      zweites Piper-Modell (~80 MB zusätzlich, entscheiden)
- [ ] Spracheinstellung in Setup + Config; Default aus Browser-Locale
- [ ] Manifest: `lang` dynamisch (VitePWA-Build-Var) — Kosmetik

## Hinweise

- Prompt-Qualität: Die deutschen Regeln (Kanten, Timer, score) sind in
  iterativ gehärtet worden — die EN-Variante muss dieselben Verträge
  abdecken, nicht bloß übersetzt sein.
- Voice-UX: „OK."-Konvention und Ton-Regeln gelten für beide Sprachen.

## Abhängigkeit

→ 1000 (Navigation), 0300 (Desktop-Layout) — Strings teilen sich die Views
