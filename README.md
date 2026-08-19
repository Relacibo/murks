# MURKS

> **M**URKS — **u**nterwürfige **R**ezept**k**och**s**oftware

PWA auf Basis von Vite + SolidJS + Tailwind. Trocken, minimalistisch, direkt —
mit einer Prise Unterwürfigkeit. Keine Höflichkeitsfloskeln.

<!-- Alternative, rekursiv elegant: **M**inimal **u**nterwürfig, **r**echt **k**östlich, **s**elten Murks -->

## Features

- **Voice-First**: Spracherkennung (Whisper lokal via WASM oder Server-Whisper,
  Silero VAD) und Sprachausgabe (Piper/Thorsten via Worker oder Web Speech)
- **Agent**: OpenAI-kompatibles Chat-Endpoint, Werkzeuge für die Kochoberfläche
  (Stränge, Schritte, Timer, Zutaten)
- **Kochstränge**: parallele Zubereitungen mit Schritten, Fokus und Timern

## Agent

Die Agent-View spricht ein OpenAI-kompatibles Chat-Endpoint an
(`POST {base}/chat/completions`). Endpoint und Model werden in der
Config-Seite gesetzt. Lokale AIs funktionieren damit auch offline:

- Ollama: `http://localhost:11434/v1` (ggf. `OLLAMA_ORIGINS=*` für CORS)
- LM Studio: `http://localhost:1234/v1`

## Entwicklung

```sh
npm install
npm run dev
```

## Produktion

```sh
npm run typecheck
npm run build
```

## Deployment

GitHub Actions baut bei Push auf `main` und deployed nach GitHub Pages.
`BASE_URL` wird im Workflow auf `/murks/` gesetzt.

## Lizenz

AGPL-3.0-or-later — Reinhard Bronner
