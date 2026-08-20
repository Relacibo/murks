# MURKS — UI/UX Spec v3 (Konzept C)

Voice-first Kochassistent-PWA. KI navigiert primär per Tool, Nutzer übersteuert per Touch.

> **B2 verworfen.** Konzept C: Schritte haben optionale Abhängigkeiten; „aktiv" heißt
> Abhängigkeiten erfüllt. Mobile zeigt alle aktiven Karten (statt Strips + eine Karte).
>
> **Sprach-Trennung:** visueller Text (UI) = **deutsch** („Strang", „Zutaten", „Zutatenliste");
> Tools, Parameter und State = **englisch** (`add_flow`, `flow_id`, `add_ingredient`, …).

---

## Kerndatenmodell

### Flow (UI: „Strang")
Ein paralleler Kochprozess (z.B. „Reis", „Soße", „Salat").

```ts
interface Flow {
  id: string
  name: string
  icon: string | null      // Emoji, vom LLM vergeben (add_flow) — visuelle Identität
  color: FlowColor
  steps: Step[]
  done: boolean
  ingredients: Ingredient[]         // Ingredients gehören zum Flow, nicht global
}
```

### Schritt (Step)
**1 Karte = 1 Schritt. Schritte sind nie verschachtelt.**

```ts
interface StepRef {
  flow_id: string
  step_id: string          // stabile Schritt-ID — überlebt Einfügen/Löschen/Splitten
}

interface Step {
  id: string               // stabil (crypto.randomUUID)
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
- **Navigation allein schließt nie ab** (`show_step`, Titel-Tap, Timer-Chip).
- **⏱-Button (Schritt mit `timerSeconds`) bzw. ✓** = expliziter Abschluss: `complete_step`.
  Bei `timerSeconds` startet damit der Timer — abhängige Schritte bleiben waiting, bis er
  abgelaufen ist.
- **↺ Zurücknehmen** (`revert_step`) = abgeschlossenen Schritt wieder auf nicht-erledigt setzen —
  **nur möglich, wenn keine Karte, die diesen Schritt als Abhängigkeit hat, selbst abgeschlossen ist**
  (sonst ↺ ausgeblendet bzw. Tool-Fehler). Der revertierte Schritt erscheint wieder hinten in
  seiner „Jetzt"-Queue (`activatedAt` neu); sein eigener Timer wird verworfen, ein gesetzter
  `Flow.done` gelöscht; Abhängige werden wieder blocked (rücken in die Vorschau).
- `complete_flow` = alle Schritte `done` + Flow `done` + alle Schritt-Timer abbrechen.
- `Flow.done` gilt zusätzlich als abgeleitet, wenn alle Schritte `done` sind.

> **Migration:** `steps: string[]` → `steps: Step[]`. Alte Daten: `string` wird `description`;
> altes `summary` wird übernommen, falls `description` leer ist.
> Alte Flow-Timer → Timer des aktiven Schritts.
> Neue Felder defaulten: `id` (generiert), `done: false`, `dependsOn: []`, `activatedAt: null`,
> `priority: 'normal'`. Alte `dependsOn`-Refs per `step_index` werden beim Laden auf
> `step_id` gemappt; `Flow.stepIndex` entfällt.

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
**Spalten pro Flow** (nur Gliederung mit Überschrift, keine Karte), alle Schritte als
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
  **Kartenbreite identisch zu den Flow-Spalten** (320px Spalte, gleiches Innen-Padding p-1).
- **Übersicht ein-/ausblendbar:** Topbar-Toggle (nur Desktop) klappt die Flow-Spalten
  komplett ein/aus. Geschlossen → nur die „Jetzt"-View, zentriert, mit breiteren Karten
  (400px).
- **Rechts daneben die Flow-Spalten** (= mobile „Flow"-Views): jede Spalte hat ihre
  **eigene vertikale Scrollbar** (nur wenn nötig). **Die Seite selbst scrollt nie.**
- **Horizontales Scrollen nur im Flow-Bereich** — die „Jetzt"-Spalte bleibt stehen.
- Titel-Tap in der „Jetzt"-Spalte = **Schritt anspringen**: Flow fokussieren + Karte
  in den sichtbaren Bereich scrollen (Spalte horizontal, Karte vertikal) + kurzer Puls —
  gleiches Verhalten wie `show_step`.
- **Spaltenreihenfolge:** fix = Anlegereihenfolge.
- **Spalte ist keine Karte** — nur Header (Emoji + Name, Klick = fokussieren) + Kartenstapel.
- **Alle Schritt-Karten ausgeklappt** und **identisch zur mobilen Karte** (gleiches Titelband —
  bewusst redundant zum Spalten-Header). Karten-Header: `🍚 FLOW-NAME · ⏱ Timer · x/y`.
- **active:** hellere Outline in Flow-Farbe.
- **done:** gedimmt, ↺-Button zum Zurücknehmen (s. Abschluss-Regeln).
- **waiting:** gestrichelte Outline, Countdown im Band, ✓ = früh abschließen.
- **blocked:** gedimmt + 🔒 (Abhängigkeit offen), kein ✓-Button.
- **Mehrere Karten pro Flow können gleichzeitig Timer laufen lassen.**
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
- Karte = **farbiges Titelband oben** (Flow-Farbe, Farbe endet vertikal am Band-Ende)
  + **neutraler Body** (zinc, monoton) + **farbige Outline** (Flow-Farbe).
- Emoji bleibt farbig (visuelle Identität); der Body-Text trägt keine Flow-Farbe.
- **Karten sehen in Desktop und Mobile identisch aus** (eine `StepCard`-Komponente);
  Desktop-Spalten-Header bleibt zusätzlich als Gliederung.

### Karten-Header
- Titelband in Flow-Farbe: Emoji immer, **Flow-Name nur in „Jetzt" (View 1)** — in
  View 2 / Desktop-Spalten reicht das Emoji, der Name steht ja im Flow-/Spalten-Header.
  `· ⏱ Timer (nur wenn läuft) · x/y`. Nur mobile „Jetzt": `▸` + Titel-Tap =
  Schritt anspringen (Flow-View auf + Scroll + Puls).

### Zustände
- **active**: hellere Outline (Flow-Farbe), Titelband heller
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
  kein Cursor-Pointer). Nur der **Titel** ist klickbar: springt gezielt zu diesem Schritt
  (Fokus + Flow-View/Scroll + kurzer Puls) — dasselbe wie das KI-Tool `show_step`.
- ⏱ (grün, Schritt mit `timerSeconds`) oder ✓ (rund, nur Häkchen) = `complete_step`;
  auf waiting-Karten überspringt ✓ die Wartezeit. Keine Navigations-Sprünge mehr.
- Mobile „Jetzt"-View: Karten einzeln untereinander, nicht klickbar;
  Tap auf das Titelband springt zum Schritt (Flow-View + Scroll + Puls).

---

## Zutaten (Ingredients)

- Gehören zum **Flow**, nicht global. UI-Text deutsch: „Zutaten", „Zutatenliste".
- Zutaten-Modal öffnet sich pro Flow.
- `open_ingredients` / `add_ingredient` erfordern `flow_id`.
- Globale Einkaufsliste (alle Zutaten aggregiert) bleibt als separate Ansicht möglich.
- Modal-Darstellung: Desktop zentriertes Dialog (max-w-md, Rahmen, abgerundet),
  Mobile Bottom-Sheet; schließt über X, Esc, Klick auf den Hintergrund.

---

## Modals (Chat + Zutaten)

- **Hauptscreen ist immer der Koch-Screen.** Chat und Zutatenliste sind **nur Modals**
  (Bottom-Sheet mobil, zentriertes Dialog desktop).
- **Sichtbarkeit steht in der URL:** `?modal=chat`, `?modal=ingredients`, beides
  `?modal=chat,ingredients` — öffnen/schließen ist back/forward-fähig.
- **KI kann die Modals öffnen und schließen:** `open_chat`/`close_chat`,
  `open_ingredients`/`close_ingredients` (Engine-Signal → URL).
- Chat-Modal: Verlauf (auto-scroll), Texteingabe, Mikro, „Verlauf löschen", ⚙;
  die Voice-Instanz teilen sich Koch-Screen und Chat-Modal.
- Ohne Flows wird der Chat beim Laden automatisch geöffnet (dort entstehen die ersten Flows).

---

## Timer

- Gehören zum **Schritt** (Karte), nicht zum Flow. Deklariert als `timerSeconds` (Dauer)
  beim Anlegen (`add_flow`/`add_step`).
- **Läuft NACH dem Abschließen** des Schritts: `complete_step` startet den Timer;
  abhängige Schritte sind waiting, bis er abgelaufen ist. Mehrere Schritte eines Flows
  können parallel Timer laufen lassen.
- **Kein Timer-UI:** Neusetzen läuft über die KI — `start_timer` ersetzt den laufenden Timer
  (z.B. „das muss noch 5 Minuten"); `cancel_timer` bricht ab (Abhängige werden dann frei).
- **Waiting-Karten** sind in „Jetzt" sichtbar (gestrichelt, Countdown) und können mit ✓
  **vor Ablauf abgeschlossen** werden — das cancelt die Timer anderer Schritte nicht.
- **Revert:** `revert_step` verwirft den eigenen Timer und macht Abhängige wieder blocked
  (sie rücken in die Vorschau).
- Sichtbar: in der Schritt-Karte (Header) + Topbar-Timer-Chips (nur Emoji + Zeit).
  **Topbar-Chips nur für Timer, auf die eine offene Karte wartet** — Timer ohne
  abhängige Karten erscheinen nicht in der Topbar (Countdown bleibt auf der Karte).
- **Klick auf einen Timer-Chip markiert alle abhängigen Karten** (kurzer Puls,
  wo immer sie gerade sichtbar sind).
- Dringlichkeit: Orange + Pulsieren < 2 min; bei Ablauf verschwindet der Topbar-Chip sofort
  (Bell bleibt nur auf der Schritt-Karte).
- Bei Ablauf: KI navigiert aktiv zum betroffenen Schritt (`show_step`).
- `complete_flow` bricht alle Schritt-Timer des Flows ab.

---

## Priorität

- `priority: 'normal' | 'high'` am Schritt (LLM-vergeben beim Anlegen; `update_step`
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
- Links: Timer-Chips (Emoji + Zeit — keine Beschreibung), scrollbar; rechts: 🎤 + eine
  **Buttongruppe** [📄 Zutaten · 💬 Chat · ⚙ Konfiguration] als Segmente (gemeinsamer
  Rahmen, Trennlinien) + Desktop-Übersicht-Toggle.
- Chip-Dringlichkeit: gelb pulsierend < 2 min. **Bei Ablauf verschwindet der Chip sofort**
  (kein Bell-Chip). Klick = alle abhängigen Karten markieren (Puls).

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

## KI-Tools

Schritte haben **stabile IDs** — alles referenziert über `step_id` (aus `get_cook_state`).
Die KI kann Flows ad-hoc umbauen: anlegen, umbenennen, löschen, Schritte einfügen/
umbenennen/löschen/teilen, Timer neu setzen oder verlängern.

| Tool | Semantik |
|---|---|
| `get_cook_state` | kompletter Zustand (Flows, Steps mit IDs, Timer, Ingredients) |
| `add_flow` | neuer Flow: `name`, `icon`, `steps[]` mit `description`, `depends_on` (nur auf existierende Steps), `timer_seconds`, `priority` |
| `add_step` | Step anhängen oder hinter `after_step_id` einfügen; optional `depends_on`, `timer_seconds`, `priority` |
| `update_step` | `description` / `depends_on` / `timer_seconds` / `priority` ändern (nur angegebene Felder); Queue-Status wird neu bewertet |
| `delete_step` | Step entfernen; Refs auf ihn werden entfernt, frei gewordene Steps werden aktiv |
| `split_step` | Step teilen: Teil 1 bleibt (mit Timer/Prio), Teil 2 folgt danach und hängt von Teil 1 ab; Verweise auf den Original-Step zeigen auf Teil 2. Nur nicht-done |
| `complete_step` | `done`; startet bei `timerSeconds` den Timer; nimmt Abhängige in „Jetzt" auf (waiting/active) |
| `revert_step` | zurücknehmen — nur wenn keine abhängige Karte abgeschlossen ist; verwirft eigenen Timer, Abhängige werden wieder blocked |
| `start_timer` | `seconds` — Timer neu setzen **oder verlängern** (ersetzt laufenden; KI-Override, z.B. „noch 5 Minuten") |
| `cancel_timer` | Timer abbrechen (Abhängige werden frei) |
| `complete_flow` | alle Steps `done` + Flow `done` + alle Schritt-Timer abbrechen |
| `update_flow` | `name` / `icon` ändern |
| `delete_flow` | Flow löschen; Refs anderer Flows auf seine Steps werden entfernt |
| `reset_cook` | alles verwerfen: alle Flows + Ingredients löschen |
| `show_step` | gezielt einen Schritt zeigen: Fokus + View-Wechsel (mobil) + Scroll in den sichtbaren Bereich + kurzer Puls — ersetzt `set_step`/`focus_flow`-Navigation |
| `focus_flow` | Flow fokussieren (Spalten-Hervorhebung), ohne Schritt-Puls |
| `add_ingredient` | `name`, optional `amount` |
| `open_ingredients` / `close_ingredients` | Zutaten-Modal |
| `open_chat` / `close_chat` | Chat-Modal |
| `toggle_ingredient` | **kein KI-Tool mehr** — nur UI-intern (Nutzer hakt ab) |

**Entfernt:** `set_step`, `set_step_priority` (→ `update_step`), `toggle_ingredient` (KI-seitig).

---

## Offene Fragen

- Schritt-spezifische Zutaten?
- Swipe-Schwellwert / Achsenerkennung bei nassen Händen?
- Einkaufslisten-Ansicht (alle Flows aggregiert)?
