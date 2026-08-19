# TODO: Cook-UX & Agent-Verhalten

## Auswahl-UI (Claude/opencode-CLI-Stil)

- Agent soll nummerierte Optionen vorschlagen können (z.B. Mengen, Zutaten, Gericht-Varianten)
- Anzeige nicht nur im Chat, sondern prominent in der Cook View (über der Voice-Leiste / als Inlay in der Karte)
- Auswahl per Stimme („eins", „zwei") oder Tap; custom-Antwort immer möglich
- Technisch: eigenes Tool (z.B. `ask_choice(options[])`), gewählte Option wird zur nächsten User-Nachricht

## Zutaten-Bewertung & Vervollständigung

- Agent bewertet Zutaten: Passt es überhaupt rein? Wie gut unterbringbar? — nicht „ist das traditionell?"
- Bei unvollständigen Zutaten aktiv nachfragen/vorschlagen (Beispiel: Sellerie, Mais, Salami → „Eier für den Teig?")
- Bewertung knapp halten, mit konkretem Gegenvorschlag

## Rezept-Erstellung: nicht zu früh anlegen

- Ablauf: Vorschlag (Gericht, Stränge, Schritte) → Nutzer bestätigt/ändert → erst dann `add_strang`
- Im Test-Chat wurde der Strang angelegt, bevor die Rückfrage kam („Strang angelegt." kam vor „Soll ich das anlegen?")
- Prompt-Vorgabe: erst Plan machen, auf Bestätigung warten, dann anlegen

## Rezeptübersicht (Draft) als JSON

- Kein Freitext: Agent entwirft strukturierten Rezept-Entwurf, z.B.:
  `{"gericht": "...", "zutaten": [{"item": "Mehl", "amount": 250, "unit": "g"}], "strangs": [{"name": "Teig", "steps": [...]}]}`
- Cook-State bekommt `draft`-Feld; neues Tool `draft_recipe(json)` + `confirm_recipe()`
- UI: Übersichts-View statt Karten, solange der Entwurf unbestätigt ist — Bestätigen/Ändern erst, dann Stränge anlegen
- Entwurf speist beim Bestätigen die Zutatenliste (add_zutaten mit Menge) und die Stränge

## Kein Kommentar zu Tool-Aktionen

- Agent soll Tool-Aktionen nicht kommentieren („Strang angelegt." ist unnötig — die UI toastet schon)
- Nur „OK." oder inhaltlich Notwendiges; Prompt ist bereits angepasst

## Strang als JSON-API, Karte als Projektion

- Die Karte ist reine Darstellung des Strang-Zustands — kein separates Karten-JSON
- `update_strang(strang_id, patch)` fehlt noch: Schritte/Timer/Reihenfolge ändern (siehe todo/timer-ux/todo.md)

## Merge / Diverge von Strängen

- **Merge ist real und wichtig**: Komponenten kommen im Gericht zusammen (Teig + Füllung → „Fertigstellen")
  → eigenes Tool `merge_strang(a_id, b_id, name?, steps?)`
- **Diverge ist selten**: heute schon über `add_strang` abbildbar → kein eigenes Tool; offene Frage, ob jemals nötig
- Offen: Was passiert mit Timern/Zuständen beim Merge (max. Timer übernehmen? Anweisungen kombinieren?)

## Mengen & Portionen

- Agent fragt Mengen/Portionen ab (z.B. „125g Reis" oder „für eine Person")
- Standardwerte + Auswahl (80 / 100 / 125 g) oder custom — als Auswahl-UI (s.o.)
- Mengen landen in Schrittanweisungen und der Zutatenliste

## Offen aus der Integration

- Manuelles Weiterschalten von Schritten (Fallback ohne Stimme)? Oder nur via Agent/Sprache?
- Desktop-Rechts-Panel („Gespräch" aus dem Mock) noch nicht integriert — aktuell nur Voice-Leiste unten
- Was passiert, wenn alle Stränge fertig sind? Zurück zum Chat / Session-Ende?
- Strang löschen/bearbeiten via Agent fehlt (`remove_strang`/`update_strang`) — siehe todo/timer-ux/todo.md
- Schritt als Titel + Detailtext trennen (Karte: Schritt-Label als Untertitel, Instruktion darunter)? Prompt verlangt aktuell vollständige Anweisungen im Schritttext — falls das zu lang wird, Struktur ändern
