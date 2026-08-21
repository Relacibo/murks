import { createEffect, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { showToast } from '../lib/toast'
import { dbGet, dbPut } from '../lib/db'
import { TOOLS } from '../lib/tools'
import { createCookEngine, FLOW_COLORS } from '../lib/cookEngine'

export interface AgentProfile {
  id: string
  name: string
  endpoint: string
  model: string
  key: string
}

const DEFAULT_SYSTEM_PROMPT = [
  'Du bist MURKS, die KI einer Rezeptkochsoftware — du reagierst auf die Anrede Murks. Du hilfst beim Kochen: Gerichte planen, Schritte koordinieren, Timer setzen, parallele Kochstränge im Blick behalten.',
  'Jeder Schritt hat eine description: eine vollständige, eigenständig ausführbare Anweisung mit Zutaten, Mengen und Methode (Markdown erlaubt). Der erste Satz ist eine kurze Kernaussage — sie erscheint als Titel in Timer-Chips.',
  'Reihenfolge entsteht AUSSCHLIESSLICH über depends_on — es gibt keine implizite Abfolge. Jede Karte ohne Kante erscheint sofort parallel in der „Jetzt"-Ansicht; kantenlos ist nur erlaubt, wenn der Schritt wirklich parallel zum Startpunkt laufen soll. Sollen Schritte parallel laufen, gib ihnen denselben Vorgänger; ein Schritt mit mehreren Kanten ist der Zusammenführungspunkt. Beispiel Schoko-Biskuit: 1 „Eier trennen" (Startpunkt, keine Kante) → 2 „Eigelb mit Zucker schaumig schlagen" (hängt von 1) und 3 „Eiweiß steif schlagen" (hängt von 1, parallel zu 2) → 4 „Eischnee unterheben" (hängt von 2 UND 3, Zusammenführung) → 5 „Teig in die Form füllen, glatt streichen, in den Ofen schieben — 25–30 Minuten backen" (hängt von 4) → 6 „Biskuit mit Stäbchenprobe prüfen und aus dem Ofen holen" (hängt von 5 mit timer_seconds 1500). Bündle kleine zusammengehörige Handlungen zu EINEM Schritt („Backofen vorheizen, Form auslegen"); splitte nur, was parallel laufen kann oder einen eigenen Timer braucht. Prüfe vor jedem add_flow: Hat jeder Schritt, der nach einem anderen kommen soll, depends_on?',
  'Zeitangaben stehen am ENDE der Karte, die den Timer AUSLÖST (Schritt 5: Kernaussage zuerst, „25–30 Minuten backen" zum Schluss); die wartende Karte nennt KEINE Zeit, nur was nach Ablauf zu tun ist (Schritt 6). FALSCH wäre: „Nach 25–30 Minuten Backzeit prüfen und herausnehmen" auf der wartenden Karte. Eine aktive Karte kann keinen eigenen Countdown haben — Wartezeit liegt immer als timer_seconds auf der Kante zur Folgekarte. Endet ein Rezept mit einer Wartezeit („Torte 2 Stunden kalt stellen"), ergänze deshalb einen finalen Schritt, der mit timer_seconds darauf wartet („Anschneiden und servieren") — nur so meldet die App den Zeitpunkt. Bei unkritischen Minima („mindestens 2 Stunden") darf der Timer entfallen.',
  'Referenzen: In add_flow verweisen Schritte desselben neuen Flows über step_index (0-basiert) auf Vorgänger: depends_on: [{ step_index: 0 }]. Bestehende Schritte haben stabile ids — Abhängigkeiten auf andere Flows nutzen flow_id + step_id. timer_seconds an einer Kante: Die Karte wird erst X Sekunden NACH Abschluss der Abhängigkeit frei. Bei mehreren getimten Kanten zählt die zuletzt ablaufende. Auf einer wartenden Karte wirken start_timer/pause_timer/cancel_timer auf deren Wartezeit selbst (wie das Warte-Menü der App): seconds = neu ab jetzt, offset_seconds + offset_base "end" = aufschlagen („noch X Minuten länger"), cancel_timer = Reset auf die ursprüngliche Wartezeit. Auf aktiven Karten steuern sie die Wartezeit der abhängigen Karten.',
  'Getimte Kanten sind dein Scheduling-Werkzeug über Flow-Grenzen hinweg (flow_id + step_id): Ein Schritt, dessen Ergebnis nicht stehen darf (z.B. geschlagene Sahne fällt zusammen), hängt nicht sequenziell hinten dran, sondern mit timer_seconds an dem Schritt, der die Vorlaufzeit startet. „Kurz vor einer wartenden Karte" gibt es als Mechanik nicht — stattdessen hängt die Karte am SELBEN Anker wie die wartende Karte, mit kleinerem timer_seconds: „Aus dem Ofen holen" gatet „Torte füllen" mit 7200 (2 Stunden auskühlen); „Sahne steif schlagen" hängt ebenfalls an „Aus dem Ofen holen", mit 6600 — erscheint so zehn Minuten vor dem Füllen. Verzögere aber nur Karten mit echtem Frische- oder Timing-Grund; alles andere darf früh erscheinen — der Koch taktet sich selbst.',
  'priority "high" ist ein echter Alarm für Zeitkritisches (z.B. etwas im Ofen): Die Karte pulsiert und steht in „Jetzt" ganz oben. Ein "high"-Schritt darf höchstens EINE Abhängigkeit haben — den Schritt, dessen Abschluss (ggf. plus Verzögerung) die Wartezeit bestimmt. Modelliere zeitkritische Aktionen deshalb als eigene Karte. Vergib "high" sparsam.',
  'score (Zahl, Default 0) sortiert die aktiven Karten in „Jetzt" — höher = weiter oben. Stiller Scheduling-Hinweis („mach das zuerst"), kein Alarm; score verschiebt keine Karte in die Zukunft — Timing machen getimte Kanten. Setze einen hohen score direkt auf den zeitkritischen Schritt (z.B. „Teig in den Ofen" direkt nach der Gehzeit) — die Engine propagiert ihn rückwärts über depends_on, auch durch Wartezeiten hindurch; Vorgänger nicht einzeln scoren. Nur setzen, wenn die Standard-Reihenfolge falsch wäre; verkleinere ihn (update_step), wenn der Grund wegfällt.',
  'Gib jedem Flow beim Anlegen ein passendes Emoji als icon (z.B. 🍚 für Reis).',
  'Wir sprechen per Stimme: Der Nutzer diktiert, deine Antworten werden vorgelesen. Sprich natürlich wie ein Gesprächspartner: kurze Sätze, keine Markdown-Formatierung, keine Listen, keine Emojis. Ton: trocken, direkt, präzise — aber hilfsbereit und zugewandt; keine Floskeln, kein Smalltalk, keine Gesten wie *lacht*.',
  'Nenne den Namen des Nutzers höchstens einmal pro Antwort und nur an natürlichen Stellen: Begrüßung zu Sessionsbeginn, Flow-Abschluss („Fertig, <Name>"), zeitkritischer Alarm („<Name>, der Ofen!"). Sonst weglassen.',
  'Weise Themen nie brüsk ab — Antworten wie „Kein Kochbezug" oder „Ende" sind verboten. Überleite stattdessen kurz und sachlich zu einer konkreten Kochfrage.',
  'Die Spracherkennung macht Fehler: Bei offensichtlich verrauschtem oder unsinnigem Input frage höchstens einmal kurz nach, danach übergehe ihn.',
  'Ist keine Antwort nötig (reine Bestätigung, Geräusch, verrauschtes Transkript), antworte ausschließlich mit „OK." — das wird weder vorgelesen noch angezeigt.',
  'Deine Werkzeuge steuern die Kochoberfläche: add_flow, add_step, update_step, delete_step, split_step, complete_step, revert_step, start_timer, pause_timer, resume_timer, cancel_timer, complete_flow, update_flow, delete_flow, reset_cook, show_step, focus_flow, add_ingredient, open_ingredients, close_ingredients, open_chat, close_chat, get_cook_state. Tool-Ergebnisse sind JSON-Strings; den aktuellen Zustand liefert get_cook_state — rufe es auf, wenn du ihn nicht kennst.',
  'Delegiere nie etwas in der App an den Nutzer — seine Hände gehören an den Herd, und in der App kannst du alles selbst: Navigation (show_step, focus_flow), Modals (open_ingredients/close_ingredients: Ingredients-Liste, open_chat/close_chat: Chat-Verlauf), Timer (start_timer/pause_timer/resume_timer/cancel_timer) und Struktur. Sätze wie „stell den Timer auf …" oder „öffne mal die Flow-Ansicht" sind verboten — tu es einfach. Meldet der Nutzer Realität („die Sahne ist schon geschlagen", „der Ofen braucht länger"), spiegle sie sofort per Werkzeug ins Modell (complete_step, start_timer). Du darfst Flows jederzeit ad-hoc umbauen: Schritte einfügen (after_step_id), ändern (update_step), löschen (delete_step), teilen (split_step), Flows umbenennen (update_flow) oder löschen (delete_flow). show_step(step_id) zeigt dem Nutzer gezielt eine Karte (flow_id optional): view "jetzt" für aktive Schritte (Standard), view "flow" für blockierte/fertige; speak: true liest die description vor — nutze das bei „Was mache ich als Nächstes?" und antworte nur „OK.".',
  'Kommentiere Werkzeug-Aktionen nicht — die Oberfläche bestätigt sie selbst; antworte „OK." oder sprich nur, wenn es inhaltlich etwas zu sagen gibt. Antworte so kurz wie möglich. Handle mit Werkzeugen, statt Aktionen im Text zu beschreiben oder anzukündigen.',
].join(' ')

export interface Config {
  displayName: string
}

export type SttMode = 'wasm' | 'server' | 'webspeech'

export type SttModelSize = 'tiny' | 'base' | 'small'

export interface SttConfig {
  mode: SttMode
  endpoint: string
  key: string
  model: SttModelSize
}

export type TtsMode = 'wasm' | 'server' | 'webspeech'

export interface TtsConfig {
  mode: TtsMode
  endpoint: string
  key: string
  voice: string
  /** Sprachausgabe stumm — betrifft NUR TTS, Alarmtöne (Timer) bleiben an */
  muted: boolean
}

export interface AgentMessage {
  role: 'user' | 'agent'
  text: string
  silent?: boolean
}

export type FlowColor = 'cyan' | 'violet' | 'amber' | 'emerald' | 'rose' | 'sky'

export interface StepRef {
  flow_id: string
  step_id: string
  /** Verzögerung: Karte wird erst X Sekunden nach Abschluss der Abhängigkeit frei */
  timer_seconds?: number | null
}

/**
 * Laufzeit-Timer einer Karte — ein eigenes Objekt, losgelöst vom Abschluss
 * der Karte (doneAt) und von den Kanten-Verzögerungen. Das Warte-Menü agiert
 * ausschließlich auf diesem Objekt.
 */
export interface StepTimer {
  /** Startzeitpunkt (Basis). Restzeit = durationMs − (jetzt − startAt) + Pausen */
  startAt: number
  /** Dauer in ms — „+1 Min" = durationMs erhöhen, „neu setzen" = startAt/durationMs neu */
  durationMs: number
  /** Pause aktiv seit … (Restzeit friert ein, der Timer läuft nie ab) */
  pausedAt: number | null
  /** Akkumulierte Pausendauer (wandert beim Fortsetzen hierher) */
  pauseOffsetMs: number
  /** true = Timer übersteuert die Wartezeit DIESER Karte (Warte-Menü),
      false = er steuert die Wartezeit der Dependents (z.B. Brat-Timer) */
  gatesSelf: boolean
}

export interface Step {
  id: string // stabil — bleibt bei Einfügen/Löschen/Splitten gleich
  description: string
  done: boolean
  doneAt: number | null
  dependsOn: StepRef[]
  timer: StepTimer | null
  activatedAt: number | null
  priority: 'normal' | 'high'
  /** Scheduling-Hinweis der KI (Default 0): höher = weiter oben in der aktiven
      Queue. Kein Alarm — dafür ist priority "high". */
  score: number
}

export interface Flow {
  id: string
  name: string
  icon: string | null
  color: FlowColor
  steps: Step[]
  done: boolean
}

export interface Ingredient {
  id: string
  name: string
  amount: string
  checked: boolean
}

export interface CookState {
  flows: Flow[]
  ingredients: Ingredient[]
  focusedFlowId: string | null
}

export interface AppState {
  config: Config
  setupDone: boolean
  stt: SttConfig
  tts: TtsConfig
  agents: AgentProfile[]
  defaultAgentId: string | null
  cook: CookState
  agent: {
    messages: AgentMessage[]
    busy: boolean
  }
}

const defaults: AppState = {
  config: {
    displayName: '',
  },
  setupDone: false,
  stt: {
    mode: 'wasm',
    endpoint: '',
    key: '',
    model: 'base',
  },
  tts: {
    mode: 'wasm',
    endpoint: '',
    key: '',
    voice: '',
    muted: false,
  },
  agents: [],
  defaultAgentId: null,
  cook: {
    flows: [],
    ingredients: [],
    focusedFlowId: null,
  },
  agent: {
    messages: [],
    busy: false,
  },
}

function hydrate(data: unknown): AppState {
  try {
    const raw = (data ?? {}) as Record<string, unknown>
    const loadedConfig = (raw.config ?? {}) as Record<string, unknown>
    const agents: AgentProfile[] = Array.isArray(raw.agents) ? (raw.agents as AgentProfile[]) : []
    let defaultAgentId: string | null = (raw.defaultAgentId as string | null) ?? null
    if (!agents.some((a) => a.id === defaultAgentId)) {
      defaultAgentId = agents[0]?.id ?? null
    }
    const cook = (raw.cook ?? {}) as Record<string, unknown>
    return {
      config: { displayName: loadedConfig.displayName ? String(loadedConfig.displayName) : '' },
      setupDone: raw.setupDone === true,
      stt: {
        mode:
          (raw.stt as Record<string, unknown> | null)?.mode === 'server' ||
          (raw.stt as Record<string, unknown> | null)?.mode === 'webspeech'
            ? ((raw.stt as Record<string, unknown>).mode as SttMode)
            : 'wasm',
        endpoint: (raw.stt as Record<string, unknown> | null)?.endpoint
          ? String((raw.stt as Record<string, unknown>).endpoint)
          : '',
        key: (raw.stt as Record<string, unknown> | null)?.key
          ? String((raw.stt as Record<string, unknown>).key)
          : '',
        model:
          (raw.stt as Record<string, unknown> | null)?.model === 'tiny' ||
          (raw.stt as Record<string, unknown> | null)?.model === 'small'
            ? ((raw.stt as Record<string, unknown>).model as SttModelSize)
            : 'base',
      },
      tts: {
        mode:
          (raw.tts as Record<string, unknown> | null)?.mode === 'server' ||
          (raw.tts as Record<string, unknown> | null)?.mode === 'webspeech'
            ? ((raw.tts as Record<string, unknown>).mode as TtsMode)
            : 'wasm',
        endpoint: (raw.tts as Record<string, unknown> | null)?.endpoint
          ? String((raw.tts as Record<string, unknown>).endpoint)
          : '',
        key: (raw.tts as Record<string, unknown> | null)?.key
          ? String((raw.tts as Record<string, unknown>).key)
          : '',
        voice: (raw.tts as Record<string, unknown> | null)?.voice
          ? String((raw.tts as Record<string, unknown>).voice)
          : '',
        muted: (raw.tts as Record<string, unknown> | null)?.muted === true,
      },
      agents,
      defaultAgentId,
      cook: {
        flows: (() => {
          const rawFlows = (Array.isArray(cook.flows) ? cook.flows : []) as {
            id?: string
            name?: string
            icon?: string
            color?: FlowColor
            stepIndex?: number
            done?: boolean
            steps?: (
              | string
              | {
                  id?: string
                  description?: string
                  summary?: string
                  done?: boolean
                  doneAt?: number | null
                  dependsOn?: (StepRef | { flow_id?: string; step_index?: number })[]
                  timerSeconds?: number | null
                  timer?: Partial<StepTimer> | null
                  timerEndsAt?: number | null
                  timerPausedAt?: number | null
                  timerOffsetMs?: number
                  timerExpired?: boolean
                  timerGatesSelf?: boolean
                  activatedAt?: number | null
                  priority?: 'normal' | 'high'
                  score?: number
                }
            )[]
            timerEndsAt?: number | null
            timerExpired?: boolean
          }[]
          // Pass 1: Steps mit stabilen IDs versehen (alte Index-Refs sammeln)
          const idxToId = new Map<string, Map<number, string>>()
          const rawDepsByStep = new Map<string, (StepRef | { flow_id?: string; step_index?: number })[]>()
          // Migration: alte timerSeconds am Step → timer_seconds an den Kanten der Dependents
          const rawTimerSeconds = new Map<string, number>()
          const flows: Flow[] = rawFlows.map((s) => {
            const sid = String(s.id ?? '')
            const map = new Map<number, string>()
            idxToId.set(sid, map)
            const steps: Step[] = (Array.isArray(s.steps) ? s.steps : []).map((st, i) => {
              const o = typeof st === 'string' ? null : st
              const id =
                o && typeof o.id === 'string' && o.id !== '' ? o.id : crypto.randomUUID()
              map.set(i, id)
              if (o && Array.isArray(o.dependsOn)) {
                rawDepsByStep.set(id, o.dependsOn as (StepRef | { flow_id?: string; step_index?: number })[])
              }
              const done = typeof st === 'string' ? false : st?.done === true
              const timerSeconds =
                o && typeof o.timerSeconds === 'number' && o.timerSeconds > 0 ? o.timerSeconds : null
              if (done && timerSeconds !== null) rawTimerSeconds.set(id, timerSeconds)
              const timerEndsAt = typeof st === 'string' ? null : (st?.timerEndsAt ?? null)
              // doneAt ableiten: alter Timer-Endzeit minus deklarierter Dauer; sonst 0 (≈ längst abgelaufen)
              let doneAt: number | null =
                typeof st === 'string'
                  ? null
                  : typeof st?.doneAt === 'number'
                    ? st.doneAt
                    : null
              if (done && doneAt === null) {
                doneAt =
                  timerEndsAt !== null && timerSeconds !== null
                    ? timerEndsAt - timerSeconds * 1000
                    : 0
              }
              // Timer-Objekt: neue Form direkt, alte Einzelfelder migrieren
              let timer: StepTimer | null = null
              if (o && typeof o.timer === 'object' && o.timer !== null) {
                const t = o.timer
                if (
                  typeof t.startAt === 'number' &&
                  typeof t.durationMs === 'number' &&
                  t.durationMs > 0
                ) {
                  timer = {
                    startAt: t.startAt,
                    durationMs: t.durationMs,
                    pausedAt: typeof t.pausedAt === 'number' ? t.pausedAt : null,
                    pauseOffsetMs: typeof t.pauseOffsetMs === 'number' ? t.pauseOffsetMs : 0,
                    gatesSelf: t.gatesSelf === true,
                  }
                }
              } else if (o && typeof o.timerEndsAt === 'number' && o.timerExpired !== true) {
                const pausedAt = typeof o.timerPausedAt === 'number' ? o.timerPausedAt : null
                const offsetMs = typeof o.timerOffsetMs === 'number' ? o.timerOffsetMs : 0
                const effEnd = o.timerEndsAt + offsetMs + (pausedAt !== null ? Date.now() - pausedAt : 0)
                timer = {
                  startAt: Date.now(),
                  durationMs: Math.max(0, effEnd - Date.now()),
                  pausedAt,
                  pauseOffsetMs: offsetMs,
                  gatesSelf: o.timerGatesSelf === true,
                }
              }
              return {
                id,
                description:
                  typeof st === 'string'
                    ? st
                    : String(st?.description ?? '').trim() ||
                      (typeof st?.summary === 'string' ? String(st.summary).trim() : ''),
                done,
                doneAt,
                dependsOn: [],
                timer,
                activatedAt:
                  typeof st === 'string'
                    ? null
                    : typeof st?.activatedAt === 'number'
                      ? st.activatedAt
                      : null,
                priority: typeof st === 'string' || st?.priority !== 'high' ? 'normal' : 'high',
                score:
                  typeof st === 'string'
                    ? 0
                    : typeof st?.score === 'number' && Number.isFinite(st.score)
                      ? st.score
                      : 0,
              }
            })
            const stepIndex = typeof s.stepIndex === 'number' ? s.stepIndex : 0
            // Migration: alter Flow-Timer → Timer des aktiven Schritts
            if (typeof s.timerEndsAt === 'number' && steps[stepIndex] && steps[stepIndex].timer === null) {
              steps[stepIndex] = {
                ...steps[stepIndex],
                timer: {
                  startAt: Date.now(),
                  durationMs: Math.max(0, s.timerEndsAt - Date.now()),
                  pausedAt: null,
                  pauseOffsetMs: 0,
                  gatesSelf: false,
                },
              }
            }
            return {
              id: sid,
              name: String(s.name ?? ''),
              icon: typeof s.icon === 'string' && s.icon.trim() !== '' ? s.icon.trim() : null,
              steps,
              color: FLOW_COLORS.includes(s.color as FlowColor)
                ? (s.color as FlowColor)
                : FLOW_COLORS[0],
              done: s.done === true,
            }
          })
          // Pass 2: dependsOn auflösen — neue step_id-Refs behalten, alte step_index-Refs mappen
          for (const s of flows) {
            for (const st of s.steps) {
              const rawDeps = rawDepsByStep.get(st.id)
              if (!rawDeps) continue
              st.dependsOn = rawDeps
                .map((d): StepRef | null => {
                  const sid = String(d?.flow_id ?? '')
                  const ts = (d as StepRef).timer_seconds
                  const timer_seconds = typeof ts === 'number' && ts > 0 ? ts : null
                  if (typeof (d as StepRef).step_id === 'string' && (d as StepRef).step_id !== '') {
                    return {
                      flow_id: sid,
                      step_id: (d as StepRef).step_id,
                      timer_seconds,
                    }
                  }
                  const mapped = idxToId
                    .get(sid)
                    ?.get(Number((d as { step_index?: number }).step_index ?? 0))
                  return mapped
                    ? { flow_id: sid, step_id: mapped, timer_seconds }
                    : null
                })
                .filter((d): d is StepRef => d !== null)
            }
          }
          // Pass 3 (Migration): alte timerSeconds am Step → Verzögerung an allen
          // Kanten, die auf diesen Schritt zeigen (altes Verhalten: alle Dependents warten)
          for (const s of flows) {
            for (const st of s.steps) {
              const ts = rawTimerSeconds.get(st.id)
              if (ts === undefined) continue
              for (const other of flows) {
                for (const dep of other.steps) {
                  dep.dependsOn = dep.dependsOn.map((d) =>
                    d.flow_id === s.id && d.step_id === st.id && !d.timer_seconds
                      ? { ...d, timer_seconds: ts }
                      : d,
                  )
                }
              }
            }
          }
          return flows
        })(),
        ingredients: Array.isArray(cook.ingredients) ? (cook.ingredients as Ingredient[]) : [],
        focusedFlowId: (cook.focusedFlowId as string | null) ?? null,
      },
      agent: {
        messages: Array.isArray((raw.agent as Record<string, unknown> | null)?.messages)
          ? ((raw.agent as Record<string, unknown>).messages as AgentMessage[])
          : [],
        busy: false,
      },
    }
  } catch {
    return defaults
  }
}

export const [state, setState] = createStore<AppState>(defaults)

// Kochlogik gegen den echten CookState (Mock-Seite nutzt eine eigene Engine)
export const cookEngine = createCookEngine(
  () => state.cook,
  (fn) => setState('cook', fn),
)

const [ready, setReady] = createSignal(false)
export const stateReady = ready

async function init() {
  try {
    setState(hydrate(await dbGet<unknown>()))
  } catch (e) {
    console.error('IndexedDB laden fehlgeschlagen', e)
  }
  // Spiegel-Timer für wartende Karten aus dem persistierten Zustand
  cookEngine.syncTimers()
  setReady(true)
}
init()

let saveTimer: ReturnType<typeof setTimeout> | undefined
createEffect(() => {
  if (!ready()) return
  const snapshot = JSON.parse(JSON.stringify(state)) as AppState
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    dbPut(snapshot).catch((e) => console.error('IndexedDB speichern fehlgeschlagen', e))
  }, 300)
})

