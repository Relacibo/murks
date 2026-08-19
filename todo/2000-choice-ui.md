# 2000 · Choice-UI: Agent schlägt nummerierte Optionen vor

**Prio: MITTEL**

## Was
Agent kann dem Nutzer nummerierte Optionen anbieten (Mengen, Varianten, Zutaten).
Antwort per Stimme („eins", „zwei") oder Tap. Custom-Antwort immer möglich.

## Konzept
- Neues Tool: `ask_choice({ question, options: string[] })`
- Cook-View zeigt Optionen prominent (über Voice-Leiste oder als Karten-Inlay)
- Auswahl → wird als nächste User-Nachricht weitergegeben

## Tasks
- [ ] Tool `ask_choice` definieren + in `tools.ts`
- [ ] State: `cook.pendingChoice: { question, options } | null`
- [ ] UI-Komponente: Optionsliste mit Tap-Targets
- [ ] Voice: Erkennung von „eins"/„zwei"/„drei" als Auswahl
- [ ] Prompt anpassen: Agent darf und soll Choice nutzen
