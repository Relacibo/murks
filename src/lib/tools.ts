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
  description: 'Optionale Abhängigkeiten (Schritte, die zuerst erledigt sein müssen)',
}

const prioritySchema = {
  type: 'string',
  enum: ['normal', 'high'],
  description: '"high" für zeitkritische Schritte (z.B. etwas im Ofen): Karte steht in „Jetzt" oben und pulsiert. Ein "high"-Schritt darf höchstens EINE Abhängigkeit haben (den Schritt, dessen Abschluss — ggf. plus Verzögerung — die Wartezeit bestimmt). Sparsam verwenden.',
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
      description: 'Aktuellen Kochzustand abrufen: alle Flows, Schritte (mit stabilen IDs), Timer, Ingredients-Modal.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_flow',
      description: 'Neuen Flow anlegen (parallele Komponente mit eigener Schrittfolge). Schritte können nur auf bereits existierende Schritte anderer Flows verweisen.',
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
                depends_on: depRefSchema,
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
      description: 'Schritt an einen bestehenden Flow anhängen oder hinter einem bestimmten Schritt einfügen (after_step_id).',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          description: { type: 'string', description: 'Vollständige, eigenständig ausführbare Anweisung (Markdown erlaubt); beginne mit einer kurzen Kernaussage' },
          after_step_id: { type: 'string', description: 'Optional: stabile ID des Schritts, hinter dem eingefügt wird (sonst ans Ende)' },
          priority: prioritySchema,
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
      description: 'Schritt bearbeiten: Beschreibung, Abhängigkeiten (inkl. Verzögerung an den Kanten) oder Priorität ändern (nur angegebene Felder).',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der Schritt'),
          description: { type: 'string', description: 'Neue Anweisung (Markdown erlaubt)' },
          depends_on: depRefSchema,
          priority: prioritySchema,
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
      name: 'start_timer',
      description: 'Ad-hoc-Timer eines Schritts (neu) setzen oder verlängern — z.B. wenn der Nutzer eine andere Zeit will („das muss noch 5 Minuten"). Wartende Karten bleiben blockiert bis zum späteren Ende (Ad-hoc-Timer oder Kanten-Verzögerung). Ersetzt einen laufenden Timer.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('Der Schritt'),
          seconds: { type: 'number', description: 'Dauer ab jetzt, in Sekunden' },
        },
        required: ['flow_id', 'step_id', 'seconds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_timer',
      description: 'Laufenden Ad-hoc-Timer eines Schritts abbrechen (abhängige Karten werden frei, sofern keine Kanten-Verzögerung mehr läuft).',
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
      name: 'reset_cook',
      description: 'Alles verwerfen: alle Flows und Ingredients löschen (z.B. „wir fangen neu an").',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_step',
      description: 'Dem Nutzer gezielt einen Schritt zeigen: Fokus auf den Flow, Ansicht wechseln, Schritt in den sichtbaren Bereich scrollen und kurz pulsieren lassen.',
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
      name: 'add_ingredient',
      description: 'Ingredient zur Ingredientsliste hinzufügen (Name, optional Menge).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Ingredient, z.B. "Basmatireis"' },
          amount: { type: 'string', description: 'Menge, z.B. "300 g" oder "2 Stück"' },
        },
        required: ['name'],
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
