import { createEffect, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import type { CookState, Flow, StepRef } from '../state/store'
import { CookContext, createCookEngine } from '../lib/cookEngine'
import { Cook } from './Cook'

const step = (
  description: string,
  done = false,
  dependsOn: StepRef[] = [],
  doneAt: number | null = null,
  priority: 'normal' | 'high' = 'normal',
) => ({
  id: crypto.randomUUID(),
  description,
  done,
  doneAt,
  dependsOn,
  timer: null,
  activatedAt: Date.now(),
  priority,
  score: 0,
})

const s1_0 = step('Mehl und Eier in eine Schüssel geben.', true)
const s1_1 = step('Milch nach und nach einrühren, bis der Teig glatt ist.', true, [
  { flow_id: 's1', step_id: s1_0.id },
])
// Vor 11 Minuten abgeschlossen — Verzögerung 15 min läuft noch ~4 Minuten
const s1_2 = step(
  'Teig 15 Minuten gehen lassen.',
  true,
  [{ flow_id: 's1', step_id: s1_1.id }],
  Date.now() - 660_000,
)
const s1_3 = step('Pfanne mit etwas Öl erhitzen.', false, [
  { flow_id: 's1', step_id: s1_2.id, timer_seconds: 900 },
])
const s1_4 = step('Teig portionsweise von beiden Seiten goldbraun backen.', false, [
  { flow_id: 's1', step_id: s1_3.id },
])
const s2_0 = step('Zwiebeln fein würfeln und glasig andünsten.')
const s2_1 = step(
  'Passierte Tomaten und Gewürze zugeben.',
  false,
  [{ flow_id: 's1', step_id: s1_2.id, timer_seconds: 900 }],
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
    steps: [s1_0, s1_1, s1_2, s1_3, s1_4],
    done: false,
  },
  {
    id: 's2',
    name: 'Tomatensauce',
    icon: '🍅',
    steps: [s2_0, s2_1, s2_2],
    done: false,
  },
  {
    id: 's3',
    name: 'Salat',
    icon: '🥗',
    steps: [s3_0, s3_1, s3_2],
    done: true,
  },
]

const MOCK_COOK: CookState = {
  flows: MOCK_FLOWS,
  ingredients: [
    { id: 'z1', name: 'Mehl', amount: '250 g' },
    { id: 'z2', name: 'Passierte Tomaten', amount: '400 g' },
  ],
  focusedFlowId: 's2',
  loading: { all: false, flows: [] },
}

export function CookMock() {
  // Eigener, lokaler Store — der echte App-State bleibt unberührt.
  // Persistiert in localStorage, damit Reloads die Queue behalten (wie die echte App).
  // Key-versioniert: der Mock persistiert ROH (ohne die Migration des echten
  // hydrate) — nach Timer-Modell-Änderungen würden alte Shapes sonst
  // „pausiert + NaN:NaN"-Zustände erzeugen.
  const MOCK_KEY = 'murks-mock-state-v2'
  const loadMockCook = (): CookState => {
    try {
      const raw = localStorage.getItem(MOCK_KEY)
      if (raw) {
        const cook = JSON.parse(raw) as CookState
        // Form-Guard: kaputte Timer-Shapes aus früheren Versionen entsorgen;
        // Ladeanzeige ist transient — nach Reload immer aus
        cook.loading = { all: false, flows: [] }
        for (const s of cook.flows ?? []) {
          for (const st of s.steps ?? []) {
            const t = st.timer as unknown
            if (t === undefined || t === null) continue
            const o = t as { alarmAt?: unknown; pausedAt?: unknown }
            if (
              typeof o !== 'object' ||
              typeof o.alarmAt !== 'number' ||
              !Number.isFinite(o.alarmAt) ||
              (o.pausedAt !== null && typeof o.pausedAt !== 'number')
            ) {
              st.timer = null
            }
          }
        }
        return cook
      }
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
      <Cook
        onOpenIngredients={() => setIngredientsOpen(true)}
        onOpenChat={() => {}}
        ingredientsOpen={ingredientsOpen()}
        onCloseIngredients={() => setIngredientsOpen(false)}
        chatOpen={false}
        onCloseChat={() => {}}
      />
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
          onClick={() => {
            // Verzögerung überspringen: Abschlusszeitpunkt weit in die Vergangenheit,
            // Spiegel-Timer der wartenden Karten entfernen
            setCook((c) => ({
              ...c,
              flows: c.flows.map((s) => ({
                ...s,
                steps: s.steps.map((st) =>
                  st.id === s1_2.id
                    ? { ...st, doneAt: Date.now() - 901_000 }
                    : st.id === s1_3.id || st.id === s2_1.id
                      ? { ...st, timer: null }
                      : st,
                ),
              })),
            }))
            engine.expireTimers()
          }}
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
                  st.id === s1_2.id
                    ? { ...st, doneAt: Date.now() - 901_000 }
                    : st.id === s1_3.id || st.id === s2_1.id
                      ? { ...st, timer: null }
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
