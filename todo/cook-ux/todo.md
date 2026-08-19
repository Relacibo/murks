# TODO: Cook-UX & Agent-Verhalten

## Gelöst

- **Kein Kommentar zu Tool-Aktionen** — Prompt verlangt „OK." oder inhaltlich Notwendiges, die UI toastet selbst
- **Manuelles Weiterschalten von Schritten** — Punkt-Navigation (Vorschau), „Schritt X aktiv setzen", ↑/↓-Scrub in der Karte
- **Agent kennt den Karten-Zustand** — `get_cook_state` liefert Stränge, Schritte, Timer, Zutaten

## Verworfen

- **Desktop-Rechts-Panel („Gespräch")** — Desktop zeigt stattdessen alle Karten nebeneinander (2:1); das Gespräch ist die Voice-Leiste/Transkript
- **Schritt als Titel + Detailtext** — keine Schritt-Überschrift; der Strang-Name ist die Überschrift, der Prompt verlangt vollständige Anweisungen im Schritttext
- **Resortierung nach Relevanz** — statische Reihenfolge; die KI expandiert per `focus_strang`, Priorität wird visuell signalisiert (gelb <2min, rot abgelaufen)

## Offen

### Auswahl-UI (Claude/opencode-CLI-Stil)

- Agent soll nummerierte Optionen vorschlagen können (z.B. Mengen, Zutaten, Gericht-Varianten)
- Anzeige prominent in der Cook View (über der Voice-Leiste / als Inlay in der Karte)
- Auswahl per Stimme („eins", „zwei") oder Tap; custom-Antwort immer möglich
- Technisch: eigenes Tool (z.B. `ask_choice(options[])`), gewählte Option wird zur nächsten User-Nachricht

### Zutaten-Bewertung & Vervollständigung

- Agent bewertet Zutaten: Passt es überhaupt rein? Wie gut unterbringbar? — nicht „ist das traditionell?"
- Bei unvollständigen Zutaten aktiv nachfragen/vorschlagen (Beispiel: Sellerie, Mais, Salami → „Eier für den Teig?")
- Bewertung knapp halten, mit konkretem Gegenvorschlag

### Rezept-Erstellung: nicht zu früh anlegen

- Ablauf: Vorschlag (Gericht, Stränge, Schritte) → Nutzer bestätigt/ändert → erst dann `add_strang`
- Im Test-Chat wurde der Strang angelegt, bevor die Rückfrage kam („Strang angelegt." kam vor „Soll ich das anlegen?")
- Prompt-Vorgabe: erst Plan machen, auf Bestätigung warten, dann anlegen

### Rezeptübersicht (Draft) als JSON

- Kein Freitext: Agent entwirft strukturierten Rezept-Entwurf, z.B.:
  `{"gericht": "...", "zutaten": [{"item": "Mehl", "amount": 250, "unit": "g"}], "strangs": [{"name": "Teig", "steps": [...]}]}`
- Cook-State bekommt `draft`-Feld; neues Tool `draft_recipe(json)` + `confirm_recipe()`
- UI: Übersichts-View statt Karten, solange der Entwurf unbestätigt ist — Bestätigen/Ändern erst, dann Stränge anlegen
- Entwurf speist beim Bestätigen die Zutatenliste (add_zutaten mit Menge) und die Stränge

### Mengen & Portionen

- Agent fragt Mengen/Portionen ab (z.B. „125g Reis" oder „für eine Person")
- Standardwerte + Auswahl (80 / 100 / 125 g) oder custom — als Auswahl-UI (s.o.)
- Mengen landen in Schrittanweisungen und der Zutatenliste

### Strang-Verwaltung

- `update_strang(strang_id, patch)` fehlt: Schritte/Timer/Reihenfolge ändern
- `remove_strang` fehlt — Strang löschen via Agent
- **Merge**: Komponenten kommen im Gericht zusammen (Teig + Füllung → „Fertigstellen") → Tool `merge_strang(a_id, b_id, name?, steps?)`; offen: Timern/Zustände beim Merge (max. Timer übernehmen? Anweisungen kombinieren?)
- Diverge: heute schon über `add_strang` abbildbar — kein eigenes Tool

### Session-Ende

- Was passiert, wenn alle Stränge fertig sind? Zurück zum Chat / Session beenden?
