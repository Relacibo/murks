# 6000 · Joplin-Sync via WebDAV

**Prio: NIEDRIG** — nice to have nach 5500

## Was
MURKS liest/schreibt Rezepte direkt in den Joplin-WebDAV-Sync-Ordner.
Gleiche WebDAV-Zugangsdaten wie in Joplin konfiguriert.
Eigene Credentials, unabhängig von App-Storage (→ 5500).

## Konfiguration
```ts
config.webdav.joplin = { url, user, password }
// z.B. url: "https://nextcloud.example.com/remote.php/dav/files/user/Joplin"
```

## Joplin-Dateiformat
Joplin speichert Notes als Markdown mit Frontmatter:
```
Pfannkuchen mit Salami

Zutaten: ...
Schritte: ...

id: abc123
parent_id: xyz
created_time: ...
```

## Tasks
- [ ] Joplin-Ordner lesen: PROPFIND → Dateiliste
- [ ] Note parsen: Markdown + Frontmatter → Rezept-Objekt
- [ ] Rezept exportieren: Rezept-Objekt → Joplin-Markdown → PUT
- [ ] Notizbuch (parent_id) konfigurierbar (z.B. „Murks-Rezepte")
- [ ] Config-UI: Joplin-WebDAV-Zugangsdaten + Notizbuch-Name
- [ ] CORS-Hinweis (Nextcloud: admin → Sicherheit → CORS)

## Abhängigkeit
→ 5500 (WebDAV-Client-Modul wiederverwendbar)
