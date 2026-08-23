# 2600 · WebMCP: externe Agenten sauber unterstützen

**Prio: MITTEL**

## Was
MVP steht: `src/lib/webmcp.ts` registriert alle Cook-Tools (`TOOLS` → `document.modelContext.registerTool`) plus `get_system_prompt` (System-Prompt als Tool). Browser-Agenten (Gemini in Chrome etc.) entdecken und rufen sie direkt auf — kein Server, gleiche URL, STT/TTS macht der externe Agent. Saubere Unterstützung braucht noch:

## Tasks
- [ ] **Externer System-Prompt**: `get_system_prompt` liefert derzeit den internen Prompt (Voice-, „OK."- und TTS-Regeln passen nicht zum externen Agenten). Prompt in gemeinsamen Kern + interne/externe Zusätze aufteilen, extern nur den Kern + externe Regeln ausgeben.
- [ ] **show_step speak im externen Modus**: TTS unterdrücken, wenn der externe Agent spricht (Modus-Erkennung oder Flag in `get_cook_state`).
- [ ] **Modus extern erkennen** (siehe 2400): interner Agent vs. WebMCP-Agent — Config-Zwang (`hasValidAgent` in App.tsx) nur im internen Modus erzwingen.
- [ ] **Status in der Config-UI**: „WebMCP: N Tools aktiv" anzeigen (Feature-Detection), sonst ist das Feature unsichtbar.
- [ ] **Tool-Ergebnisse prüfen**: `outputSchema` (WebMCP Issue #9) nutzen, sobald verfügbar — JSON-Strings sind fürs Modell sonst schwerer zu deuten.
- [ ] **Origin Trial für Produktion**: Trial-Token in `index.html` eintragen (GitHub Pages), solange WebMCP hinter dem Trial liegt.
- [ ] **Testen**: Model Context Tool Inspector (chrome://flags/#enable-webmcp-testing); Tool-Beschreibungen gegen echte Agenten-Aufrufe verifizieren.

## Abhängigkeit
→ 2400 (Modi: Beratung vs. bekanntes Gericht)
