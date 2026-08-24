import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, useContext } from 'solid-js'
import { Portal } from 'solid-js/web'
import { SolidMarkdown as Markdown } from 'solid-markdown'
import { IngredientsModal } from '../components/IngredientsModal'
import { AgentModal } from './Agent'
import { ConfigModal } from './Config'
import { useConfig } from '../App'
import { state, sendMessage, removeEmptyAgents, type Flow, type Step, type StepRef } from '../state/store'
import { CookContext, FLOW_COLORS, queueOrder, timerEffectiveEnd } from '../lib/cookEngine'
import { fmtRemaining } from '../lib/tools'
import { createAgentVoice } from '../lib/agentVoice'
import {
  FiMic, FiMoreHorizontal, FiFileText, FiSettings, FiMessageSquare,
  FiCheck, FiLock, FiChevronLeft, FiChevronRight, FiRotateCcw, FiClock, FiSidebar,
  FiVolume2, FiVolumeX, FiPause, FiPlay, FiPlus, FiFastForward, FiSend, FiSquare, FiX,
} from 'solid-icons/fi'
import { toggleMuted, stopSpeaking, speak, pregenCard } from '../lib/tts'
import { playAlarmBell, playAlarmBing, stopAlarmSounds } from '../lib/alarmSounds'

/** Gesprächsmodus-Symbol (wie Gemini Live): drei Balken, mittlerer größer */
function ConvBars() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
      <rect x="4.5" y="10" width="3" height="4" rx="1.5" />
      <rect x="10.5" y="5" width="3" height="14" rx="1.5" />
      <rect x="16.5" y="10" width="3" height="4" rx="1.5" />
    </svg>
  )
}

