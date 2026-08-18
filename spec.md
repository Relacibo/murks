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
