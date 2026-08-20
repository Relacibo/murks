# 1200 · Sessions: Deeplinks + Übersicht

**Prio: MITTEL**

## Was
Sessions sind persistente Koch-Einheiten (ein Abendessen = eine Session).
Jede Session hat eine eigene URL. Sessions-Übersicht zeigt alle vergangenen
und die aktuelle Session.

## Konzept
- Session = `{ id, name, createdAt, strangs[] }`
- URL: `/session/:id`
- Sessions-Übersicht: Liste aller Sessions, neue starten
- Offene Frage: Session = Rezept? Oder Session = Kochvorgang eines Rezepts?

## Tasks
- [x] Deeplink `?prompt=…` — startet Anfrage an den Agenten (Chat öffnet sich); `?reset=1` verwirft Flows + Chat-Verlauf (frische Session)
- [ ] Session-Datenmodell
- [ ] Router auf Multi-Session umstellen
- [ ] Sessions-Übersicht-Seite
- [ ] Neue Session starten
- [ ] Session aus URL laden
- [ ] Session-Name (aus Gericht-Name oder manuell)

## Abhängigkeit
→ 1000 (Navigation)

## Offen
- Overlap mit Rezept-Sammlung (→ 7400): Session archivieren = Rezept speichern?
