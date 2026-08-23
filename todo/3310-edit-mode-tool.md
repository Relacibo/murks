# 3310 · Edit-Mode-Tool statt manuellem Bau-Spinner

**Prio: MITTEL**

## Was
Statt `set_loading({loading: true/false})` ein Tool für den **Bearbeitungs-Modus**
der Schedule: aktivieren/deaktivieren. Der Spinner-Badge (3300) hängt dann am
Edit-Zustand statt an einem losen Flag — Modelle werden gezwungen, den Modus
sowohl AN- als auch AUSzuschalten (klarer Semantik-Kontrast als „Spinner an/aus").

## Konzept
- `edit_mode({enabled: true|false})` oder zwei Tools `start_editing`/`stop_editing`
- Zustand `CookState.editing` (oder `loading` umbenennen); UI wie 3300
- `get_cook_state` zeigt `editing` zurück — der Agent kann prüfen, ob er noch
  im Modus ist (statt es sich zu merken)
- Fallbacks bleiben: nächste Nutzernachricht + Reload räumen den Modus weg
- Prompt-Kopplung wie in 3300: vor jedem Aufbau an, nach dem letzten
  Tool-Aufruf IMMER aus

## Offen
- [ ] Verhalten bei WebMCP-Agenten testen (auch die schalten nie aus?)
- [ ] Name: editing vs. edit_mode vs. building — Modell-Verständnis prüfen

## Abhängigkeit
→ 3300 (Bau-Spinner)
