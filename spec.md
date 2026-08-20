# MURKS — UI/UX Spec v3 (Konzept C)

Voice-first Kochassistent-PWA. KI navigiert primär per Tool, Nutzer übersteuert per Touch.

> **B2 verworfen.** Konzept C: Schritte haben optionale Abhängigkeiten; „aktiv" heißt
> Abhängigkeiten erfüllt. Mobile zeigt alle aktiven Karten (statt Strips + eine Karte).

---

## Kerndatenmodell

### Strang (Flow)
Ein paralleler Kochprozess (z.B. „Reis", „Soße", „Salat").

```ts
interface Strang {
  id: string
  name: string
  icon: string | null      // Emoji, vom LLM vergeben (add_strang) — visuelle Identität
  color: StrangColor
  steps: Step[]
  stepIndex: number        // „Zeiger" des Flows (Navigation, 0-basiert)
  done: boolean
  zutaten: Zutat[]         // Zutaten gehören zum Strang, nicht global
}
```

### Schritt (Step)
**1 Karte = 1 Schritt. Schritte sind nie verschachtelt.**

```ts
interface StepRef {
  strang_id: string
  step_index: number
}

interface Step {
  description: string      // Volltext, Markdown-rendered; beginnt mit kurzer Kernaussage (Titel in Chips)
  done: boolean            // Schritt einzeln abschließbar (✓-Button / complete_step)
  dependsOn: StepRef[]     // optionale Abhängigkeiten — eigener oder anderer Flow
  timerEndsAt: number | null
  timerInstruction: string | null
  timerExpired: boolean
  activatedAt: number | null // Zeitpunkt des Aktiv-Werdens (Reihenfolge „Jetzt": neu → unten)
}
```

### Abgeleitete Schritt-Zustände
- **blocked**: mind. eine Abhängigkeit nicht `done`
- **active**: alle Abhängigkeiten `done`, selbst nicht `done` → wird auf Mobile in „Jetzt" angezeigt
- **done**: explizit abgeschlossen

### Abschluss-Regeln
- **Navigation allein schließt nie ab** (◀▶, Dots, Klick auf Desktop-Karte, `set_step`).
- **✓ (runder Button, nur Häkchen)** = expliziter Abschluss: `complete_step` (aktueller Schritt) + Navigation zum nächsten.
- **↺ Zurücknehmen** (`revert_step`) = abgeschlossenen Schritt wieder auf nicht-erledigt setzen —
  **nur möglich, wenn keine Karte, die diesen Schritt als Abhängigkeit hat, selbst abgeschlossen ist**
  (sonst ↺ ausgeblendet bzw. Tool-Fehler). Der revertierte Schritt erscheint wieder unten in
  „Jetzt" (`activatedAt` neu); ein gesetzter `Strang.done` wird dabei gelöscht.
- `complete_strang` = alle Schritte `done` + Strang `done` + alle Schritt-Timer abbrechen.
- `Strang.done` gilt zusätzlich als abgeleitet, wenn alle Schritte `done` sind.

> **Migration:** `steps: string[]` → `steps: Step[]`. Alte Daten: `string` wird `description`;
> altes `summary` wird übernommen, falls `description` leer ist.
> Alte Strang-Timer → Timer des aktiven Schritts.
> Neue Felder defaulten: `done: false`, `dependsOn: []`, `activatedAt: null`
> (Altdaten: Reihenfolge wie bisher, neue Karten anhängen).
> Offen: `dependsOn` referenziert per Index — Indizes verschieben sich bei `add_step`
> (für v1 akzeptiert; später stabile Step-IDs).

---

## Mobile Layout (≤ 639px)

### Prinzip (Konzept C)
Zwei Views:

1. **„Jetzt"** (Standard, mobile-only): **alle aktiven Karten über alle Flows** —
   die Dinge, die gerade dran sind. Blocked/done-Karten sind ausgeblendet.
2. **„Flow"**: die Karten **eines** Flows — optisch identisch mit einer Desktop-Spalte
   (vertikaler Kartenstapel mit allen Zuständen: done/active/blocked).

Wechsel: Tap auf den Karten-Titel einer „Jetzt"-Karte → „Flow"-View dieses Flows;
Zurück-Button → „Jetzt". Es gibt keine Flow-Chips-Leiste mehr.

### Aufbau „Jetzt"

```
┌────────────────────────────────────┐
│ ⏱🍚04:00  ⏱🥗01:12      🎤  📄  ⚙ │  ← Topbar: Timer-Chips + Buttons (kein Logo)
├────────────────────────────────────┤
│ ┌──────────────────────────────┐   │
│ │ 🍝 TOMATENSAUCE ▸ ⏱ 07:41  │   │  ← farbiges Titelband (Dekorator)
│ ├──────────────────────────────┤   │     Farbe endet hier vertikal
│ │ Hitze mittel, ~10 min  2/4   │   │  ← neutraler Body (zinc)
│ │ köcheln.                     │   │
│ │                    [ ✓ ]     │   │  ← runder Häkchen-Button
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ 🍚 REIS ▸           ⏱ 04:00 │   │
│ ├──────────────────────────────┤   │
│ │ Quellen lassen …       3/5   │   │
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

- **Reihenfolge = Reihenfolge des Auftauchens.** Karten erscheinen in der Reihenfolge,
  in der sie aktiv wurden. Neu aktive Karten (KI legt Schritt an oder Abhängigkeit
  erfüllt) werden **unten angehängt**. Die KI kann nicht umsortieren (append-only,
  kein Reorder-Werkzeug).
- Karten voll ausgeklappt: **farbiges Titelband** (Emoji + Flow-Name, caps, klickbar)
  + ⏱ Timer + x/y; darunter neutraler Body (zinc) mit der Description (Markdown).
  Der Body-Stil ist überall identisch — nur das Band unterscheidet pro Flow.
- ✓ (rund) = `complete_step` + Navigation (Navigation allein schließt nie ab).
- Blocked-Karte im Flow: ✓ deaktiviert + Hinweis auf fehlende Abhängigkeit.

### Aufbau „Flow" (≈ Desktop-Spalte)

Wie Desktop: Flow-Header + vertikaler Kartenstapel (done gedimmt, active hervorgehoben,
blocked mit Hinweis), scrollbar. Keine ◀▶-Browse-Navigation nötig — alles sichtbar.

---

## Desktop Layout (≥ 640px)

### Prinzip
Genug Platz → **Spalten pro Strang** (nur Gliederung mit Überschrift, keine Karte),
alle Schritte als **voll ausgeklappte Karten** vertikal gestapelt, scrollbar.
Keine Browsing-Navigation nötig — alles sichtbar.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⏱🍚04:00 ⏱🥗01:12 ⏱🥫07:41                        🎤  📄  ⚙      │  ← Topbar
├──────────┬───────────────────────┬───────────────────────────────────┤
│ 🍚 REIS  │ 🍝 SAUCE              │ 🥗 SALAT                          │  ← Spalten-Header
│          │                       │                                   │    (nur Gliederung)
│┌────────┐│ ┌───────────────────┐ │ ┌───────────────────┐            │
││✓ Kochen││ │ ✓ Zwiebeln ⏱ 03:00│ │ │ ✓ Salat waschen   │            │
││  …     ││ │   andünsten 1/4   │ │ │   …               │            │
│╔════════╗│ ╔═══════════════════╗ │ ╔═══════════════════╗            │
│║Quellen ║│ ║  Einreduzieren    ║ │ ║  Dressing ⏱ 01:12  ║            │
│║lassen   ║│ ║  ⏱ 07:41  2/4     ║ │ ║  1/4 …            ║            │
│║ …      ║│ ║  Hitze mittel, …  ║ │ ╚═══════════════════╝            │
│╚════════╝│ ╚═══════════════════╝ │ ┌───────────────────┐            │
│┌────────┐│ ┌───────────────────┐ │ │  Anmachen         │            │
││Auflock.││ │  Abschmecken      │ │ │   …               │            │
││  …     ││ │   …               │ │ └───────────────────┘            │
│└────────┘│ └───────────────────┘ │                                   │
└──────────┴─┴───────────────────┴─┴───────────────────────────────────┘
```

- **Spaltenreihenfolge:** fix = Anlegereihenfolge.
- **Spalte ist keine Karte** — nur Header (Emoji + Name, Klick = fokussieren) + Kartenstapel.
- **Alle Schritt-Karten ausgeklappt** (Description sichtbar), **ohne eigenen Titel** —
  der Flow-Name steht im Spalten-Header. Karten-Header: `⏱ Timer (nur wenn läuft) · x/y`.
- **active:** hellere Outline in Strang-Farbe (Desktop: Spalten-Header farbig).
- **done:** gedimmt, ↺-Button zum Zurücknehmen (s. Abschluss-Regeln).
- **blocked:** dezenter + 🔒 (Abhängigkeit offen), ✓-Button deaktiviert.
- **Mehrere Karten pro Strang können gleichzeitig Timer laufen lassen.**
- Vertikales Scrollen pro Spalte. Kein horizontales Scrollen (bis auf die Spalten selbst).

---

## Kartendesign

**Karten werden nie verschachtelt.** Keine Karte-in-Karte (auch keine Spalte als Karte):
Spalten- und Flow-Header sind reine Gliederung. Die Schritt-Karten bilden einen
**flachen Stapel kleiner Karten**.

**Karten klein halten:** Header (`⏱ Timer · x/y`) + Description + ggf. ✓-Button.
Mehrere Karten stehen untereinander (Stapel).

> Fehlerhafte Vorgänger-Umsetzung: verschachtelte Karten (Spalte als Karte mit
> Unterkarten) — Commit `e6a6011` (v0.4.0), verworfen.

**Alle Karten sind immer voll ausgeklappt** (Description sichtbar). Kein Ein-/Ausklappen mehr.

### Dekorator-Prinzip
- Karte = **farbiges Titelband oben** (Strang-Farbe, Farbe endet vertikal am Band-Ende)
  + **neutraler Body** (zinc, monoton) + **farbige Outline** (Strang-Farbe).
- Emoji bleibt farbig (visuelle Identität); der Body-Text trägt keine Strang-Farbe.
- Desktop-Spalten: Der Spalten-Header ist das farbige Titelband, Karten darunter neutral.

### Karten-Header
- Mobile „Jetzt": `🍚 FLOW-NAME ▸ · ⏱ Timer (nur wenn läuft) · x/y` — Titelband in
  Strang-Farbe, Flow-Name caps + klein; Titel-Tap → Flow-View.
- Desktop / Flow-View: `⏱ Timer (nur wenn läuft) · x/y` (Flow-Name steht im Spalten-/Flow-Header)

### Zustände
- **active**: hellere Outline (Strang-Farbe), Titelband heller
- **blocked**: dezenter, 🔒-Hinweis auf fehlende Abhängigkeit, ✓-Button deaktiviert
- **done**: gedimmt, Description bleibt sichtbar, ↺-Button zum Zurücknehmen
  (ausgeblendet, wenn eine abhängige Karte bereits abgeschlossen ist)

### Karte (allgemein)
```
┌──────────────────────────────────┐
│ 🍝 TOMATENSAUCE ▸ ⏱ 07:41  2/4  │  ← farbiges Titelband (nur mobile „Jetzt")
├──────────────────────────────────┤
│ Hitze mittel, ~10 min köcheln.  │  ← neutraler Body (zinc, Markdown)
│                                  │
│                         [ ✓ ]    │  ← runder Häkchen-Button (Abschluss + Navigation)
└──────────────────────────────────┘
```

- Klick auf Karte (Desktop/Flow-View) = `set_step` — Navigation, kein Abschluss,
  keine Toast-Bestätigung.
- ✓ (rund, nur Häkchen) = `complete_step` + Navigation zum nächsten Schritt.
- Mobile „Jetzt"-View: Karten einzeln untereinander, kein Klick-Navigation nötig;
  Tap auf das Titelband öffnet die Flow-View.

---

## Zutaten

- Gehören zum **Strang**, nicht global.
- Zutaten-Modal öffnet sich pro Strang.
- `open_zutaten` / `add_zutaten` erfordern `strang_id`.
- Globale Einkaufsliste (alle Zutaten aggregiert) bleibt als separate Ansicht möglich.

---

## Timer

- Gehören zum **Schritt** (Karte), nicht zum Strang.
- **Mehrere Schritte eines Strangs können gleichzeitig Timer laufen lassen** (parallele aktive Karten).
- Sichtbar: in der Schritt-Karte (Header), Topbar-Timer-Chips (mit Zeit + Emoji + Beschreibungsanfang).
- Dringlichkeit: Orange + Pulsieren < 2 min, Bell-Icon + Rot bei Ablauf.
- Bei Ablauf: KI navigiert aktiv zum betroffenen Schritt (`focus_strang` + `set_step`).
- `complete_strang` / `complete_step` brechen den laufenden Timer des Schritts ab.

---

## Topbar

- **Eine einzige Leiste** — keine zweite Timer-Leiste darunter.
- Kein Logo/Schriftzug „MURKS".
- Links: Timer-Chips (⏱ Emoji + Beschreibungsanfang + Zeit), scrollbar; rechts: 🎤 📄 ⚙.
- Chip-Dringlichkeit: gelb pulsierend < 2 min, rot (Bell) bei Ablauf. Klick = zu Schritt springen.

---

## Voice-Overlay

- Nur sichtbar wenn aktiv (Mic an / transkribiert / KI aktiv / ≤ 12s nach KI-Antwort / ≤ 10s nach STT-Text).
- Mic-Button immer erreichbar in der Topbar.
- Erkannte Eingabe (STT-Text) als eigener Streifen, fade-out nach 10s.
- Letzter KI-Text: max. 4 Zeilen, fade-out nach 12s.

---

## KI-Tools (Delta zu v1)

| Tool | Änderung |
|---|---|
| `add_strang` | `steps: Step[]` statt `steps: string[]`; zusätzlich `icon` (Emoji, LLM vergibt); Steps optional mit `depends_on` |
| `add_step` | `description` statt `text`; optional `depends_on` |
| `set_step` | unverändert (reine Navigation, schließt nie ab) |
| `complete_step` | **neu**: Schritt abschließen (`done`), Timer des Schritts abbrechen |
| `revert_step` | **neu**: Schritt auf nicht-erledigt setzen — nur wenn keine abhängige Karte abgeschlossen ist |
| `focus_strang` | unverändert |
| `start_timer` | `strang_id` + `step_index` (Timer gehört zum Schritt) |
| `cancel_timer` | `strang_id` + `step_index` |
| `complete_strang` | alle Schritte `done` + Strang `done` + alle Schritt-Timer abbrechen |
| `add_zutaten` | `strang_id` required |
| `open_zutaten` | `strang_id` required |
| `toggle_zutaten` / `close_zutaten` | unverändert |

---

## Offene Fragen

- `dependsOn` referenziert per Index — Indizes verschieben sich bei `add_step` (stabile Step-IDs später)?
- Schritt-spezifische Zutaten?
- Swipe-Schwellwert / Achsenerkennung bei nassen Händen?
- Einkaufslisten-Ansicht (alle Stränge aggregiert)?
