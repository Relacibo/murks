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
  icon: string | null      // Emoji, vom LLM vergeben (add_strang) — Strip-Identität
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
  summary: string      // Kurzbezeichnung, reiner Text, 1 Zeile, max ~2 Wörter (System-Prompt)
  description: string  // Volltext, Markdown-rendered (ausgeklappte Karte)
}
// Eingeklappt/Strip: 🍚 Summary · ⏱ Timer-Chip (nur wenn läuft) · x/y (klein grau).
//   Kein Name — Emoji (LLM) + Strang-Farbe identifizieren den Strang.
// Ausgeklappt: Header 🍝 Name · ⏱ Timer · x/y (Name als Kontext-Anker beim Browsen),
//   darunter description (Markdown) statt summary.
```

> **Migration:** `steps: string[]` → `steps: Step[]`. Alte Daten: `string` wird `summary`, `description: ""`.

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
│ 🍚 Quellen lassen  07:41  3/5     │  ← Strip: Tap = Fokus wechseln
│ 🥗 Dressing anrühren       1/4    │
├────────────────────────────────────┤
│ ╔════════════════════════════════╗ │
│ ║ 🍝 SAUCE                  3/5  ║ │  ← fokussierter Strang: Name + x/y
│ ║                                ║ │    (Kontext-Anker beim Browsen)
│ ║  Hitze auf mittel, offen ~10   ║ │  ← ausgeklappt: description (Markdown,
│ ║  min köcheln, gelegentlich     ║ │    scrollt vertikal bei Bedarf)
│ ║  rühren.                       ║ │    eingeklappt: nur summary (1 Zeile)
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
- Inhalt: `🍚 Summary (truncated) · Timer-Chip (nur wenn läuft) · x/y` — kein Name, Emoji + Farbe identifizieren
- Dringlichkeit via Farbe/Puls/Bell-Icon, **nie** via Umsortieren.
- Summary wird nie weggelassen (Kerninfo des Strips), max ~2 Wörter.
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
│╔════════╗│ │ ✓ Passata zugeben │ │ ║  Öl, Essig, Senf,  ║            │
│║Quellen ║│ ╔═══════════════════╗ │ ║  gut verrühren …   ║            │
│║lassen  ║│ ║  Hitze mittel,    ║ │ ╚═══════════════════╝            │
│╚════════╝│ ║  ~10 min köcheln. ║ │ ┌───────────────────┐            │
│┌────────┐│ ╚═══════════════════╝ │ │   Anmachen        │            │
││Auflock.││                       │ └───────────────────┘            │
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

Tap auf Header = ein-/ausklappen. Nur der Body wechselt: summary ↔ description.

### Eingeklappt (identisch zum Strip, kein Name)
```
╔══════════════════════════════════╗
║ 🍝 Einreduzieren · ⏱ 01:12 · 3/5 ║  ← Emoji + Farbe = Strang-Identität,
╚══════════════════════════════════╝    Summary truncate, x/y klein grau
```

### Ausgeklappt — aktiver Schritt (Mobile)
```
╔══════════════════════════════════╗
║ 🍝 SAUCE   ⏱ 01:12         3 / 5  ║  ← Name erscheint (Kontext-Anker), x/y klein grau
╠══════════════════════════════════╣
║                                  ║
║  Hitze auf mittel, offen ~10     ║  ← Description (Markdown-rendered,
║  min köcheln, gelegentlich       ║    ~14px, scrollt vertikal)
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
║ ▍ SAUCE  [später]  4/5  ●Aktuell→║  ← Name bleibt Kontext-Anker; Badge + Rücksprung
╠══════════════════════════════════╣
║  Salz, Pfeffer, Prise Zucker …   ║  ← Description des gebrowsten Schritts
║                                  ║
║  ◀  ○○○●○  ▶   [ ↩ Hierhin ]   ║
╚══════════════════════════════════╝
```

### Desktop-Karten
- Aktiver Schritt: ausgeklappt → description (Markdown).
- Vergangene: gedimmt, eingeklappt → summary.
- Zukünftige: eingeklappt → summary (optional ausklappbar → description).

---

## Zutaten

- Gehören zum **Strang**, nicht global.
- Zutaten-Modal öffnet sich pro Strang.
- `open_zutaten` / `add_zutaten` erfordern `strang_id`.
- Globale Einkaufsliste (alle Zutaten aggregiert) bleibt als separate Ansicht möglich.

---

## Timer

- Gehören zum **Strang** (nicht zu einem Schritt).
- Sichtbar: Strip (Timer-Chip), ausgeklappte Karte (Header + großer Pill), Desktop-Spalten-Header.
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
| `add_strang` | `steps: Step[]` statt `steps: string[]`; zusätzlich `icon` (Emoji, LLM vergibt) |
| `add_step` | `summary` + `description` statt `text` |
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
