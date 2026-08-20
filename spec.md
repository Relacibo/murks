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
  description: string      // Volltext, Markdown-rendered; beginnt mit kurzer Kernaussage
  done: boolean            // Schritt einzeln abschließbar (✓-Button / complete_step)
  dependsOn: StepRef[]     // Abhängigkeiten liegen im abhängigen Step → m:n ergibt sich von selbst
  timerSeconds: number | null  // deklarierte Dauer: läuft NACH Abschluss des Schritts
  timerEndsAt: number | null   // Laufzeit-Endzeit (von Abschluss oder start_timer)
  timerExpired: boolean
  activatedAt: number | null // Zeitpunkt des Eintritts in „Jetzt" (innerhalb seiner Queue: neu → hinten)
  priority: 'normal' | 'high' // high: bei active in der Prio-Queue oben (FIFO) + pulsierend
}
```

### Abgeleitete Schritt-Zustände
- **blocked**: mind. eine Abhängigkeit nicht `done`
- **waiting**: alle Abhängigkeiten `done`, aber mind. ein Timer einer Abhängigkeit läuft noch
  → wird in „Jetzt" angezeigt (gestrichelt, Countdown), ✓ = früh abschließen (Wartezeit überspringen)
- **active**: alle Abhängigkeiten `done` und deren Timer abgelaufen (bzw. keiner deklariert)
- **done**: explizit abgeschlossen

### Abschluss-Regeln
- **Navigation allein schließt nie ab** (◀▶, Dots, `set_step`).
- **⏱-Button (Schritt mit `timerSeconds`) bzw. ✓** = expliziter Abschluss: `complete_step`
  + Navigation zum nächsten. Bei `timerSeconds` startet damit der Timer — abhängige
  Schritte bleiben waiting, bis er abgelaufen ist.
- **↺ Zurücknehmen** (`revert_step`) = abgeschlossenen Schritt wieder auf nicht-erledigt setzen —
  **nur möglich, wenn keine Karte, die diesen Schritt als Abhängigkeit hat, selbst abgeschlossen ist**
  (sonst ↺ ausgeblendet bzw. Tool-Fehler). Der revertierte Schritt erscheint wieder hinten in
  seiner „Jetzt"-Queue (`activatedAt` neu); sein eigener Timer wird verworfen, ein gesetzter
  `Strang.done` gelöscht; Abhängige werden wieder blocked (rücken in die Vorschau).
- `complete_strang` = alle Schritte `done` + Strang `done` + alle Schritt-Timer abbrechen.
- `Strang.done` gilt zusätzlich als abgeleitet, wenn alle Schritte `done` sind.

> **Migration:** `steps: string[]` → `steps: Step[]`. Alte Daten: `string` wird `description`;
> altes `summary` wird übernommen, falls `description` leer ist.
> Alte Strang-Timer → Timer des aktiven Schritts.
> Neue Felder defaulten: `done: false`, `dependsOn: []`, `activatedAt: null`,
> `priority: 'normal'`.
> Offen: `dependsOn` referenziert per Index — Indizes verschieben sich bei `add_step`
> (für v1 akzeptiert; später stabile Step-IDs).

---

## Mobile Layout (≤ 639px)

### Prinzip (Konzept C)
Zwei Views:

1. **„Jetzt"** (Standard, mobile-only): eine **Queue** aller aktiven Karten über alle Flows —
   die Dinge, die gerade dran sind. Ganz oben die Prio-Queue, darunter die normale Queue,
   unten als **Vorschau** die blocked-Karten (gedimmt, mit Farbe). Done-Karten sind ausgeblendet.
2. **„Flow"**: die Karten **eines** Flows — optisch identisch mit einer Desktop-Spalte
   (vertikaler Kartenstapel mit allen Zuständen: done/active/waiting/blocked).

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
│ │ Hitze mittel, ~10 min  [ ✓ ] │   │  ← neutraler Body (zinc), Button rechts neben Text
│ │ köcheln.                     │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ 🍚 REIS ▸           ⏱ 04:00 │   │
│ ├──────────────────────────────┤   │
│ │ Quellen lassen …       3/5   │   │
│ └──────────────────────────────┘   │
│ ┌──────────────────────────────┐   │
│ │ 🍝 TOMATENSAUCE 🔒     4/5   │   │  ← Blocked-Vorschau (gedimmt, Farbe bleibt)
│ │ Abschmecken …                │   │
│ └──────────────────────────────┘   │
└────────────────────────────────────┘
```

