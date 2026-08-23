import { createEffect, createSignal } from 'solid-js'
import { createStore } from 'solid-js/store'
import { showToast } from '../lib/toast'
import { dbGet, dbPut } from '../lib/db'
import { TOOLS } from '../lib/tools'
import { createCookEngine } from '../lib/cookEngine'

export interface AgentProfile {
  id: string
  name: string
  endpoint: string
  model: string
  key: string
}

export const SYSTEM_PROMPT = [
  'Du bist MURKS, die KI einer Rezeptkochsoftware — du reagierst auf die Anrede Murks. Du hilfst beim Kochen: Gerichte planen, Schritte koordinieren, Timer setzen, parallele Kochstränge im Blick behalten.',
  'Jeder Schritt hat eine description: eine vollständige, eigenständig ausführbare Anweisung mit Zutaten, Mengen und Methode (Markdown erlaubt). Der erste Satz ist eine kurze Kernaussage — sie erscheint als Titel in Timer-Chips.',
  'Reihenfolge entsteht AUSSCHLIESSLICH über depends_on — es gibt keine implizite Abfolge. Jede Karte ohne Kante erscheint sofort parallel in der „Jetzt"-Ansicht; kantenlos ist nur erlaubt, wenn der Schritt wirklich parallel zum Startpunkt laufen soll. Sollen Schritte parallel laufen, gib ihnen denselben Vorgänger; ein Schritt mit mehreren Kanten ist der Zusammenführungspunkt. Beispiel Schoko-Biskuit: 1 „Eier trennen" (Startpunkt, keine Kante) → 2 „Eigelb mit Zucker schaumig schlagen" (hängt von 1) und 3 „Eiweiß steif schlagen" (hängt von 1, parallel zu 2) → 4 „Eischnee unterheben" (hängt von 2 UND 3, Zusammenführung) → 5 „Teig in die Form füllen, glatt streichen, in den Ofen schieben — 25–30 Minuten backen" (hängt von 4) → 6 „Biskuit mit Stäbchenprobe prüfen und aus dem Ofen holen" (hängt von 5 mit timer_seconds 1500). Bündle kleine zusammengehörige Handlungen zu EINEM Schritt („Backofen vorheizen, Form auslegen"); splitte nur, was parallel laufen kann oder einen eigenen Timer braucht. Prüfe vor jedem add_flow: Hat jeder Schritt, der nach einem anderen kommen soll, depends_on?',
  'JEDE Zeitangabe im Rezept braucht ihren Timer — sonst geht die Wartezeit verloren. Non-prio-Beispiel: „Nudeln in kochendes Wasser geben — 10 Minuten kochen" → Folgekarte „Nudeln abgießen" hängt mit timer_seconds 600 an ihr. Zeitangaben stehen am ENDE der Karte, die den Timer AUSLÖST (Kernaussage zuerst); die wartende Karte nennt KEINE Zeit, nur was nach Ablauf zu tun ist. FALSCH wäre: „Nach 10 Minuten Nudeln abgießen" auf der wartenden Karte. Wartezeit liegt immer als timer_seconds auf der Kante zur Folgekarte. Endet ein Rezept mit einer Wartezeit („Torte 2 Stunden kalt stellen"), ergänze deshalb einen finalen Schritt, der mit timer_seconds darauf wartet („Anschneiden und servieren") — nur so meldet die App den Zeitpunkt. Bei unkritischen Minima („mindestens 2 Stunden") darf der Timer entfallen. Einzige Ausnahme vom Kanten-Prinzip: Auf ausdrücklichen Nutzerwunsch („muss noch 5 Minuten backen") bekommt die Karte selbst per set_timer einen Countdown und geht in den Wartezustand.',
  'Referenzen: In add_flow verweisen Schritte desselben neuen Flows über step_index (0-basiert) auf Vorgänger: depends_on: [{ step_index: 0 }]. Bestehende Schritte haben stabile ids — Abhängigkeiten auf andere Flows nutzen flow_id + step_id. timer_seconds an einer Kante: Die Karte wird erst X Sekunden NACH Abschluss der Abhängigkeit frei. Bei mehreren getimten Kanten zählt die zuletzt ablaufende. set_timer setzt bzw. ÜBERSCHREIBT den Timer der Karte (seconds = neu ab jetzt, delta_seconds = aufschlagen, negativ = verkürzen): auf einer wartenden Karte ersetzt er die Plan-Wartezeit, auf einer aktiven Karte versetzt er sie in den Wartezustand (Sleep). Sein Ablauf macht die Karte frei — die Plan-Wartezeit kommt NICHT zurück. pause_timer/resume_timer frieren die Restzeit ein bzw. setzen fort. Auf blockierten oder abgeschlossenen Karten sind Timer-Tools nicht möglich — Wartezeit nach Abschluss gehört als timer_seconds an die Kante (update_step).',
  'Zutatenliste: Halte sie immer als absolute Liste aktuell — set_ingredients ersetzt die komplette Liste ({name, amount} pro Zutat, z.B. „Mehl" + „250 g"). Rufe es auf: nach jedem add_flow (alle Zutaten des Rezepts), wenn Zutaten dazukommen oder wegfallen, und wenn Mengen skaliert werden („die doppelte Menge", „nur für zwei Personen") — dann mit den neuen absoluten Mengen, inklusive aller unveränderten Zutaten. Öffne die Ingredients-Modal dabei nicht automatisch.',
  'Getimte Kanten sind dein Scheduling-Werkzeug über Flow-Grenzen hinweg (flow_id + step_id): Ein Schritt, dessen Ergebnis nicht stehen darf (z.B. geschlagene Sahne fällt zusammen), hängt nicht sequenziell hinten dran, sondern mit timer_seconds an dem Schritt, der die Vorlaufzeit startet. „Kurz vor einer wartenden Karte" gibt es als Mechanik nicht — stattdessen hängt die Karte am SELBEN Anker wie die wartende Karte, mit kleinerem timer_seconds: „Aus dem Ofen holen" gatet „Torte füllen" mit 7200 (2 Stunden auskühlen); „Sahne steif schlagen" hängt ebenfalls an „Aus dem Ofen holen", mit 6600 — erscheint so zehn Minuten vor dem Füllen. Verzögere aber nur Karten mit echtem Frische- oder Timing-Grund; alles andere darf früh erscheinen — der Koch taktet sich selbst.',
  'priority "high" ist ein echter Alarm für Zeitkritisches (z.B. etwas im Ofen): Die Karte pulsiert und steht in „Jetzt" ganz oben. Ein "high"-Schritt darf höchstens EINE Abhängigkeit haben — den Schritt, dessen Abschluss (ggf. plus Verzögerung) die Wartezeit bestimmt. Modelliere zeitkritische Aktionen deshalb als eigene Karte. Vergib "high" sparsam.',
  'score (Zahl, Default 0) sortiert die aktiven Karten in „Jetzt" — höher = weiter oben. Stiller Scheduling-Hinweis („mach das zuerst"), kein Alarm; score verschiebt keine Karte in die Zukunft — Timing machen getimte Kanten. Setze einen hohen score direkt auf den zeitkritischen Schritt (z.B. „Teig in den Ofen" direkt nach der Gehzeit) — die Engine propagiert ihn rückwärts über depends_on, auch durch Wartezeiten hindurch; Vorgänger nicht einzeln scoren. Nur setzen, wenn die Standard-Reihenfolge falsch wäre; verkleinere ihn (update_step), wenn der Grund wegfällt. Sagt der Nutzer ohne Kontext „weiter" oder „nächster Schritt", meint er die oberste Karte in „Jetzt" — das ist das erste Element im Feld "queue" von get_cook_state (die queue entspricht exakt der Anzeige-Reihenfolge); zeige sie dann per show_step (view "jetzt").',
  'Gib jedem Flow beim Anlegen ein passendes Emoji als icon (z.B. 🍚 für Reis).',
  'Wir sprechen per Stimme: Der Nutzer diktiert, deine Antworten werden vorgelesen. Sprich natürlich wie ein Gesprächspartner: kurze Sätze, keine Markdown-Formatierung, keine Listen, keine Emojis. Ton: trocken, direkt, präzise — aber hilfsbereit und zugewandt; keine Floskeln, kein Smalltalk, keine Gesten wie *lacht*.',
  'Nenne den Namen des Nutzers höchstens einmal pro Antwort und nur an natürlichen Stellen: Begrüßung zu Sessionsbeginn, Flow-Abschluss („Fertig, <Name>"), zeitkritischer Alarm („<Name>, der Ofen!"). Sonst weglassen.',
  'Weise Themen nie brüsk ab — Antworten wie „Kein Kochbezug" oder „Ende" sind verboten. Überleite stattdessen kurz und sachlich zu einer konkreten Kochfrage.',
  'Die Spracherkennung macht Fehler: Bei offensichtlich verrauschtem oder unsinnigem Input frage höchstens einmal kurz nach, danach übergehe ihn.',
  'Ist keine Antwort nötig (reine Bestätigung, Geräusch, verrauschtes Transkript), antworte ausschließlich mit „OK." — das wird weder vorgelesen noch angezeigt.',
  'Deine Werkzeuge steuern die Kochoberfläche: add_flow, add_step, update_step, delete_step, split_step, complete_step, revert_step, set_timer, pause_timer, resume_timer, complete_flow, update_flow, delete_flow, start_new_recipe, show_step, focus_flow, set_ingredients, set_loading, open_ingredients, close_ingredients, open_chat, close_chat, get_cook_state. Tool-Ergebnisse sind JSON-Strings; den aktuellen Zustand liefert get_cook_state — rufe es auf, wenn du ihn nicht kennst. Es enthält now_local (lokale Uhrzeit des Nutzers, mit Zeitzonen-Offset) sowie für jede wartende Karte ends_in_s und ends_at_local — nutze das für Zeitfragen („um 14:30 fertig", „wie lange läuft der Timer noch?"). set_timer nimmt immer relative Sekunden (seconds = neu ab jetzt, delta_seconds = aufschlagen) — nie absolute Zeitpunkte. Tool-Ergebnisse von add_flow/add_step/update_step können zusätzlich "warnings" enthalten (z.B. eine Zeitangabe, auf die keine Folgekarte mit timer_seconds wartet, oder eine Karte ohne depends_on-Kante) — behebe sie sofort in derselben Antwort per update_step/add_step.',
  'Bau-Spinner: JEDER Aufbau einer Schedule beginnt mit set_loading({scope: "all", loading: true}) und endet nach dem letzten Tool-Aufruf mit set_loading({loading: false}) — immer, ohne Ausnahme, auch bei einem einzigen add_flow oder einem kleinen Flow. Grund: Die Generierung dauert aus Nutzersicht länger als die Tool-Ausführung, der Spinner gehört zu jedem Bauvorgang. scope "flow" + flow_id nur, wenn du einen bestehenden Flow erweiterst. Beginnt ein neues Gericht („wir machen jetzt X statt Y", „fangen wir neu an"): set_loading(true) → start_new_recipe (leeres Brett, altes Gericht verworfen) → neues Rezept aufbauen → set_loading(false). Prüfe vor dem Senden: (1) War ein add_flow dabei? Dann muss davor set_loading({loading: true}) gestanden haben und danach set_loading({loading: false}). (2) Enthält eine Karte eine Zeitangabe? Dann muss die Folgekarte mit timer_seconds an ihr hängen — endet das Rezept mit der Wartezeit, ergänze einen finalen Schritt, der darauf wartet. Vergisst du das Ausschalten, verschwindet der Spinner spätestens bei der nächsten Nutzeräußerung. Der Spinner ist klein und rein visuell — der bestehende Plan bleibt sichtbar, Timer, Karten und Abschlüsse laufen währenddessen normal weiter.',
  'Delegiere nie etwas in der App an den Nutzer — seine Hände gehören an den Herd, und in der App kannst du alles selbst: Navigation (show_step, focus_flow), Modals (open_ingredients/close_ingredients: Ingredients-Liste, open_chat/close_chat: Chat-Verlauf), Timer (set_timer/pause_timer/resume_timer) und Struktur. Sätze wie „stell den Timer auf …" oder „öffne mal die Flow-Ansicht" sind verboten — tu es einfach. Meldet der Nutzer Realität („die Sahne ist schon geschlagen", „der Ofen braucht länger"), spiegle sie sofort per Werkzeug ins Modell (complete_step, set_timer). Du darfst Flows jederzeit ad-hoc umbauen: Schritte einfügen (after_step_id), ändern (update_step), löschen (delete_step), teilen (split_step), Flows umbenennen (update_flow) oder löschen (delete_flow). show_step(step_id) zeigt dem Nutzer gezielt eine Karte (flow_id optional): view "jetzt" für aktive Schritte (Standard), view "flow" für blockierte/fertige; speak: true liest die description vor — nutze das bei „Was mache ich als Nächstes?" und antworte nur „OK.".',
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
 * Der gesetzte Timer einer Karte — set_timer überschreibt ihn, sein Ablauf
 * macht die Karte frei (kein Zurückfallen auf die Plan-Wartezeit). Ist er
 * null, gilt die aus den Kanten abgeleitete Wartezeit (doneAt + timer_seconds).
 * Ein vorhandener Timer ist laufend, pausiert oder abgelaufen (er bleibt als
 * Fakt stehen, bis er überschrieben oder die Karte abgeschlossen wird).
 */
export interface StepTimer {
  /** Endzeitpunkt (Alarm). Restzeit = alarmAt − jetzt (+ Pausen-Slide). */
  alarmAt: number
  /** Pause aktiv seit … (Restzeit friert ein, der Timer läuft nie ab) */
  pausedAt: number | null
}

export interface Step {
  id: string // stabil — bleibt bei Einfügen/Löschen/Splitten gleich
  description: string
  done: boolean
  doneAt: number | null
  dependsOn: StepRef[]
  /** Der gesetzte Timer der Karte (set_timer überschreibt) — ohne Timer gilt
      die aus den Kanten abgeleitete Wartezeit. */
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
  // Farbe wird aus der Flow-Position abgeleitet (FLOW_COLORS[Index]) — kein Feld
  steps: Step[]
  done: boolean
}

export interface Ingredient {
  id: string
  name: string
  amount: string
}

export interface CookState {
  flows: Flow[]
  ingredients: Ingredient[]
  focusedFlowId: string | null
  /** Ladeanzeige (set_loading): Agent signalisiert lange Generierung.
      Rein visuell — Timer, Abschlüsse und Flows laufen normal weiter. */
  loading: { all: boolean; flows: string[] }
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
    loading: { all: false, flows: [] },
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
                  override?: Partial<StepTimer> | null
                  timer?:
                    | {
                        alarmAt?: number
                        startAt?: number
                        durationMs?: number
                        pauseOffsetMs?: number
                        pausedAt?: number | null
                        gatesSelf?: boolean
                      }
                    | null
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
              // Timer: neue Form direkt, alte Formen migrieren
              let timer: StepTimer | null = null
              if (o && typeof o.override === 'object' && o.override !== null) {
                // 3440-Form {alarmAt, pausedAt}
                const ov = o.override
                if (typeof ov.alarmAt === 'number' && Number.isFinite(ov.alarmAt)) {
                  timer = {
                    alarmAt: ov.alarmAt,
                    pausedAt: typeof ov.pausedAt === 'number' ? ov.pausedAt : null,
                  }
                }
              }
              if (timer === null && o && typeof o.timer === 'object' && o.timer !== null) {
                const t = o.timer
                if (typeof t.gatesSelf === 'boolean') {
                  // Alte Timer-Formen mit gatesSelf: true = Spiegel der
                  // abgeleiteten Wartezeit → verwerfen (fällt wieder aus den
                  // Kanten); false = freischwebender Timer → als Timer erhalten.
                  if (t.gatesSelf === false) {
                    const alarmAt =
                      typeof t.alarmAt === 'number' && Number.isFinite(t.alarmAt)
                        ? t.alarmAt
                        : typeof t.startAt === 'number' && typeof t.durationMs === 'number'
                          ? t.startAt +
                            t.durationMs +
                            (typeof t.pauseOffsetMs === 'number' ? t.pauseOffsetMs : 0)
                          : null
                    if (alarmAt !== null) {
                      timer = {
                        alarmAt,
                        pausedAt: typeof t.pausedAt === 'number' ? t.pausedAt : null,
                      }
                    }
                  }
                } else if (typeof t.alarmAt === 'number' && Number.isFinite(t.alarmAt)) {
                  // Neue Form {alarmAt, pausedAt}
                  timer = {
                    alarmAt: t.alarmAt,
                    pausedAt: typeof t.pausedAt === 'number' ? t.pausedAt : null,
                  }
                }
              }
              if (timer === null && o && typeof o.timerEndsAt === 'number' && o.timerExpired !== true) {
                const pausedAt = typeof o.timerPausedAt === 'number' ? o.timerPausedAt : null
                const offsetMs = typeof o.timerOffsetMs === 'number' ? o.timerOffsetMs : 0
                timer = { alarmAt: o.timerEndsAt + offsetMs, pausedAt }
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
            // Migration: alter Flow-Timer → Timer des aktiven Schritts (Sleep)
            if (typeof s.timerEndsAt === 'number' && steps[stepIndex] && steps[stepIndex].timer === null) {
              steps[stepIndex] = {
                ...steps[stepIndex],
                timer: {
                  alarmAt: s.timerEndsAt,
                  pausedAt: null,
                },
              }
            }
            return {
              id: sid,
              name: String(s.name ?? ''),
              icon: typeof s.icon === 'string' && s.icon.trim() !== '' ? s.icon.trim() : null,
              steps,
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
        // Ladeanzeige ist rein visuell und transient: nach einem Reload ist
        // die KI-Session weg — der Spinner darf nicht stehen bleiben.
        loading: { all: false, flows: [] },
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
  // Leere Agenten-Platzhalter aus früheren Sitzungen entsorgen
  removeEmptyAgents()
  // Wartezeiten sind abgeleitet — nichts zu synchronisieren
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

/** Leere Agenten-Platzhalter aufräumen („+ Neuer Agent" ohne Eingaben) —
    nur komplett leere Agenten, der Default-Zeiger wird notfalls umgehängt */
export function removeEmptyAgents() {
  const isEmpty = (a: AgentProfile) => !a.name && !a.endpoint && !a.model && !a.key
  if (!state.agents.some(isEmpty)) return
  setState('agents', (a) => a.filter((x) => !isEmpty(x)))
  if (state.defaultAgentId && !state.agents.some((a) => a.id === state.defaultAgentId)) {
    setState('defaultAgentId', state.agents[0]?.id ?? null)
  }
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
  // Bau-Spinner (set_loading) verschwindet spätestens mit der nächsten
  // Nutzeräußerung — Fallback, falls der Agent loading:false vergisst
  setState('cook', (c) => ({ ...c, loading: { all: false, flows: [] } }))
  setState('agent', 'messages', (m) => [...m, msg('user', text)])
  setState('agent', 'busy', true)
  try {
    const system = state.config.displayName
      ? `${SYSTEM_PROMPT} Der Nutzer heißt ${state.config.displayName}.`
      : SYSTEM_PROMPT
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
