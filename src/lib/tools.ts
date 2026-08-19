import { state, setState, STRANG_COLORS } from '../state/store'
import { showToast } from './toast'

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
                summary: { type: 'string', description: 'Kurzbezeichnung, max. 2 Wörter, z.B. "Teig anrühren"' },
                description: { type: 'string', description: 'Vollständige, eigenständig ausführbare Anweisung (Markdown erlaubt)' },
              },
              required: ['summary', 'description'],
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
          summary: { type: 'string', description: 'Kurzbezeichnung, max. 2 Wörter, z.B. "Abschmecken"' },
          description: { type: 'string', description: 'Vollständige, eigenständig ausführbare Anweisung (Markdown erlaubt)' },
        },
        required: ['strang_id', 'summary', 'description'],
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
      name: 'start_timer',
      description: 'Timer für einen Strang starten.',
      parameters: {
        type: 'object',
        properties: {
          strang_id: { type: 'string' },
          seconds: { type: 'number' },
          on_expire_instruction: {
            type: 'string',
            description: 'Anweisung, die beim Ablaufen gilt, z.B. "Nudeln abgießen"',
          },
        },
        required: ['strang_id', 'seconds'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cancel_timer',
      description: 'Laufenden Timer eines Strangs abbrechen.',
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

function findStrang(id: string) {
  return state.cook.strangs.find((s) => s.id === id)
}

function patchStrang(id: string, patch: Record<string, unknown>) {
  setState('cook', 'strangs', (str) => str.map((s) => (s.id === id ? { ...s, ...patch } : s)))
}

function fmtRemaining(endsAt: number): string {
  const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
  const mm = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export { fmtRemaining }

export function executeTool(name: string, args: Record<string, unknown>): string {
  try {
    switch (name) {
      case 'get_cook_state':
        return JSON.stringify(state.cook)
      case 'add_strang': {
        const strangName = String(args.name ?? '').trim()
        const icon = String(args.icon ?? '').trim()
        const steps = Array.isArray(args.steps)
          ? args.steps.map((st) => {
              if (typeof st === 'string') return { summary: st, description: '' }
              const o = (st ?? {}) as Record<string, unknown>
              return {
                summary: String(o.summary ?? '').trim(),
                description: String(o.description ?? '').trim(),
              }
            })
          : []
        if (!strangName) return JSON.stringify({ error: 'name fehlt' })
        if (steps.length === 0 || steps.some((s) => s.summary === '')) {
          return JSON.stringify({ error: 'steps brauchen mindestens eine summary' })
        }
        const id = crypto.randomUUID()
        const color = STRANG_COLORS[state.cook.strangs.length % STRANG_COLORS.length]
        setState('cook', 'strangs', (s) => [
          ...s,
          {
            id,
            name: strangName,
            icon: icon || null,
            color,
            steps: steps.map((st) => ({ ...st, description: st.description || st.summary })),
            stepIndex: 0,
            done: false,
            timerEndsAt: null,
            timerInstruction: null,
            timerExpired: false,
          },
        ])
        setState('cook', 'focusedStrangId', id)
        showToast(`Strang: ${strangName}`)
        return JSON.stringify({ id, name: strangName })
      }
      case 'add_step': {
        const id = String(args.strang_id ?? '')
        const summary = String(args.summary ?? '').trim()
        const description = String(args.description ?? '').trim()
        const strang = findStrang(id)
        if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
        if (!summary) return JSON.stringify({ error: 'summary fehlt' })
        const step = { summary, description: description || summary }
        patchStrang(id, { steps: [...strang.steps, step] })
        showToast(`${strang.name}: + „${summary}"`)
        return JSON.stringify({ ok: true, step_index: strang.steps.length })
      }
      case 'set_step': {
        const id = String(args.strang_id ?? '')
        const idx = Number(args.step_index)
        const strang = findStrang(id)
        if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
        if (!Number.isInteger(idx) || idx < 0 || idx >= strang.steps.length) {
          return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
        }
        patchStrang(id, { stepIndex: idx, timerExpired: false })
        showToast(`${strang.name}: Schritt ${idx + 1}/${strang.steps.length}`)
        return JSON.stringify({ ok: true })
      }
      case 'start_timer': {
        const id = String(args.strang_id ?? '')
        const seconds = Number(args.seconds)
        const strang = findStrang(id)
        if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
        if (!Number.isFinite(seconds) || seconds <= 0) {
          return JSON.stringify({ error: 'seconds muss positiv sein' })
        }
        const endsAt = Date.now() + seconds * 1000
        patchStrang(id, {
          timerEndsAt: endsAt,
          timerExpired: false,
          timerInstruction: args.on_expire_instruction ? String(args.on_expire_instruction) : null,
        })
        showToast(`⏱ Timer: ${fmtRemaining(endsAt)} (${strang.name})`)
        return JSON.stringify({ ok: true, endsAt })
      }
      case 'cancel_timer': {
        const id = String(args.strang_id ?? '')
        if (!findStrang(id)) return JSON.stringify({ error: 'Unbekannter Strang' })
        patchStrang(id, { timerEndsAt: null, timerInstruction: null, timerExpired: false })
        showToast('⏱ Timer abgebrochen')
        return JSON.stringify({ ok: true })
      }
      case 'complete_strang': {
        const id = String(args.strang_id ?? '')
        const strang = findStrang(id)
        if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
        patchStrang(id, { done: true, timerEndsAt: null, timerInstruction: null, timerExpired: false })
        showToast(`Fertig: ${strang.name}`)
        const idx = state.cook.strangs.findIndex((s) => s.id === id)
        const rest = state.cook.strangs.slice(idx + 1).concat(state.cook.strangs.slice(0, idx))
        const next = rest.find((s) => !s.done)
        if (next) setState('cook', 'focusedStrangId', next.id)
        return JSON.stringify({ ok: true })
      }
      case 'focus_strang': {
        const id = String(args.strang_id ?? '')
        if (!findStrang(id)) return JSON.stringify({ error: 'Unbekannter Strang' })
        setState('cook', 'focusedStrangId', id)
        return JSON.stringify({ ok: true })
      }
      case 'add_zutaten': {
        const zName = String(args.name ?? '').trim()
        if (!zName) return JSON.stringify({ error: 'name fehlt' })
        const id = crypto.randomUUID()
        setState('cook', 'zutaten', (z) => [
          ...z,
          { id, name: zName, amount: args.amount ? String(args.amount) : '', checked: false },
        ])
        showToast(`Zutat: ${zName}`)
        return JSON.stringify({ id, name: zName })
      }
      case 'toggle_zutaten': {
        const id = String(args.id ?? '')
        let found = false
        setState('cook', 'zutaten', (z) =>
          z.map((x) => {
            if (x.id !== id) return x
            found = true
            return { ...x, checked: !x.checked }
          }),
        )
        if (!found) return JSON.stringify({ error: 'Unbekannte Zutat' })
        return JSON.stringify({ ok: true })
      }
      case 'open_zutaten':
        setState('cook', 'zutatenOpen', true)
        return JSON.stringify({ ok: true })
      case 'close_zutaten':
        setState('cook', 'zutatenOpen', false)
        return JSON.stringify({ ok: true })
      default:
        return JSON.stringify({ error: `Unbekanntes Tool: ${name}` })
    }
  } catch (e) {
    return JSON.stringify({ error: e instanceof Error ? e.message : String(e) })
  }
}