- **Drei Zonen, von oben nach unten:**
  1. **Prio-Queue**: aktive `high`-Karten, FIFO (Auftauch-Reihenfolge — eine neue Prio
     kommt hinten dran, verdrängt keine ältere), pulsierend.
  2. **Normale Queue**: active + waiting in Auftauch-Reihenfolge.
  3. **Blocked-Vorschau**: blocked-Karten, gedimmt wie done (keine gestrichelte Outline, kein
     Label — das Grau sagt es), in Anlage-Reihenfolge (Flow 1 Schritt n, n+1, … Flow 2 Schritt m, …).
- **Prio-Aktivierung:** Wird eine `high`-Karte aktiv (ihre einzige Bedingung ist erfüllt),
  wechselt die UI automatisch in die „Jetzt"-View (falls nicht schon dort) und scrollt
  nach oben — die Karte steht in der Prio-Queue und pulsiert.
- Neu eintretende Karten (KI legt Schritt an, Abhängigkeit erfüllt, Timer abgelaufen)
  werden in ihrer Queue **unten angehängt**. Die KI kann nicht umsortieren (append-only,
  kein Reorder-Werkzeug).
- **Queue-Verhalten + Animation:** Abschließen entfernt die Karte aus der Queue — die
  Karten darunter **wandern animiert nach oben** (FLIP). **Blocked→aktiv:** mobil ist die
  Karte schon sichtbar — sie **bubbelt nur nach oben** und wird mit einer
  **Farb-/Opacity-Transition** ent-dimmt; Desktop schießt sie **von rechts rein**
  (dort war sie nicht in der Liste). Brandneue Karten (KI legt Schritt an) schießen
  unten von rechts rein. Abschließen „tauscht" nie den Karteninhalt.
- Karten voll ausgeklappt, **feste Größe**: **farbiges Titelband** (Emoji + Flow-Name,
  caps, klickbar) + ⏱ Timer + x/y; darunter neutraler Body (zinc) mit der Description
  (Markdown, 2 Zeilen). Der Body-Stil ist überall identisch — nur das Band unterscheidet
  pro Flow.
- ⏱ (grün, bei `timerSeconds`) bzw. ✓ (rund) = `complete_step` + Navigation;
  auf waiting-Karten = früh abschließen. Navigation allein schließt nie ab.
- Blocked-Karte: 🔒 + Hinweis auf fehlende Abhängigkeit, kein ✓-Button.

### Aufbau „Flow" (≈ Desktop-Spalte)

Wie Desktop: Flow-Header + vertikaler Kartenstapel (done gedimmt, active hervorgehoben,
blocked mit Hinweis), scrollbar. Keine ◀▶-Browse-Navigation nötig — alles sichtbar.

---

## Desktop Layout (≥ 640px)

### Prinzip
Genug Platz → **links die „Jetzt"-Spalte** (fix, wie die mobile View 1), rechts daneben
**Spalten pro Strang** (nur Gliederung mit Überschrift, keine Karte), alle Schritte als
**voll ausgeklappte Karten** vertikal gestapelt. Keine Browsing-Navigation nötig —
alles sichtbar.

```
┌──────────────────────────────────────────────────────────────────────┐
│ ⏱🍚04:00 ⏱🥗01:12 ⏱🥫07:41                        🎤  📄  ⚙      │  ← Topbar
├─────────────┬───────────────────────┬────────────────────────────────┤
│ JETZT       │ 🍚 REIS              │ 🍝 SAUCE        │ 🥗 SALAT     │  ← Header
│ (getönt,    │                       │                 │              │    „Jetzt" = kleines
│  kein Strich)│┌───────────────────┐  │ ┌─────────────┐  │ ┌──────────┐ │    Label, nicht
│┌───────────┐││ ✓ Quellen lassen  │  │ │ Einreduzieren│  │ │ Dressing │ │    klickbar
││ Prio ═══╗ │││   ⏱ 04:00  3/5    │  │ │ ⏱ 07:41 2/4 │  │ │ ⏱ 01:12  │ │
│└───────────┘│└───────────────────┘  │ │ …           │  │ │ …        │ │
│┌───────────┐│┌───────────────────┐  │ └─────────────┘  │ └──────────┘ │
││ aktiv …   │││ Auflockern …  4/5 │  │ ┌─────────────┐  │ ┌──────────┐ │
│└───────────┘│└───────────────────┘  │ │ Abschmecken🔒│  │ │ …        │ │
│             │                       │ └─────────────┘  │ └──────────┘ │
│ ← eigene    │ ← eigene Scrollbars   │ ← eigene Scrollbars              │
└─────────────┴───────────────────────┴─────────────────┴──────────────┘
```

