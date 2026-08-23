# 3300 · Agent-Status-Tool: Spinner während der Arbeit

**Prio: MITTEL**

## Was
Der Agent signalisiert per Tool, dass er gerade die Schedule generiert (dauert
oft lange) — ein Spinner über dem Diagramm bzw. in einer Spalte zeigt „hier
wird gerade was gebaut", ohne Timer, Karten oder Abschlüsse zu blockieren.

## Umsetzung (Stand)
- Tool `set_loading({ loading, scope: "all" | "flow", flow_id? })` in tools.ts —
  explizites An und Aus; KEIN Auto-Off am Turn-Ende (Agent ersetzt Gerichte oft
  über mehrere Antworten — Spinner soll bis zum fertigen Aufbau stehen bleiben)
- Fallback: neue Nutzernachricht setzt loading zurück (sendMessage-Start);
  Reload: loading wird nicht rehydriert
- Zustand `CookState.loading` (all + flows); `start_new_recipe`/`delete_flow` räumen auf
- UI scope "all" (auch fürs Anlegen neuer Flows): Overlay-Spinner über dem
  gesamten Diagramm (pointer-events-none), deckt Desktop + mobile „Jetzt" ab
- UI scope "flow": Spinner in der Flow-Spalte (Desktop); auf Mobile ein
  schmaler, nicht-blockierender Streifen über dem Inhalt („Jetzt" zeigt ja
  keine Spalten)
- Neues-Gericht-Workflow im Prompt: set_loading(true) → start_new_recipe →
  Aufbau → set_loading(false); `reset_cook` umbenannt in `start_new_recipe`

## Offen
- [ ] WebMCP-Test: verifizieren, dass externe Agenten das Tool sinnvoll setzen

## Abhängigkeit
→ 2200 (draft_recipe nutzt den Spinner)
