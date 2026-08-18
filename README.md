# MURKS

**M**inimal **u**nterwürfige **R**ezept- **u**nd **K**üchen-**S**oftware

PWA auf Basis von Vite + SolidJS + Tailwind. Trocken, minimalistisch, direkt.
Keine Höflichkeitsfloskeln.

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
