# MURKS: Minimal unterwürfige Rezept- und Küchensoftware

## Namensherkunft & Akronym
**MURKS** ist das offizielle Projekt-Akronym. Es entstand aus der bewussten Abkehr von künstlich freundlichen, "sykophantischen" KI-Assistenten. Das Ziel ist eine Software, die ohne Höflichkeitsfloskeln, Lobeshymnen oder unnötigen Smalltalk funktioniert.

Das Akronym steht für:
**M**inimal **u**nterwürfige **R**ezept- **u**nd **K**üchen-**S**oftware

Die Namenswahl unterstreicht den Anspruch: trocken, minimalistisch, direkt und strikt auf die Funktion konzentriert.

## Verorfene / Abgelehnte Kandidaten
Während der Findungsphase wurden verschiedene Alternativen diskutiert und verworfen:
* **K.O.T.Z. (Küchen-Optimierte-Tool-Zusammenstellung):** Zunächst als humorvolles Akronym erdacht, aber letztlich verworfen. Der Hauptgrund war schlicht, dass sich kein wirklich eleganter, flüssiger Aufbau für das letzte Wort (wie "Zusammenstellung") finden ließ – es wirkte zu sperrig und erzwungen.

## Plattform
MURKS ist eine **PWA** (installierbar, offlinefähig), gebaut mit **Vite + SolidJS + TypeScript + Tailwind**. Bewusst ohne UI-Komponentenbibliothek: keine klassische Website, sondern eine app-artige Oberfläche. Lizenz: MIT (Reinhard Bronner). Gehostet auf GitHub Pages, Deployment per GitHub Actions bei Push auf `main`.

## Architektur-Entscheidungen
* **State:** `createStore` (Solid) mit automatischer Persistenz in `localStorage`. Kein Backend, keine Cloud – alles lokal im Browser.
* **Routing:** `@solidjs/router`. Keine Navigationsleiste. Beim Laden entscheidet der Default-Agent: vorhanden → Chat, fehlend → Config. Config nur über einen kleinen ⚙-Knopf (Ecke) oder Swipe-Geste erreichbar.
* **Agent:** Chat spricht ein **OpenAI-kompatibles** Endpoint an (`POST {base}/chat/completions`). Endpoint und Model werden in der Config gepflegt.
* **Agent-Profile:** Vergangene Agenten werden als Liste gespeichert. Ein Agent ist Default, er wird im Chat verwendet. Profile sind anlegbar, editierbar, löschbar.
* **Lokale AIs:** Netzwerk-lokale oder lokale Modelle (z.B. Ollama unter `http://localhost:11434/v1`, LM Studio unter `http://localhost:1234/v1`) funktionieren offline – Browser erlauben `localhost`-Fetches aus HTTPS-Seiten.
* **Offline-Fähigkeit:** Statische Assets werden vom Service Worker geprecacht; Netzwerk-Features (externe Agent-Endpoints) brauchen Verbindung.

## Scope
Hauptsächlich für den Eigengebrauch eines Nutzers. Kein Mehrbenutzer-Betrieb, keine Serverkomponente geplant. Der Fokus liegt auf einer agentengesteuerten Chat-View plus lokaler Config.

---

## Cook View — UI-Design & Konzept

### Vision
MURKS soll das parallele Kochen unterstützen: mehrere Gerichte/Komponenten laufen gleichzeitig, die KI koordiniert Timing und Schritte. Primär bedienbar per **Voice** (Hände sind beim Kochen voll). Der Agent bekommt Tools, um die UI zu steuern (Timer setzen, Schritt weiterschalten, Strang hinzufügen, etc.) — er "antwortet" also nicht primär in Text, sondern in Aktionen.

### Entscheidungen

**Timeline-Abstraktion vs. flaches Rezept?**
→ **Timeline-Abstraktion**, aber flach dargestellt. Während des Kochens sieht der Nutzer keine verschachtelte Schrittliste — nur das, was gerade aktiv ist. Intern gibt es "Strangs" (parallele Kochkomponenten: Reis, Soße, Lasagne), jeder Strang hat eine eigene Schrittfolge und eigene Timer. Die Komplexität bleibt im State, die UI zeigt immer nur den aktuellen Schritt pro Strang.

