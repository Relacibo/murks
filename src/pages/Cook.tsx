import { For, Show, createEffect, createMemo, createSignal, onCleanup, useContext } from 'solid-js'
import { SolidMarkdown as Markdown } from 'solid-markdown'
import { useConfig } from '../App'
import { state, sendMessage, type Flow, type Step, type StepRef } from '../state/store'
import { CookContext, FLOW_COLORS, queueOrder, overrideEffectiveEnd } from '../lib/cookEngine'
import { fmtRemaining } from '../lib/tools'
import { createAgentVoice } from '../lib/agentVoice'
import {
  FiMic, FiMicOff, FiMoreHorizontal, FiFileText, FiSettings, FiMessageSquare,
  FiCheck, FiLock, FiChevronLeft, FiChevronRight, FiRotateCcw, FiClock, FiSidebar,
  FiVolume2, FiVolumeX, FiPause, FiPlay, FiPlus, FiFastForward, FiSend, FiX,
} from 'solid-icons/fi'
import { toggleMuted, stopSpeaking, speak, pregenCard } from '../lib/tts'
import { playAlarmBell, playAlarmBing } from '../lib/alarmSounds'

export function Cook(props: {
  voice?: ReturnType<typeof createAgentVoice>
  onOpenIngredients: () => void
  onOpenChat: () => void
  overviewOpen?: boolean
  onToggleOverview?: () => void
}) {
  const { configOpen, setConfigOpen } = useConfig()
  const voice = props.voice ?? createAgentVoice({ configOpen })
  const engine = useContext(CookContext)!

  const [tick, setTick] = createSignal(Date.now())
  const [flowView, setFlowView] = createSignal<string | null>(null)
  // Übersicht (Desktop): Zustand kommt aus der URL; Mock fällt auf lokalen Signal zurück
  const [localOverviewOpen, setLocalOverviewOpen] = createSignal(true)
  const overviewOpen = () => props.overviewOpen ?? localOverviewOpen()
  const toggleOverview = () =>
    props.onToggleOverview ? props.onToggleOverview() : setLocalOverviewOpen((v) => !v)
  const [lastAgent, setLastAgent] = createSignal<{ text: string; at: number } | null>(null)
  const interval = setInterval(() => {
    setTick(Date.now())
    engine.expireTimers()
  }, 1000)
  onCleanup(() => clearInterval(interval))

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
      a !== null && tick() > 0 && (voice.speaking() || Date.now() - a.at < 12_000)
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

  /* Farbe ergibt sich aus der Flow-Position (Index) — kein gespeichertes Feld,
     dadurch nie Duplikate und keine Lücken nach delete_flow */
  const colorOf = (s: Flow) =>
    FLOW_COLORS[Math.max(0, flows().indexOf(s)) % FLOW_COLORS.length]
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

  /* Abgelaufene Timer (Engine-Events, letzte ~6 s) → Band-Uhr blinkt auf;
     neue Events: Ton — prio = mechanischer Wecker (auch bei Mute), sonst
     informatives Bing (bei gemutetem TTS still; Text wird danach vorgelesen) */
  const [alarmEvents, setAlarmEvents] = createSignal<{ key: string; at: number; prio: boolean }[]>([])
  let lastAlarmAt = Date.now()
  createEffect(() => {
    const evs = engine.alarmEvents
    if (!evs.length) return
    setAlarmEvents(evs.map((e) => ({ key: `${e.flowId}:${e.stepId}`, at: e.at, prio: e.prio })))
    const fresh = evs.filter((e) => e.at > lastAlarmAt)
    if (!fresh.length) return
    lastAlarmAt = fresh[fresh.length - 1].at
    if (fresh.some((e) => e.prio)) playAlarmBell()
    else if (!state.tts.muted) playAlarmBing()
  })
  function revealStep(flowId: string, stepId: string, view?: 'jetzt' | 'flow') {
    const s = flows().find((x) => x.id === flowId)
    if (!s || !s.steps.some((st) => st.id === stepId)) return
    focusFlow(flowId)
    if (view !== 'jetzt') setFlowView(flowId)   // 'flow' oder undefined → Detailansicht
    else setFlowView(null)                        // 'jetzt' → Queue bleibt sichtbar
    const key = `${flowId}:${stepId}`
    pulseCards([key])
    /* Ziel-Karte in den sichtbaren Bereich scrollen — nur im Flow-Kontext
       (Desktop-Spalte bzw. mobile Flow-View), nicht in der „Jetzt"-Liste */
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

  /* Wann wird die Karte frei? Maximaler Gate-Endzeitpunkt über alle
     abgeschlossenen Abhängigkeiten (Kanten-Verzögerung doneAt + timer_seconds)
     plus ggf. eigenes Override. Reine Ableitung aus den Fakten — tick()-Read,
     damit ablaufende Gates die Zustände pro Sekunde aktualisieren. */
  function pendingUntil(s: Flow, step: Step): number | null {
    tick()
    let max: number | null = null
    for (const d of step.dependsOn) {
      const dep = depStepOf(d)
      if (!dep?.done) continue
      if (d.timer_seconds && dep.doneAt !== null) {
        const e = dep.doneAt + d.timer_seconds * 1000
        if (max === null || e > max) max = e
      }
    }
    if (step.override) {
      const e = overrideEffectiveEnd(step.override)
      if (max === null || e > max) max = e
    }
    return max
  }

  function stepState(s: Flow, step: Step): 'done' | 'blocked' | 'waiting' | 'active' {
    tick()
    if (step.done) return 'done'
    if (step.dependsOn.some((d) => !depDone(s, step, d))) return 'blocked'
    /* waiting = effektives Ende (Kanten-Gates oder Override) liegt in der
       Zukunft — rein abgeleitet, nichts wird imperativ gepflegt */
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
     bzw. dem Override der Karte selbst. */
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
          const paused = () => st()!.override?.pausedAt != null
          return (
            <div
              class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
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
                          if (e.key === 'Enter') { e.currentTarget.blur() }
                          if (e.key === 'Escape') { setEditMins(null) }
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
          )
        }}
      </Show>
    )
  }

  /* ── Schritt-Karte (flach, klein, nie verschachtelt) ──────────────── */
  function StepCard(props: { s: Flow; i: number; onTitleClick?: () => void }) {
    const s = () => props.s
    const i = () => props.i
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
    /* Uhr im Band: Timer dieser Karte ist gerade abgelaufen (Engine-Event,
       max. 6 s) und die Karte ist dadurch aktiv geworden */
    const alarmClock = () => {
      tick()
      if (stateName() !== 'active') return false
      return alarmEvents().some(
        (e) => e.key === `${s().id}:${st().id}` && Date.now() - e.at < 6000,
      )
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
            <FiClock size={12} class="alarm-clock shrink-0" />
          </Show>
          <Show when={countdownEndsAt() !== null}>
            <span
              class="step-countdown font-mono text-sm font-semibold leading-none shrink-0 tabular-nums inline-flex items-center gap-1"
              classList={{ 'animate-pulse': urgent() }}
            >
              <Show when={st().override?.pausedAt != null}>
                <FiPause size={12} class="text-amber-400 shrink-0" />
              </Show>
              <span
                class="translate-y-[1px]"
                classList={{
                  'text-amber-300': urgent() || st().override?.pausedAt == null,
                  'text-zinc-400': !urgent() && st().override?.pausedAt != null,
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
                classList={{ 'is-running': st().override?.pausedAt == null }}
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
  }) {
    const showBlocked = () => props.showBlocked !== false
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
    const visibleKeys = () => {
      const list = [...jetztCards().prio, ...jetztCards().normal, ...jetztCards().waiting]
      if (showBlocked()) list.push(...jetztCards().blocked)
      return list.join('|')
    }
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
          // fill backwards: während des kleinen Delays unsichtbar (kein Morph),
          // erst fliegt der Ghost raus, dann kommt die neue Karte rein
          el.animate(
            [
              { transform: 'translateY(32px)', opacity: 0 },
              { transform: 'translateY(0)', opacity: 1 },
            ],
            { duration: 300, easing: 'ease-out', delay: 120, fill: 'backwards' },
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
                  setTimeout(() => setLeaving((l) => l.filter((x) => x !== g)), 600)
                })
              }}
            />
          )}
        </For>
        <For each={jetztCards().prio}>
          {(key) => {
            const c = cardByKey(key)
            return c ? <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(key.split(':')[0], key.split(':')[1])} /> : null
          }}
        </For>
        <For each={jetztCards().normal}>
          {(key) => {
            const c = cardByKey(key)
            return c ? <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(key.split(':')[0], key.split(':')[1])} /> : null
          }}
        </For>
        <For each={jetztCards().waiting}>
          {(key) => {
            const c = cardByKey(key)
            return c ? <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(key.split(':')[0], key.split(':')[1])} /> : null
          }}
        </For>
        <Show when={showBlocked()}>
          <For each={jetztCards().blocked}>
            {(key) => {
              const c = cardByKey(key)
              return c ? <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(key.split(':')[0], key.split(':')[1])} /> : null
            }}
          </For>
        </Show>
        <Show when={empty()}>
          <p class="text-sm text-zinc-500 text-center py-8">Alles erledigt.</p>
        </Show>
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
          <For each={s().steps}>
            {(_, i) => <StepCard s={s()} i={i()} />}
          </For>
        </div>
      </div>
    )
  }

  return (
    <div class="fixed inset-0 bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* ── Topbar: Timer-Chips + Buttons (eine Leiste) ────── */}
      <header class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-600">
        {/* Wortmarke nur auf dem Desktop — mobile verzichtet zugunsten der Chips */}
        <span class="hidden sm:block shrink-0 text-sm font-bold tracking-widest uppercase text-zinc-300 select-none">
          MURKS
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
                <Show when={x.st.override?.pausedAt != null} fallback={
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
                  classList={{ 'text-zinc-400': x.st.override?.pausedAt != null }}
                >
                  {fmtCountdown(x.endsAt)}
                </span>
              </button>
            )}
          </For>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="mic-btn"
            classList={{
              'is-on':
                voice.listening() || voice.transcribing() || voice.speaking(),
              'is-off':
                !voice.listening() && !voice.transcribing() && !voice.speaking(),
              /* Mobile: verschwindet, wenn der Composer (mit eigenem Mic) offen ist;
                 Desktop: immer sichtbar */
              'max-sm:hidden': composerOpen(),
            }}
            onClick={() => voice.toggleMic()}
            disabled={state.agent.busy || (!voice.sttReady() && !voice.listening())}
            title={voice.micTitle()}
            aria-label="Mikrofon umschalten"
          >
            <Show
              when={voice.transcribing()}
              fallback={
                <Show when={voice.listening()} fallback={<FiMicOff size={20} />}>
                  <FiMic size={20} />
                </Show>
              }
            >
              <FiMoreHorizontal size={20} class="animate-pulse" />
            </Show>
          </button>
          <button
            class="mic-btn"
            classList={{ 'is-on': !state.tts.muted, 'is-off': state.tts.muted }}
            onClick={() => toggleMuted()}
            title={
              state.tts.muted
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
          <div class="flex items-center rounded-lg border border-zinc-600 overflow-hidden divide-x divide-zinc-600 shrink-0">
            <button class="grouped-btn" onClick={() => props.onOpenIngredients()} title="Zutaten"><FiFileText size={16} /></button>
            <button class="grouped-btn" onClick={() => props.onOpenChat()} title="Chat"><FiMessageSquare size={16} /></button>
            <button class="grouped-btn" onClick={() => setConfigOpen(true)} title="Konfiguration"><FiSettings size={16} /></button>
          </div>
        </div>
      </header>

      {/* ── Karten ─────────────────────────────────────────────────────── */}
      <main class="flex-1 min-h-0 flex flex-col">
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
              {(s) => (
                <div class="flex-1 min-h-0 flex flex-col" data-flow-id={s().id}>
                  <div class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-600">
                    <button
                      class="icon-btn"
                      onClick={() => setFlowView(null)}
                      aria-label="Zurück zu Jetzt"
                    >
                      <FiChevronLeft size={16} />
                    </button>
                    <span class="text-sm font-semibold truncate">
                      {s().icon ? `${s().icon} ${s().name}` : s().name}
                    </span>
                  </div>
                  <div class="flex-1 min-h-0 overflow-y-auto pt-3 px-3 pb-28 flex flex-col gap-2">
                    <For each={s().steps}>
                      {(_, i) => <StepCard s={s()} i={i()} />}
                    </For>
                  </div>
                </div>
              )}
            </Show>
          </div>

          {/* Desktop: „Jetzt"-Spalte links + Übersicht (eine Spalte pro Flow) */}
          {/* Übersicht ein-/ausblendbar; zu → „Jetzt" allein, zentriert, breitere Karten */}
          {/* Horizontales Scrollen nur im Flow-Bereich — „Jetzt" bleibt stehen */}
          <div class="hidden sm:flex flex-1 min-h-0" classList={{ 'justify-center': !overviewOpen() }}>
            <div class="w-[320px] shrink-0 flex flex-col min-h-0" classList={{ 'bg-zinc-900/50': overviewOpen() }}>
              <Show when={overviewOpen()}>
                <div class="shrink-0 px-3 py-2 border-b border-zinc-700 text-xs uppercase tracking-widest text-zinc-500">
                  Jetzt
                </div>
              </Show>
              <JetztQueue
                onTitleClick={(flowId, stepId) => revealStep(flowId, stepId)}
                scrollerRef={(el) => (jetztScrollerDesktop = el)}
                showBlocked={false}
                dense
              />
            </div>
            <Show when={overviewOpen()}>
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
      </main>

      {/* ── Composer-Bar: globale Eingabe (Text + Mikrofon), immer sichtbar.
             Strips darüber erscheinen nur bei Aktivität. ────────────── */}
      <div class="composer">
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
              danach noch kurz */}
          <Show when={showAgentText()}>
            <div class="transcript-strip">
              <p class="text-sm text-zinc-400 line-clamp-4">{lastAgent()!.text}</p>
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
              classList={{
                'is-listening': voice.listening() || voice.transcribing(),
                'is-speaking': voice.speaking(),
              }}
              onClick={() => voice.toggleMic()}
              disabled={state.agent.busy || (!voice.sttReady() && !voice.listening())}
              title={voice.micTitle()}
              aria-label="Mikrofon umschalten"
            >
              <Show
                when={voice.transcribing()}
                fallback={
                  <Show when={voice.listening()} fallback={<FiMicOff size={20} />}>
                    <FiMic size={20} />
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
            {/* Leeres Feld: ✕ klappt ein (ersetzt den Senden-Button — kein Extra-Platz) */}
            <Show
              when={composerInput().trim() !== ''}
              fallback={
                <button
                  type="button"
                  class="composer-x"
                  onClick={collapseComposer}
                  title="Eingabe einklappen"
                  aria-label="Eingabe einklappen"
                >
                  <FiX size={16} />
                </button>
              }
            >
              <button
                type="submit"
                class="composer-send"
                disabled={state.agent.busy}
                title="Senden"
                aria-label="Nachricht senden"
              >
                <FiSend size={18} />
              </button>
            </Show>
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

      <WaitMenu />
    </div>
  )
}
