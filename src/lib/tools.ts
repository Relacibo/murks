export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_cook_state',
      description: 'Aktuellen Kochzustand abrufen: alle Stränge, Schritte, Timer, Zutaten-Modal.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_strang',
      description: 'Neuen Kochstrang anlegen (parallele Komponente mit eigener Schrittfolge).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name, z.B. "Reis"' },
          icon: { type: 'string', description: 'Passendes Emoji, z.B. "🍚" — identifiziert den Strang visuell' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Vollständige, eigenständig ausführbare Anweisung (Markdown erlaubt); beginne mit einer kurzen Kernaussage' },
                timer_seconds: {
                  type: 'number',
                  description: 'Optionale Dauer in Sekunden. Der Timer läuft NACH dem Abschließen dieses Schritts; abhängige Schritte werden erst frei, wenn er abgelaufen ist.',
                },
                priority: {
                  type: 'string',
                  enum: ['normal', 'high'],
                  description: '"high" für zeitkritische Schritte (z.B. etwas im Ofen): Karte steht in „Jetzt" oben und pulsiert. Ein "high"-Schritt darf höchstens EINE Abhängigkeit haben (den Schritt mit dem Timer). Sparsam verwenden.',
                },
                depends_on: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      strang_id: { type: 'string' },
                      step_index: { type: 'number', description: '0-basiert' },
                    },
                    required: ['strang_id', 'step_index'],
                  },
                  description: 'Optionale Abhängigkeiten (Schritte, die zuerst erledigt sein müssen)',
                },
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
      description: 'Schritt an einen bestehenden Strang anhängen.',
      parameters: {
        type: 'object',
        properties: {
          strang_id: { type: 'string' },
          description: { type: 'string', description: 'Vollständige, eigenständig ausführbare Anweisung (Markdown erlaubt); beginne mit einer kurzen Kernaussage' },
          timer_seconds: {
            type: 'number',
            description: 'Optionale Dauer in Sekunden. Der Timer läuft NACH dem Abschließen dieses Schritts; abhängige Schritte werden erst frei, wenn er abgelaufen ist.',
          },
          priority: {
            type: 'string',
            enum: ['normal', 'high'],
            description: '"high" für zeitkritische Schritte (z.B. etwas im Ofen): Karte steht in „Jetzt" oben und pulsiert. Ein "high"-Schritt darf höchstens EINE Abhängigkeit haben (den Schritt mit dem Timer). Sparsam verwenden.',
          },
          depends_on: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                strang_id: { type: 'string' },
                step_index: { type: 'number', description: '0-basiert' },
              },
              required: ['strang_id', 'step_index'],
            },
            description: 'Optionale Abhängigkeiten (Schritte, die zuerst erledigt sein müssen)',
          },
        },
        required: ['strang_id', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_step',
      description: 'Schritt abschließen (done). Laufender Timer des Schritts wird abgebrochen.',
      parameters: {
        type: 'object',
        properties: {
          strang_id: { type: 'string' },
          step_index: { type: 'number', description: '0-basiert' },
        },
        required: ['strang_id', 'step_index'],
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
          strang_id: { type: 'string' },
          step_index: { type: 'number', description: '0-basiert' },
        },
        required: ['strang_id', 'step_index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_step',
      description: 'Schritt eines Strangs setzen (vor oder zurück).',
      parameters: {
        type: 'object',
        properties: {
          strang_id: { type: 'string' },
          step_index: { type: 'number', description: '0-basiert' },
        },
        required: ['strang_id', 'step_index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_step_priority',
      description: 'Priorität eines Schritts setzen: "high" für zeitkritische Schritte — Karte steht in „Jetzt" oben und pulsiert.',
      parameters: {
        type: 'object',
        properties: {
          strang_id: { type: 'string' },
          step_index: { type: 'number', description: '0-basiert' },
          priority: { type: 'string', enum: ['normal', 'high'] },
        },
        required: ['strang_id', 'step_index', 'priority'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_timer',
      description: 'Timer eines Schritts (neu) setzen — z.B. wenn der Nutzer eine andere Zeit will („das muss noch 5 Minuten"). Ersetzt einen laufenden Timer.',
      parameters: {
        type: 'object',
        properties: {
          strang_id: { type: 'string' },
          step_index: { type: 'number', description: '0-basiert' },
          seconds: { type: 'number' },
        },
        required: ['strang_id', 'step_index', 'seconds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_timer',
      description: 'Laufenden Timer eines Schritts abbrechen.',
      parameters: {
        type: 'object',
        properties: {
          strang_id: { type: 'string' },
          step_index: { type: 'number', description: '0-basiert' },
        },
        required: ['strang_id', 'step_index'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_strang',
      description: 'Strang als fertig markieren.',
      parameters: {
        type: 'object',
        properties: { strang_id: { type: 'string' } },
        required: ['strang_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'focus_strang',
      description: 'Aktiven Strang wechseln (bestimmt, welche Karte der Nutzer sieht).',
      parameters: {
        type: 'object',
        properties: { strang_id: { type: 'string' } },
        required: ['strang_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_zutaten',
      description: 'Zutat zur Zutatenliste hinzufügen (Name, optional Menge).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Zutat, z.B. "Basmatireis"' },
          amount: { type: 'string', description: 'Menge, z.B. "300 g" oder "2 Stück"' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'toggle_zutaten',
      description: 'Zutat in der Liste abhaken oder wieder freischalten.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_zutaten',
      description: 'Zutaten-Modal öffnen.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_zutaten',
      description: 'Zutaten-Modal schließen.',
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