**Chat-Position / Voice-Interface?**
→ Kein eigener Chat-View während des Kochens. Nur eine persistente **Voice-Leiste** unten:
- Großer Mikrofon-Button (mind. 56×56px für Touch/mit nassen Händen)
- Transkript-Streifen: zeigt zuletzt Erkanntes ("ok ich hab die lasagne in den ofen getan") — wichtig, da Spracherkennung fehleranfällig ist
- Agent-Aktionen erscheinen als kurze **Toast-Meldungen** über der Leiste ("✓ Timer gestellt: 45 min"), kein Fließtext-Chat
- Listening-State: Text wechselt zu "Höre zu...", Puls-Animation am Mic-Button

**Timer-Anzeige?**
→ Embedded in Strang-Karten, kein eigener Timer-View. Timer-Pill in der Karte zeigt verbleibende Zeit (Monospace, groß genug lesbar auf einen Blick). Kein separates Timer-Overlay — würde den Kochkontext ausblenden.

**Was passiert wenn Timer abläuft?**
→ Die Karte wechselt in einen **Alert-State** (orange Border, Bell-Icon, "Timer abgelaufen!") und zeigt sofort die nächste Instruktion ("Jetzt: Lasagne aus dem Ofen nehmen, 10 Min ruhen lassen"). Kein extra Modal nötig — der Nutzer sieht es direkt im Kontext. Zusätzlich: Toast-Notification über der Voice-Leiste.

**Wie viele Views?**
→ **3 Views / Overlays** reichen:
1. **Cook View** (Haupt-View beim Kochen): Strang-Karten + Voice-Leiste, immer sichtbar
2. **Zutaten-Modal** (Bottom Sheet): Checkliste aller Zutaten, abkoppelbar per 🧾-Button; Agent kann es auch öffnen
3. **Config-Modal** (Bottom Sheet, existiert bereits): Agent-Einstellungen, via ⚙-Button

Kein separater "Rezept-View" während des Kochens — zu viel Information, zu ablenkend. Schritte kommen Strang-weise.

### Strang-Karten (Strang = parallele Kochkomponente)

```
┌─ Strang-Name ───────── Schritt X von Y ─┐
│  Aktuelle Instruktion (text-base, lesbar) │
│                                           │
│  ┌─ Timer-Pill ──────────────────────┐   │
│  │  ⏱  12 : 34  verbleib.           │   │
│  └───────────────────────────────────┘   │
│                            [✓ Fertig]    │
└───────────────────────────────────────────┘
```

**Expired State (orange):**
```
┌─ Strang-Name ──────────────── 🔔 ────────┐
│  Timer abgelaufen!                        │
│  ─────────────────                        │
│  Jetzt: Lasagne aus dem Ofen nehmen,      │
│  10 Minuten ruhen lassen.                 │
│                            [✓ Fertig]    │
└───────────────────────────────────────────┘
```

### Agent-Tools (für Deepseek zu implementieren)
Der Agent soll folgende UI-Tools bekommen:
- `add_strang(name, steps[])` — neuen Strang hinzufügen
- `set_step(strang_id, step_index)` — Schritt weiterschalten
- `start_timer(strang_id, seconds, on_expire_instruction)` — Timer starten
- `cancel_timer(strang_id)` — Timer abbrechen
- `open_zutaten()` / `close_zutaten()` — Zutaten-Modal steuern
- `show_toast(message)` — kurze Benachrichtigung
- `complete_strang(strang_id)` — Strang als fertig markieren

### Design-System (Kochansicht)
Identisch zum restlichen App-Design (zinc-Palette, mobile-first). Spezifisch für Cook View:
- Strang-Karten: `bg-zinc-900 border border-zinc-700 rounded-xl p-4`
- Timer-Pill: `bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2`, Zeit in `font-mono text-xl font-semibold`
- Timer-Expired-Karte: `border-orange-500 bg-zinc-900`
- Mic-Button: `bg-zinc-100 text-zinc-900 rounded-full w-14 h-14` (min 56px)
- Listening-Ring: `animate-pulse ring-2 ring-zinc-400` um den Mic-Button
- Toast: `bg-zinc-800 text-zinc-100 rounded-full px-4 py-2 text-sm` über Voice-Leiste

### Mockup
Ein statisches Mockup liegt unter `/mock` (Route `/mock`, Datei `src/pages/CookMock.tsx`).
Zeigt alle UI-States: Normal, Timer abgelaufen, Hört zu, Zutaten-Modal.
