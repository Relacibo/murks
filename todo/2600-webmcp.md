# 2600 · WebMCP: externe Agenten sauber unterstützen

**Prio: MITTEL**

## Was
MVP steht: `src/lib/webmcp.ts` registriert alle Cook-Tools (`TOOLS` → `document.modelContext.registerTool`) plus `get_system_prompt` (System-Prompt als Tool). Browser-Agenten (Gemini in Chrome etc.) entdecken und rufen sie direkt auf — kein Server, gleiche URL, STT/TTS macht der externe Agent. Saubere Unterstützung braucht noch:

## Tasks
- [x] **Externer Modus (`?webmcp=1`)**: URL-Param als Source of Truth, Einweg-Automatik: erster WebMCP-Tool-Aufruf setzt den Param — kein manueller Einstieg (Config-Toggle wieder entfernt, macht keinen Sinn), zurück nur über den URL-Param.
- [x] **UI im externen Modus**: Setup-Zwang aus, Composer-Bar/Chat-Modal/Gesprächsmodus-Button weg, keine Config im externen Modus (zurück nur über URL-Param), internes TTS aus (`setTtsExternalMode` — Alarmtöne bleiben), Audio-Toggle schaltet nur non-prio-Bing.
- [x] **Externer System-Prompt**: statt des internen Prompts liefert `get_system_prompt` nur noch Rolle/Sprache/Grundton (`WEBMCP_SYSTEM_PROMPT`) — die Koch-Regeln stecken direkt in den Tool-Beschreibungen (depends_on-Schema, set_timer, set_loading, set_ingredients, show_step inkl. view/speak-Parametern und „weiter"-Regel).
- [ ] **Tool-Ergebnisse prüfen**: `outputSchema` (WebMCP Issue #9) nutzen, sobald verfügbar — JSON-Strings sind fürs Modell sonst schwerer zu deuten.
- [ ] **Origin Trial für Produktion**: Trial-Token in `index.html` eintragen (GitHub Pages), solange WebMCP hinter dem Trial liegt.
- [ ] **Testen**: Model Context Tool Inspector (chrome://flags/#enable-webmcp-testing); Tool-Beschreibungen gegen echte Agenten-Aufrufe verifizieren.

## Abhängigkeit
→ 2400 (Modi: Beratung vs. bekanntes Gericht)
