export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

const depRefSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      flow_id: { type: 'string' },
      step_id: { type: 'string', description: 'Stabile Schritt-ID (aus get_cook_state)' },
      timer_seconds: {
        type: 'number',
        description:
          'Optionale Verzögerung in Sekunden: Die Karte wird erst X Sekunden NACH dem Abschluss dieser Abhängigkeit frei („ich komme X nach dieser Karte").',
      },
    },
    required: ['flow_id', 'step_id'],
  },
  description:
    'Optionale Abhängigkeiten (Schritte, die zuerst erledigt sein müssen). Es gibt KEINE implizite Reihenfolge — ohne depends_on läuft der Schritt sofort parallel. Verkette jeden Folgeschritt explizit an seinen Vorgänger (auch Schritt 2 → Schritt 1). JEDE Zeitangabe im Rezept MUSS als timer_seconds an der Kante zur Folgekarte stehen („10 Minuten kochen" → Folgekarte mit timer_seconds 600). WARTEZEIT vs. aktive Arbeit: Die Kante bedeutet passives Warten (backen, ziehen lassen, kühlen). Bestimmt das ERGEBNIS das Ende („bis goldbraun", „bis sämig") oder ist der Koch aktiv („unter Rühren aufkochen"), gibt es KEINE Kante — die Zeit steht in der Beschreibung der Karte selbst. Zeitangaben stehen am ENDE der auslösenden Karte (Kernaussage zuerst); die wartende Folgekarte nennt KEINE Zeit, nur was nach Ablauf zu tun ist. Endet ein Rezept mit einer Wartezeit, hänge einen finalen Schritt an, der mit timer_seconds darauf wartet („Anschneiden und servieren"). Über Flow-Grenzen ist die Kante das Scheduling-Werkzeug: „Sahne steif schlagen" hängt mit kleinerem timer_seconds am GLEICHEN Anker wie die Wartekarte — erscheint kurz davor. PLANE SO SPÄT WIE MÖGLICH (mit Puffer): Ergebnisse, die altern (vorgeheizter Ofen, geschlagene Sahne, geschmolzene Butter), gehören NICHT frei an den Anfang — verankere sie so, dass sie genau dann fertig sind, wenn sie gebraucht werden. Beispiel Hirse: [aufkochen] →(540s)→ [quellen lassen] →(600s)→ [lockern]. „Ofen auf 180° vorheizen" (≈ 5 Min) soll heiß sein, wenn das Quellen endet: hänge es mit timer_seconds=300 an die Quell-Karte — Rechnung: timer = Quellzeit 600 − Vorheizzeit 300, der Ofen startet 5 Min vor Quell-Ende und ist exakt pünktlich. Die Rechnung steckt im timer_seconds, nicht in der Beschreibung. Bei Unsicherheit lieber etwas früher starten — ein heißer Ofen hält die Temperatur, wartendes Essen wird kalt.',
}

/** depends_on in add_flow: Vorgänger im SELBEN neuen Flow per step_index
    (0-basiert, muss kleiner als der eigene Index sein) ODER auf bereits
    existierende Schritte anderer Flows per flow_id + step_id. */
const addFlowDepRefSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      step_index: {
        type: 'number',
        description:
          'Vorgänger innerhalb DIESES neuen Flows: 0-basierter Index des Schritts im steps-Array (muss kleiner als der eigene Index sein).',
      },
      flow_id: { type: 'string', description: 'Für Vorgänger in einem anderen, bereits existierenden Flow' },
      step_id: { type: 'string', description: 'Stabile Schritt-ID (aus get_cook_state)' },
      timer_seconds: {
        type: 'number',
        description:
          'Optionale Verzögerung in Sekunden: Die Karte wird erst X Sekunden NACH dem Abschluss dieser Abhängigkeit frei („ich komme X nach dieser Karte").',
      },
    },
  },
  description:
    'Optionale Abhängigkeiten. Es gibt KEINE implizite Reihenfolge — ohne depends_on läuft der Schritt sofort parallel. Verkette jeden Folgeschritt explizit an seinen Vorgänger: innerhalb dieses neuen Flows per step_index, auf bestehende Schritte anderer Flows per flow_id + step_id. JEDE Zeitangabe im Rezept MUSS als timer_seconds an der Kante zur Folgekarte stehen („10 Minuten kochen" → Folgekarte mit timer_seconds 600). WARTEZEIT vs. aktive Arbeit: Die Kante bedeutet passives Warten (backen, ziehen lassen, kühlen). Bestimmt das ERGEBNIS das Ende („bis goldbraun", „bis sämig") oder ist der Koch aktiv („unter Rühren aufkochen"), gibt es KEINE Kante — die Zeit steht in der Beschreibung der Karte selbst. Zeitangaben stehen am ENDE der auslösenden Karte (Kernaussage zuerst); die wartende Folgekarte nennt KEINE Zeit, nur was nach Ablauf zu tun ist. Endet ein Rezept mit einer Wartezeit, hänge einen finalen Schritt an, der mit timer_seconds darauf wartet („Anschneiden und servieren"). Über Flow-Grenzen ist die Kante das Scheduling-Werkzeug: „Sahne steif schlagen" hängt mit kleinerem timer_seconds am GLEICHEN Anker wie die Wartekarte — erscheint kurz davor. PLANE SO SPÄT WIE MÖGLICH (mit Puffer): Ergebnisse, die altern (vorgeheizter Ofen, geschlagene Sahne, geschmolzene Butter), gehören NICHT frei an den Anfang — verankere sie so, dass sie genau dann fertig sind, wenn sie gebraucht werden. Beispiel Hirse: [aufkochen] →(540s)→ [quellen lassen] →(600s)→ [lockern]. „Ofen auf 180° vorheizen" (≈ 5 Min) soll heiß sein, wenn das Quellen endet: hänge es mit timer_seconds=300 an die Quell-Karte — Rechnung: timer = Quellzeit 600 − Vorheizzeit 300, der Ofen startet 5 Min vor Quell-Ende und ist exakt pünktlich. Die Rechnung steckt im timer_seconds, nicht in der Beschreibung. Bei Unsicherheit lieber etwas früher starten — ein heißer Ofen hält die Temperatur, wartendes Essen wird kalt.',
}

