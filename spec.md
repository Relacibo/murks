# MURKS — UI/UX Spec v3 (Konzept C)

Voice-first Kochassistent-PWA. KI navigiert primär per Tool, Nutzer übersteuert per Touch.

> **B2 verworfen.** Konzept C: Schritte haben optionale Abhängigkeiten; „aktiv" heißt
> Abhängigkeiten erfüllt. Mobile zeigt alle aktiven Karten (statt Strips + eine Karte).
>
> **Sprach-Trennung:** visueller Text (UI) = **deutsch** („Strang", „Zutaten", „Zutatenliste");
> Tools, Parameter und State = **englisch** (`add_flow`, `flow_id`, `set_ingredients`, …).

---

## Kerndatenmodell

### Flow (UI: „Strang")
Ein paralleler Kochprozess (z.B. „Reis", „Soße", „Salat").

```ts
interface Flow {
  id: string
  name: string
  icon: string | null      // Emoji, vom LLM vergeben (add_flow) — visuelle Identität
  // keine color — Farbe wird aus der Flow-Position abgeleitet (FLOW_COLORS[Index])
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
  timer_seconds?: number | null // Verzögerung: Karte wird X s NACH Abschluss der Abhängigkeit frei
}

interface TimerOverride {
  alarmAt: number          // Endzeitpunkt (Alarm) — „neu setzen" setzt ihn neu,
                           // „+1 Min" verschiebt ihn
  pausedAt: number | null  // Pause-Beginn (Restzeit friert ein, Timer läuft nie ab)
}

interface Step {
  id: string               // stabil (crypto.randomUUID)
  description: string      // Volltext, Markdown-rendered; beginnt mit kurzer Kernaussage
  done: boolean            // Schritt einzeln abschließbar (✓-Button / complete_step)
  doneAt: number | null    // Abschlusszeitpunkt — Basis der Verzögerungen an den Kanten
  dependsOn: StepRef[]     // Abhängigkeiten liegen im abhängigen Step → m:n ergibt sich von selbst
  override: TimerOverride | null // explizite Wartezeit-Übersteuerung (set_timer/pause);
                                 // abgeleitete Wartezeiten werden NIE gespeichert
  activatedAt: number | null // Zeitpunkt des Eintritts in „Jetzt" (innerhalb seiner Queue: neu → hinten)
  priority: 'normal' | 'high' // high: bei active in der Prio-Queue oben (FIFO) + pulsierend
  score: number               // Scheduling-Hinweis der KI (Default 0): höher = weiter oben
}
```

> **Implizite Verzögerung an der Kante:** `StepRef.timer_seconds` — eine Karte sagt
> „ich komme X Minuten nach Abschluss dieser Karte". Zwei Karten können so mit
> **unterschiedlichen Offsets** an derselben Abhängigkeit hängen (Soße +0, Spaghetti +10).
> Der Schritt, auf den getimte Kanten zeigen, bekommt den
> ⏱-Button; wartende Karten zeigen den Countdown. Die Wartezeit ist **rein abgeleitet**
> (`doneAt + timer_seconds`, nie gespeichert); nur explizite Nutzer-/KI-Eingriffe
> (set_timer/pause) landen als `override` auf der Karte selbst — ein Timer gehört
> immer der Karte, auf der er liegt, nie den Dependents.

### Abgeleitete Schritt-Zustände
- **blocked**: mind. eine Abhängigkeit nicht `done`
- **waiting**: alle Abhängigkeiten `done`, aber das effektive Ende (Kanten-Verzögerung
  oder eigenes Override) liegt noch in der Zukunft → wird in „Jetzt" angezeigt
  (gedimmt wie blocked/done, Countdown in Flow-Farbe, amber ab < 30 s),
  ✓ = früh abschließen (Wartezeit überspringen)
- **active**: alle Abhängigkeiten `done` und alle Gates abgelaufen (bzw. keines deklariert)
- **done**: explizit abgeschlossen

Karte frei = **maximaler** Gate-Endzeitpunkt über alle Abhängigkeiten (der zuletzt ablaufende
Timer entscheidet). Der Countdown zeigt diesen Maximalwert — er steht erst fest, wenn alle
Abhängigkeiten abgeschlossen sind (deshalb zeigt nur waiting, nicht blocked, einen Countdown).
Die Zustände fallen **ausschließlich aus den Fakten** — es gibt keinen Code, der
blocked → waiting → active „setzt", und nichts, das synchronisiert werden müsste.

### Abschluss-Regeln
- **Navigation allein schließt nie ab** (`show_step`, Titel-Tap, Timer-Chip).
- **⏱-Button (Schritt mit getimter Kante auf ihn) bzw. ✓** = expliziter Abschluss: `complete_step`.
  Mit dem Abschluss laufen die Verzögerungen an den Kanten los (`doneAt`); abhängige Karten bleiben waiting,
  bis ihre Gates abgelaufen sind.
- **↺ Zurücknehmen** (`revert_step`) = abgeschlossenen Schritt wieder auf nicht-erledigt setzen —
  **nur möglich, wenn keine Karte, die diesen Schritt als Abhängigkeit hat, selbst abgeschlossen ist**
  (sonst ↺ ausgeblendet bzw. Tool-Fehler). Der revertierte Schritt erscheint wieder hinten in
  seiner „Jetzt"-Queue (`activatedAt` neu); `doneAt` und Timer werden verworfen, ein
  gesetzter `Flow.done` gelöscht; Abhängige werden wieder blocked (rücken in die Vorschau).
- `complete_flow` = alle Schritte `done` (+ `doneAt`) + Flow `done` + alle Timer abbrechen.
- `Flow.done` gilt zusätzlich als abgeleitet, wenn alle Schritte `done` sind.

> **Migration:** `steps: string[]` → `steps: Step[]`. Alte Daten: `string` wird `description`;
> altes `summary` wird übernommen, falls `description` leer ist.
> Alte Flow-Timer → Override des aktiven Schritts.
> Neue Felder defaulten: `id` (generiert), `done: false`, `doneAt: null`, `dependsOn: []`,
> `activatedAt: null`, `priority: 'normal'`. Alte `dependsOn`-Refs per `step_index` werden beim
> Laden auf `step_id` gemappt; `Flow.stepIndex` entfällt. Alte `timerSeconds` am Step werden
> beim Laden auf die Kanten aller Dependents verteilt; `doneAt` wird aus `timerEndsAt −
> timerSeconds` rekonstruiert.

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
  2. **Normale Queue**: **gruppiert nach Flow** (Anlegereihenfolge: Flow 1, Flow 2, …);
     innerhalb eines Flows stehen **alle** active + waiting Karten nach Schrittnummer.
     **Kein „ein Schritt pro Flow":** pro Flow können mehrere Karten stehen
     (z.B. parallele Timer — „Quellen lassen" + „Auflockern" gleichzeitig).
  3. **Blocked-Vorschau**: blocked-Karten, gedimmt wie done (keine gestrichelte Outline, kein
     Label — das Grau sagt es), in Anlage-Reihenfolge (Flow 1 Schritt n, n+1, … Flow 2 Schritt m, …).
- **Prio-Aktivierung:** Wird eine `high`-Karte aktiv (ihre einzige Bedingung ist erfüllt),
  wechselt die UI automatisch in die „Jetzt"-View (falls nicht schon dort) und scrollt
  nach oben — die Karte steht in der Prio-Queue und pulsiert.
- Die KI kann die Gruppierung nicht umsortieren (Reihenfolge = Flow-Anlegereihenfolge,
  innerhalb nach Schrittnummer; Prio-Queue = FIFO). Kein Reorder-Werkzeug.
- **Queue-Verhalten + Animation:** Abschließen entfernt die Karte — sie **fliegt weg**
  (Ghost: Desktop nach links, mobil nach oben, Fade-out) und die Karten darunter
  **wandern animiert nach oben** (FLIP). Der nächste Schritt desselben Flows **fliegt
  von rechts an die freie Stelle** (Standard-Ersatz — gleicher Flow, gleiche Position).
  **Timer-Karten** (waiting) sind schon in der Queue und **wandern per FLIP an die
  richtige Stelle**, wenn der Timer abläuft. **Blocked→aktiv:** mobil bubbelt die Karte
  nach oben und wird ent-dimmt; Desktop schießt sie von rechts rein (dort war sie
  nicht in der Liste). Abschließen „tauscht" nie den Karteninhalt.
- Karten voll ausgeklappt, **feste Größe**: **farbiges Titelband** (Emoji + Flow-Name,
  caps, klickbar) + ⏱ Timer + x/y; darunter neutraler Body (zinc) mit der Description
  (Markdown, 2 Zeilen). Der Body-Stil ist überall identisch — nur das Band unterscheidet
  pro Flow.
- ⏱ (Kartenfarbe, wenn eine getimte Kante auf den Schritt zeigt; mit kleinem Play-Icon
  unten rechts als Hinweis, dass dieser Abschluss den Timer startet) bzw. ✓ (rund) = `complete_step` + Navigation;
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
  (blocked erscheint nur mobil). Leicht getönter Hintergrund (kein vertikaler Strich) +
  kleines „Jetzt"-Label als Header (nicht klickbar, keine Flow-Chips).
  **Kartenbreite identisch zu den Flow-Spalten** (320px Spalte, gleiches Innen-Padding p-1).
- **Übersicht ein-/ausblendbar:** Topbar-Toggle (nur Desktop) klappt die Flow-Spalten
  komplett ein/aus. Geschlossen → nur die „Jetzt"-View, zentriert, mit breiteren Karten
  (400px) — **ohne Label und ohne Tönung, einfach nur die Karten.**
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
- **waiting:** gedimmt wie blocked/done (opacity, Farbzuordnung bleibt) — der Countdown
  leuchtet amber im Band; ✓ = früh abschließen.
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
- **waiting**: gedimmt wie blocked/done (opacity, Farbzuordnung bleibt) — der Countdown zeigt den hellen Flow-Farbton (wie Topbar-Chip), ab < 30 s amber + Puls;
  ✓ (grau, wie der ↺-Button) rechts neben dem Text = früh abschließen
- **blocked**: gedimmt wie done (opacity — **kein grayscale**, Farbzuordnung bleibt erhalten),
  🔒-Hinweis auf fehlende Abhängigkeit, kein ✓-Button
- **done**: gedimmt (gleiche Art wie blocked), Description bleibt sichtbar, ↺ in der Button-Zeile
  rechts neben dem Text (ausgeblendet, wenn eine abhängige Karte bereits abgeschlossen ist)
- **prio (high, active)**: pulsiert (Outline, **rot** — echter Alarm) und steht in „Jetzt"
  oben — greift beim Aktiv-Werden; blocked/waiting verhalten sich wie immer
- **Alarm-Feedback:** läuft ein Timer ab, blinkt an der Stelle des Countdowns im Kartenband
  eine ⏰-Uhr auf (max. ~6 s, Engine-Event) — nicht-prio in heller Kartenschriftfarbe,
  prio in Rot (die Karte pulsiert dort ohnehin). Dazu Ton (Web-Audio-Synthese, keine
  Assets): prio = Klirren eines mechanischen Weckers (auch bei gemutetem TTS),
  nicht-prio = kurzes informatives Bing (stumm bei gemutetem TTS); danach liest die
  vorhandene TTS-Logik den Text vor.

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

- **Karten haben natürliche Größe — nichts wird geklemmt oder abgekürzt:**
  Description und „Wartet auf"-Zeile zeigen immer den vollen Text (Zeilenumbrüche
  statt `…`). Karten dürfen unterschiedlich groß sein; ihre Größe ändert sich nur,
  wenn sich Daten ändern (Description, Abhängigkeiten, Zustand). Die **Button-Zeile**
  unter dem Text teilen sich Status (links) und Button (rechts); `min-h-11` reserviert
  sie auch ohne Button — blockierte Karten zeigen nur den Status und springen nicht.
- **Karten sind nicht klickbar** und haben **keine Hover-Effekte** (kein Aufhellen,
  kein Cursor-Pointer). Nur der **Titel** ist klickbar: springt gezielt zu diesem Schritt
  (Fokus + Flow-View/Scroll + kurzer Puls) — dasselbe wie das KI-Tool `show_step`.
- **Ausnahme: blockierte Karten** sind klickbar (Cursor-Pointer, Tooltip „Zeigt, worauf
  diese Karte wartet"): der Klick pulsiert die Karten, auf die sie wartet (dieselbe
  Puls-Mechanik wie der Timer-Chip-Klick), wo immer sie gerade sichtbar sind.
- ⏱ (Kartenfarbe, Schritt mit getimter Kante auf ihn) oder ✓ (rund, nur Häkchen) = `complete_step`;
  auf waiting-Karten überspringt ✓ die Wartezeit. Keine Navigations-Sprünge mehr.
- Mobile „Jetzt"-View: Karten einzeln untereinander, nicht klickbar;
  Tap auf das Titelband springt zum Schritt (Flow-View + Scroll + Puls).

---

## Zutaten (Ingredients)

- Gehören zum **Flow**, nicht global. UI-Text deutsch: „Zutaten", „Zutatenliste".
- Zutaten-Modal öffnet sich pro Flow.
- `open_ingredients` / `set_ingredients` erfordern `flow_id`.
- Agent hält die Zutatenliste absolut: `set_ingredients` ersetzt die komplette Liste — nach `add_flow` und bei jeder Änderung (Zutat dazu/weg, Mengen-Skalierung).
- **Kein Abhaken in der App** — die Liste ist read-only. Abhaken passiert beim Einkauf:
  Export-Button im Modal kopiert die Zutaten als Markdown-Checkliste (`- [ ] Name — Menge`)
  in die Zwischenablage (für Joplin & Co.).
- Globale Einkaufsliste (alle Zutaten aggregiert) bleibt als separate Ansicht möglich.
- Modal-Darstellung: Desktop zentriertes Dialog (max-w-md, Rahmen, abgerundet),
  Mobile Bottom-Sheet; schließt über X, Esc, Klick auf den Hintergrund.

---

## Modals (Chat + Zutaten)

- **Hauptscreen ist immer der Koch-Screen.** Chat, Zutatenliste und **Konfiguration** sind
  **nur Modals** (Bottom-Sheet mobil, zentriertes Dialog desktop).
- **Sichtbarkeit steht in der URL:** `?modal=chat`, `?modal=ingredients`, `?modal=config`,
  kombiniert `?modal=chat,ingredients`; **versteckte Übersicht: `?overview=hidden`** —
  öffnen/schließen ist back/forward-fähig.
- **KI kann die Modals öffnen und schließen:** `open_chat`/`close_chat`,
  `open_ingredients`/`close_ingredients` (Engine-Signal → URL).
- Chat-Modal: reine **Verlaufs-View** (auto-scroll, „Verlauf löschen") — ohne Mikro
  und ohne Eingabefeld. Die Eingabe ist **global** als Composer-Bar am unteren
  Bildschirmrand (Mikro + Textfeld + Senden; mobile Tastatur schiebt sie hoch,
  safe-area berücksichtigt). **Ein-/ausklappbar:** eingeklappt nur ein runder
  Sprechblasen-Button (sticky unten rechts), der die Bar aufklappt und das Textfeld
  fokussiert; ausgeklappt ersetzt bei leerem Eingabefeld ein ✕ den Senden-Button
  (einklappen, kein Extra-Platz), Escape klappt ebenfalls ein. Darüber erscheinen
  kurze Strips: das STT-Transkript für ~10 s, die letzte Agent-Antwort (TTS-Text)
  solange gesprochen wird und danach noch ~12 s — auch wenn der Composer
  eingeklappt ist. Ein dritter Strip zeigt nur während Hören/Transkribieren/Denken
  den Status. Die Voice-Instanz teilen sich Composer und Koch-Screen (eine Instanz). Die Übersichts-Spalten laufen wie die „Jetzt"-Ansicht
  über die volle Länge.
- Ohne Flows wird der Chat beim Laden automatisch geöffnet (Verlauf sichtbar — die
  ersten Flows entstehen über die Composer-Bar).

---

## Timer

- **Implizit, an der Kante:** Die Verzögerung steckt im `depends_on`-Eintrag der abhängigen
  Karte (`timer_seconds`) — „ich komme X Sekunden nach Abschluss dieser Karte". Der Schritt,
  der den Timer auslöst, deklariert nichts.
- **Läuft NACH dem Abschließen** des Schritts: `complete_step` setzt `doneAt`; das Gate einer
  Kante ist `doneAt + timer_seconds`. Mehrere Karten können mit unterschiedlichen Offsets an
  derselben Karte hängen.
- **Mehrere Gates:** Der zuletzt ablaufende entscheidet, wann die Karte frei wird (Maximum).
- **Abgeleitet, nie gespeichert:** Wartezeiten sind eine reine Funktion der Fakten
  (`doneAt + timer_seconds`) — es gibt kein Timer-Objekt und nichts zu synchronisieren.
  Nur explizite Eingriffe (set_timer/pause) liegen als `override` (`alarmAt` + `pausedAt`)
  auf der Karte selbst; ein Timer gehört immer der Karte, auf der er liegt. Neue, längere
  Bedingungen verlängern die Wartezeit automatisch, weil das Maximum stets frisch
  gerechnet wird.
- **Warte-Menü** (öffnet am Button der wartenden Karte): Pausieren/Fortsetzen,
  +1/+5 Min (aufschlagen), „Neu: 5 Min" (Startzeitpunkt komplett zurücksetzen),
  **⏩ Vorspulen** (= früh abschließen, Wartezeit überspringen).
- **Timer-Tools:** `set_timer` — `seconds` = neu setzen ab jetzt (`alarmAt` = jetzt +
  Dauer), `delta_seconds` (signed) = aufschlagen/verkürzen relativ zum aktuellen Ende.
  Auf einer wartenden Karte übersteuern die Tools deren Wartezeit (cancel_timer = zurück
  zur abgeleiteten Wartezeit); auf einer **aktiven** Karte versetzt `set_timer` sie selbst
  in den Wartezustand (Sleep, z.B. „muss noch 5 Minuten backen"). Auf blockierten oder
  abgeschlossenen Karten sind Timer-Tools nicht möglich — Wartezeit nach Abschluss
  gehört als `timer_seconds` an die Kante.
  `pause_timer`/`resume_timer` frieren die Restzeit ein bzw. setzen fort (die Pausendauer
  wird beim Fortsetzen auf `alarmAt` aufgeschlagen); pausierte Timer laufen nie ab.
- **Wartung:** einzig abgelaufene Overrides werden eingesammelt (Toast) — abgeleitete
  Gates brauchen keine, die Karte wird von selbst aktiv, sobald ihr Ende vorbei ist
  (Übergangs-Toast im ±2-s-Fenster).
- **Waiting-Karten** sind in „Jetzt" sichtbar (gedimmt wie blocked/done, Countdown in Flow-Farbe, ab < 30 s amber);
  ihr Button ist ein Uhr-Symbol (Kartenfarbe, pulsiert solange der Timer läuft) und öffnet das Warte-Menü (kein Direkt-Abschluss mehr).
- **Sortierung:** waiting-Karten stehen **unter** den aktiven und **über** den blocked;
  Reihenfolge nach Freiwerden (Timer-Ende), Tiebreaker `high` oben.
- **Revert:** `revert_step` verwirft `doneAt` und den Timer und macht Abhängige wieder
  blocked (sie rücken in die Vorschau).
- Sichtbar: **Countdown im Kartenband nur auf den wartenden Karten** (die den Timer als
  Bedingung haben); ⏸ im Band und im Chip, solange pausiert. Die Karte, die den Timer
  auslöst, zeigt keinen Countdown im Band — vorher nur der ⏱-Button; nach dem Abschluss
  trägt sie ein **einfaches ✓ wie jede andere erledigte Karte** (kein 🔔). Topbar-Timer-Chips
  (nur Emoji + Zeit) sind ein Chip pro Timer-Objekt — Timer ohne wartende Karten
  erscheinen dort nicht.
- **Klick auf einen Timer-Chip markiert die wartenden Karten** (kurzer Puls,
  wo immer sie gerade sichtbar sind).
- Dringlichkeit: Amber + Pulsieren < 30 s; bei Ablauf verschwindet der Topbar-Chip sofort.
- Bei Ablauf: KI navigiert aktiv zum betroffenen Schritt (`show_step`).
- `complete_flow` bricht alle Timer des Flows ab (Verzögerungen an den Kanten laufen implizit aus).

---

## Priorität

- `priority: 'normal' | 'high'` am Schritt (LLM-vergeben beim Anlegen; `update_step`
  zum Nachziehen). `high` sparsam — nur wenn sofortiges Handeln nötig ist (z.B. Ofen).
- **high-Karten** stehen bei `active` in der **Prio-Queue ganz oben** (FIFO) und
  **pulsieren** (Outline); als waiting/blocked verhalten sie sich wie jede andere Karte.
- **Ein-Dep-Regel (im Engine erzwungen):** Ein `high`-Schritt darf höchstens **eine**
  Abhängigkeit haben — den Schritt, dessen Abschluss (ggf. plus Kanten-Verzögerung) die
  Wartezeit bestimmt. Das zwingt dazu,
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

## Scheduling (Score)

- `score: number` am Schritt (Default 0, optional, LLM-vergeben — `add_flow`/`add_step`/
  `update_step`). **Stilles** Signal: sortiert die aktiven Karten der normalen Queue
  (absteigend; bei gleichem Score: **zuletzt aktualisierter Flow zuerst** — der letzte
  abgeschlossene Schritt zählt, `max(doneAt)` — dann Schritt-Reihenfolge). Kein Puls,
  keine Ein-Dep-Regel — das ist `priority: high` vorbehalten (echter Alarm).
- **Zweck:** optimale Arbeitsreihenfolge — lange Wartezeiten früh freigeben und mit
  anderer Arbeit füllen. Beispiel: „Mehl und Eier verrühren" (→ 30 min Ruhen) bekommt
  einen hohen Score, „Teig gehen lassen" keinen, „Zwiebeln schneiden" bleibt niedrig —
  der Teig steht oben, die Zwiebeln werden während der Ruhezeit geschnitten.
- **Platzierung:** Der Score sitzt auf der Karte **vor** der Wartezeit — deren Abschluss
  startet den Timer. Wartende Karten zählen nicht mit: solange sie blocked/waiting sind,
  konkurrieren sie nicht in der aktiven Queue; wenn sie aktiv werden, hängt keine lange
  Wartezeit mehr an ihnen.
- **Kein abgeleiteter Score:** Die Sortierung ist explizit und damit sichtbar und
  steuerbar. Die KI sieht den Graphen (`get_cook_state`) und übersetzt kritische Pfade
  selbst in Scores — auch Dinge, die nicht im Graphen stehen („Zwiebeln passen in die
  Ruhezeit-Lücke").
- „X ist vor Y fertig" als harte Constraint gibt es nicht — dafür bräuchte es einen
  Scheduler. Score ist die weiche Steuerung.

---

## Topbar

- **Eine einzige Leiste** — keine zweite Timer-Leiste darunter.
- Wortmarke „MURKS" nur auf dem Desktop (≥ 640px), links vor den Chips; mobile verzichtet darauf.
- Links: Timer-Chips (Emoji + Zeit — keine Beschreibung), scrollbar; rechts: 🔇 **Mute**
  (schaltet nur die Sprachausgabe stumm — Timer-Alarmtöne bleiben an; das Mikrofon sitzt
  in der Composer-Bar unten) + eine
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
- **Gesprächsmodus:** Einmal eingeschaltet bleibt das Mic an — über Agent-Antworten
  hinweg, bis der Nutzer es manuell ausmacht. VAD-Modi (lokal/server) hören nach
  jedem Transkript weiter. WebSpeech (Browser-Erkennung, one-shot) wird nach jeder
  Äußerung neu gestartet (Restart statt `continuous=true` — unzuverlässig in Chrome);
  solange der Agent antwortet (busy) oder spricht (TTS), wird nicht zugehört
  (Echo-Schutz), danach startet die Erkennung automatisch wieder.

## Toasts (Meldung unten)

- **Nur bei KI-Aktionen** (LLM führt Tools aus) und **Engine-Events** (Timer abgelaufen).
- **Nutzer-Aktionen erzeugen keine** Toasts — ✓/⏱ (abschließen), ↺ (zurücknehmen):
  der Nutzer sieht die Karte ja direkt. Ausnahme: der Zutaten-Export (Zwischenablage) —
  externer Effekt ohne sichtbare Bestätigung, bekommt einen kurzen Toast.

---

## KI-Tools

Schritte haben **stabile IDs** — alles referenziert über `step_id` (aus `get_cook_state`).
Die KI kann Flows ad-hoc umbauen: anlegen, umbenennen, löschen, Schritte einfügen/
umbenennen/löschen/teilen, Timer neu setzen oder verlängern.

| Tool | Semantik |
|---|---|
| `get_cook_state` | kompletter Zustand (Flows, Steps mit IDs, Timer, Ingredients) + Feld `queue`: Reihenfolge der „Jetzt"-View (erstes Element = oberste Karte) + `now_local` (lokale Uhrzeit mit Offset) + `waiting` (ref, `ends_in_s`, `ends_at_local` je wartender Karte) — Zeitfragen ohne Epoch-Mathematik |
| `add_flow` | neuer Flow: `name`, `icon`, `steps[]` mit `description`, `depends_on` (nur auf existierende Steps; Einträge optional mit `timer_seconds`), `priority`, `score` |
| `add_step` | Step anhängen oder hinter `after_step_id` einfügen; optional `depends_on` (inkl. `timer_seconds` an den Kanten), `priority`, `score` |
| `update_step` | `description` / `depends_on` (inkl. Kanten-`timer_seconds`) / `priority` / `score` ändern (nur angegebene Felder); Queue-Status wird neu bewertet |
| `delete_step` | Step entfernen; Refs auf ihn werden entfernt, frei gewordene Steps werden aktiv |
| `split_step` | Step teilen: Teil 1 bleibt (mit Prio), Teil 2 folgt danach und hängt von Teil 1 ab; Verweise auf den Original-Step zeigen auf Teil 2. Nur nicht-done |
| `complete_step` | `done` (+ `doneAt`); Verzögerungen der Dependents laufen ab hier; Abhängige kommen in „Jetzt" (waiting/active) |
| `revert_step` | zurücknehmen — nur wenn keine abhängige Karte abgeschlossen ist; verwirft `doneAt`/Timer, Abhängige werden wieder blocked |
| `set_timer` | Timer neu setzen („seconds" = Dauer ab jetzt, Startzeitpunkt wird zurückgesetzt) **oder aufschlagen** (`delta_seconds` signed: positiv = „noch X Minuten länger", negativ = verkürzen). Auf einer wartenden Karte: deren Wartezeit selbst |
| `pause_timer` | laufenden Timer pausieren (Restzeit friert ein); auf wartender Karte ohne eigenen Timer: Wartezeit einfrieren |
| `resume_timer` | pausierten Timer fortsetzen |
| `cancel_timer` | Timer abbrechen (Abhängige werden frei, sofern keine Kanten-Verzögerung läuft); auf wartender Karte: Reset auf die abgeleitete Wartezeit |
| `complete_flow` | alle Steps `done` (+ `doneAt`) + Flow `done` + alle Timer abbrechen |
| `update_flow` | `name` / `icon` ändern |
| `delete_flow` | Flow löschen; Refs anderer Flows auf seine Steps werden entfernt; Farben sind abgeleitet (FLOW_COLORS[Index]) — nichts zu pflegen |
| `reset_cook` | alles verwerfen: alle Flows + Ingredients löschen |
| `show_step` | gezielt einen Schritt zeigen: Fokus + View-Wechsel (mobil) + Scroll in den sichtbaren Bereich + kurzer Puls — ersetzt `set_step`/`focus_flow`-Navigation |
| `focus_flow` | Flow fokussieren (Spalten-Hervorhebung), ohne Schritt-Puls |
| `set_ingredients` | komplette Zutatenliste ersetzen (absolute Liste): `ingredients[]` mit `name`, optional `amount` |
| `open_ingredients` / `close_ingredients` | Zutaten-Modal |
| `open_chat` / `close_chat` | Chat-Modal |

**Entfernt:** `set_step`, `set_step_priority` (→ `update_step`), `toggle_ingredient` (kein Abhaken in der App mehr), `add_ingredient` (→ `set_ingredients`).

---

## Offene Fragen

- Schritt-spezifische Zutaten?
- Swipe-Schwellwert / Achsenerkennung bei nassen Händen?
- Einkaufslisten-Ansicht (alle Flows aggregiert)?
