import { For, Show, createEffect, createMemo, createSignal, onCleanup, useContext } from 'solid-js'
import { SolidMarkdown as Markdown } from 'solid-markdown'
import { useConfig } from '../App'
import { state, sendMessage, type Flow, type Step, type StepRef, type StepTimer } from '../state/store'
import { CookContext, timerEffectiveEnd } from '../lib/cookEngine'
import { fmtRemaining } from '../lib/tools'
import { createAgentVoice } from '../lib/agentVoice'
import {
  FiMic, FiMicOff, FiMoreHorizontal, FiFileText, FiSettings, FiMessageSquare,
  FiCheck, FiLock, FiChevronLeft, FiChevronRight, FiRotateCcw, FiClock, FiSidebar,
  FiVolume2, FiVolumeX, FiPause, FiPlay, FiPlus, FiFastForward, FiSend,
} from 'solid-icons/fi'
import { toggleMuted, stopSpeaking } from '../lib/tts'

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
  const showAgentText = () =>
    lastAgent() !== null && tick() > 0 && Date.now() - lastAgent()!.at < 12_000

  const barVisible = () =>
    voice.listening() ||
    voice.transcribing() ||
    voice.speaking() ||
    state.agent.busy ||
    showTranscript() ||
    showAgentText()

  /* ── Globale Eingabe (Composer-Bar): Text + Mikrofon, immer sichtbar ── */
  const [composerInput, setComposerInput] = createSignal('')
  function submitComposer(e: Event) {
    e.preventDefault()
    const text = composerInput().trim()
    if (!text) return
    stopSpeaking()
    sendMessage(text)
    setComposerInput('')
  }

  const flows = () => engine.cook.flows

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
  function revealStep(flowId: string, stepId: string) {
    const s = flows().find((x) => x.id === flowId)
    if (!s || !s.steps.some((st) => st.id === stepId)) return
    focusFlow(flowId)
    setFlowView(flowId)
    const key = `${flowId}:${stepId}`
    pulseCards([key])
    requestAnimationFrame(() => {
      const el = Array.from(
        document.querySelectorAll<HTMLElement>(`[data-card-key="${CSS.escape(key)}"]`),
      ).find((n) => n.offsetParent !== null)
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
    })
  }

  /* Alle (noch offenen) Karten markieren, die auf einen Timer dieser Karte warten */
  function pulseTimedDependents(s: Flow, st: Step) {
    const keys: string[] = []
    for (const x of flows()) {
      for (const d of x.steps) {
        if (!d.done && d.dependsOn.some((r) => r.flow_id === s.id && r.step_id === st.id)) {
          keys.push(`${x.id}:${d.id}`)
        }
      }
    }
    pulseCards(keys)
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
    if (t) revealStep(t.flowId, t.stepId)
  })

  /* ── Schritt-Zustände (implizite Verzögerungen: Karte sagt „ich komme X nach Y") ── */
  function depStepOf(dep: StepRef): Step | undefined {
    return flows().find((x) => x.id === dep.flow_id)?.steps.find((st) => st.id === dep.step_id)
  }
  function depDone(s: Flow, step: Step, dep: StepRef): boolean {
    return depStepOf(dep)?.done === true
  }

  /* Wann wird die Karte frei? Maximaler Gate-Endzeitpunkt über alle
     abgeschlossenen Abhängigkeiten (deren Timer oder Kanten-Verzögerung)
     plus ggf. der eigene Warte-Timer (timer.gatesSelf). tick()-Read, damit
     ablaufende Gates die abgeleiteten Zustände pro Sekunde aktualisieren. */
  function pendingUntil(s: Flow, step: Step): number | null {
    tick()
    let max: number | null = null
    for (const d of step.dependsOn) {
      const dep = depStepOf(d)
      if (!dep?.done) continue
      let end: number | null = null
      if (dep.timer) end = timerEffectiveEnd(dep.timer)
      if (d.timer_seconds && dep.doneAt !== null) {
        const e = dep.doneAt + d.timer_seconds * 1000
        if (end === null || e > end) end = e
      }
      if (end !== null && (max === null || end > max)) max = end
    }
    if (step.timer?.gatesSelf) {
      const e = timerEffectiveEnd(step.timer)
      if (max === null || e > max) max = e
    }
    return max
  }

  function stepState(s: Flow, step: Step): 'done' | 'blocked' | 'waiting' | 'active' {
    if (step.done) return 'done'
    if (step.dependsOn.some((d) => !depDone(s, step, d))) return 'blocked'
    /* gatesSelf-Timer wird von syncWaitTimers/expireTimers imperativ gepflegt —
       kein tick()-Read nötig, dadurch bleibt jetztCards() tick-unabhängig */
    if (step.timer?.gatesSelf === true) return 'waiting'
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

  /* Topbar-Chips: ein Chip pro Timer-Objekt (ein Timer gehört genau einem Step —
     Besitzer ergibt sich beim Iterieren, dedupe über Referenz-Gleichheit).
     gatesSelf = Warte-Timer der Karte selbst, sonst Timer für die Dependents. */
  const chipTimers = createMemo(() => {
    tick()
    const now = Date.now()
    const out: { t: StepTimer; s: Flow; st: Step; endsAt: number }[] = []
    const seen = new Set<StepTimer>()
    for (const s of flows()) {
      for (const st of s.steps) {
        const t = st.timer
        if (!t || seen.has(t)) continue
        seen.add(t)
        const end = timerEffectiveEnd(t)
        if (end <= now) continue
        const relevant = t.gatesSelf
          ? !st.done
          : flows().some((f) =>
              f.steps.some(
                (c) =>
                  !c.done &&
                  c.dependsOn.some((d) => d.flow_id === s.id && d.step_id === st.id),
              ),
            )
        if (!relevant) continue
        out.push({ t, s, st, endsAt: end })
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
  /* Prio-Queue: active high-Steps in Auftauch-Reihenfolge (FIFO)       */
  /* Normale Queue: nach Scheduling-Score (absteigend),                 */
  /*                Tiebreaker Flow-/Schritt-Reihenfolge                */
  /* Waiting: nach Freiwerden (Timer-Ende), Tiebreaker prio             */
  /* Blocked: als Vorschau unten, grau, in Anlage-Reihenfolge           */
  const jetztCards = createMemo(() => {
    const prio: { s: Flow; st: Step; i: number }[] = []
    const normal: { s: Flow; st: Step; i: number }[] = []
    const waiting: { s: Flow; st: Step; i: number }[] = []
    const blocked: { s: Flow; st: Step; i: number }[] = []
    for (const s of flows()) {
      if (flowDone(s)) continue
      s.steps.forEach((st, i) => {
        if (st.done) return
        const state = stepState(s, st)
        if (state === 'active' && st.priority === 'high') prio.push({ s, st, i })
        else if (state === 'active') normal.push({ s, st, i })
        else if (state === 'waiting') waiting.push({ s, st, i })
        else blocked.push({ s, st, i })
      })
    }
    prio.sort((a, b) => (a.st.activatedAt ?? 0) - (b.st.activatedAt ?? 0))
    /* Aktive Karten: Scheduling-Score absteigend; stabile Sortierung —
       bei Gleichstand bleibt die Flow-/Schritt-Reihenfolge */
    normal.sort((a, b) => b.st.score - a.st.score)
    /* Wartende Karten: nach Freiwerden (Timer-Ende), Tiebreaker prio oben.
       timerEffectiveEnd liest keine Signals → jetztCards() bleibt tick-unabhängig */
    waiting.sort((a, b) => {
      const ta = a.st.timer?.gatesSelf ? timerEffectiveEnd(a.st.timer) : Infinity
      const tb = b.st.timer?.gatesSelf ? timerEffectiveEnd(b.st.timer) : Infinity
      if (ta !== tb) return ta - tb
      if (a.st.priority !== b.st.priority) return a.st.priority === 'high' ? -1 : 1
      return 0
    })
    return { prio, normal, waiting, blocked }
  })

  /* Prio-Step wird aktiv → „Jetzt"-View öffnen + nach oben springen */
  let jetztScroller: HTMLDivElement | undefined
  let jetztScrollerDesktop: HTMLDivElement | undefined
  const prioActiveIds = createMemo(() =>
    jetztCards()
      .prio.map((c) => `${c.s.id}:${c.i}`)
      .join('|'),
  )
  let prevPrioIds: string | null = null
  createEffect(() => {
    const cur = prioActiveIds()
    if (prevPrioIds === null) {
      prevPrioIds = cur
      return
    }
    const prev = new Set(prevPrioIds.split('|').filter(Boolean))
    prevPrioIds = cur
    const added = cur.split('|').filter((id) => id && !prev.has(id))
    if (added.length === 0) return
    setFlowView(null)
    requestAnimationFrame(() => {
      jetztScroller?.scrollTo({ top: 0, behavior: 'smooth' })
      jetztScrollerDesktop?.scrollTo({ top: 0, behavior: 'smooth' })
    })
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
    const [mins, setMins] = createSignal('')
    const [secs, setSecs] = createSignal('')
    function applyCustomTimer() {
      const m = Math.max(0, parseInt(mins() || '0', 10))
      const s = Math.min(59, Math.max(0, parseInt(secs() || '0', 10)))
      const total = m * 60 + s
      if (total > 0) {
        act('start_timer', { seconds: total })
        setMins('')
        setSecs('')
      }
    }
    const btn =
      'h-9 px-3 rounded-lg border border-zinc-600 bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-zinc-100 transition-colors flex items-center justify-center gap-1.5 text-sm disabled:opacity-40'
    const inputCls =
      'w-14 bg-zinc-800 border border-zinc-600 rounded-lg py-2 text-center font-mono text-xl text-zinc-100 focus:border-zinc-400 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none'
    return (
      <Show when={card()}>
        {(c) => {
          const remaining = () => pendingUntil(c().s, st()!)
          const paused = () => st()!.timer?.pausedAt !== null
          return (
            <div
              class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
              onClick={() => setWaitMenu(null)}
            >
              <div
                class="w-full sm:max-w-xs rounded-t-xl sm:rounded-xl border border-zinc-700 bg-zinc-900 p-5 flex flex-col gap-4"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Großer Countdown */}
                <div class="flex flex-col items-center gap-1 py-1">
                  <div class="flex items-center gap-2">
                    <Show when={paused()}>
                      <FiPause size={18} class="text-amber-400" />
                    </Show>
                    <span
                      class="font-mono text-5xl font-bold tabular-nums"
                      classList={{ 'text-amber-300': !paused(), 'text-zinc-500': paused() }}
                    >
                      {remaining() !== null ? fmtCountdown(remaining()!) : '–'}
                    </span>
                  </div>
                  <Show when={paused()}>
                    <span class="text-xs text-zinc-500">pausiert</span>
                  </Show>
                </div>

                {/* Neu stellen: M : SS */}
                <div class="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="99"
                    class={inputCls}
                    placeholder="0"
                    value={mins()}
                    onInput={(e) => setMins(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyCustomTimer()}
                  />
                  <span class="text-zinc-500 font-mono text-2xl font-bold select-none">:</span>
                  <input
                    type="number"
                    min="0"
                    max="59"
                    class={inputCls}
                    placeholder="00"
                    value={secs()}
                    onInput={(e) => setSecs(e.currentTarget.value)}
                    onKeyDown={(e) => e.key === 'Enter' && applyCustomTimer()}
                  />
                  <button
                    class={btn + ' flex-1'}
                    disabled={!mins() && !secs()}
                    onClick={applyCustomTimer}
                  >
                    <FiCheck size={14} />
                    Stellen
                  </button>
                </div>

                {/* Schnell-Aktionen */}
                <div class="grid grid-cols-4 gap-2">
                  <button
                    class={btn}
                    onClick={() => (paused() ? act('resume_timer', {}) : act('pause_timer', {}))}
                  >
                    <Show when={paused()} fallback={<FiPause size={14} />}>
                      <FiPlay size={14} />
                    </Show>
                  </button>
                  <button
                    class={btn}
                    onClick={() => act('start_timer', { offset_seconds: 60, offset_base: 'end' })}
                  >
                    <FiPlus size={12} />1m
                  </button>
                  <button
                    class={btn}
                    onClick={() => act('start_timer', { offset_seconds: 300, offset_base: 'end' })}
                  >
                    <FiPlus size={12} />5m
                  </button>
                  <button class={btn} onClick={() => act('cancel_timer', {})} title="Zurücksetzen">
                    <FiRotateCcw size={14} />
                  </button>
                </div>

                {/* Jetzt abschließen */}
                <button
                  class={btn + ' w-full justify-center'}
                  onClick={() => {
                    const c2 = card()
                    if (c2) completeStep(c2.s, c2.i)
                    setWaitMenu(null)
                  }}
                >
                  <FiFastForward size={14} />
                  Jetzt abschließen
                </button>
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
    return (
      <div
        class="step-card"
        data-color={s().color}
        data-card-key={`${s().id}:${st().id}`}
        classList={{
          'is-active': stateName() === 'active',
          'is-past': stateName() === 'done',
          'is-blocked': stateName() === 'blocked',
          'is-waiting': stateName() === 'waiting',
          'is-prio': st().priority === 'high' && stateName() === 'active',
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
          <Show when={countdownEndsAt() !== null}>
            <span
              class="step-countdown font-mono text-sm font-semibold leading-none translate-y-[1px] shrink-0 tabular-nums"
              classList={{ 'text-amber-300 animate-pulse': urgent() }}
            >
              <Show when={st().timer?.pausedAt !== null}>
                <FiPause size={12} class="text-amber-300 shrink-0" />
              </Show>
              {fmtCountdown(countdownEndsAt()!)}
            </span>
          </Show>
          <span class="text-sm opacity-60 tabular-nums shrink-0">
            {i() + 1}/{s().steps.length}
          </span>
        </div>

        {/* Button außerhalb step-card-body, damit opacity-55 (waiting) ihn nicht dimmt */}
        <div class="flex items-stretch">
          <div class="step-card-body flex-1 min-w-0">
            <div class="step-description step-description-clamp">
              <Show when={st().description}>
                <Markdown>{st().description}</Markdown>
              </Show>
            </div>
            <p class="mt-1 h-4 text-xs leading-4 truncate opacity-70">
              <Show when={stateName() === 'blocked'}>
                Wartet auf: {blockedBy(s(), st()).join(', ')}
              </Show>
              <Show when={stateName() === 'waiting'}>
                <span class="inline-flex items-center gap-1">
                  Wartet auf <FiClock size={11} /> Timer
                </span>
              </Show>
            </p>
          </div>
          <div class="shrink-0 w-14 flex items-center justify-center">
            {/* Wartende Karte: Uhr öffnet Timer-Modal */}
            <Show when={stateName() === 'waiting'}>
              <button
                class="clock-btn"
                classList={{ 'is-running': st().timer?.pausedAt === null }}
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
                  <FiClock size={18} />
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
          </div>
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
      return list.map((c) => `${c.s.id}:${c.st.id}`).join('|')
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
          {(c) => (
            <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(c.s.id, c.st.id)} />
          )}
        </For>
        <For each={jetztCards().normal}>
          {(c) => (
            <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(c.s.id, c.st.id)} />
          )}
        </For>
        <For each={jetztCards().waiting}>
          {(c) => (
            <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(c.s.id, c.st.id)} />
          )}
        </For>
        <Show when={showBlocked()}>
          <For each={jetztCards().blocked}>
            {(c) => (
              <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(c.s.id, c.st.id)} />
            )}
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
        data-color={s().color}
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
    <div class="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* ── Topbar: Timer-Chips + Buttons (eine Leiste, kein Logo) ────── */}
      <header class="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-zinc-600">
        <div
          ref={(el) => (chipsRow = el)}
          class="chip-row flex-1 min-w-0 flex items-center gap-2 overflow-x-auto"
          classList={{ 'is-compact': chipsCompact() }}
        >
          <For each={chipTimers()}>
            {(x) => (
              <button
                class="chip"
                data-color={x.s.color}
                classList={{
                  'is-urgent': tick() > 0 && x.endsAt - Date.now() < 30_000,
                  'is-active': x.s.id === active()?.id,
                }}
                onClick={() =>
                  x.t.gatesSelf
                    ? pulseCards([`${x.s.id}:${x.st.id}`])
                    : pulseTimedDependents(x.s, x.st)
                }
                title={
                  x.t.gatesSelf ? 'Wartende Karte markieren' : 'Abhängige Karten markieren'
                }
              >
                <Show when={x.s.icon}>
                  <span class="chip-icon text-base leading-none shrink-0">{x.s.icon}</span>
                </Show>
                <Show when={x.t.pausedAt !== null}>
                  <FiPause size={12} class="text-amber-300" />
                </Show>
                <span class="font-mono font-semibold tabular-nums">
                  {fmtCountdown(x.endsAt)}
                </span>
              </button>
            )}
          </For>
        </div>
        <div class="flex items-center gap-2 shrink-0">
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
            class="icon-btn hidden sm:flex"
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
                <div class="flex-1 min-h-0 flex flex-col">
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
            <div
              class="shrink-0 flex flex-col min-h-0"
              classList={{
                'w-[320px] bg-zinc-900/50': overviewOpen(),
                'w-[400px]': !overviewOpen(),
              }}
            >
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
              <div class="columns-area flex flex-1 min-h-0 gap-3 pt-3 px-3 pb-20 overflow-x-auto items-stretch">
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
          {/* Erkannte Eingabe (STT-Text) */}
          <Show when={showTranscript()}>
            <div class="transcript-strip">
              <p class="text-sm text-zinc-300 line-clamp-2">
                <span class="text-zinc-500 mr-1">🗣</span>
                {voice.lastTranscript()!.text}
              </p>
            </div>
          </Show>

          {/* Status / letzte Agent-Antwort */}
          <Show when={barVisible()}>
            <div class="transcript-strip">
              <Show
                when={voice.transcribing()}
                fallback={
                  <Show
                    when={voice.listening()}
                    fallback={
                      <Show
                        when={voice.speaking()}
                        fallback={
                          <Show
                            when={state.agent.busy}
                            fallback={
                              <Show when={showAgentText()}>
                                <p class="text-sm text-zinc-400 line-clamp-4">{lastAgent()!.text}</p>
                              </Show>
                            }
                          >
                            <p class="text-xs italic text-zinc-500 animate-pulse">Denke nach …</p>
                          </Show>
                        }
                      >
                        <p class="text-xs italic text-zinc-400">Sprache erkannt</p>
                      </Show>
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

          <form class="composer-row" onSubmit={submitComposer}>
            <button
              type="button"
              class="composer-mic"
              classList={{
                'is-listening': voice.listening() && !voice.transcribing(),
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
              class="composer-input"
              placeholder="Nachricht …"
              value={composerInput()}
              onInput={(e) => setComposerInput(e.currentTarget.value)}
            />
            <button
              type="submit"
              class="composer-send"
              disabled={state.agent.busy || !composerInput().trim()}
              title="Senden"
              aria-label="Nachricht senden"
            >
              <FiSend size={18} />
            </button>
          </form>
        </div>
      </div>

      <WaitMenu />
    </div>
  )
}
