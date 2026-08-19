import { onMount } from 'solid-js'
import { setState } from '../state/store'
import { Cook } from './Cook'

const MOCK_STRANGS = [
  {
    id: 's1',
    name: 'Pfannkuchenteig',
    icon: '🥞',
    color: 'cyan' as const,
    steps: [
      { summary: 'Mehl & Eier', description: 'Mehl und Eier in eine Schüssel geben.' },
      { summary: 'Milch einrühren', description: 'Milch nach und nach einrühren, bis der Teig glatt ist.' },
      { summary: 'Teig quellen', description: 'Teig 15 Minuten ruhen lassen.' },
      { summary: 'Pfanne erhitzen', description: 'Pfanne mit etwas Öl erhitzen.' },
      { summary: 'Ausbacken', description: 'Teig portionsweise von beiden Seiten goldbraun backen.' },
    ],
    stepIndex: 1,
    done: false,
    timerEndsAt: Date.now() + 240_000,
    timerInstruction: null,
    timerExpired: false,
  },
  {
    id: 's2',
    name: 'Tomatensauce',
    icon: '🍅',
    color: 'rose' as const,
    steps: [
      { summary: 'Zwiebeln dünsten', description: 'Zwiebeln fein würfeln und glasig andünsten.' },
      { summary: 'Tomaten zugeben', description: 'Passierte Tomaten und Gewürze zugeben.' },
      { summary: 'Köcheln', description: 'Offen ~10 min köcheln, gelegentlich rühren.' },
    ],
    stepIndex: 0,
    done: false,
    timerEndsAt: null,
    timerInstruction: null,
    timerExpired: false,
  },
  {
    id: 's3',
    name: 'Salat',
    icon: '🥗',
    color: 'emerald' as const,
    steps: [
      { summary: 'Waschen', description: 'Salat waschen und trocken schleudern.' },
      { summary: 'Dressing', description: 'Öl, Essig, Senf und Gewürze verrühren.' },
      { summary: 'Mischen', description: 'Alles in einer Schüssel mischen.' },
    ],
    stepIndex: 2,
    done: true,
    timerEndsAt: null,
    timerInstruction: null,
    timerExpired: false,
  },
]

export function CookMock() {
  onMount(() => {
    setState('cook', 'strangs', MOCK_STRANGS)
    setState('cook', 'focusedStrangId', 's1')
    setState('setupDone', true)
  })
  return <Cook />
}