- **„Jetzt"-Spalte ganz links, fix:** wie die mobile View 1 — aber **ohne Blocked-Vorschau**
  (blocked erscheint nur mobil). Nur leicht getönter Hintergrund (kein vertikaler Strich).
  Kleines „Jetzt"-Label als Header (nicht klickbar, keine Flow-Chips).
- **Ein-/ausblendbar:** Topbar-Toggle (nur Desktop) klappt die Übersicht komplett
  ein/aus. Geschlossen → Strang-Spalten zentriert und Karten breiter (Spalten wachsen).
- **Rechts daneben die Strang-Spalten** (= mobile „Flow"-Views): jede Spalte hat ihre
  **eigene vertikale Scrollbar** (nur wenn nötig). **Die Seite selbst scrollt nie.**
- **Horizontales Scrollen nur im Strang-Bereich** — die „Jetzt"-Spalte bleibt stehen.
- Titel-Tap in der „Jetzt"-Spalte = Strang fokussieren + Spalte horizontal ins Bild
  scrollen (falls nicht sichtbar).
- **Spaltenreihenfolge:** fix = Anlegereihenfolge.
- **Spalte ist keine Karte** — nur Header (Emoji + Name, Klick = fokussieren) + Kartenstapel.
- **Alle Schritt-Karten ausgeklappt** und **identisch zur mobilen Karte** (gleiches Titelband —
  bewusst redundant zum Spalten-Header). Karten-Header: `🍚 FLOW-NAME · ⏱ Timer · x/y`.
- **active:** hellere Outline in Strang-Farbe.
- **done:** gedimmt, ↺-Button zum Zurücknehmen (s. Abschluss-Regeln).
- **waiting:** gestrichelte Outline, Countdown im Band, ✓ = früh abschließen.
- **blocked:** gedimmt + 🔒 (Abhängigkeit offen), kein ✓-Button.
- **Mehrere Karten pro Strang können gleichzeitig Timer laufen lassen.**
- Vertikales Scrollen pro Spalte. Kein horizontales Scrollen (bis auf die Spalten selbst).

---

## Kartendesign

**Karten werden nie verschachtelt.** Keine Karte-in-Karte (auch keine Spalte als Karte):
Spalten- und Flow-Header sind reine Gliederung. Die Schritt-Karten bilden einen
**flachen Stapel kleiner Karten**.

**Karten klein halten:** Titelband (`🍚 FLOW-NAME · ⏱ Timer · x/y`) + Description + ggf. ✓/↺.
Mehrere Karten stehen untereinander (Stapel).

> Fehlerhafte Vorgänger-Umsetzung: verschachtelte Karten (Spalte als Karte mit
> Unterkarten) — Commit `e6a6011` (v0.4.0), verworfen.

**Alle Karten sind immer voll ausgeklappt** (Description sichtbar). Kein Ein-/Ausklappen mehr.

### Dekorator-Prinzip
- Karte = **farbiges Titelband oben** (Strang-Farbe, Farbe endet vertikal am Band-Ende)
  + **neutraler Body** (zinc, monoton) + **farbige Outline** (Strang-Farbe).
- Emoji bleibt farbig (visuelle Identität); der Body-Text trägt keine Strang-Farbe.
- **Karten sehen in Desktop und Mobile identisch aus** (eine `StepCard`-Komponente);
  Desktop-Spalten-Header bleibt zusätzlich als Gliederung.

### Karten-Header
- Titelband in Strang-Farbe: Emoji immer, **Flow-Name nur in „Jetzt" (View 1)** — in
  View 2 / Desktop-Spalten reicht das Emoji, der Name steht ja im Flow-/Spalten-Header.
  `· ⏱ Timer (nur wenn läuft) · x/y`. Nur mobile „Jetzt": `▸` + Titel-Tap → Flow-View.

### Zustände
- **active**: hellere Outline (Strang-Farbe), Titelband heller
- **waiting**: gestrichelte Outline, Countdown im Band, ✓ rechts neben dem Text = früh abschließen
- **blocked**: gedimmt wie done (opacity — **kein grayscale**, Farbzuordnung bleibt erhalten),
  🔒-Hinweis auf fehlende Abhängigkeit, kein ✓-Button
- **done**: gedimmt (gleiche Art wie blocked), Description bleibt sichtbar, ↺ im Button-Slot
  rechts neben dem Text (ausgeblendet, wenn eine abhängige Karte bereits abgeschlossen ist)
- **prio (high, active)**: pulsiert (Outline) und steht in „Jetzt" oben — greift beim
  Aktiv-Werden; blocked/waiting verhalten sich wie immer

### Karte (allgemein)
```
┌──────────────────────────────────┐
│ 🍝 TOMATENSAUCE ▸ ⏱ 07:41  2/4  │  ← farbiges Titelband (▸ nur mobile „Jetzt")
├──────────────────────────────────┤
│ Hitze mittel, ~10 min  [ ⏱ ]    │  ← Body: Description links, Button rechts
│ köcheln.                 ▲      │     (fester Slot neben dem Text)
│                                  │
└──────────────────────────────────┘
```

- **Karten ändern nie ihre Größe:** Description fest auf 2 Zeilen geklemmt (line-clamp),
  Statuszeile und Button-Slot fest reserviert — Zustandswechsel (Button erscheint,
  „Wartet auf"-Zeile) verschieben nichts. Reines CSS (Flex + line-clamp), keine
  Laufzeit-Berechnung nötig.
- **Karten sind nicht klickbar** und haben **keine Hover-Effekte** (kein Aufhellen,
  kein Cursor-Pointer). Nur der **Titel** ist klickbar: mobil → Flow-View,
  Desktop → Strang fokussieren + Spalte horizontal ins Bild scrollen.
- ⏱ (grün, Schritt mit `timerSeconds`) oder ✓ (rund, nur Häkchen) = `complete_step`
  + Navigation zum nächsten Schritt; auf waiting-Karten überspringt ✓ die Wartezeit.
- Mobile „Jetzt"-View: Karten einzeln untereinander, nicht klickbar;
  Tap auf das Titelband öffnet die Flow-View.

---

## Zutaten

- Gehören zum **Strang**, nicht global.
- Zutaten-Modal öffnet sich pro Strang.
- `open_zutaten` / `add_zutaten` erfordern `strang_id`.
- Globale Einkaufsliste (alle Zutaten aggregiert) bleibt als separate Ansicht möglich.

---

## Timer

- Gehören zum **Schritt** (Karte), nicht zum Strang. Deklariert als `timerSeconds` (Dauer)
  beim Anlegen (`add_strang`/`add_step`).
- **Läuft NACH dem Abschließen** des Schritts: `complete_step` startet den Timer;
  abhängige Schritte sind waiting, bis er abgelaufen ist. Mehrere Schritte eines Strangs
  können parallel Timer laufen lassen.
- **Kein Timer-UI:** Neusetzen läuft über die KI — `start_timer` ersetzt den laufenden Timer
  (z.B. „das muss noch 5 Minuten"); `cancel_timer` bricht ab (Abhängige werden dann frei).
- **Waiting-Karten** sind in „Jetzt" sichtbar (gestrichelt, Countdown) und können mit ✓
  **vor Ablauf abgeschlossen** werden — das cancelt die Timer anderer Schritte nicht.
- **Revert:** `revert_step` verwirft den eigenen Timer und macht Abhängige wieder blocked
  (sie rücken in die Vorschau).
- Sichtbar: in der Schritt-Karte (Header), Topbar-Timer-Chips (nur Emoji + Zeit bzw. 🔔).
- Dringlichkeit: Orange + Pulsieren < 2 min; bei Ablauf verschwindet der Topbar-Chip sofort
  (Bell bleibt nur auf der Schritt-Karte).
- Bei Ablauf: KI navigiert aktiv zum betroffenen Schritt (`focus_strang` + `set_step`).
- `complete_strang` bricht alle Schritt-Timer des Strangs ab.

---

## Priorität

- `priority: 'normal' | 'high'` am Schritt (LLM-vergeben beim Anlegen; `set_step_priority`
  zum Nachziehen). `high` sparsam — nur wenn sofortiges Handeln nötig ist (z.B. Ofen).
- **high-Karten** stehen bei `active` in der **Prio-Queue ganz oben** (FIFO) und
  **pulsieren** (Outline); als waiting/blocked verhalten sie sich wie jede andere Karte.
- **Ein-Dep-Regel (im Engine erzwungen):** Ein `high`-Schritt darf höchstens **eine**
  Abhängigkeit haben — den Schritt, dessen Timer die Wartezeit bestimmt. Das zwingt dazu,
  zeitkritische Aktionen als eigene Karte zu modellieren („Aus dem Ofen holen" hängt nur
  von „In den Ofen" ab). Verstöße → Tool-Fehler.
- **Blocked = ganz normal blocked** — kein Puls, kein ✓; erscheint in „Jetzt" nur in der
  Blocked-Vorschau unten (gedimmt, Farbe bleibt).
- **Prio-Queue:** Mehrere `high`-Karten bilden eine eigene FIFO-Queue ganz oben —
  eine neu aktivierte Prio verdrängt keine ältere, sie kommt hinten dran.
- **Beim Aktiv-Werden** (Bedingung erfüllt — bei `high` gibt es nur eine) wechselt die
  UI automatisch in die „Jetzt"-View (falls nicht schon dort), scrollt nach oben, und die
  Karte **pulsiert** in der Prio-Queue. Abschließen ist dann ganz normal möglich (keine
  Ausnahme). Vorher (waiting) verhält sie sich wie jede waiting-Karte (Countdown,
  ✓ = überspringen).
- Prio hängt nicht vom Timer ab und unterbricht nichts — Hervorhebung **plus** Aufmerksamkeits-
  Trigger beim Aktiv-Werden (Auto-Wechsel in „Jetzt" + Scroll nach oben).

---

## Topbar

- **Eine einzige Leiste** — keine zweite Timer-Leiste darunter.
- Kein Logo/Schriftzug „MURKS".
- Links: Timer-Chips (Emoji + Zeit — keine Beschreibung), scrollbar; rechts: 🎤 📄 ⚙ (+ Toggle
  für die Desktop-Übersicht).
- Chip-Dringlichkeit: gelb pulsierend < 2 min. **Bei Ablauf verschwindet der Chip sofort**
  (kein Bell-Chip). Klick = zu Schritt springen.

---

## Voice-Overlay

- Nur sichtbar wenn aktiv (Mic an / transkribiert / KI aktiv / ≤ 12s nach KI-Antwort / ≤ 10s nach STT-Text).
- Mic-Button immer erreichbar in der Topbar.
- Erkannte Eingabe (STT-Text) als eigener Streifen, fade-out nach 10s.
- Letzter KI-Text: max. 4 Zeilen, fade-out nach 12s.

## Toasts (Meldung unten)

- **Nur bei KI-Aktionen** (LLM führt Tools aus) und **Engine-Events** (Timer abgelaufen).
- **Nutzer-Aktionen erzeugen keine** Toasts — ✓/⏱ (abschließen), ↺ (zurücknehmen),
  Zutaten-Haken: der Nutzer sieht die Karte ja direkt. Die Meldung unten bleibt den
  Dingen vorbehalten, die der Nutzer nicht selbst ausgelöst hat.

---

## KI-Tools (Delta zu v1)

| Tool | Änderung |
|---|---|
| `add_strang` | `steps: Step[]` statt `steps: string[]`; zusätzlich `icon` (Emoji, LLM vergibt); Steps optional mit `depends_on`, `timer_seconds` (läuft nach Abschluss), `priority` |
| `add_step` | `description` statt `text`; optional `depends_on`, `timer_seconds`, `priority` |
| `set_step` | unverändert (reine Navigation, schließt nie ab) |
| `complete_step` | **neu**: Schritt abschließen (`done`); startet bei `timerSeconds` den Timer; nimmt Abhängige in „Jetzt" auf (waiting/active) |
| `revert_step` | **neu**: Schritt auf nicht-erledigt setzen — nur wenn keine abhängige Karte abgeschlossen ist; verwirft eigenen Timer, Abhängige werden wieder blocked |
| `set_step_priority` | **neu**: `priority` eines Schritts setzen (`high` → sobald aktiv: Prio-Queue oben + pulsierend); `high` nur mit höchstens einer Abhängigkeit |
| `focus_strang` | unverändert |
| `start_timer` | `strang_id` + `step_index` + `seconds` — Timer (neu) setzen, ersetzt laufenden (KI-Override, z.B. „noch 5 Minuten") |
| `cancel_timer` | `strang_id` + `step_index` — Timer abbrechen (Abhängige werden frei) |
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
