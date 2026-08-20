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
                description: { type: 'string', description: 'Vollständige, eigenständig ausführbare Anweisung (Markdown erlaubt); beginne mit einer kurzen Kernaussage — sie erscheint als Titel in Timer-Chips' },
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
          description: { type: 'string', description: 'Vollständige, eigenständig ausführbare Anweisung (Markdown erlaubt); beginne mit einer kurzen Kernaussage — sie erscheint als Titel in Timer-Chips' },
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
      description: 'Timer für einen SCHRITT starten (mehrere Schritte eines Strangs können parallel Timer laufen lassen).',
      parameters: {
        type: 'object',
        properties: {
          strang_id: { type: 'string' },
          step_index: { type: 'number', description: '0-basiert' },
          seconds: { type: 'number' },
          on_expire_instruction: {
            type: 'string',
            description: 'Anweisung, die beim Ablaufen gilt, z.B. "Nudeln abgießen"',
          },
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

function findStrang(id: string) {
  return state.cook.strangs.find((s) => s.id === id)
}

function patchStrang(id: string, patch: Record<string, unknown>) {
  setState('cook', 'strangs', (str) => str.map((s) => (s.id === id ? { ...s, ...patch } : s)))
}

function patchStep(strangId: string, stepIndex: number, patch: Record<string, unknown>) {
  setState('cook', 'strangs', (str) =>
    str.map((s) =>
      s.id === strangId
        ? { ...s, steps: s.steps.map((st, i) => (i === stepIndex ? { ...st, ...patch } : st)) }
        : s,
    ),
  )
}

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

// Monoton wachsende Sequenz (Basis Date.now, damit Werte nach Reload > gespeicherte sind).
let actSeq = Date.now()
function nextAct(): number {
  return ++actSeq
}

function depsDone(deps: { strang_id: string; step_index: number }[]): boolean {
  return deps.every(
    (d) => state.cook.strangs.find((x) => x.id === d.strang_id)?.steps[d.step_index]?.done === true,
  )
}

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
              if (typeof st === 'string') return { description: st, dependsOn: [] }
              const o = (st ?? {}) as Record<string, unknown>
              return {
                description: String(o.description ?? '').trim(),
                dependsOn: Array.isArray(o.depends_on)
                  ? (o.depends_on as Record<string, unknown>[]).map((d) => ({
                      strang_id: String(d?.strang_id ?? '').trim(),
                      step_index: Number(d?.step_index ?? 0),
                    }))
                  : [],
              }
            })
          : []
        if (!strangName) return JSON.stringify({ error: 'name fehlt' })
        if (steps.length === 0 || steps.some((s) => s.description === '')) {
          return JSON.stringify({ error: 'steps brauchen mindestens eine description' })
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
            steps: steps.map((st) => ({
              description: st.description,
              done: false,
              dependsOn: st.dependsOn,
              timerEndsAt: null,
              timerInstruction: null,
              timerExpired: false,
              activatedAt: depsDone(st.dependsOn) ? nextAct() : null,
            })),
            stepIndex: 0,
            done: false,
          },
        ])
        setState('cook', 'focusedStrangId', id)
        showToast(`Strang: ${strangName}`)
        return JSON.stringify({ id, name: strangName })
      }
      case 'add_step': {
        const id = String(args.strang_id ?? '')
        const description = String(args.description ?? '').trim()
        const strang = findStrang(id)
        if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
        if (!description) return JSON.stringify({ error: 'description fehlt' })
        const dependsOn = Array.isArray(args.depends_on)
          ? (args.depends_on as Record<string, unknown>[]).map((d) => ({
              strang_id: String(d?.strang_id ?? '').trim(),
              step_index: Number(d?.step_index ?? 0),
            }))
          : []
        const step = {
          description,
          done: false,
          dependsOn,
          timerEndsAt: null,
          timerInstruction: null,
          timerExpired: false,
          activatedAt: depsDone(dependsOn) ? nextAct() : null,
        }
        patchStrang(id, { steps: [...strang.steps, step] })
        showToast(`${strang.name}: + „${stepLabel(description)}"`)
        return JSON.stringify({ ok: true, step_index: strang.steps.length })
      }
      case 'complete_step': {
        const id = String(args.strang_id ?? '')
        const stepIdx = Number(args.step_index)
        const strang = findStrang(id)
        if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
        if (!Number.isInteger(stepIdx) || stepIdx < 0 || stepIdx >= strang.steps.length) {
          return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
        }
        const steps = strang.steps.map((st, i) =>
          i === stepIdx
            ? { ...st, done: true, timerEndsAt: null, timerInstruction: null, timerExpired: false }
            : st,
        )
        const allDone = steps.every((st) => st.done)
        patchStrang(id, { steps, done: allDone ? true : strang.done })
        // Abhängigkeiten prüfen: blockierte Schritte, die jetzt frei werden, tauchen
        // unten in der „Jetzt“-View auf (Reihenfolge = Reihenfolge des Auftauchens).
        for (const s2 of state.cook.strangs) {
          s2.steps.forEach((st2, j) => {
            if (st2.done || st2.activatedAt !== null) return
            if (!st2.dependsOn.some((d) => d.strang_id === id && d.step_index === stepIdx)) return
            if (!depsDone(st2.dependsOn)) return
            patchStep(s2.id, j, { activatedAt: nextAct() })
          })
        }
        showToast(`${strang.name}: „${stepLabel(strang.steps[stepIdx].description)}" fertig`)
        return JSON.stringify({ ok: true })
      }
      case 'set_step': {
        const id = String(args.strang_id ?? '')
        const idx = Number(args.step_index)
        const strang = findStrang(id)
        if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
        if (!Number.isInteger(idx) || idx < 0 || idx >= strang.steps.length) {
          return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
        }
        patchStrang(id, { stepIndex: idx })
        return JSON.stringify({ ok: true })
      }
      case 'start_timer': {
        const id = String(args.strang_id ?? '')
        const stepIdx = Number(args.step_index)
        const seconds = Number(args.seconds)
        const strang = findStrang(id)
        if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
        if (!Number.isInteger(stepIdx) || stepIdx < 0 || stepIdx >= strang.steps.length) {
          return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
        }
        if (!Number.isFinite(seconds) || seconds <= 0) {
          return JSON.stringify({ error: 'seconds muss positiv sein' })
        }
        const endsAt = Date.now() + seconds * 1000
        patchStep(id, stepIdx, {
          timerEndsAt: endsAt,
          timerExpired: false,
          timerInstruction: args.on_expire_instruction ? String(args.on_expire_instruction) : null,
        })
        showToast(`⏱ Timer: ${fmtRemaining(endsAt)} (${strang.name}: ${stepLabel(strang.steps[stepIdx].description)})`)
        return JSON.stringify({ ok: true, endsAt })
      }
      case 'cancel_timer': {
        const id = String(args.strang_id ?? '')
        const stepIdx = Number(args.step_index)
        const strang = findStrang(id)
        if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
        if (!Number.isInteger(stepIdx) || stepIdx < 0 || stepIdx >= strang.steps.length) {
          return JSON.stringify({ error: `step_index muss 0..${strang.steps.length - 1} sein` })
        }
        patchStep(id, stepIdx, { timerEndsAt: null, timerInstruction: null, timerExpired: false })
        showToast('⏱ Timer abgebrochen')
        return JSON.stringify({ ok: true })
      }
      case 'complete_strang': {
        const id = String(args.strang_id ?? '')
        const strang = findStrang(id)
        if (!strang) return JSON.stringify({ error: 'Unbekannter Strang' })
        patchStrang(id, {
          done: true,
          steps: strang.steps.map((st) => ({
            ...st,
            done: true,
            timerEndsAt: null,
            timerInstruction: null,
            timerExpired: false,
          })),
        })
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
