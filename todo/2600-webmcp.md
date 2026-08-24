# 2600 · WebMCP: externe Agenten sauber unterstützen

**Prio: MITTEL**

## Was
MVP steht: `src/lib/webmcp.ts` registriert alle Cook-Tools (`TOOLS` → `document.modelContext.registerTool`) plus `get_system_prompt` (System-Prompt als Tool). Browser-Agenten (Gemini in Chrome etc.) entdecken und rufen sie direkt auf — kein Server, gleiche URL, STT/TTS macht der externe Agent. Saubere Unterstützung braucht noch:

## Tasks
- [x] **Externer Modus (`?webmcp=1`)**: URL-Param als Source of Truth, Toggle in der Config (nur wenn WebMCP-API verfügbar, zeigt Tool-Count). Einweg-Automatik: erster WebMCP-Tool-Aufruf setzt den Param — zurück nur explizit.
- [x] **UI im externen Modus**: Setup-Zwang aus, Composer-Bar/Chat-Modal/Gesprächsmodus-Button weg, Konfiguration als Topbar-Button (More-Menü entfällt), Config zeigt nur Name + WebMCP-Toggle, internes TTS aus (`setTtsExternalMode` — Alarmtöne bleiben), Audio-Toggle schaltet nur non-prio-Bing.
- [ ] **Externer System-Prompt**: `get_system_prompt` liefert derzeit den internen Prompt (Voice-, „OK."- und TTS-Regeln passen nicht zum externen Agenten). Prompt in gemeinsamen Kern + interne/externe Zusätze aufteilen, extern nur den Kern + externe Regeln ausgeben.
- [ ] **Tool-Ergebnisse prüfen**: `outputSchema` (WebMCP Issue #9) nutzen, sobald verfügbar — JSON-Strings sind fürs Modell sonst schwerer zu deuten.
- [ ] **Origin Trial für Produktion**: Trial-Token in `index.html` eintragen (GitHub Pages), solange WebMCP hinter dem Trial liegt.
- [ ] **Testen**: Model Context Tool Inspector (chrome://flags/#enable-webmcp-testing); Tool-Beschreibungen gegen echte Agenten-Aufrufe verifizieren.

## Abhängigkeit
→ 2400 (Modi: Beratung vs. bekanntes Gericht)
