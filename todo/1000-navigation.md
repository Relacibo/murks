# 1000 · Navigation: Chat-Toggle + Session-Übersicht

**Prio: MITTEL**

## Was
Grundlegende App-Navigation: zwischen Cook-View und Chat-View wechseln;
Session-Übersicht / neue Session starten.

## Konzept
- Bottom-Nav oder Topbar-Tabs: `Koch` | `Chat` | `Sessions`
- Cook und Chat sind innerhalb einer Session; Sessions ist die Übersicht
- Deeplinks: `/session/:id` → direkt in die Session

## Tasks
- [ ] Nav-Komponente (Bottom-Tab-Bar auf Mobile, Topbar-Tabs auf Desktop)
- [ ] Chat-View als eigene Route (aktuell: `Agent`-Seite)
- [ ] Cook-View als Route `/session/:id/cook`
- [ ] Chat-View als Route `/session/:id/chat`
- [ ] Sessions-Übersicht als Route `/sessions`

## Offen
- Sessions vs. Rezept-Sammlung: enger Zusammenhang (→ 1200)
