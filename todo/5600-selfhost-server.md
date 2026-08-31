# 5600 · Self-hostable Server (Rezepte speichern & mehr)

**Prio: MITTEL**

## Was
Ein kleiner self-hostable Server, damit nicht alles im Client steckt.
Erster Job: Rezepte speichern — damit werden Share-Links kurz (ID statt
gz-Payload in der URL) und Rezepte überleben Gerätewechsel. Danach können
weitere Aufgaben umziehen (Sync, Agent-Proxy, Secrets).

Murks bleibt **offline-first**: Der Server ist optional, die App läuft
auch komplett ohne ihn.

## Konzept
- Server in Docker (single binary, SQLite oder Datei-Storage)
- App bekommt in der Config eine optionale Server-URL (+ Token)
- Rezept speichern → Server gibt kurze ID zurück → Link `…/murks/?recipe=<id>`
  (oder `/r/<id>`) → App lädt das Rezept beim Öffnen
- Einfache Auth: pro Installation ein Token, kein Account-System

## Tasks
- [ ] Server: Rezepte als JSON speichern/laden/auflisten (REST)
- [ ] Server: kurze ID (z.B. 8 Zeichen) statt gz-Payload in Share-Links
- [ ] App: `?recipe=<id>` gegen den Server auflösen (Fallback: gz-Payload
      weiterhin unterstützen)
- [ ] App: Teilen-Modal nutzt den Server, wenn konfiguriert (sonst QR/gz)
- [ ] Config: Server-URL + Token (in 5400 Secrets aufgehen lassen)
- [ ] Dockerfile + README (self-host)

## Später möglich (Server übernimmt mehr)
- Geräte-Sync (IndexedDB ↔ Server) — siehe 5000/5100
- Agent-Proxy: API-Keys liegen serverseitig statt im Client — siehe 5400
- Import/Export über den Server — siehe 5200

## Abhängigkeiten
→ 7400 (Rezeptsammlung) · 5200 (Import/Export) · 5400 (Secrets)