const prioritySchema = {
  type: 'string',
  enum: ['normal', 'high'],
  description: '"high" für zeitkritische Schritte (z.B. etwas im Ofen): Karte steht in „Jetzt" oben und pulsiert (echter Alarm). Ein "high"-Schritt darf höchstens EINE Abhängigkeit haben (den Schritt, dessen Abschluss — ggf. plus Verzögerung — die Wartezeit bestimmt). Sparsam verwenden.',
}

const scoreSchema = {
  type: 'number',
  description:
    'Optionaler Scheduling-Hinweis (Default 0): je höher, desto weiter oben in der aktiven Queue („mach das zuerst"). Kein Alarm — dafür ist priority "high". Setze den Wert direkt auf den zeitkritischen Schritt (z.B. den Schritt, der nach einer Wartezeit sofort passieren muss: „Benzin abtrennen" nach dem Absetzen, „Teig in den Ofen" nach der Gehzeit). Die Engine zieht alle Schritte davor automatisch rekursiv mit nach oben — der score propagiert rückwärts über depends_on, auch durch Wartezeiten hindurch. Vorgänger brauchen also keinen eigenen score. Nur setzen, wenn der Default falsch wäre.',
}

const stepIdSchema = (description: string) => ({
  type: 'string',
  description: `${description} (stabile Schritt-ID aus get_cook_state)`,
})

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_cook_state',
      description:
        'Aktuellen Kochzustand abrufen: alle Flows, Schritte (mit stabilen IDs), Timer, Ingredients-Modal. Enthält now_local (lokale Wanduhrzeit des Nutzers) und für jede wartende Karte ends_in_s/ends_at_local — rufe das für Zeitfragen auf („fertig um 14:30?", „wie lange läuft der Timer noch?") und immer dann, wenn du den Zustand nicht kennst.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_flow',
      description:
        'Neuen Flow anlegen (parallele Komponente mit eigener Schrittfolge). Schritte können nur auf bereits existierende Schritte anderer Flows verweisen. JEDER Aufbau beginnt mit set_loading({scope:"all", loading:true}) als ERSTEM Tool-Aufruf deiner Antwort (bevor du die Schedule durchdenkst — nicht erst, wenn du anfängst Flows anzulegen) und endet nach dem letzten Tool-Aufruf mit set_loading({loading:false}) — auch bei einem einzelnen Flow. Das Tool-Ergebnis kann "warnings" enthalten (z.B. eine Zeitangabe, auf die keine Folgekarte mit timer_seconds wartet) — behebe sie sofort in derselben Antwort per update_step/add_step, außer die Situation ist gewollt (z.B. eine Karte, die wirklich sofort parallel laufen soll).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name, z.B. "Reis"' },
          icon: { type: 'string', description: 'Passendes Emoji, z.B. "🍚" — identifiziert den Flow visuell' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Vollständige, eigenständig ausführbare Anweisung (Markdown erlaubt); beginne mit einer kurzen Kernaussage' },
                priority: prioritySchema,
                score: scoreSchema,
                depends_on: addFlowDepRefSchema,
              },
              required: ['description'],
            },
            description: 'Schrittfolge',
          },
        },
        required: ['name', 'icon', 'steps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_step',
      description:
        'Schritt an einen bestehenden Flow anhängen oder hinter einem bestimmten Schritt einfügen (after_step_id). Das Tool-Ergebnis kann "warnings" enthalten (z.B. eine Zeitangabe ohne Folgekarte mit timer_seconds) — behebe sie sofort per update_step/add_step, außer die Situation ist gewollt.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          description: { type: 'string', description: 'Vollständige, eigenständig ausführbare Anweisung (Markdown erlaubt); beginne mit einer kurzen Kernaussage' },
          after_step_id: { type: 'string', description: 'Optional: stabile ID des Schritts, hinter dem eingefügt wird (sonst ans Ende)' },
          priority: prioritySchema,
          score: scoreSchema,
          depends_on: depRefSchema,
        },
        required: ['flow_id', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_step',
      description:
        'Schritt bearbeiten: Beschreibung, Abhängigkeiten (inkl. Verzögerung an den Kanten), Priorität oder Score ändern (nur angegebene Felder). Wartezeit nach Abschluss einer Karte gehört als timer_seconds an die Kante (depends_on) — nicht auf die abgeschlossene Karte. Das Tool-Ergebnis kann "warnings" enthalten — behebe sie sofort in derselben Antwort.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der Schritt'),
          description: { type: 'string', description: 'Neue Anweisung (Markdown erlaubt)' },
          depends_on: depRefSchema,
          priority: prioritySchema,
          score: scoreSchema,
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_step',
      description: 'Schritt entfernen. Abhängigkeiten anderer Schritte auf ihn werden mit entfernt; frei gewordene Schritte werden aktiv.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der Schritt'),
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'split_step',
      description: 'Schritt in zwei aufteilen: Teil 1 bleibt an seiner Stelle, Teil 2 wird dahinter eingefügt, hängt von Teil 1 ab. Schritte, die auf den Original-Schritt zeigten, zeigen danach auf Teil 2. Nur für nicht-abgeschlossene Schritte.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der zu teilende Schritt'),
          first_description: { type: 'string', description: 'Anweisung für Teil 1 (bleibt an der Stelle)' },
          second_description: { type: 'string', description: 'Anweisung für Teil 2 (folgt danach)' },
        },
        required: ['flow_id', 'step_id', 'first_description', 'second_description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_step',
      description: 'Schritt abschließen (done). Abhängige Karten mit Verzögerung an der Kante (timer_seconds am depends_on-Eintrag) werden erst nach Ablauf frei.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der Schritt'),
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'revert_step',
      description: 'Abgeschlossenen Schritt wieder auf nicht-erledigt setzen. Nur möglich, wenn keine Karte, die diesen Schritt als Abhängigkeit hat, selbst abgeschlossen ist.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der Schritt'),
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_timer',
      description:
        'Timer eines Schritts setzen oder überschreiben — ein erneuter Aufruf ersetzt den bisherigen Timer. "seconds": Dauer ab jetzt. Alternativ "delta_seconds" (signed): aktuelles Ende um X Sekunden verschieben — positiv = „noch X länger", negativ = verkürzen (auf einer wartenden Karte ohne eigenen Timer ist die Basis deren Plan-Wartezeit). Auf einer wartenden Karte ersetzt der Timer die Plan-Wartezeit; auf einer aktiven Karte geht sie damit in den Wartezustand. Sein Ablauf macht die Karte frei — die Plan-Wartezeit kommt NICHT zurück.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der Schritt'),
          seconds: { type: 'number', description: 'Dauer ab jetzt, in Sekunden (ersetzt einen laufenden Timer)' },
          delta_seconds: {
            type: 'number',
            description: 'Optional statt seconds: laufenden Timer um diese Sekunden verschieben — positiv verlängert, negativ verkürzt',
          },
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_timer',
      description: 'Laufenden Timer eines Schritts pausieren — die Restzeit friert ein, bis er mit resume_timer fortgesetzt wird. Auf einer wartenden Karte ohne eigenen Timer friert pause_timer deren Wartezeit ein.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der Schritt'),
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resume_timer',
      description: 'Pausierten Timer eines Schritts fortsetzen.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der Schritt'),
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_flow',
      description: 'Flow als fertig markieren (alle Schritte done, alle Timer abgebrochen).',
      parameters: {
        type: 'object',
        properties: { flow_id: { type: 'string' } },
        required: ['flow_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_flow',
      description: 'Flow bearbeiten: Name und/oder Emoji ändern.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          name: { type: 'string', description: 'Neuer Name' },
          icon: { type: 'string', description: 'Neues Emoji (leer entfernt es)' },
        },
        required: ['flow_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_flow',
      description: 'Flow löschen. Abhängigkeiten anderer Flows auf seine Schritte werden entfernt.',
      parameters: {
        type: 'object',
        properties: { flow_id: { type: 'string' } },
        required: ['flow_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_new_recipe',
      description:
        'AUSSCHLIESSLICH für ein komplett anderes Gericht — wenn der Nutzer explizit ein neues Gericht kochen will (z.B. „lass uns stattdessen Pasta machen"). Löscht alle Flows und Zutaten (kein Backup). Für Änderungen am laufenden Gericht (Schritt anpassen, Zutat ändern, Menge skalieren, Flow ergänzen) NIEMALS aufrufen — stattdessen update_step / add_step / delete_step / add_flow / delete_flow / set_ingredients / update_flow verwenden. Ablauf: set_loading(true) → start_new_recipe → Aufbau per add_flow/set_ingredients → set_loading(false).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_loading',
      description:
        'Bau-Spinner. JEDER Aufbau einer Schedule — auch ein einzelner add_flow — beginnt mit loading:true als ERSTEM Tool-Aufruf deiner Antwort, BEVOR du die Schedule durchdenkst und aufbaust — der Nutzer soll den Spinner sehen, solange du arbeitest; nie erst denken/bauen und den Spinner später einschalten. Reine Antworten/Fragen ohne Planänderung bekommen keinen Spinner. scope "all" (Standard) = kleiner Spinner links unten (der bestehende Plan bleibt sichtbar); scope "flow" + flow_id = Spinner nur bei diesem bestehenden Flow. loading=false nach dem letzten Tool-Aufruf des Aufbaus (auch bei Abbruch/Fehler). Rein visuell: Timer, Karten und Abschlüsse laufen normal weiter.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['all', 'flow'],
            description: '"all" = ganze Schedule (Standard), "flow" = einzelner Flow',
          },
          flow_id: { type: 'string', description: 'Nur bei scope "flow"' },
          loading: { type: 'boolean', description: 'true = anzeigen, false = ausblenden' },
        },
        required: ['loading'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_step',
      description:
        'Dem Nutzer gezielt einen Schritt zeigen: Fokus auf den Flow, Ansicht wechseln, Schritt in den sichtbaren Bereich scrollen und kurz pulsieren lassen. view: "jetzt" (Standard) für aktive Schritte, "flow" für blockierte/fertige; speak:true liest die Beschreibung vor. Sagt der Nutzer „weiter" oder „nächster Schritt" ohne Kontext, meint er die oberste Karte in „Jetzt" (erstes Element des queue-Felds von get_cook_state — exakt die Anzeige-Reihenfolge) — zeige sie mit view "jetzt" und antworte nur "OK.".',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der Schritt'),
          view: {
            type: 'string',
            enum: ['jetzt', 'flow'],
            description: '"jetzt" (Standard) für aktive Schritte, "flow" für blockierte/fertige',
          },
          speak: { type: 'boolean', description: 'Beschreibung der Karte vorlesen (z.B. für „Was mache ich als Nächstes?")' },
        },
        required: ['step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'focus_flow',
      description: 'Flow fokussieren (hebt die Spalte hervor), ohne einen einzelnen Schritt zu zeigen.',
      parameters: {
        type: 'object',
        properties: { flow_id: { type: 'string' } },
        required: ['flow_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_ingredients',
      description: 'Die komplette Zutatenliste ersetzen (absolute Liste, Einkaufsliste). Aufrufen nach add_flow und bei jeder Änderung: Zutat kommt dazu/fällt weg, Mengen werden skaliert (z.B. doppelte Menge). Vorhandene Einkaufs-Haken bleiben über den Namen erhalten.',
      parameters: {
        type: 'object',
        properties: {
          ingredients: {
            type: 'array',
            description: 'Komplette Zutatenliste (alle Zutaten, auch unveränderte)',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Zutat, z.B. "Basmatireis"' },
                amount: { type: 'string', description: 'Menge, z.B. "300 g" oder "2 Stück"' },
              },
              required: ['name'],
            },
          },
        },
        required: ['ingredients'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_ingredients',
      description: 'Ingredients-Liste (Modal) öffnen.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_ingredients',
      description: 'Ingredients-Liste (Modal) schließen.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_chat',
      description: 'Chat-Verlauf (Modal) öffnen.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_chat',
      description: 'Chat-Verlauf (Modal) schließen.',
      parameters: { type: 'object', properties: {} },
    },
  },
]

function fmtRemaining(endsAt: number): string {
  const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
  const mm = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export { fmtRemaining }

export function stepLabel(description: string, max = 40): string {
  const first =
    description
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '') ?? ''
  const text = first.replace(/\s+/g, ' ')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
