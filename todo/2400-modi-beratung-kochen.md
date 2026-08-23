# 2400 · Modi: Beratung vs. bekanntes Gericht

**Prio: MITTEL**

## Was
Zwei Nutzungsarten unterscheiden:

1. **Kochen** — Nutzer weiß, was er machen will (klare Ansage oder Deeplink `?prompt=`): Agent plant sofort.
2. **Beratung** — Nutzer will Vorschläge, was gekocht werden soll: Agent fragt erst ab (Vorlieben, Vorräte, Zeit), schlägt per `ask_choice` Optionen vor; erst nach Entscheidung wird geplant.

Mengen/Portionen werden an einem Punkt aktiv abgefragt (Standardwerte + Auswahl oder custom), nie stillschweigend angenommen.

## Offen (Implementierung)
- Entweder **branching System-Prompts** (ein Prompt pro Modus, Auswahl vor dem Chat) oder **ein System-Prompt**, der beide Fälle beschreibt und der Agent den Modus aus dem Kontext erkennt.
- Modus-Erkennung: explizite Nutzerwahl vs. Kontext-Erkennung vs. Deeplink-Parameter.
- Entscheidung noch zu diskutieren.

## Tasks
- [ ] Modus-Konzept entscheiden (branching vs. ein Prompt)
- [ ] Modus-Erkennung implementieren
- [ ] Beratungs-Flow: Rückfragen → Vorschläge via `ask_choice` → Entscheidung → Planung
- [ ] Agent fragt „Für wie viele Personen?" zu Beginn (Choice 1 / 2 / 4 / custom)
- [ ] Mengen in `add_zutaten` mit `amount` + `unit`
- [ ] Mengen in Schritt-Beschreibungen einsetzen

## Abhängigkeit
→ 2000 (Choice-UI)
