import { createStore } from 'solid-js/store'
import type { CookState, Strang, StepRef } from '../state/store'
import { CookContext, createCookEngine } from '../lib/cookEngine'
import { Cook } from './Cook'

const step = (
  description: string,
  done = false,
  dependsOn: StepRef[] = [],
  timerSeconds: number | null = null,
  timerEndsAt: number | null = null,
  priority: 'normal' | 'high' = 'normal',
) => ({
  description,
  done,
  dependsOn,
  timerSeconds,
  timerEndsAt,
  timerExpired: false,
  activatedAt: Date.now(),
  priority,
})

const MOCK_STRANGS: Strang[] = [
  {
    id: 's1',
    name: 'Pfannkuchenteig',
    icon: '🥞',
    color: 'cyan',
    steps: [
      step('Mehl und Eier in eine Schüssel geben.', true),
      step('Milch nach und nach einrühren, bis der Teig glatt ist.', true, [
        { strang_id: 's1', step_index: 0 },
      ]),
      step('Teig 15 Minuten gehen lassen.', true, [
        { strang_id: 's1', step_index: 1 },
      ], 900, Date.now() + 240_000),
      step('Pfanne mit etwas Öl erhitzen.', false, [
        { strang_id: 's1', step_index: 2 },
      ]),
      step('Teig portionsweise von beiden Seiten goldbraun backen.', false, [
        { strang_id: 's1', step_index: 3 },
      ]),
    ],
    stepIndex: 2,
    done: false,
  },
  {
    id: 's2',
    name: 'Tomatensauce',
    icon: '🍅',
    color: 'rose',
    steps: [
      step('Zwiebeln fein würfeln und glasig andünsten.'),
      step('Passierte Tomaten und Gewürze zugeben.', false, [
        { strang_id: 's1', step_index: 2 },
      ], null, null, 'high'),
      step('Offen ~10 min köcheln, gelegentlich rühren.', false, [
        { strang_id: 's2', step_index: 1 },
      ]),
    ],
    stepIndex: 0,
    done: false,
  },
  {
    id: 's3',
    name: 'Salat',
    icon: '🥗',
    color: 'emerald',
    steps: [
      step('Salat waschen und trocken schleudern.', true),
      step('Öl, Essig, Senf und Gewürze verrühren.', true, [
        { strang_id: 's3', step_index: 0 },
      ]),
      step('Alles in einer Schüssel mischen.', true, [
        { strang_id: 's3', step_index: 1 },
      ]),
    ],
    stepIndex: 2,
    done: true,
  },
]

const MOCK_COOK: CookState = {
  strangs: MOCK_STRANGS,
  zutaten: [
    { id: 'z1', name: 'Mehl', amount: '250 g', checked: true },
    { id: 'z2', name: 'Passierte Tomaten', amount: '400 g', checked: false },
  ],
  focusedStrangId: 's2',
  zutatenOpen: false,
}

export function CookMock() {
  // Eigener, lokaler Store — der echte App-State bleibt unberührt.
  const [cook, setCook] = createStore<CookState>(MOCK_COOK)
  const engine = createCookEngine(
    () => cook,
    (fn) => setCook(fn),
  )

  const mockBtn = 'rounded-lg border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700'

  return (
    <CookContext.Provider value={engine}>
      <Cook />
      {/* Gemockte Events zum Durchklicken */}
      <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-1.5 items-end">
        <button
          class={mockBtn}
          onClick={() => engine.executeTool('complete_step', { strang_id: 's1', step_index: 3 })}
        >
          ✓ S1 Schritt 4 früh fertig (wartend)
        </button>
        <button
          class={mockBtn}
          onClick={() => engine.executeTool('cancel_timer', { strang_id: 's1', step_index: 2 })}
        >
          ⏭ Timer S1 überspringen
        </button>
        <button
          class={mockBtn}
          onClick={() => {
            setCook((c) => ({
              ...c,
              strangs: c.strangs.map((s) => ({
                ...s,
                steps: s.steps.map((st) =>
                  st.timerEndsAt !== null && !st.timerExpired
                    ? { ...st, timerEndsAt: Date.now() - 1000 }
                    : st,
                ),
              })),
            }))
            engine.expireTimers()
          }}
        >
          ⏰ Timer ablaufen lassen
        </button>
        <button
          class={mockBtn}
          onClick={() => engine.executeTool('revert_step', { strang_id: 's3', step_index: 2 })}
        >
          ↺ S3 Schritt 3 zurück
        </button>
      </div>
    </CookContext.Provider>
  )
}
