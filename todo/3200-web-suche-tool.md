# 3200 · Web-Suche-Tool für die KI

**Prio: MITTEL**

## Was

Tool `web_search`, mit dem die KI Fakten im Internet nachschlagen kann
(Kerntemperaturen, Garzeiten, Ersatz-Zutaten, Mengenverhältnisse …), statt
unsicher zu raten. Passt ins bestehende Muster: Keys trägt der Nutzer heute
schon selbst ein (Agent, STT, TTS), Tools laufen client-seitig über
`cookEngine.executeTool`.

## Konzept-Optionen

- **A: Tavily/Brave-API mit Nutzer-Key** — beste Ergebnisse; CORS muss verifiziert
  werden (beide ggf. mit Browser-CORS-Einschränkung).
- **B: Keyless Wikipedia + DuckDuckGo Instant Answers** — kein Setup, CORS
  garantiert, schwächere Treffer; Wikipedia stark für Kochfakten.
- **C: Natives Web-Search des LLM-Providers** — null Aufwand, nur wenn der
  Agent-Endpoint das kann (z.B. OpenAI Responses-API).
- **D: Kleiner Proxy (Cloudflare Worker/Deno Deploy)** — Key-Sicherheit + CORS,
  aber Infra für eine statische App; nur falls CORS A/B blockiert.

Empfehlung: A + B kombiniert (Key falls gesetzt, sonst keyless-Fallback).

## Delay

Unkritisch bei Einschränkung: nur bei Bedarf suchen („max. 1 Suche pro Anfrage,
nur wenn du unsicher bist"), Ergebnis auf ~5 Treffer / ~1200 Zeichen kappen.
Kostet dann +0,5–1,5 s nur bei Faktenfragen, nichts bei reinen Koch-Kommandos.

## Tasks

- [ ] CORS-Verifikation Tavily/Brave (erster Schritt — entscheidet A vs. B)
- [ ] `src/lib/search.ts`: `webSearch(query)` mit Provider-Switch (Key → A, sonst B)
- [ ] `tools.ts`: neues Tool `web_search { query }` mit Beschreibung + Prompt-Hinweis
- [ ] `cookEngine.executeTool` → `Promise<string>`, `await` in Agent-Schleife
      (store.ts ~591); UI-Aufrufer bleiben fire-and-forget
- [ ] Settings: optionale Sektion „Search" (Provider + Key), analog Agent-Key
- [ ] Prompt (store.ts): „Bei unsicheren Fakten suchen statt raten; Ergebnis knapp
      zusammenfassen."

## Offene Fragen

- Welchen Agent-Endpoint nutzen wir? (Entscheidet Option C.)
- Such-Key (Tavily/Brave Free-Tier) oder erstmal keyless starten?
- Soll die KI selbst entscheiden, wann sie sucht, oder nur auf explizite
  Aufforderung („schau mal nach …")?

## Abhängigkeit

→ 3000 (Tools-Muster), ggf. Provider-Endpoint (Agent-Settings)
