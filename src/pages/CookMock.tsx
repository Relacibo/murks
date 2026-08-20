import { createEffect, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import type { CookState, Flow, StepRef } from '../state/store'
import { CookContext, createCookEngine } from '../lib/cookEngine'
import { IngredientsModal } from '../components/IngredientsModal'
import { Cook } from './Cook'

const step = (
  description: string,
  done = false,
  dependsOn: StepRef[] = [],
  timerSeconds: number | null = null,
  timerEndsAt: number | null = null,
  priority: 'normal' | 'high' = 'normal',
) => ({
  id: crypto.randomUUID(),
  description,
  done,
  dependsOn,
  timerSeconds,
  timerEndsAt,
  timerExpired: false,
  activatedAt: Date.now(),
  priority,
})

const s1_0 = step('Mehl und Eier in eine Schüssel geben.', true)
const s1_1 = step('Milch nach und nach einrühren, bis der Teig glatt ist.', true, [
  { flow_id: 's1', step_id: s1_0.id },
])
const s1_2 = step(
  'Teig 15 Minuten gehen lassen.',
  true,
  [{ flow_id: 's1', step_id: s1_1.id }],
  900,
  Date.now() + 240_000,
)
const s1_3 = step('Pfanne mit etwas Öl erhitzen.', false, [
  { flow_id: 's1', step_id: s1_2.id },
])
const s1_4 = step('Teig portionsweise von beiden Seiten goldbraun backen.', false, [
  { flow_id: 's1', step_id: s1_3.id },
])
const s2_0 = step('Zwiebeln fein würfeln und glasig andünsten.')
const s2_1 = step(
  'Passierte Tomaten und Gewürze zugeben.',
  false,
  [{ flow_id: 's1', step_id: s1_2.id }],
  null,
  null,
  'high',
)
const s2_2 = step('Offen ~10 min köcheln, gelegentlich rühren.', false, [
  { flow_id: 's2', step_id: s2_1.id },
])
const s3_0 = step('Salat waschen und trocken schleudern.', true)
const s3_1 = step('Öl, Essig, Senf und Gewürze verrühren.', true, [
  { flow_id: 's3', step_id: s3_0.id },
])
const s3_2 = step('Alles in einer Schüssel mischen.', true, [
  { flow_id: 's3', step_id: s3_1.id },
])

const MOCK_FLOWS: Flow[] = [
  {
    id: 's1',
    name: 'Pfannkuchenteig',
    icon: '🥞',
    color: 'cyan',
    steps: [s1_0, s1_1, s1_2, s1_3, s1_4],
    done: false,
  },
  {
    id: 's2',
    name: 'Tomatensauce',
    icon: '🍅',
    color: 'rose',
    steps: [s2_0, s2_1, s2_2],
    done: false,
  },
  {
    id: 's3',
    name: 'Salat',
    icon: '🥗',
    color: 'emerald',
    steps: [s3_0, s3_1, s3_2],
    done: true,
  },
]

const MOCK_COOK: CookState = {
  flows: MOCK_FLOWS,
  ingredients: [
    { id: 'z1', name: 'Mehl', amount: '250 g', checked: true },
    { id: 'z2', name: 'Passierte Tomaten', amount: '400 g', checked: false },
  ],
  focusedFlowId: 's2',
}

export function CookMock() {
  // Eigener, lokaler Store — der echte App-State bleibt unberührt.
  // Persistiert in localStorage, damit Reloads die Queue behalten (wie die echte App).
  const MOCK_KEY = 'murks-mock-state'
  const loadMockCook = (): CookState => {
    try {
      const raw = localStorage.getItem(MOCK_KEY)
      if (raw) return JSON.parse(raw) as CookState
    } catch {
      /* ignorieren */
    }
    return MOCK_COOK
  }
  const [cook, setCook] = createStore<CookState>(loadMockCook())
  const engine = createCookEngine(
    () => cook,
    (fn) => setCook(fn),
  )
  createEffect(() => {
    localStorage.setItem(MOCK_KEY, JSON.stringify(cook))
  })
  const [ingredientsOpen, setIngredientsOpen] = createSignal(false)

  const mockBtn = 'rounded-lg border border-zinc-600 bg-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-700'

  return (
    <CookContext.Provider value={engine}>
      <Cook onOpenIngredients={() => setIngredientsOpen(true)} onOpenChat={() => {}} />
      <IngredientsModal open={ingredientsOpen()} onClose={() => setIngredientsOpen(false)} />
      {/* Gemockte Events zum Durchklicken */}
      <div class="fixed bottom-4 right-4 z-50 flex flex-col gap-1.5 items-end">
        <button
          class={mockBtn}
          onClick={() => engine.executeTool('complete_step', { flow_id: 's1', step_id: s1_3.id })}
        >
          ✓ S1 Schritt 4 früh fertig (wartend)
        </button>
        <button
          class={mockBtn}
          onClick={() => engine.executeTool('cancel_timer', { flow_id: 's1', step_id: s1_2.id })}
        >
          ⏭ Timer S1 überspringen
        </button>
        <button
          class={mockBtn}
          onClick={() => {
            setCook((c) => ({
              ...c,
              flows: c.flows.map((s) => ({
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
          onClick={() => engine.executeTool('revert_step', { flow_id: 's3', step_id: s3_2.id })}
        >
          ↺ S3 Schritt 3 zurück
        </button>
        <button
          class={mockBtn}
          onClick={() => engine.executeTool('show_step', { flow_id: 's1', step_id: s1_4.id })}
        >
          👆 S1 Schritt 5 zeigen (Puls)
        </button>
        <button
          class={mockBtn}
          onClick={() =>
            engine.executeTool('split_step', {
              flow_id: 's1',
              step_id: s1_3.id,
              first_description: 'Pfanne mit etwas Öl erhitzen.',
              second_description: 'Teig in die heiße Pfanne geben.',
            })
          }
        >
          ✂ S1 Schritt 4 splitten
        </button>
        <button
          class={mockBtn}
          onClick={() => {
            localStorage.removeItem('murks-mock-state')
            window.location.reload()
          }}
        >
          🧹 Mock zurücksetzen
        </button>
      </div>
    </CookContext.Provider>
  )
}
