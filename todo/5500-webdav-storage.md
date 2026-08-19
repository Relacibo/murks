# 5500 · WebDAV als Cloud-Storage (Sessions, Rezepte, Settings)

**Prio: MITTEL** — ersetzt/ergänzt IndexedDB-Migration (5000)

## Was
WebDAV als primäres Cloud-Backend für App-Daten.
localStorage/IndexedDB nur noch als lokaler Cache + Offline-Fallback.

## Dateistruktur
```
/murks/
  settings.json
  sessions/{id}.json
  recipes/{id}.json
```

## Konfiguration
Eigene Zugangsdaten, getrennt von Joplin (→ 6000):
```ts
config.webdav.storage = { url, user, password }
```

## Tasks
- [ ] WebDAV-Client-Modul (fetch + Basic Auth, PROPFIND/GET/PUT/DELETE)
- [ ] Storage-Abstraction-Layer: lokaler Cache (localStorage) + WebDAV-Sync
- [ ] Conflict-Resolution-Strategie (last-write-wins als Einstieg)
- [ ] Config-UI: WebDAV-Storage-Zugangsdaten
- [ ] Offline-Modus: lokaler Cache, Sync bei Reconnect
- [ ] CORS-Hinweis in Docs (Nextcloud: CORS konfigurierbar)

## Verhältnis zu anderen Todos
- Ersetzt 5000 (IndexedDB) als primäre Storage-Lösung
- 5200 (Import/Export) bleibt als manueller Fallback sinnvoll
- 6000 (Joplin) nutzt separate Credentials, aber gleichen WebDAV-Client
