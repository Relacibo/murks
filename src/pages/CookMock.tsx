import { onMount } from 'solid-js'
import { setState } from '../state/store'
import { Cook } from './Cook'

const MOCK_STRANGS = [
  {
    id: 's1', name: 'Pfannkuchenteig', color: 'cyan' as const,
    steps: ['Mehl und Eier vermischen', 'Milch einrühren', 'Teig ruhen lassen', 'Pfanne erhitzen', 'Teig portionsweise ausbacken'],
    stepIndex: 1, done: false, timerEndsAt: Date.now() + 240_000, timerInstruction: null, timerExpired: false,
  },
  {
    id: 's2', name: 'Tomatensauce', color: 'rose' as const,
    steps: ['Zwiebeln andünsten', 'Tomaten hinzufügen', 'Würzen', 'Köcheln lassen'],
    stepIndex: 0, done: false, timerEndsAt: null, timerInstruction: null, timerExpired: false,
  },
  {
    id: 's3', name: 'Salat vorbereiten', color: 'emerald' as const,
    steps: ['Salat waschen', 'Dressing anrühren', 'Alles mischen'],
    stepIndex: 2, done: true, timerEndsAt: null, timerInstruction: null, timerExpired: false,
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
