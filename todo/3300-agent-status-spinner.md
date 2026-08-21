# 3300 · Agent-Status-Tool: Spinner während der Arbeit

**Prio: MITTEL**

## Was
Spezialisiertes Tool `start_build`: Der Agent signalisiert, dass er gerade
etwas baut (z.B. Rezept generieren in 2200) — ein großer Spinner über dem
leeren Dashboard zeigt „hier wird gerade was gebaut". Kein explizites
Ausschalten: der Spinner verschwindet automatisch, wenn der Agent-Turn
endet. Bewusst getrennt vom kleinen Thinking-Indikator (`agent.busy`) im Chat.

## Konzept
- Spezialisiertes Tool `start_build("Rezept wird erstellt…")` — Agent ruft es
  vor einer Bau-Phase auf. Kein generisches Status-Tool, kein `build_done`:
  **Auto-Off am Turn-Ende.** Der Agent-Loop hält `agent.busy` über alle
  Tool-Runden eines Turns durchgehend an (store.ts sendMessage-Loop), d.h.
  ein mehrstufiger Build innerhalb des Turns behält den Spinner; endet der
  Turn (finale Nachricht/Fehler → `finally`), verschwindet er automatisch.
  Bauen über mehrere Turns: Agent ruft `start_build` pro Bau-Turn erneut auf.
- Abgrenzung zum bestehenden Thinking-Indikator: `agent.busy` allein zeigt
  jede LLM-Anfrage — der Spinner ist ein bewusster, längerer „Bau-Phase"-
  Zustand nur fürs Dashboard (z.B. 2200), getrennt davon gespeichert.
- UI: großer Overlay-Spinner auf der leeren Dashboard-Fläche, solange
  `building` && `busy`
- Auto-Reset-Fallback: Turn-Ende + neue User-Nachricht setzen `building` zurück

## Tasks
- [ ] `start_build` Tool in tools.ts
- [ ] `agent.building` im Store (getrennt von `agent.busy`)
- [ ] Overlay-Spinner-Komponente (leeres Dashboard), sichtbar bei `building` && `busy`
- [ ] Auto-Reset: `building=false` im `finally` des Send-Loops + bei neuer Nachricht
- [ ] Prompt: Agent ruft `start_build` bevor er Draft/Rezept erzeugt (pro Bau-Turn)

## Abhängigkeit
→ 2200 (draft_recipe nutzt den Spinner)
