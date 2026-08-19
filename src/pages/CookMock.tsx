import { onMount } from 'solid-js'
import { setState, type StepRef } from '../state/store'
import { Cook } from './Cook'

const step = (
  summary: string,
  description: string,
  done = false,
  dependsOn: StepRef[] = [],
  timerEndsAt: number | null = null,
) => ({
  summary,
  description,
  done,
  dependsOn,
  timerEndsAt,
  timerInstruction: null,
  timerExpired: false,
})

const MOCK_STRANGS = [
  {
    id: 's1',
    name: 'Pfannkuchenteig',
    icon: '🥞',
    color: 'cyan' as const,
    steps: [
      step('Mehl & Eier', 'Mehl und Eier in eine Schüssel geben.', true),
      step('Milch einrühren', 'Milch nach und nach einrühren, bis der Teig glatt ist.', true, [
        { strang_id: 's1', step_index: 0 },
      ]),
      step('Teig quellen', 'Teig 15 Minuten ruhen lassen.', false, [
        { strang_id: 's1', step_index: 1 },
      ], Date.now() + 240_000),
      step('Pfanne erhitzen', 'Pfanne mit etwas Öl erhitzen.', false, [
        { strang_id: 's1', step_index: 2 },
      ]),
      step('Ausbacken', 'Teig portionsweise von beiden Seiten goldbraun backen.', false, [
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
    color: 'rose' as const,
    steps: [
      step('Zwiebeln dünsten', 'Zwiebeln fein würfeln und glasig andünsten.', false, [], Date.now() + 70_000),
      step('Tomaten zugeben', 'Passierte Tomaten und Gewürze zugeben.', false, [
        { strang_id: 's1', step_index: 2 },
      ]),
      step('Köcheln', 'Offen ~10 min köcheln, gelegentlich rühren.', false, [
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
    color: 'emerald' as const,
    steps: [
      step('Waschen', 'Salat waschen und trocken schleudern.', true),
      step('Dressing', 'Öl, Essig, Senf und Gewürze verrühren.', true, [
        { strang_id: 's3', step_index: 0 },
      ]),
      step('Mischen', 'Alles in einer Schüssel mischen.', true, [
        { strang_id: 's3', step_index: 1 },
      ]),
    ],
    stepIndex: 2,
    done: true,
  },
]

export function CookMock() {
  onMount(() => {
    setState('cook', 'strangs', MOCK_STRANGS)
    setState('cook', 'focusedStrangId', 's2')
    setState('setupDone', true)
  })
  return <Cook />
}