export function setConfig(patch: Partial<Config>) {
  setState('config', patch)
}

export function setSetupDone(done: boolean) {
  setState('setupDone', done)
}

export function setStt(patch: Partial<SttConfig>) {
  setState('stt', patch)
}

export function setTts(patch: Partial<TtsConfig>) {
  setState('tts', patch)
}

export function defaultAgent(): AgentProfile | undefined {
  return state.agents.find((a) => a.id === state.defaultAgentId)
}

export function addAgent(): string {
  const id = crypto.randomUUID()
  setState('agents', (a) => [...a, { id, name: '', endpoint: '', model: '', key: '' }])
  if (state.defaultAgentId === null) setState('defaultAgentId', id)
  return id
}

export function updateAgent(id: string, patch: Partial<AgentProfile>) {
  const idx = state.agents.findIndex((a) => a.id === id)
  if (idx !== -1) setState('agents', idx, patch)
}

export function removeAgent(id: string) {
  if (id === state.defaultAgentId) return
  setState('agents', (a) => a.filter((x) => x.id !== id))
}

export function setDefaultAgent(id: string) {
  if (state.agents.some((a) => a.id === id)) setState('defaultAgentId', id)
}

export function clearMessages() {
  setState('agent', 'messages', [])
}

export function pushAgentMessage(role: AgentMessage['role'], text: string, silent = false) {
  setState('agent', 'messages', (m) => [...m, msg(role, text, silent)])
}

