import { For, Show, createEffect, createMemo, createSignal, onCleanup, useContext } from 'solid-js'
import { SolidMarkdown as Markdown } from 'solid-markdown'
import { useConfig } from '../App'
import { state, type Strang, type Step } from '../state/store'
import { CookContext } from '../lib/cookEngine'
import { fmtRemaining } from '../lib/tools'
import { createAgentVoice } from '../lib/agentVoice'
import {
  FiMic, FiMicOff, FiMoreHorizontal, FiFileText, FiSettings,
  FiCheck, FiBell, FiX, FiLock, FiChevronLeft, FiChevronRight, FiRotateCcw, FiClock, FiSidebar,
} from 'solid-icons/fi'

export function Cook() {
  const { configOpen, setConfigOpen } = useConfig()
  const voice = createAgentVoice({ configOpen })
  const engine = useContext(CookContext)!

  const [tick, setTick] = createSignal(Date.now())
  const [flowView, setFlowView] = createSignal<string | null>(null)
  const [overviewOpen, setOverviewOpen] = createSignal(true)
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

  const strangs = () => engine.cook.strangs

  const active = createMemo(() => {
    const all = strangs()
    if (all.length === 0) return undefined
    return all.find((s) => s.id === engine.cook.focusedStrangId) ?? all[0]
  })

  function focusStrang(id: string) {
    engine.executeTool('focus_strang', { strang_id: id })
  }

  /* Desktop: Strang fokussieren + Spalte horizontal ins Bild scrollen */
  function focusColumn(id: string) {
    focusStrang(id)
    requestAnimationFrame(() => {
      document
        .querySelector(`[data-strang-id="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
    })
  }

  /* ── Schritt-Zustände (Modell B: Timer läuft nach Abschluss) ──────── */
  function depStepOf(dep: { strang_id: string; step_index: number }): Step | undefined {
    return strangs().find((x) => x.id === dep.strang_id)?.steps[dep.step_index]
  }
  function depDone(s: Strang, step: Step, dep: { strang_id: string; step_index: number }): boolean {
    return depStepOf(dep)?.done === true
  }
  function depPending(dep: { strang_id: string; step_index: number }): boolean {
    const d = depStepOf(dep)
    return !!d && d.done && d.timerEndsAt !== null && !d.timerExpired
  }

  function stepState(s: Strang, step: Step): 'done' | 'blocked' | 'waiting' | 'active' {
    if (step.done) return 'done'
    if (step.dependsOn.some((d) => !depDone(s, step, d))) return 'blocked'
    if (step.dependsOn.some((d) => depPending(d))) return 'waiting'
    return 'active'
  }

  function strangDone(s: Strang): boolean {
    return s.done || s.steps.every((st) => st.done)
  }

  /* Zurücknehmen nur, wenn keine abhängige Karte selbst abgeschlossen ist */
  function canRevert(s: Strang, i: number): boolean {
    const step = s.steps[i]
    if (!step?.done) return false
    return !strangs().some((x) =>
      x.steps.some(
        (st) =>
          st.done &&
          st.dependsOn.some((d) => d.strang_id === s.id && d.step_index === i),
      ),
    )
  }

  function blockedBy(s: Strang, step: Step): string[] {
    return step.dependsOn
      .filter((d) => !depDone(s, step, d))
      .map((d) => {
        const ts = strangs().find((x) => x.id === d.strang_id)
        return `${ts?.icon ?? ''} ${ts?.name ?? '?'} · Schritt ${d.step_index + 1}`.trim()
      })
  }

  /* Frühester ablaufender Timer, auf den die Karte wartet */
  function waitingRemaining(s: Strang, step: Step): number | null {
    let min: number | null = null
    for (const d of step.dependsOn) {
      if (!depPending(d)) continue
      const t = depStepOf(d)!.timerEndsAt!
      if (min === null || t < min) min = t
    }
    return min
  }

  /* ── Timer ─────────────────────────────────────────────────────────── */
  const stepRemaining = (st: Step) => (st.timerEndsAt !== null ? st.timerEndsAt - Date.now() : null)
  const stepUrgent = (st: Step) => {
    tick()
    const r = stepRemaining(st)
    return r !== null && r < 120_000
  }

  const runningTimers = createMemo(() =>
    strangs().flatMap((s) =>
      s.steps
        .map((st, i) => ({ s, st, i }))
        .filter((x) => x.st.timerEndsAt !== null && !x.st.timerExpired),
    ),
  )

  function jumpToStep(s: Strang, i: number) {
    focusStrang(s.id)
    engine.executeTool('set_step', { strang_id: s.id, step_index: i })
  }

  function completeAndAdvance(s: Strang, i: number) {
    engine.executeTool('complete_step', { strang_id: s.id, step_index: i }, { silent: true })
    if (i < s.steps.length - 1) {
      engine.executeTool('set_step', { strang_id: s.id, step_index: i + 1 })
    }
  }

  /* ── View 1 (Mobile „Jetzt"): Prio-Queue, normale Queue, Blocked ──── */
  /* Prio-Queue: active high-Steps in Auftauch-Reihenfolge (FIFO)       */
  /* Normale Queue: active + waiting in Auftauch-Reihenfolge            */
  /* Blocked: als Vorschau unten, grau, in Anlage-Reihenfolge           */
  const jetztCards = createMemo(() => {
    const prio: { s: Strang; st: Step; i: number }[] = []
    const normal: { s: Strang; st: Step; i: number }[] = []
    const blocked: { s: Strang; st: Step; i: number }[] = []
    for (const s of strangs()) {
      if (strangDone(s)) continue
      s.steps.forEach((st, i) => {
        if (st.done) return
        const state = stepState(s, st)
        if (state === 'active' && st.priority === 'high') prio.push({ s, st, i })
        else if (state === 'active' || state === 'waiting') normal.push({ s, st, i })
        else blocked.push({ s, st, i })
      })
    }
    prio.sort((a, b) => (a.st.activatedAt ?? 0) - (b.st.activatedAt ?? 0))
    normal.sort((a, b) => (a.st.activatedAt ?? 0) - (b.st.activatedAt ?? 0))
    return { prio, normal, blocked }
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

  const flowStrang = createMemo(() => strangs().find((x) => x.id === flowView()))

  /* ── Schritt-Karte (flach, klein, nie verschachtelt) ──────────────── */
  function StepCard(props: { s: Strang; i: number; onTitleClick?: () => void }) {
    const s = () => props.s
    const i = () => props.i
    const st = () => s().steps[i()]
    const stateName = () => stepState(s(), st())
    const countdownEndsAt = () =>
      st().timerEndsAt !== null && !st().timerExpired
        ? st().timerEndsAt
        : stateName() === 'waiting'
          ? waitingRemaining(s(), st())
          : null
    const urgent = () => {
      tick()
      const ends = countdownEndsAt()
      return ends !== null && ends - Date.now() < 120_000
    }
    return (
      <div
        class="step-card"
        data-color={s().color}
        data-card-key={`${s().id}:${i()}`}
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
            <button
              class="step-card-title-btn"
              onClick={(e) => {
                e.stopPropagation()
                props.onTitleClick?.()
              }}
            >
              <Show when={s().icon}>
                <span class="text-base leading-none shrink-0">{s().icon}</span>
              </Show>
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
          <Show when={st().timerExpired}>
            <FiBell size={12} class="text-orange-400 shrink-0" />
          </Show>
          <Show when={countdownEndsAt() !== null}>
            <span
              class="font-mono text-sm font-semibold shrink-0 tabular-nums"
              classList={{ 'text-amber-300 animate-pulse': urgent() }}
            >
              {tick() && fmtRemaining(countdownEndsAt()!)}
            </span>
          </Show>
          <span class="text-sm opacity-60 tabular-nums shrink-0">
            {i() + 1}/{s().steps.length}
          </span>
        </div>

        <div class="step-card-body">
          {/* Feste Größe: 2-Zeilen-Description + Statuszeile + Button-Slot reserviert */}
          <div class="flex items-start gap-2">
            <div class="flex-1 min-w-0">
              <div class="step-description step-description-clamp">
                <Show when={st().description}>
                  <Markdown>{st().description}</Markdown>
                </Show>
              </div>
              <p class="mt-1 h-4 text-xs leading-4 truncate opacity-70">
                <Show when={stateName() === 'blocked'}>
                  Wartet auf: {blockedBy(s(), st()).join(', ')}
                </Show>
                <Show when={stateName() === 'waiting'}>Wartet auf ⏱ Timer</Show>
              </p>
            </div>
            <div class="shrink-0 w-11 h-11 flex items-center justify-center">
              <Show
                when={
                  (stateName() === 'active' || stateName() === 'waiting') &&
                  !strangDone(s())
                }
                fallback={
                  <Show when={stateName() === 'done' && canRevert(s(), i())}>
                    <button
                      class="revert-btn"
                      title="Schritt zurücknehmen"
                      aria-label="Schritt zurücknehmen"
                      onClick={(e) => {
                        e.stopPropagation()
                        engine.executeTool(
                          'revert_step',
                          { strang_id: s().id, step_index: i() },
                          { silent: true },
                        )
                      }}
                    >
                      <FiRotateCcw size={18} />
                    </button>
                  </Show>
                }
              >
                <Show
                  when={st().timerSeconds !== null}
                  fallback={
                    <button
                      class="check-btn"
                      title={
                        stateName() === 'waiting'
                          ? 'Früh abschließen (Wartezeit überspringen)'
                          : 'Schritt abschließen'
                      }
                      aria-label="Schritt abschließen und weiter"
                      onClick={(e) => {
                        e.stopPropagation()
                        completeAndAdvance(s(), i())
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
                      completeAndAdvance(s(), i())
                    }}
                  >
                    <FiClock size={18} />
                  </button>
                </Show>
              </Show>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ── „Jetzt"-Queue (Mobile-View 1 + Desktop-Spalte links) ────────── */
  function JetztQueue(props: {
    onTitleClick: (id: string) => void
    scrollerRef?: (el: HTMLDivElement) => void
    showBlocked?: boolean
  }) {
    const showBlocked = () => props.showBlocked !== false
    const empty = () =>
      jetztCards().prio.length === 0 &&
      jetztCards().normal.length === 0 &&
      (!showBlocked() || jetztCards().blocked.length === 0)

    /* Queue-Animation (FLIP + Eintritt von rechts mit Fade):
       Abschließen entfernt die Karte, die Karten darunter wandern nach oben,
       nur frisch aktivierte/neue Karten schießen von rechts rein.
       Erster Render (Seiten-Load, Flow-Wechsel zurück) = statisch. */
    let listRef: HTMLDivElement | undefined
    let prevRects = new Map<string, number>()
    let firstRun = true
    const visibleKeys = () => {
      const list = [...jetztCards().prio, ...jetztCards().normal]
      if (showBlocked()) list.push(...jetztCards().blocked)
      return list.map((c) => `${c.s.id}:${c.i}`).join('|')
    }
    createEffect(() => {
      visibleKeys()
      const cont = listRef
      if (!cont) return
      const nodes = Array.from(cont.querySelectorAll<HTMLElement>('[data-card-key]'))
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
            [
              { transform: 'translateX(24px)', opacity: 0 },
              { transform: 'translateX(0)', opacity: 1 },
            ],
            { duration: 300, easing: 'ease-out' },
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
        class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2"
      >
        <For each={jetztCards().prio}>
          {(c) => <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(c.s.id)} />}
        </For>
        <For each={jetztCards().normal}>
          {(c) => <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(c.s.id)} />}
        </For>
        <Show when={showBlocked()}>
          <For each={jetztCards().blocked}>
            {(c) => <StepCard s={c.s} i={c.i} onTitleClick={() => props.onTitleClick(c.s.id)} />}
          </For>
        </Show>
        <Show when={empty()}>
          <p class="text-sm text-zinc-500 text-center py-8">Alles erledigt.</p>
        </Show>
      </div>
    )
  }

  /* ── Spalten-Header (Desktop) ─────────────────────────────────────── */
  function StrangColumn(props: { s: Strang; isFocused: boolean; onFocus: () => void }) {
    const s = () => props.s
    return (
      <div
        class="column"
        data-color={s().color}
        data-strang-id={s().id}
        classList={{ 'is-focused': props.isFocused }}
      >
        <button class="column-header" onClick={props.onFocus}>
          <Show when={s().icon}>
            <span class="text-base leading-none shrink-0">{s().icon}</span>
          </Show>
          <span class="text-sm font-semibold truncate flex-1 min-w-0">{s().name}</span>
          <Show when={strangDone(s())}>
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
        <div class="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto">
          <For each={runningTimers()}>
            {(x) => (
              <button
                class="chip"
                data-color={x.s.color}
                classList={{
                  'is-urgent': stepUrgent(x.st),
                  'is-active': x.s.id === active()?.id && x.i === x.s.stepIndex,
                }}
                onClick={() => jumpToStep(x.s, x.i)}
              >
                <Show when={x.s.icon}>
                  <span class="text-base leading-none">{x.s.icon}</span>
                </Show>
                <span class="font-mono font-semibold tabular-nums">
                  {tick() && fmtRemaining(x.st.timerEndsAt!)}
                </span>
              </button>
            )}
          </For>
        </div>
        <div class="flex items-center gap-2 shrink-0">
          <button
            class="mic-btn"
            classList={{ 'is-on': voice.listening(), 'is-off': !voice.listening() }}
            onClick={() => voice.toggleMic()}
            disabled={state.agent.busy}
            title={voice.micTitle()}
            aria-label="Mikrofon umschalten"
          >
            <Show when={voice.transcribing()} fallback={
              <Show when={voice.listening()} fallback={<FiMicOff size={20} />}>
                <FiMic size={20} />
              </Show>
            }>
              <FiMoreHorizontal size={20} class="animate-pulse" />
            </Show>
          </button>
          <button class="icon-btn" onClick={() => engine.executeTool('open_zutaten', {})} title="Zutaten"><FiFileText size={16} /></button>
          <button
            class="icon-btn hidden sm:flex"
            onClick={() => setOverviewOpen((v) => !v)}
            title={overviewOpen() ? 'Übersicht ausblenden' : 'Übersicht einblenden'}
            aria-label="Übersicht ein-/ausblenden"
          >
            <FiSidebar size={16} />
          </button>
          <button class="icon-btn" onClick={() => setConfigOpen(true)} title="Konfiguration"><FiSettings size={16} /></button>
        </div>
      </header>

      {/* ── Karten ─────────────────────────────────────────────────────── */}
      <main class="flex-1 min-h-0 flex flex-col">
        <Show
          when={strangs().length > 0}
          fallback={
            <div class="flex items-center justify-center h-full">
              <p class="text-sm text-zinc-500">Noch keine Stränge.</p>
            </div>
          }
        >
          {/* Mobile: „Jetzt" (alle aktiven Karten) ↔ „Flow" (eine Spalte) */}
          <div class="sm:hidden flex-1 min-h-0 flex flex-col overflow-hidden">
            <Show
              when={flowStrang()}
              fallback={
                <JetztQueue
                  onTitleClick={(id) => setFlowView(id)}
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
                  <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
                    <For each={s().steps}>
                      {(_, i) => <StepCard s={s()} i={i()} />}
                    </For>
                  </div>
                </div>
              )}
            </Show>
          </div>

          {/* Desktop: „Jetzt"-Spalte links + Übersicht (eine Spalte pro Strang) */}
          {/* Übersicht ein-/ausblendbar; zu → „Jetzt" allein, zentriert, breitere Karten */}
          {/* Horizontales Scrollen nur im Strang-Bereich — „Jetzt" bleibt stehen */}
          <div class="hidden sm:flex flex-1 min-h-0" classList={{ 'justify-center': !overviewOpen() }}>
            <div
              class="shrink-0 flex flex-col min-h-0 bg-zinc-900/50"
              classList={{ 'w-[320px]': overviewOpen(), 'w-[400px]': !overviewOpen() }}
            >
              <div class="shrink-0 px-3 py-2 border-b border-zinc-700 text-xs uppercase tracking-widest text-zinc-500">
                Jetzt
              </div>
              <JetztQueue
                onTitleClick={(id) => focusColumn(id)}
                scrollerRef={(el) => (jetztScrollerDesktop = el)}
                showBlocked={false}
              />
            </div>
            <Show when={overviewOpen()}>
              <div class="columns-area flex flex-1 min-h-0 gap-3 p-3 overflow-x-auto items-stretch">
                <For each={strangs()}>
                  {(s) => (
                    <StrangColumn
                      s={s}
                      isFocused={s.id === active()?.id}
                      onFocus={() => focusStrang(s.id)}
                    />
                  )}
                </For>
              </div>
            </Show>
          </div>
        </Show>
      </main>

      {/* ── Voice-Overlay: erscheint bei Aktivität, sonst versteckt ───── */}
      <div class="voice-overlay" classList={{ 'is-visible': barVisible() }}>
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
      </div>

      {/* ── Zutaten Modal ─────────────────────────────────────────────── */}
      <Show when={engine.cook.zutatenOpen}>
        <div
          class="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col justify-end"
          onClick={(e) => e.target === e.currentTarget && engine.executeTool('close_zutaten', {})}
        >
          <div class="bg-zinc-950 rounded-t-2xl max-h-[80vh] overflow-y-auto">
            <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-600 sticky top-0 bg-zinc-950">
              <h2 class="text-base font-semibold">Zutaten</h2>
              <button
                class="icon-btn"
                onClick={() => engine.executeTool('close_zutaten', {})}
              >
                <FiX size={16} />
              </button>
            </div>
            <div class="px-4 py-2 pb-6 flex flex-col">
              <Show
                when={engine.cook.zutaten.length > 0}
                fallback={<p class="text-sm text-zinc-500 py-2">Noch keine Zutaten.</p>}
              >
                <For each={engine.cook.zutaten}>
                  {(item) => (
                    <button
                      class="flex items-center gap-3 py-3 px-1 border-b border-zinc-600 last:border-0 w-full text-left"
                      onClick={() => engine.executeTool('toggle_zutaten', { id: item.id }, { silent: true })}
                    >
                      <div
                        class={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          item.checked ? 'border-zinc-400 bg-zinc-700' : 'border-zinc-600 bg-zinc-700'
                        }`}
                      >
                        <Show when={item.checked}>
                          <FiCheck size={12} class="text-zinc-100" />
                        </Show>
                      </div>
                      <span
                        class={`flex-1 text-sm ${
                          item.checked ? 'text-zinc-400 line-through' : 'text-zinc-100'
                        }`}
                      >
                        {item.name}
                      </span>
                      <span class="text-xs text-zinc-400 shrink-0">{item.amount}</span>
                    </button>
                  )}
                </For>
              </Show>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
