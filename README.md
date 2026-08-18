# MURKS

**M**inimal **u**nterwürfige **R**ezept- **u**nd **K**üchen-**S**oftware

PWA auf Basis von Vite + SolidJS + Tailwind. Trocken, minimalistisch, direkt.
Keine Höflichkeitsfloskeln.

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

MIT — Reinhard Bronner