export function Cook(props: {
  voice?: ReturnType<typeof createAgentVoice>
  onOpenIngredients: () => void
  onOpenChat: () => void
  ingredientsOpen: boolean
  onCloseIngredients: () => void
  chatOpen: boolean
  onCloseChat: () => void
  overviewOpen?: boolean
  onToggleOverview?: () => void
  webmcpMode?: boolean
  onToggleWebmcp?: () => void
}) {
  const { configOpen, setConfigOpen } = useConfig()
  const voice = props.voice ?? createAgentVoice({ configOpen })
  const engine = useContext(CookContext)!
  /* Externer Modus (WebMCP): Composer/Chat/Voice sind ausgeblendet, der
     externe Agent übernimmt den Dialog — Konfiguration wird Top-Level. */
  const external = () => props.webmcpMode === true

  /* Puls-Sync: alle CSS-Pulsanimationen starten bei derselben Phase.
     Einmalig beim Mount --pulse-offset auf :root setzen = negativer delay
     sodass alle Karten (egal wann gemountet) im gleichen Takt laufen. */
  const PULSE_DURATION = 1400 // ms — muss mit prio-pulse-Duration in CSS übereinstimmen
  document.documentElement.style.setProperty(
    '--pulse-offset',
    `-${(performance.now() % PULSE_DURATION).toFixed(0)}ms`,
  )

  const [tick, setTick] = createSignal(Date.now())
  const [flowView, setFlowView] = createSignal<string | null>(null)
  // Übersicht (Desktop): Zustand kommt aus der URL; Mock fällt auf lokalen Signal zurück
  const [localOverviewOpen, setLocalOverviewOpen] = createSignal(true)
  const overviewOpen = () => props.overviewOpen ?? localOverviewOpen()
  const toggleOverview = () =>
    props.onToggleOverview ? props.onToggleOverview() : setLocalOverviewOpen((v) => !v)
  const [lastAgent, setLastAgent] = createSignal<{ text: string; at: number } | null>(null)
  const [moreOpen, setMoreOpen] = createSignal(false)
  let moreMenuRef: HTMLDivElement | undefined
  function closeMoreOnOutside(e: MouseEvent) {
    if (moreMenuRef && !moreMenuRef.contains(e.target as Node)) setMoreOpen(false)
  }
  onMount(() => document.addEventListener('mousedown', closeMoreOnOutside))
  onCleanup(() => document.removeEventListener('mousedown', closeMoreOnOutside))
  const interval = setInterval(() => {
    setTick(Date.now())
    engine.expireTimers()
  }, 1000)
  onCleanup(() => clearInterval(interval))

  /* Toasts schweben über der Composer-Bar (inkl. Strips): Höhe der Bar
     als CSS-Variable auf :root, Toasts positionieren sich per calc()
     darüber. Im externen Modus (keine Bar) bleibt die Variable 0 —
     Toasts liegen dann ganz unten. */
  let composerRef: HTMLDivElement | undefined
  createEffect(() => {
    const setH = (px: number) =>
      document.documentElement.style.setProperty('--composer-h', `${px}px`)
    if (external()) {
      setH(0)
      return
    }
    const el = composerRef
    setH(el?.offsetHeight ?? 0)
    if (!el) return
    const ro = new ResizeObserver(() => setH(el.offsetHeight))
    ro.observe(el)
    onCleanup(() => {
      ro.disconnect()
      setH(0)
    })
  })

  let lastAgentRef: { text: string } | undefined = state.agent.messages[state.agent.messages.length - 1]
  createEffect(() => {
    const msgs = state.agent.messages
    const last = msgs[msgs.length - 1]
    if (last && last.role === 'agent' && last !== lastAgentRef) {
      lastAgentRef = last
      setLastAgent({ text: last.text, at: Date.now() })
    }
  })

  const showTranscript = () => {
    const t = voice.lastTranscript()
    return t !== null && tick() > 0 && Date.now() - t.at < 10_000
  }
  /* Letzte Agent-Antwort: solange die TTS spricht immer sichtbar,
     danach noch 12 s */
  const showAgentText = () => {
    const a = lastAgent()
    return (
      a !== null && tick() > 0 && (voice.ttsSpeaking() || Date.now() - a.at < 12_000)
    )
  }

  /* Transiente Zustände, die einen Status-Strip brauchen */
  const showStatus = () =>
    voice.transcribing() || voice.listening() || state.agent.busy

  /* ── Globale Eingabe (Composer-Bar): Text + Mikrofon ────────────────
     Eingeklappt nur ein runder Sprechblasen-Button (sticky unten rechts);
     ausgeklappt die volle Zeile. Strips erscheinen bei Aktivität. */
  const [composerOpen, setComposerOpen] = createSignal(false)
  const [composerInput, setComposerInput] = createSignal('')
  let composerInputRef: HTMLInputElement | undefined
  function openComposer() {
    setComposerOpen(true)
    requestAnimationFrame(() => composerInputRef?.focus())
  }
  function submitComposer(e: Event) {
    e.preventDefault()
    /* Während der Aufnahme ist der Send-Button ein „Stopp + Senden":
       Aufnahme beenden, das Transkript wird automatisch gesendet */
    if (voice.recording()) {
      voice.toggleRecord()
      return
    }
    const text = composerInput().trim()
    if (!text) return
    stopSpeaking()
    sendMessage(text)
    setComposerInput('')
  }
  function collapseComposer() {
    setComposerOpen(false)
    composerInputRef?.blur()
  }

  const flows = () => engine.cook.flows

  /* Laufende Flow-Erweiterungen (set_loading) — für Spinner in Spalte/Streifen */
  const loadingFlowNames = () =>
    engine.cook.loading.flows.flatMap((id) => {
      const f = flows().find((x) => x.id === id)
      return f ? [`${f.icon ? `${f.icon} ` : ''}${f.name}`] : []
    })

  /* Farbe ergibt sich aus der Flow-Position (Index) — kein gespeichertes Feld,
     dadurch nie Duplikate und keine Lücken nach delete_flow */
  const colorOf = (s: Flow) =>
    FLOW_COLORS[Math.max(0, flows().findIndex((f) => f.id === s.id)) % FLOW_COLORS.length]
  const active = createMemo(() => {
    const all = flows()
    if (all.length === 0) return undefined
    return all.find((s) => s.id === engine.cook.focusedFlowId) ?? all[0]
  })

  function focusFlow(id: string) {
    engine.executeTool('focus_flow', { flow_id: id })
  }

  /* ── Schritt anspringen: Fokus + Flow-View + Scroll + kurzer Puls ──── */
  const [pulses, setPulses] = createSignal<{ keys: Set<string>; nonce: number } | null>(null)
  let pulseTimer: ReturnType<typeof setTimeout> | undefined
  function pulseCards(keys: string[]) {
    const nonce = Date.now()
    setPulses({ keys: new Set(keys), nonce })
    clearTimeout(pulseTimer)
    pulseTimer = setTimeout(() => setPulses((p) => (p && p.nonce === nonce ? null : p)), 1600)
  }

  /* Abgelaufene Timer → Ton — prio = mechanischer Wecker (auch bei Mute),
     sonst informatives Bing (bei gemutetem TTS still; Text wird danach
     vorgelesen). Die ⏰-Uhr im Band ist aus den Fakten abgeleitet
     (Tombstone/abgelaufenes Gate — kein eigener Zustand). */
  let lastAlarmAt = Date.now()
  createEffect(() => {
    const evs = engine.alarmEvents
    if (!evs.length) return
    const fresh = evs.filter((e) => e.at > lastAlarmAt)
    if (!fresh.length) return
    lastAlarmAt = fresh[fresh.length - 1].at
    if (fresh.some((e) => e.prio)) playAlarmBell()
    else if (!state.tts.muted) playAlarmBing()
  })

  /* Schritt abgeschlossen/zurückgenommen (auch via Agent) → laufende
     Alarm-Töne sofort stoppen */
  let lastQuiet = 0
  createEffect(() => {
    const n = engine.quietNonce
    if (n === lastQuiet) return
    lastQuiet = n
    stopAlarmSounds()
  })
  function revealStep(flowId: string, stepId: string, view?: 'jetzt' | 'flow') {
    const s = flows().find((x) => x.id === flowId)
    if (!s || !s.steps.some((st) => st.id === stepId)) return
    focusFlow(flowId)
    /* Flow-Kontext: Detail-View (volle Breite) — wie mobil. Ausnahme
       Desktop mit offener Übersicht: dort bleibt die Ziel-Spalte stehen. */
    if (view === 'jetzt') {
      setFlowView(null)
    } else if (!(overviewOpen() && window.matchMedia('(min-width: 640px)').matches)) {
      setFlowView(flowId)
    }
    const key = `${flowId}:${stepId}`
    pulseCards([key])
    /* Ziel-Karte in den sichtbaren Bereich scrollen — nur im Flow-Kontext
       (Desktop-Spalte bzw. Flow-Detail-View), nicht in der „Jetzt"-Liste */
    requestAnimationFrame(() => {
      const scope =
        view === 'jetzt'
          ? `[data-card-list] [data-card-key="${CSS.escape(key)}"]`
          : `[data-flow-id="${CSS.escape(flowId)}"] [data-card-key="${CSS.escape(key)}"]`
      const el = Array.from(document.querySelectorAll<HTMLElement>(scope)).find(
        (n) => n.offsetParent !== null,
      )
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })
  }

  /* Kurzer Puls via WAAPI — startet bei jedem Klick neu (auch schnell hintereinander) */
  createEffect(() => {
    const p = pulses()
    if (!p) return
    for (const key of p.keys) {
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>(`[data-card-key="${CSS.escape(key)}"]`),
      )) {
        if (el.offsetParent === null) continue
        el.animate(
          [
            { boxShadow: '0 0 0 2px rgba(255, 255, 255, 0.9)' },
            { boxShadow: '0 0 0 10px rgba(255, 255, 255, 0)' },
          ],
          { duration: 1500, easing: 'ease-out' },
        )
      }
    }
  })

  /* KI ruft show_step → gleiches Verhalten wie Titel-Tap */
  createEffect(() => {
    const t = engine.navTarget
    if (t) revealStep(t.flowId, t.stepId, t.view)
  })

  /* ── Schritt-Zustände (implizite Verzögerungen: Karte sagt „ich komme X nach Y") ── */
  function depStepOf(dep: StepRef): Step | undefined {
    return flows().find((x) => x.id === dep.flow_id)?.steps.find((st) => st.id === dep.step_id)
  }
  function depDone(s: Flow, step: Step, dep: StepRef): boolean {
    return depStepOf(dep)?.done === true
  }

  /* Wann wird die Karte frei? Der gesetzte Timer (falls vorhanden) ERSETZT
     die Plan-Wartezeit; ohne Timer gilt die Ableitung aus den Kanten
     (doneAt + timer_seconds). tick()-Read, damit ablaufende Gates die
     Zustände pro Sekunde aktualisieren. */
  function derivedGateEnd(step: Step): number | null {
    let max: number | null = null
    for (const d of step.dependsOn) {
      const dep = depStepOf(d)
      if (!dep?.done) continue
      if (d.timer_seconds && dep.doneAt !== null) {
        const e = dep.doneAt + d.timer_seconds * 1000
        if (max === null || e > max) max = e
      }
    }
    return max
  }

  function pendingUntil(s: Flow, step: Step): number | null {
    tick()
    if (step.timer) return timerEffectiveEnd(step.timer)
    return derivedGateEnd(step)
  }

  function stepState(s: Flow, step: Step): 'done' | 'blocked' | 'waiting' | 'active' {
    tick()
    if (step.done) return 'done'
    if (step.dependsOn.some((d) => !depDone(s, step, d))) return 'blocked'
    /* waiting = effektives Ende (gesetzter Timer oder Kanten-Gates) liegt in
       der Zukunft — rein abgeleitet, nichts wird imperativ gepflegt */
    const end = pendingUntil(s, step)
    if (end !== null && end > Date.now()) return 'waiting'
    return 'active'
  }

  function flowDone(s: Flow): boolean {
    return s.done || s.steps.every((st) => st.done)
  }

  /* Offene Karte mit getimter Kante auf diesen Schritt? → Uhr-Button beim Abschließen */
  function hasTimedDependent(s: Flow, step: Step): boolean {
    return flows().some((f) =>
      f.steps.some(
        (c) =>
          !c.done &&
          c.dependsOn.some(
            (d) => d.flow_id === s.id && d.step_id === step.id && !!d.timer_seconds,
          ),
      ),
    )
  }

  /* Zurücknehmen nur, wenn keine abhängige Karte selbst abgeschlossen ist */
  function canRevert(s: Flow, i: number): boolean {
    const step = s.steps[i]
    if (!step?.done) return false
    return !flows().some((x) =>
      x.steps.some(
        (st) =>
          st.done &&
          st.dependsOn.some((d) => d.flow_id === s.id && d.step_id === step.id),
      ),
    )
  }

  function blockedBy(s: Flow, step: Step): string[] {
    return step.dependsOn
      .filter((d) => !depDone(s, step, d))
      .map((d) => {
        const ts = flows().find((x) => x.id === d.flow_id)
        const depStep = ts?.steps.find((st) => st.id === d.step_id)
        const nr = depStep ? ts!.steps.indexOf(depStep) + 1 : '?'
        return `${ts?.icon ?? ''} ${ts?.name ?? '?'} · Schritt ${nr}`.trim()
      })
  }

  /* ── Timer ─────────────────────────────────────────────────────────── */
  /* Tick lesen + formatieren als Funktionsaufruf, nicht als {tick() && fmt…}
     in JSX: der Compiler memo-isiert die &&-Bedingung und würde die
     Countdown-Anzeige einfrieren. */
  const fmtCountdown = (endsAt: number) => {
    tick()
    return fmtRemaining(endsAt)
  }

  /* Topbar-Chips: ein Chip pro wartender Karte — abgeleitet aus den Kanten
     bzw. dem gesetzten Timer der Karte selbst. */
  const chipTimers = createMemo(() => {
    tick()
    const now = Date.now()
    const out: { s: Flow; st: Step; endsAt: number }[] = []
    for (const s of flows()) {
      for (const st of s.steps) {
        if (st.done) continue
        if (st.dependsOn.some((d) => !depDone(s, st, d))) continue
        const end = pendingUntil(s, st)
        if (end === null || end <= now) continue
        out.push({ s, st, endsAt: end })
      }
    }
    out.sort((a, b) => a.endsAt - b.endsAt)
    return out
  })

  /* Chips zusammenstauchen, wenn sie nicht in die Zeile passen: erst Emojis
     ausblenden (kompakt); horizontales Scrollen bleibt letzte Reserve.
     Kompakt bleibt klebrig, bis weniger Chips da sind oder Platz wächst. */
  const [chipsCompact, setChipsCompact] = createSignal(false)
  let chipsRow: HTMLDivElement | undefined
  let chipsFloor = Infinity
  let chipsLastWidth = 0
  const measureChips = () => {
    const el = chipsRow
    if (!el) return
    if (!chipsCompact() && el.scrollWidth > el.clientWidth) setChipsCompact(true)
  }
  createEffect(() => {
    const n = chipTimers().length
    if (n < chipsFloor) {
      chipsFloor = n
      setChipsCompact(false)
    }
    requestAnimationFrame(measureChips)
  })
  createEffect(() => {
    const el = chipsRow
    if (!el) return
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > chipsLastWidth && chipsCompact()) {
        setChipsCompact(false)
        requestAnimationFrame(measureChips)
      }
      chipsLastWidth = el.clientWidth
      measureChips()
    })
    ro.observe(el)
    onCleanup(() => ro.disconnect())
  })

  /* Exit-Animation: abgeschlossene Karte fliegt weg (Desktop: links, mobil: oben) + Fade */
  const [leaving, setLeaving] = createSignal<
    { id: string; html: string; top: number; left: number; width: number; container: HTMLElement }[]
  >([])

  function completeStep(s: Flow, i: number) {
    const key = `${s.id}:${s.steps[i].id}`
    const el = Array.from(
      document.querySelectorAll<HTMLElement>(`[data-card-key="${CSS.escape(key)}"]`),
    ).find((n) => n.offsetParent !== null)
    if (el) {
      const cont = el.closest<HTMLElement>('[data-card-list]')
      if (cont) {
        const rect = el.getBoundingClientRect()
        const contRect = cont.getBoundingClientRect()
        const ghost = {
          id: `${key}-${Date.now()}`,
          html: el.outerHTML,
          top: rect.top - contRect.top + cont.scrollTop,
          left: rect.left - contRect.left + cont.scrollLeft,
          width: rect.width,
          container: cont,
        }
        setLeaving((l) => [...l, ghost])
      }
    }
    engine.executeTool('complete_step', { flow_id: s.id, step_id: s.steps[i].id }, { silent: true })
  }

  /* ── View 1 (Mobile „Jetzt"): Prio-Queue, normale Queue, Blocked ──── */
  /* Reihenfolge kommt aus queueOrder (cookEngine) — identisch zu dem,
     was der Agent über get_cook_state (Feld "queue") sieht. tick()-Read:
     abgeleitete Gates laufen ohne Store-Mutation ab — das Memo muss pro
     Sekunde neu rechnen, damit waiting-Karten in die aktive Sektion wandern. */
  const queue = createMemo(() => {
    tick()
    return queueOrder(engine.cook)
  })
  /* jetztCards gibt nur stabile step-Keys zurück ("`flowId:stepId`" Strings).
     Primitive Strings → <For> erkennt Gleichheit korrekt → keine DOM-Neubauten
     jede Sekunde durch tick(). Die Zustandskategorisierung bleibt tick-abhängig
     (via queue()), aber das betrifft nur die Reihenfolge, nicht die Identität. */
  const jetztCards = createMemo(() => {
    const prio: string[] = []
    const normal: string[] = []
    const waiting: string[] = []
    const blocked: string[] = []
    for (const q of queue()) {
      const key = `${q.flowId}:${q.stepId}`
      if (q.state === 'active' && q.priority === 'high') prio.push(key)
      else if (q.state === 'active') normal.push(key)
      else if (q.state === 'waiting') waiting.push(key)
      else blocked.push(key)
    }
    return { prio, normal, waiting, blocked }
  })

  /* Lookup-Helfer: Flow + Step-Index aus einem "flowId:stepId"-Key */
  function cardByKey(key: string): { s: Flow; i: number } | null {
    const [flowId, stepId] = key.split(':')
    const s = flows().find((x) => x.id === flowId)
    if (!s) return null
    const i = s.steps.findIndex((st) => st.id === stepId)
    return i < 0 ? null : { s, i }
  }

  /* Prio-Step wird aktiv → „Jetzt"-View öffnen + nach oben springen + Auto-Vorlesen */
  let jetztScroller: HTMLDivElement | undefined
  let jetztScrollerDesktop: HTMLDivElement | undefined
  const prioActiveIds = createMemo(() => jetztCards().prio.join('|'))
  let prevPrioIds: string | null = null
  createEffect(() => {
    const cur = prioActiveIds()
    if (prevPrioIds === null) {
      prevPrioIds = cur
      return
    }
    const prev = new Set(prevPrioIds.split('|').filter(Boolean))
    prevPrioIds = cur
    const added = cur.split('|').filter((key) => key && !prev.has(key))
    if (added.length === 0) return
    setFlowView(null)
    requestAnimationFrame(() => {
      jetztScroller?.scrollTo({ top: 0, behavior: 'smooth' })
      jetztScrollerDesktop?.scrollTo({ top: 0, behavior: 'smooth' })
    })
    // Erste neue Prio-Karte automatisch vorlesen
    const c = cardByKey(added[0])
    if (c) speak(c.s.steps[c.i].description)
  })

  /* Karten die aktiv werden: ersten Satz vorgenerieren */
  const allActiveKeys = createMemo(() =>
    [...jetztCards().prio, ...jetztCards().normal]
  )
  createEffect(() => {
    for (const key of allActiveKeys()) {
      const c = cardByKey(key)
      if (c) pregenCard(key, c.s.steps[c.i].description)
    }
  })

  const detailFlow = createMemo(() => flows().find((x) => x.id === flowView()))

  /* ── Warte-Menü (öffnet am Button der wartenden Karte) ────────────── */
  const [waitMenu, setWaitMenu] = createSignal<{ flowId: string; stepId: string } | null>(null)
  function WaitMenu() {
    const card = () => {
      const m = waitMenu()
      if (!m) return null
      const s = flows().find((x) => x.id === m.flowId)
      if (!s) return null
      const i = s.steps.findIndex((st) => st.id === m.stepId)
      return i < 0 ? null : { s, i }
    }
    const st = () => {
      const c = card()
      return c ? c.s.steps[c.i] : null
    }
    createEffect(() => {
      const c = card()
      if (c && stepState(c.s, c.s.steps[c.i]) !== 'waiting') setWaitMenu(null)
    })
    const act = (name: string, args: Record<string, unknown>) => {
      const m = waitMenu()
      if (!m) return
      engine.executeTool(name, { flow_id: m.flowId, step_id: m.stepId, ...args }, { silent: true })
    }

    /* Editierbarer Timer: Minuten als Texteingabe, Sekunden als Viertel-Schritte */
    const SEC_STEPS = [0, 15, 30, 45] as const
    const [editMins, setEditMins] = createSignal<string | null>(null)
    const [editSecs, setEditSecs] = createSignal<number | null>(null)

    function currentMins() {
      const r = pendingUntil(card()!.s, st()!)
      if (r === null) return 0
      return Math.floor((r - Date.now()) / 60000)
    }
    function currentSecs() {
      const r = pendingUntil(card()!.s, st()!)
      if (r === null) return 0
      return Math.round(((r - Date.now()) % 60000) / 1000 / 15) * 15 % 60
    }

    function applyTimer(m: number, s: number) {
      const total = Math.max(1, m * 60 + s)
      act('set_timer', { seconds: total })
    }
    function commitMins() {
      const raw = editMins()
      if (raw === null) return
      const m = Math.max(0, Math.min(99, parseInt(raw || '0', 10) || 0))
      const s = editSecs() ?? currentSecs()
      setEditMins(null)
      setEditSecs(null)
      applyTimer(m, s)
    }
    function cycleSecs(dir: 1 | -1) {
      const cur = editSecs() ?? currentSecs()
      const idx = SEC_STEPS.indexOf(cur as typeof SEC_STEPS[number])
      const next = SEC_STEPS[(idx + dir + SEC_STEPS.length) % SEC_STEPS.length]
      setEditSecs(next)
      const m = editMins() !== null ? (parseInt(editMins()! || '0', 10) || 0) : currentMins()
      applyTimer(m, next)
    }

    const iconBtn =
      'w-11 h-11 rounded-full border border-zinc-600 bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-zinc-100 transition-colors flex items-center justify-center disabled:opacity-40'

    return (
      <Show when={card()}>
        {(c) => {
          const remaining = () => pendingUntil(c().s, st()!)
          const paused = () => st()!.timer?.pausedAt != null
          return (
            <Portal>
            <div
              class="fixed inset-x-0 top-14 bottom-[max(4.5rem,env(safe-area-inset-bottom))] z-[55] flex items-end sm:items-center justify-center bg-black/50"
              onClick={() => setWaitMenu(null)}
            >
              <div
                class="w-full sm:max-w-xs rounded-t-xl sm:rounded-xl border border-zinc-700 bg-zinc-900 p-5 flex flex-col gap-5 overflow-y-auto max-h-[85svh]"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Timer-Anzeige = Eingabe */}
                <div class="flex flex-col items-center gap-1 py-1">
                  {/* Pause-Indikator: immer vorhanden (kein Layout-Shift), nur sichtbar wenn pausiert */}
                  <div class="h-4 flex items-center justify-center">
                    <Show when={paused()}>
                      <span class="flex items-center gap-1 text-xs text-zinc-500">
                        <FiPause size={10} />pausiert
                      </span>
                    </Show>
                  </div>
                  <div class="flex items-center justify-center gap-1">
                  {/* Minuten: Klick → editierbar */}
                  <div class="relative">
                    <Show
                      when={editMins() !== null}
                      fallback={
                        <button
                          class="font-mono text-5xl font-bold tabular-nums w-20 text-center leading-none"
                          classList={{ 'text-amber-300': !paused(), 'text-zinc-500': paused() }}
                          onClick={() => setEditMins(String(currentMins()))}
                          title="Minuten tippen"
                        >
                          {remaining() !== null
                            ? String(Math.floor(Math.max(0, remaining()! - Date.now()) / 60000)).padStart(2, '0')
                            : '00'}
                        </button>
                      }
                    >
                      <input
                        type="number"
                        min="0"
                        max="99"
                        class="font-mono text-5xl font-bold tabular-nums w-20 text-center leading-none bg-transparent text-amber-300 border-b-2 border-amber-400 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                        value={editMins()!}
                        onInput={(e) => setEditMins(e.currentTarget.value)}
                        onBlur={commitMins}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            commitMins()
                            e.currentTarget.blur()
                          }
                          if (e.key === 'Escape') {
                            setEditMins(null)
                            setEditSecs(null)
                          }
                        }}
                        ref={(el) => setTimeout(() => { el.focus(); el.select() }, 0)}
                      />
                    </Show>
                  </div>
                  <span
                    class="font-mono text-5xl font-bold select-none leading-none"
                    classList={{ 'text-amber-300': !paused(), 'text-zinc-500': paused() }}
                  >:</span>
                  {/* Sekunden: Klick/Scroll → Viertel-Schritte */}
                  <button
                    class="font-mono text-5xl font-bold tabular-nums w-20 text-center leading-none"
                    classList={{ 'text-amber-300': !paused(), 'text-zinc-500': paused() }}
                    onClick={() => cycleSecs(1)}
                    onWheel={(e) => { e.preventDefault(); cycleSecs(e.deltaY > 0 ? 1 : -1) }}
                    title="Sekunden (00 / 15 / 30 / 45)"
                  >
                    {editSecs() !== null
                      ? String(editSecs()!).padStart(2, '0')
                      : remaining() !== null
                        ? String(Math.round(((Math.max(0, remaining()! - Date.now())) % 60000) / 1000 / 15) * 15 % 60).padStart(2, '0')
                        : '00'}
                  </button>
                  </div>
                </div>

                {/* Aktions-Buttons */}
                <div class="flex items-center justify-center gap-3">
                  <button
                    class={iconBtn}
                    onClick={() => (paused() ? act('resume_timer', {}) : act('pause_timer', {}))}
                    title={paused() ? 'Fortsetzen' : 'Pausieren'}
                  >
                    <Show when={paused()} fallback={<FiPause size={16} />}>
                      <FiPlay size={16} />
                    </Show>
                  </button>
                  <button
                    class={iconBtn}
                    onClick={() => act('set_timer', { delta_seconds: 60 })}
                    title="+1 Minute"
                  >
                    <FiPlus size={16} />
                  </button>
                  <button
                    class={iconBtn}
                    onClick={() => {
                      const c2 = card()
                      if (c2) completeStep(c2.s, c2.i)
                      setWaitMenu(null)
                    }}
                    title="Jetzt abschließen"
                  >
                    <FiFastForward size={16} />
                  </button>
                </div>
              </div>
            </div>
            </Portal>
          )
        }}
      </Show>
    )
  }

  /* ── Schritt-Karte (flach, klein, nie verschachtelt) ──────────────── */
  /* WICHTIG: StepCard bekommt flowId/stepId (Strings) statt Flow-/Step-Objekte.
     Der Store ersetzt bei jedem Patch die Flow-Objekte (neue Proxies) — eine
     eingefrorene Objekt-Referenz in den Props würde stale Daten lesen.
     Lookup per ID liest flows() bei jedem Render frisch. */
  function StepCard(props: { flowId: string; stepId: string; onTitleClick?: () => void }) {
    const s = () => flows().find((x) => x.id === props.flowId)!
    const i = () => s().steps.findIndex((st) => st.id === props.stepId)
    const st = () => s().steps[i()]
    const stateName = () => stepState(s(), st())
    /* Countdown im Band nur auf wartenden Karten (die den Timer als Bedingung haben) —
       nicht auf der Karte, die den Timer auslöst */
    const countdownEndsAt = () =>
      stateName() === 'waiting' ? pendingUntil(s(), st()) : null
    const urgent = () => {
      tick()
      const ends = countdownEndsAt()
      return ends !== null && ends - Date.now() < 30_000
    }
    /* Uhr im Band: Timer dieser Karte ist abgelaufen — ABGELEITET aus den
       Fakten, kein eigener Zustand: abgelaufener gesetzter Timer (Tombstone)
       oder abgelaufenes Plan-Gate (doneAt + timer_seconds). Sie blinkt auf
       und bleibt stehen, bis die Karte abgeschlossen wird. (Grenzfall: nach
       revert der Karte selbst leuchtet sie wieder — das alte Gate ist ein
       Fakt; harmlos, beim nächsten Abschluss ist sie weg.) */
    const alarmClock = () => {
      tick()
      if (stateName() !== 'active') return false
      const t = st().timer
      if (t && t.pausedAt === null && timerEffectiveEnd(t) <= Date.now()) return true
      const gateEnd = derivedGateEnd(st())
      return gateEnd !== null && gateEnd <= Date.now()
    }
    return (
      <div
        class="step-card"
        data-color={colorOf(s())}
        data-card-key={`${s().id}:${st().id}`}
        classList={{
          'is-active': stateName() === 'active',
          'is-past': stateName() === 'done',
          'is-blocked': stateName() === 'blocked',
          'is-waiting': stateName() === 'waiting',
          'is-prio': st().priority === 'high' && stateName() === 'active',
          'is-clickable': stateName() === 'blocked',
        }}
        title={
          stateName() === 'blocked'
            ? 'Zeigt, worauf diese Karte wartet'
            : undefined
        }
        onClick={(e) => {
          if (stateName() !== 'blocked') return
          e.stopPropagation()
          const keys = st().dependsOn.map((d) => `${d.flow_id}:${d.step_id}`)
          if (keys.length > 0) pulseCards(keys)
        }}
      >
        <div class="step-card-band">
          <Show
            when={props.onTitleClick}
            fallback={
              <>
                {/* View 2 / Desktop-Spalten: nur Emoji — der Name steht im Flow-/Spalten-Header */}
                <Show when={s().icon}>
                  <span class="text-base leading-none shrink-0">{s().icon}</span>
                </Show>
                <span class="flex-1" />
              </>
            }
          >
            <Show when={s().icon}>
              <span class="text-base leading-none shrink-0">{s().icon}</span>
            </Show>
            <button
              class="step-card-title-btn"
              onClick={(e) => {
                e.stopPropagation()
                props.onTitleClick?.()
              }}
            >
              <span class="step-card-title truncate">{s().name}</span>
              <FiChevronRight size={12} class="shrink-0 opacity-60" />
            </button>
          </Show>
          <Show when={stateName() === 'blocked'}>
            <FiLock size={12} class="shrink-0 opacity-60" />
          </Show>
          <Show when={stateName() === 'done'}>
            <FiCheck size={12} class="shrink-0" />
          </Show>
          {/* Alarm: Timer gerade abgelaufen → Uhr blinkt an der Status-Position
              (wo sonst 🔒/✓ stehen); prio rot, sonst helle Kartenschriftfarbe */}
          <Show when={alarmClock()}>
            <span class="alarm-clock-wrap shrink-0">
              <FiClock size={12} class="alarm-clock" />
            </span>
          </Show>
          <Show when={countdownEndsAt() !== null}>
            <span
              class="step-countdown font-mono text-sm font-semibold leading-none shrink-0 tabular-nums inline-flex items-center gap-1"
              classList={{ 'animate-pulse': urgent() }}
            >
              <Show when={st().timer?.pausedAt != null}>
                <FiPause size={12} class="text-amber-400 shrink-0" />
              </Show>
              <span
                class="translate-y-[1px]"
                classList={{
                  'text-amber-300': urgent() || st().timer?.pausedAt == null,
                  'text-zinc-400': !urgent() && st().timer?.pausedAt != null,
                }}
              >
                {fmtCountdown(countdownEndsAt()!)}
              </span>
            </span>
          </Show>
          <span class="text-sm opacity-60 tabular-nums shrink-0">
            {i() + 1}/{s().steps.length}
          </span>
        </div>

        {/* Button-Zeile unter dem Text — Status („Wartet auf …") teilt sich
            die Zeile links mit dem Button rechts; außerhalb der step-card-body,
            damit opacity-55 (waiting) den Button nicht dimmt. min-h reserviert
            die Zeile, blockierte Karten zeigen nur den Status. */}
        <div class="step-card-body">
          <div class="step-description">
            <Show when={st().description}>
              <Markdown>{st().description}</Markdown>
            </Show>
          </div>
        </div>
        <div class="step-card-footer">
          <p class="flex-1 min-w-0 text-xs leading-4 opacity-70">
            <Show when={stateName() === 'blocked'}>
              Wartet auf: {blockedBy(s(), st()).join(', ')}
            </Show>
            <Show when={stateName() === 'waiting'}>
              <span class="inline-flex items-center gap-1">
                Wartet auf <FiClock size={11} /> Timer
              </span>
            </Show>
          </p>
            {/* Wartende Karte: Uhr öffnet Timer-Modal */}
            <Show when={stateName() === 'waiting'}>
              <button
                class="clock-btn"
                title="Timer-Optionen"
                aria-label="Timer-Optionen öffnen"
                onClick={(e) => {
                  e.stopPropagation()
                  setWaitMenu({ flowId: s().id, stepId: st().id })
                }}
              >
                <FiClock size={18} />
              </button>
            </Show>
            {/* Aktive Karte: abschließen — Uhr, wenn der Abschluss einen Timer startet */}
            <Show when={stateName() === 'active' && !flowDone(s())}>
              <Show
                when={hasTimedDependent(s(), st())}
                fallback={
                  <button
                    class="check-btn"
                    title="Schritt abschließen"
                    aria-label="Schritt abschließen und weiter"
                    onClick={(e) => {
                      e.stopPropagation()
                      completeStep(s(), i())
                    }}
                  >
                    <FiCheck size={18} />
                  </button>
                }
              >
                <button
                  class="clock-btn"
                  title="Abschließen — Timer startet"
                  aria-label="Schritt abschließen, Timer startet"
                  onClick={(e) => {
                    e.stopPropagation()
                    completeStep(s(), i())
                  }}
                >
                  <span class="relative inline-flex">
                    <FiClock size={18} />
                    {/* kleines Play-Icon unten rechts: dieser Abschluss startet den Timer */}
                    <FiPlay
                      size={7}
                      class="absolute -bottom-[3px] -right-[5px]"
                      fill="currentColor"
                      stroke-width={1}
                    />
                  </span>
                </button>
              </Show>
            </Show>
            <Show when={stateName() === 'done' && canRevert(s(), i())}>
              <button
                class="revert-btn"
                title="Schritt zurücknehmen"
                aria-label="Schritt zurücknehmen"
                onClick={(e) => {
                  e.stopPropagation()
                  engine.executeTool(
                    'revert_step',
                    { flow_id: s().id, step_id: st().id },
                    { silent: true },
                  )
                }}
              >
                <FiRotateCcw size={18} />
              </button>
            </Show>
            {/* Platzhalter, wenn kein Button da ist — Zeile behält ihre Höhe */}
            <Show
              when={
                stateName() !== 'waiting' &&
                !(stateName() === 'active' && !flowDone(s())) &&
                !(stateName() === 'done' && canRevert(s(), i()))
              }
            >
              <div class="w-11 h-11 shrink-0" aria-hidden="true" />
            </Show>
        </div>
      </div>
    )
  }

  /* ── „Jetzt"-Queue (Mobile-View 1 + Desktop-Spalte links) ────────── */
  function JetztQueue(props: {
    onTitleClick: (flowId: string, stepId: string) => void
    scrollerRef?: (el: HTMLDivElement) => void
    showBlocked?: boolean
    dense?: boolean
    centered?: boolean
  }) {
    const showBlocked = () => props.showBlocked !== false
    /* Zentriert (Desktop-Standalone): Karten schmal in der Mitte, der
       Scroll-Container bleibt volle Breite (Scrollbalken am Fensterrand) */
    const cardWrapCls = () => (props.centered ? 'mx-auto w-full max-w-[400px]' : '')
    const empty = () =>
      jetztCards().prio.length === 0 &&
      jetztCards().normal.length === 0 &&
      jetztCards().waiting.length === 0 &&
      (!showBlocked() || jetztCards().blocked.length === 0)

    /* Queue-Animation (FLIP + Ersatz von rechts + Exit-Ghost):
       Abschließen: Karte fliegt weg (Ghost), die Karten darunter wandern nach oben,
       der nächste Schritt desselben Flows fliegt von rechts an die Stelle.
       Erster Render (Seiten-Load, Flow-Wechsel zurück) = statisch. */
    let listRef: HTMLDivElement | undefined
    let prevRects = new Map<string, number>()
    let firstRun = true
    /* createMemo statt plain function: SolidJS vergleicht den resultierenden
       String wertgleich — bei gleichem Inhalt feuert der FLIP-Effect nicht neu,
       auch wenn jetztCards() durch tick() jede Sekunde ein neues Objekt erzeugt. */
    const visibleKeys = createMemo(() => {
      const list = [...jetztCards().prio, ...jetztCards().normal, ...jetztCards().waiting]
      if (showBlocked()) list.push(...jetztCards().blocked)
      return list.join('|')
    })
    createEffect(() => {
      visibleKeys()
      const cont = listRef
      if (!cont) return
      const nodes = Array.from(
        cont.querySelectorAll<HTMLElement>('[data-card-key]:not([data-ghost])'),
      )
      const next = new Map(nodes.map((el) => [el.dataset.cardKey!, el.getBoundingClientRect().top]))
      const skip = firstRun
      firstRun = false
      if (skip) {
        prevRects = next
        return
      }
      // display:none (andere Breakpoint) → nur merken, nicht animieren
      const hidden = cont.offsetParent === null
      for (const el of nodes) {
        if (hidden) continue
        const k = el.dataset.cardKey!
        const prev = prevRects.get(k)
        const now = next.get(k)
        if (now === undefined) continue
        if (prev === undefined) {
          el.animate(
            [{ transform: 'translateY(28px)' }, { transform: 'translateY(0)' }],
            { duration: 280, easing: 'ease-out' },
          )
        } else if (Math.abs(prev - now) > 1) {
          el.animate(
            [{ transform: `translateY(${prev - now}px)` }, { transform: 'translateY(0)' }],
            { duration: 260, easing: 'ease-out' },
          )
        }
      }
      prevRects = next
    })

    return (
      <div
        ref={(el) => {
          listRef = el
          props.scrollerRef?.(el)
        }}
        data-card-list
        class={`relative flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-2 ${props.dense ? 'p-1' : 'p-3'}`}
        style={{ 'padding-bottom': 'calc(var(--composer-h, 0px) + 1rem)' }}
      >
        <For each={leaving().filter((g) => g.container === listRef)}>
          {(g) => (
            <div
              data-ghost
              innerHTML={g.html}
              class="absolute pointer-events-none z-40"
              style={{
                top: `${g.top}px`,
                left: `${g.left}px`,
                width: `${g.width}px`,
              }}
              ref={(el) => {
                // ref feuert vor der DOM-Einfügung — Animation erst im nächsten
                // Frame, wenn das Element sicher verbunden ist
                requestAnimationFrame(() => {
                  if (!el.isConnected) return
                  const anim = el.animate(
                    [
                      { transform: 'translateY(0)', opacity: 1 },
                      { transform: 'translateY(-40px)', opacity: 0 },
                    ],
                    { duration: 220, easing: 'ease-in' },
                  )
                  anim.onfinish = () => setLeaving((l) => l.filter((x) => x !== g))
                })
              }}
            />
          )}
        </For>
        <For each={jetztCards().prio}>
          {(key) => (
            <div class={cardWrapCls()}>
              <StepCard
                flowId={key.split(':')[0]}
                stepId={key.split(':')[1]}
                onTitleClick={() => props.onTitleClick(key.split(':')[0], key.split(':')[1])}
              />
            </div>
          )}
        </For>
        <For each={jetztCards().normal}>
          {(key) => (
            <div class={cardWrapCls()}>
              <StepCard
                flowId={key.split(':')[0]}
                stepId={key.split(':')[1]}
                onTitleClick={() => props.onTitleClick(key.split(':')[0], key.split(':')[1])}
              />
            </div>
          )}
        </For>
        <For each={jetztCards().waiting}>
          {(key) => (
            <div class={cardWrapCls()}>
              <StepCard
                flowId={key.split(':')[0]}
                stepId={key.split(':')[1]}
                onTitleClick={() => props.onTitleClick(key.split(':')[0], key.split(':')[1])}
              />
            </div>
          )}
        </For>
        <Show when={showBlocked()}>
          <For each={jetztCards().blocked}>
            {(key) => (
              <div class={cardWrapCls()}>
                <StepCard
                  flowId={key.split(':')[0]}
                  stepId={key.split(':')[1]}
                  onTitleClick={() => props.onTitleClick(key.split(':')[0], key.split(':')[1])}
                />
              </div>
            )}
          </For>
        </Show>
        <Show when={empty()}>
          <p class="text-sm text-zinc-500 text-center py-8">Alles erledigt.</p>
        </Show>
      </div>
    )
  }

  /* ── Flow-Detail-View (volle Breite): ein Flow als einzelne, scrollende
        Spalte mit Zurück-Button — mobil Standard, Desktop im Übersicht-zu-
        Modus beim Klick auf einen Flow-Namen */
  function FlowDetail(props: { s: Flow; onBack: () => void }) {
    return (
      <div class="flex-1 min-h-0 flex flex-col" data-flow-id={props.s.id}>
        <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-600">
          <button
            class="icon-btn"
            onClick={props.onBack}
            aria-label="Zurück zu Jetzt"
          >
            <FiChevronLeft size={16} />
          </button>
          <span class="text-sm font-semibold truncate">
            {props.s.icon ? `${props.s.icon} ${props.s.name}` : props.s.name}
          </span>
        </div>
        <div
          class="flex-1 min-h-0 overflow-y-auto pt-3 px-3 flex flex-col gap-2"
          style={{ 'padding-bottom': 'calc(var(--composer-h, 0px) + 1rem)' }}
        >
          <For each={props.s.steps}>
            {(_, i) => <StepCard flowId={props.s.id} stepId={props.s.steps[i()].id} />}
          </For>
        </div>
      </div>
    )
  }

  /* ── Spalten-Header (Desktop) ─────────────────────────────────────── */
  function FlowColumn(props: { s: Flow; isFocused: boolean; onFocus: () => void }) {
    const s = () => props.s
    return (
      <div
        class="column"
        data-color={colorOf(s())}
        data-flow-id={s().id}
        classList={{ 'is-focused': props.isFocused }}
      >
        <button class="column-header" onClick={props.onFocus}>
          <Show when={s().icon}>
            <span class="text-base leading-none shrink-0">{s().icon}</span>
          </Show>
          <span class="text-sm font-semibold truncate flex-1 min-w-0">{s().name}</span>
          <Show when={flowDone(s())}>
            <FiCheck size={13} class="text-emerald-400 shrink-0" />
          </Show>
        </button>
        <div class="column-body">
          <Show when={engine.cook.loading.flows.includes(s().id)}>
            <div class="flex items-center gap-2 px-3 py-2 text-xs text-zinc-400">
              <span class="spinner spinner-sm shrink-0" />
              wird erweitert …
            </div>
          </Show>
          <For each={s().steps}>
            {(_, i) => <StepCard flowId={s().id} stepId={s().steps[i()].id} />}
          </For>
        </div>
      </div>
    )
  }

  return (
    <div class="fixed inset-0 bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* ── Topbar: Timer-Chips + Buttons (eine Leiste) ────── */}
      {/* z-[60]: bleibt über Modals nutzbar (Timer-Chips/Buttons) */}
      <header class="relative z-[60] shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-600 bg-zinc-950">
        {/* Wortmarke nur auf dem Desktop — mobile verzichtet zugunsten der Chips */}
        <span class="hidden sm:block shrink-0 text-sm font-bold tracking-widest text-zinc-300 select-none">
          murks
        </span>
        <div
          ref={(el) => (chipsRow = el)}
          class="chip-row flex-1 min-w-0 flex items-center gap-2 overflow-x-auto"
          classList={{ 'is-compact': chipsCompact() }}
        >
          <For each={chipTimers()}>
            {(x) => (
              <button
                class="chip"
                data-color={colorOf(x.s)}
                classList={{
                  'is-urgent': tick() > 0 && x.endsAt - Date.now() < 30_000,
                  'is-active': x.s.id === active()?.id,
                }}
                onClick={() => pulseCards([`${x.s.id}:${x.st.id}`])}
                title="Wartende Karte markieren"
              >
                {/* Emoji ausblenden wenn pausiert — ⏸ übernimmt den Platz
                    (gleicher 16-px-Footprint, damit nichts springt) */}
                <Show when={x.st.timer?.pausedAt != null} fallback={
                  <Show when={x.s.icon}>
                    <span class="chip-icon text-base leading-none shrink-0">{x.s.icon}</span>
                  </Show>
                }>
                  <span class="chip-icon w-4 h-4 shrink-0 flex items-center justify-center">
                    <FiPause size={16} class="text-amber-300" />
                  </span>
                </Show>
                <span
                  class="font-mono font-semibold tabular-nums"
                  classList={{ 'text-zinc-400': x.st.timer?.pausedAt != null }}
                >
                  {fmtCountdown(x.endsAt)}
                </span>
              </button>
            )}
          </For>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <Show when={!external()}>
            <button
              class="mic-btn"
              classList={{
                'is-on':
                  voice.listening() ||
                voice.transcribing() ||
                voice.speaking() ||
                voice.suspended(),
              'is-suspended': voice.suspended(),
              'is-off':
                !voice.listening() &&
                !voice.transcribing() &&
                !voice.speaking() &&
                !voice.suspended(),
              /* Gesprächsmodus-Toggle: immer sichtbar, auch auf Mobile */
            }}
            onClick={() => voice.toggleMic()}
            disabled={!voice.suspended() && !voice.sttReady() && !voice.listening()}
            title={voice.micTitle()}
            aria-label="Gesprächsmodus umschalten"
          >
            <Show
              when={voice.transcribing()}
              fallback={
                <span class="relative inline-flex">
                  <ConvBars />
                  <Show when={voice.suspended()}>
                    <span class="mic-suspended-bar" />
                  </Show>
                </span>
              }
            >
              <FiMoreHorizontal size={20} class="animate-pulse" />
            </Show>
          </button>
          </Show>
          <button
            class="mic-btn"
            classList={{ 'is-on': !state.tts.muted, 'is-off': state.tts.muted }}
            onClick={() => toggleMuted()}
            title={
              external()
                ? state.tts.muted
                  ? 'Nicht-kritische Alarm-Töne stumm'
                  : 'Nicht-kritische Alarm-Töne stummschalten'
                : state.tts.muted
                  ? 'Sprachausgabe stumm — Timer-Alarme bleiben an'
                  : 'Sprachausgabe stummschalten'
            }
            aria-label="Sprachausgabe stummschalten"
          >
            <Show when={state.tts.muted} fallback={<FiVolume2 size={20} />}>
              <FiVolumeX size={20} />
            </Show>
          </button>
          <button
            class="mic-btn hidden sm:flex"
            classList={{ 'is-on': overviewOpen(), 'is-off': !overviewOpen() }}
            onClick={toggleOverview}
            title={overviewOpen() ? 'Übersicht ausblenden' : 'Übersicht einblenden'}
            aria-label="Übersicht ein-/ausblenden"
          >
            <FiSidebar size={16} />
          </button>
          <button
            class="topbar-accent-btn shrink-0"
            onClick={() => props.onOpenIngredients()}
            title="Zutaten"
            aria-label="Zutaten anzeigen"
          >
            <FiFileText size={15} />
          </button>
          {/* Interner Modus: More-Menü (Chat-Verlauf + Konfiguration) */}
          <Show when={!external()}>
            <div class="relative shrink-0" ref={moreMenuRef}>
              <button
                class="mic-btn is-off"
                classList={{ 'bg-zinc-700': moreOpen() }}
                onClick={() => setMoreOpen((v) => !v)}
                title="Mehr"
                aria-label="Weitere Optionen"
              >
                <FiMoreHorizontal size={16} />
              </button>
              <Show when={moreOpen()}>
                <div class="absolute right-0 top-full mt-1 z-50 min-w-max flex flex-col rounded-lg border border-zinc-700 bg-zinc-800 shadow-xl overflow-hidden">
                  <button
                    class="more-menu-item"
                    onClick={() => { props.onOpenChat(); setMoreOpen(false) }}
                  >
                    <FiMessageSquare size={15} />
                    <span>Chat-Verlauf</span>
                  </button>
                  <button
                    class="more-menu-item"
                    onClick={() => { setConfigOpen(true); setMoreOpen(false) }}
                  >
                    <FiSettings size={15} />
                    <span>Konfiguration</span>
                  </button>
                </div>
              </Show>
            </div>
          </Show>
          {/* Externer Modus: kein Chat, keine Config — die Topbar bleibt
              bewusst karg, zurück geht es nur über den URL-Param */}
        </div>
      </header>

      {/* ── Karten ─────────────────────────────────────────────────────── */}
      <main class="relative flex-1 min-h-0 flex flex-col">
        {/* Flow-Erweiterung läuft (set_loading mit flow_id): Mobile sieht in
            der Regel nur „Jetzt" — deshalb ein schmaler, nicht-blockierender
            Streifen über dem Inhalt statt des Spinners in der Flow-Spalte
            (der ist Desktop-Sache). */}
        <Show when={loadingFlowNames().length > 0}>
          <div class="sm:hidden shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-zinc-600 bg-zinc-900/80 text-xs text-zinc-300">
            <span class="spinner spinner-sm shrink-0" />
            <span class="truncate">
              {loadingFlowNames().join(' · ')} wird erweitert …
            </span>
          </div>
        </Show>
        <Show
          when={flows().length > 0}
          fallback={
            <div class="flex items-center justify-center h-full">
              <p class="text-sm text-zinc-500">Noch keine Stränge.</p>
            </div>
          }
        >
          {/* Mobile: „Jetzt" (alle aktiven Karten) ↔ „Flow" (eine Spalte) */}
          <div class="sm:hidden flex-1 min-h-0 flex flex-col overflow-hidden">
            <Show
              when={detailFlow()}
              fallback={
                <JetztQueue
                  onTitleClick={(flowId, stepId) => revealStep(flowId, stepId)}
                  scrollerRef={(el) => (jetztScroller = el)}
                />
              }
            >
              {(s) => <FlowDetail s={s()} onBack={() => setFlowView(null)} />}
            </Show>
          </div>

          {/* Desktop: „Jetzt"-Spalte links + Übersicht (eine Spalte pro Flow) */}
          {/* Übersicht ein-/ausblendbar; zu → „Jetzt" allein wie Mobile:
              gleiche Queue (inkl. geblockter Karten unten, gemutet) über die
              volle Breite — Scrollbalken am Fensterrand, Karten zentriert.
              Flow-Namen-Klick öffnet dann die Flow-Detail-View (volle Breite,
              wie mobil) statt der Übersicht. */}
          {/* Horizontales Scrollen nur im Flow-Bereich — „Jetzt" bleibt stehen */}
          <div class="hidden sm:flex flex-1 min-h-0">
            <Show
              when={overviewOpen()}
              fallback={
                <Show
                  when={detailFlow()}
                  fallback={
                    <JetztQueue
                      onTitleClick={(flowId, stepId) => revealStep(flowId, stepId)}
                      scrollerRef={(el) => (jetztScrollerDesktop = el)}
                      showBlocked
                      centered
                    />
                  }
                >
                  {(s) => <FlowDetail s={s()} onBack={() => setFlowView(null)} />}
                </Show>
              }
            >
              <div class="w-[400px] shrink-0 flex flex-col min-h-0 bg-zinc-900/50">
                <div class="shrink-0 px-3 py-2 border-b border-zinc-700 text-xs uppercase tracking-widest text-zinc-500">
                  Jetzt
                </div>
                <JetztQueue
                  onTitleClick={(flowId, stepId) => revealStep(flowId, stepId)}
                  scrollerRef={(el) => (jetztScrollerDesktop = el)}
                  showBlocked={false}
                  dense
                />
              </div>
              <div class="columns-area flex flex-1 min-h-0 gap-3 pt-3 px-3 pb-3 overflow-x-auto items-stretch">
                <For each={flows()}>
                  {(s) => (
                    <FlowColumn
                      s={s}
                      isFocused={s.id === active()?.id}
                      onFocus={() => focusFlow(s.id)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>

        {/* Schedule-Generierung läuft (set_loading scope "all"): kleiner,
            nicht-blockierender Indikator links unten — der bestehende Plan
            bleibt voll sichtbar, nichts wird geblurrt */}
        <Show when={engine.cook.loading.all}>
          <div class="pointer-events-none absolute left-3 bottom-[5rem] sm:bottom-3 z-30 flex items-center gap-2 rounded-full border border-zinc-600 bg-zinc-800/95 px-3 py-1.5 text-xs text-zinc-200 shadow-lg">
            <span class="spinner spinner-sm" />
            Schedule wird generiert …
          </div>
        </Show>
      </main>

      {/* ── Composer-Bar: globale Eingabe (Text + Mikrofon), immer sichtbar.
             Strips darüber erscheinen nur bei Aktivität. Im externen Modus
             (WebMCP) entfällt sie komplett — Dialog macht der externe Agent. */}
      <Show when={!external()}>
      <div class="composer" classList={{ 'is-collapsed': !composerOpen() }} ref={composerRef}>
        <div class="composer-inner">
          {/* Erkannte Eingabe (STT-Text) — kurze Zeit sichtbar */}
          <Show when={showTranscript()}>
            <div class="transcript-strip">
              <p class="text-sm text-zinc-300 line-clamp-2">
                <span class="text-zinc-500 mr-1">🗣</span>
                {voice.lastTranscript()!.text}
              </p>
            </div>
          </Show>

          {/* Letzte Agent-Antwort (TTS-Text) — sichtbar, solange gesprochen wird,
              danach noch kurz. Im manuellen Modus spricht die KI nicht von
              selbst → Abspielen-Button */}
          <Show when={showAgentText()}>
            <div class="transcript-strip gap-3">
              <p class="flex-1 text-sm text-zinc-400 line-clamp-4">{lastAgent()!.text}</p>
              <Show when={!state.tts.muted}>
                <button
                  type="button"
                  class="shrink-0 text-xs text-zinc-400 hover:text-zinc-100 transition-colors inline-flex items-center gap-1"
                  onClick={() =>
                    voice.ttsSpeaking() ? stopSpeaking() : void speak(lastAgent()!.text)
                  }
                  title={
                    voice.ttsSpeaking() ? 'Sprachausgabe stoppen' : 'Antwort abspielen'
                  }
                >
                  <Show when={voice.ttsSpeaking()} fallback={<FiPlay size={14} />}>
                    <FiPause size={14} />
                  </Show>
                  {voice.ttsSpeaking() ? 'Stopp' : 'Abspielen'}
                </button>
              </Show>
            </div>
          </Show>

          {/* Status: nur während aktiver Zustände (Hören/Transkribieren/Denken) */}
          <Show when={showStatus()}>
            <div class="transcript-strip">
              <Show
                when={voice.transcribing()}
                fallback={
                  <Show
                    when={voice.listening()}
                    fallback={
                      <p class="text-xs italic text-zinc-500 animate-pulse">Denke nach …</p>
                    }
                  >
                    <p class="text-xs italic text-zinc-400">Höre zu …</p>
                  </Show>
                }
              >
                <p class="text-xs italic text-zinc-500 animate-pulse">Transkribiere …</p>
              </Show>
            </div>
          </Show>

          <Show when={composerOpen()}>
          <form class="composer-row" onSubmit={submitComposer}>
            <button
              type="button"
              class="composer-mic"
              classList={{ 'is-recording': voice.recording() }}
              onClick={() => voice.toggleRecord()}
              disabled={!voice.sttReady() && !voice.recording()}
              title={voice.recordTitle()}
              aria-label="Nachricht aufnehmen"
            >
              <Show
                when={voice.transcribing() && voice.recording()}
                fallback={
                  <Show when={voice.recording()} fallback={<FiMic size={20} />}>
                    <FiSquare size={14} />
                  </Show>
                }
              >
                <FiMoreHorizontal size={20} class="animate-pulse" />
              </Show>
            </button>
            <input
              ref={composerInputRef}
              class="composer-input"
              placeholder="Nachricht …"
              value={composerInput()}
              onInput={(e) => setComposerInput(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') collapseComposer()
              }}
            />
            {/* Leeres Feld: Gesprächsmodus-Button (wie Gemini Live — nur ohne
                Text in der Eingabe). Mit Text oder während der Aufnahme wird
                der Platz zum Senden-Button. */}
            <Show
              when={composerInput().trim() !== '' || voice.recording()}
              fallback={
                <button
                  type="button"
                  class="composer-conv"
                  classList={{
                    'is-on':
                      voice.listening() || voice.suspended() || voice.speaking(),
                  }}
                  onClick={() => voice.toggleMic()}
                  disabled={
                    !voice.listening() && !voice.suspended() && !voice.sttReady()
                  }
                  title={voice.micTitle()}
                  aria-label="Gesprächsmodus"
                >
                  <ConvBars />
                </button>
              }
            >
              <button
                type="submit"
                class="composer-send"
                disabled={state.agent.busy && !voice.recording()}
                title="Senden"
                aria-label="Nachricht senden"
              >
                <FiSend size={18} />
              </button>
            </Show>
            <button
              type="button"
              class="composer-x"
              onClick={collapseComposer}
              title="Eingabe einklappen"
              aria-label="Eingabe einklappen"
            >
              <FiX size={16} />
            </button>
          </form>
          </Show>
        </div>
        {/* Eingeklappt: FAB außerhalb des zentrierten Containers — ganz rechts */}
        <Show when={!composerOpen()}>
          <button
            class="composer-fab"
            onClick={openComposer}
            title="Chat-Eingabe"
            aria-label="Chat-Eingabe öffnen"
          >
            <FiMessageSquare size={18} />
          </button>
        </Show>
      </div>
      </Show>

      <IngredientsModal open={props.ingredientsOpen} onClose={props.onCloseIngredients} />
      <AgentModal open={!external() && props.chatOpen} onClose={props.onCloseChat} voice={voice} />
      <ConfigModal
        open={!external() && configOpen()}
        onClose={() => { removeEmptyAgents(); setConfigOpen(false) }}
        onToggleWebmcp={() => props.onToggleWebmcp?.()}
      />
      <WaitMenu />
    </div>
  )
}