function msg(role: AgentMessage['role'], text: string, silent = false): AgentMessage {
  return { role, text, silent }
}

interface RawToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export async function sendMessage(text: string) {
  const agent = defaultAgent()
  if (!agent || !agent.endpoint || !agent.model || state.agent.busy) return
  setState('agent', 'messages', (m) => [...m, msg('user', text)])
  setState('agent', 'busy', true)
  try {
    const system = state.config.displayName
      ? `${DEFAULT_SYSTEM_PROMPT} Der Nutzer heißt ${state.config.displayName}.`
      : DEFAULT_SYSTEM_PROMPT
    const convo: Array<Record<string, unknown>> = [
      { role: 'system', content: system },
      ...state.agent.messages.map((m) => ({
        role: m.role === 'agent' ? 'assistant' : 'user',
        content: m.text,
      })),
    ]
    for (let round = 0; round < 6; round++) {
      const res = await fetch(`${agent.endpoint.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(agent.key ? { Authorization: `Bearer ${agent.key}` } : {}),
        },
        body: JSON.stringify({
          model: agent.model,
          stream: false,
          messages: convo,
          tools: TOOLS,
          tool_choice: 'auto',
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const errMsg =
          (data && typeof data === 'object' && 'error' in data
            ? String((data as { error: unknown }).error)
            : null) ?? `HTTP ${res.status}`
        throw new Error(errMsg)
      }
      const message = (data as { choices?: { message?: Record<string, unknown> }[] })?.choices?.[0]
        ?.message
      if (!message) throw new Error('Leere Antwort vom Agenten')
      const toolCalls = Array.isArray(message.tool_calls)
        ? (message.tool_calls as RawToolCall[])
        : []
      if (toolCalls.length > 0) {
        convo.push({
          role: 'assistant',
          content: typeof message.content === 'string' ? message.content : null,
          tool_calls: toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.function.name, arguments: tc.function.arguments },
          })),
        })
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {}
          try {
            args = JSON.parse(tc.function.arguments || '{}')
          } catch {
            // unbrauchbare Argumente → Fehler an den Agenten zurückmelden
          }
          const result = cookEngine.executeTool(tc.function.name, args)
          convo.push({ role: 'tool', tool_call_id: tc.id, content: result })
        }
        continue
      }
      const content = typeof message.content === 'string' ? message.content.trim() : ''
      if (content && content !== 'OK.') {
        setState('agent', 'messages', (m) => [...m, msg('agent', content)])
      }
      return
    }
    throw new Error('Zu viele Werkzeug-Runden')
  } catch (e) {
    showToast(`Agent: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    setState('agent', 'busy', false)
  }
}
