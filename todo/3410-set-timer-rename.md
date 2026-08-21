# 3410 · Tool umbenennen: start_timer → set_timer (+ delta_seconds)

**Prio: NIEDRIG**

## Was

`start_timer` heißt semantisch falsch — das Tool **setzt** einen Timer neu
(überschreibt Startzeitpunkt/Dauer, kann auch aufschlagen). `set_timer`
beschreibt das besser und hilft dem Modell, es von „Timer starten (erstmalig)"
zu unterscheiden. `edit_timer` verworfen: impliziert „nur bestehenden Timer
ändern", schließt den Erst-Set-Fall aus.

## Aufgaben-Paar statt Parameter-Wundertüte

- `seconds` (neu ab jetzt) bleibt.
- `offset_seconds` + `offset_base` ersetzen durch **`delta_seconds`**
  (signed, immer relativ zum aktuellen Ende): „+600" = 10 Minuten länger,
  „-300" = 5 Minuten kürzer. Der Basis-Parameter entfällt — aktuell ist
  `offset_seconds` ohne `offset_base: "end"` gar kein Offset, sondern ein
  absolutes Neu-Setzen (Redundanz mit `seconds`, verwirrt das Modell).

## Semantik beachten (create-or-set, PUT-artig)

Das Tool KANN neue Timer anlegen (`cookEngine.ts:591ff`): `seconds` erzeugt
auf jeder Karte ohne Timer einen neuen (auf aktiven Karten gatet er dann die
abhängigen Karten; auf wartenden materialisiert er die Wartezeit). Deshalb
passt `set_timer` (set = create-if-absent), nicht `edit_timer`. Mit
`delta_seconds` wird der Offset-Pfad eindeutig: ohne bestehenden Timer →
Wartezeit aus den Kanten materialisieren oder Fehler „kein laufender Timer".

## Tasks

- [ ] `tools.ts`: Tool-Name + Beschreibung auf `set_timer` umstellen,
      `offset_seconds`/`offset_base` → `delta_seconds`
- [ ] `cookEngine.ts`: `case 'start_timer'` → `case 'set_timer'`,
      Offset-Logik auf signed Delta vereinfachen
- [ ] `Cook.tsx`: `act('start_timer', …)`-Aufrufe umbenennen (Warte-Menü,
      inkl. `offset_seconds`/`offset_base`-Aufrufe)
- [ ] `CookMock.tsx`: Demo-Aufrufe prüfen
- [ ] Prompt (`store.ts`): alle `start_timer`/offset-Erwähnungen
      (Warte-Menü-Zeile, Referenzen-Zeile, Rollenklärung) umbenennen
- [ ] Alt-Daten: Chat-Verlauf kann alte `start_timer`-Tool-Aufrufe enthalten —
      beim Convo-Aufbau (sendMessage) alte Namen mappen oder Verlauf einmal
      clearen (Prüfen, ob der Provider History-Toolnamen strikt validiert)

## Abhängigkeit

→ 3400 (Timer pro Schritt, erledigt)
