# MURKS — UI/UX Spec v2

Voice-first Kochassistent-PWA. KI navigiert primär per Tool, Nutzer übersteuert per Touch.

---

## Kerndatenmodell

### Strang (Flow)
Ein paralleler Kochprozess (z.B. „Reis", „Soße", „Salat").

```ts
interface Strang {
  id: string
  name: string
  color: StrangColor
  steps: Step[]
  stepIndex: number        // aktiver Schritt (0-basiert)
  done: boolean
  timerEndsAt: number | null
  timerInstruction: string | null
  timerExpired: boolean
  zutaten: Zutat[]         // Zutaten gehören zum Strang, nicht global
}
```

### Schritt (Step)
**1 Karte = 1 Schritt. Schritte sind nie verschachtelt.**

```ts
interface Step {
  title: string        // kurze Überschrift, z.B. „Teig anrühren"
  description: string  // ausführliche Anweisung, z.B. „Eier mit Mehl, Wasser
                       // und einer Prise Salz in eine Schüssel geben und mit
                       // dem Rührgerät glatt rühren."
}
```

> **Migration:** `steps: string[]` → `steps: Step[]`. Alte Daten: `string` wird `title`, `description: ""`.

---

## Mobile Layout (≤ 639px)

### Prinzip
Wenig Platz → immer genau **ein** Strang fokussiert, dessen **aktueller Schritt** als große Karte.
Alle anderen Stränge als kompakte Strips oben.

### Aufbau

```
┌────────────────────────────────────┐
│ MURKS                  🎤  📄  ⚙  │  ← Topbar
├────────────────────────────────────┤
│ ▍REIS   Quellen lassen  07:41  3/5 │  ← Strip: Tap = Fokus wechseln
│ ▍SALAT  Dressing anrühren      1/4 │
├────────────────────────────────────┤
│ ╔════════════════════════════════╗ │
│ ║ ▍SAUCE                    3/5  ║ │  ← fokussierter Strang
│ ║                                ║ │
│ ║  Einreduzieren                 ║ │  ← Schritttitel (groß)
│ ║                                ║ │
│ ║  Hitze auf mittel, offen ~10   ║ │  ← Beschreibung (scrollt vertikal
│ ║  min köcheln, gelegentlich     ║ │    bei Bedarf)
│ ║  rühren.                       ║ │
│ ║                                ║ │
│ ║  ⏱ 01:12  verbleib.       ⚠  ║ │  ← Timer (gehört zum Strang)
│ ║                                ║ │
│ ║  ◀  ○○●○○  ▶   [ ✓ Weiter ]  ║ │  ← Navigation + Fortschritt
│ ╚════════════════════════════════╝ │
│  „Höre zu …"                       │  ← Voice-Overlay (nur wenn aktiv)
└────────────────────────────────────┘
```

### Strips (obere Leiste)

- **Feste Reihenfolge** = Anlegereihenfolge. Nie umsortieren — räumliches Gedächtnis.
- Mindesthöhe: 44px Tap-Target.
- Inhalt: `▍ Name · aktueller Schritttitel (truncated) · Timer · x/y`
- Dringlichkeit via Farbe/Puls/Bell-Icon, **nie** via Umsortieren.
- Bei ≥ 4 Strängen: Schritttitel weglassen → nur `▍ Name · Timer`.
- Tap = Fokus auf diesen Strang wechseln.

### Schrittnavigation (◀ ▶)

- **Swipe links/rechts** oder **◀/▶** = vorherigen/nächsten Schritt **ansehen** (Browse-Modus).
- Browse ≠ Fortschritt. Swipe setzt keinen Schritt aktiv.
- Fortschritt nur über **✓ Weiter**-Button oder KI (`set_step` / `complete_strang`).
- Beim Wegbrowsen vom aktiven Schritt:
  - Karte zeigt `[später]`- oder `[bereits erledigt]`-Badge.
  - `● Aktuell`-Chip springt zurück zum aktiven Schritt.
  - `↩ Hierhin springen`-Button setzt diesen Schritt aktiv (`set_step`).
- Dots `○○●○○` zeigen Position; aktiver Schritt ausgefüllt.

### Fokus wechseln

- Tap auf Strip = manueller Fokuswechsel.
- KI navigiert via `focus_strang` + `set_step`.
- KI-Fokus animiert: Strip expandiert zur Karte (Akkordeon-Animation).

---

## Desktop Layout (≥ 640px)

### Prinzip
Genug Platz → **Spalten pro Strang**, alle Schritte als Karten **vertikal gestapelt**, scrollbar.
Keine Browsing-Navigation nötig — alles sichtbar.

```
┌──────────────────────────────────────────────────────────────────────┐
│ MURKS                                                    🎤  📄  ⚙  │
├──────────┬───────────────────────┬───────────────────────────────────┤
│ ▍REIS    │ ▍SAUCE         ⚠01:12 │ ▍SALAT                           │
│ ⏱ 07:41  │                       │                                   │
├──────────┤ ┌───────────────────┐ │ ┌───────────────────┐            │
│┌────────┐│ │ ✓ Zwiebeln andüns.│ │ │ ✓ Salat waschen   │            │
││✓ Kochen││ ├───────────────────┤ │ ╔═══════════════════╗            │
│╔════════╗│ │ ✓ Passata zugeben │ │ ║  Dressing anrühren ║            │
│║Quellen ║│ ╔═══════════════════╗ │ ║  Öl, Essig, Senf … ║            │
│║lassen  ║│ ║  Einreduzieren    ║ │ ╚═══════════════════╝            │
│╚════════╝│ ║  Hitze mittel,    ║ │ ┌───────────────────┐            │
│┌────────┐│ ║  ~10 min köcheln. ║ │ │   Anmachen        │            │
││Auflock.││ ╚═══════════════════╝ │ └───────────────────┘            │
│└────────┘│ ┌───────────────────┐ │                                   │
│          │ │   Abschmecken     │ │                                   │
└──────────┴─┴───────────────────┴─┴───────────────────────────────────┘
```

- **Spaltenreihenfolge:** fix = Anlegereihenfolge.
- **Aktiver Schritt:** hervorgehoben (gefetteter Rahmen, Strang-Farbe).
- **Vergangene Schritte:** gedimmt + durchgestrichen.
- **Zukünftige Schritte:** dezenter als aktiver.
- **Strang-Header** (Spaltenüberschrift): Name + Timer. Klick = fokussieren.
- Vertikales Scrollen pro Spalte. Kein horizontales Scrollen.

---

## Kartendesign

### Aktiver Schritt (Mobile — voll sichtbar)
```
╔══════════════════════════════════╗
║ ▍ Strangname              3 / 5  ║  ← Decorator (Strang-Farbe)
╠══════════════════════════════════╣
║                                  ║
║  Einreduzieren                   ║  ← Titel (groß, ~18px)
║                                  ║
║  Hitze auf mittel, offen ~10     ║  ← Beschreibung (~14px, scrollt)
║  min köcheln, gelegentlich       ║
║  rühren.                         ║
║                                  ║
║  ⏱ 01:12  verbleib.        ⚠   ║  ← Timer (nur wenn läuft)
║                                  ║
║  ◀  ○○●○○  ▶    [ ✓ Weiter ]   ║  ← Nav + Fortschritt
╚══════════════════════════════════╝
```

### Browse-Zustand (vom aktiven Schritt weggeswipt)
```
╔══════════════════════════════════╗
║ ▍ Strangname  [später]  ●Aktuell→║  ← Badge + Rücksprung
╠══════════════════════════════════╣
║  Abschmecken              4 / 5  ║
║  Salz, Pfeffer, Prise Zucker …   ║
║                                  ║
║  ◀  ○○○●○  ▶   [ ↩ Hierhin ]   ║
╚══════════════════════════════════╝
```

### Desktop-Karten
- Aktiver Schritt: voller Inhalt (Titel + Beschreibung).
- Vergangene: gedimmt, Beschreibung eingeklappt.
- Zukünftige: Titel sichtbar, Beschreibung eingeklappt (optional ausklappbar).

---

## Zutaten

- Gehören zum **Strang**, nicht global.
- Zutaten-Modal öffnet sich pro Strang.
- `open_zutaten` / `add_zutaten` erfordern `strang_id`.
- Globale Einkaufsliste (alle Zutaten aggregiert) bleibt als separate Ansicht möglich.

---

## Timer

- Gehören zum **Strang** (nicht zu einem Schritt).
- Sichtbar: im Strip (Mobile), Spalten-Header (Desktop) + aktiver Karte.
- Dringlichkeit: Orange + Pulsieren < 2 min, Bell-Icon + Orange-Rand bei Ablauf.
- Bei Ablauf: KI navigiert aktiv zum betroffenen Strang.
- Mehrere Timer pro Strang: zukünftig (`timers: Timer[]`), aktuell ein Timer.

---

## Voice-Overlay

- Nur sichtbar wenn aktiv (Mic an / transkribiert / KI aktiv / ≤ 8s nach KI-Antwort).
- Mic-Button immer erreichbar in der Topbar.
- Letzter KI-Text: max. 2 Zeilen, fade-out nach 8s.

---

## KI-Tools (Delta zu v1)

| Tool | Änderung |
|---|---|
| `add_strang` | `steps: Step[]` statt `steps: string[]` |
| `add_step` | `title` + `description` statt `text` |
| `set_step` | unverändert |
| `focus_strang` | unverändert |
| `start_timer` / `cancel_timer` | unverändert |
| `complete_strang` | unverändert |
| `add_zutaten` | `strang_id` required |
| `open_zutaten` | `strang_id` required |
| `toggle_zutaten` / `close_zutaten` | unverändert |

---

## Offene Fragen

- Mehrere Timer pro Strang (gleichzeitig)?
- Schritt-spezifische Zutaten?
- Swipe-Schwellwert / Achsenerkennung bei nassen Händen?
- Einkaufslisten-Ansicht (alle Stränge aggregiert)?
