import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { SolidMarkdown as Markdown } from 'solid-markdown'
import { useConfig } from '../App'
import { state, expireTimers, type Strang, type Step } from '../state/store'
import { executeTool, fmtRemaining } from '../lib/tools'
import { createAgentVoice } from '../lib/agentVoice'
import {
  FiMic, FiMicOff, FiMoreHorizontal, FiFileText, FiSettings,
  FiCheck, FiBell, FiX, FiLock, FiChevronLeft,
} from 'solid-icons/fi'

export function Cook() {
  const { configOpen, setConfigOpen } = useConfig()
  const voice = createAgentVoice({ configOpen })

  const [tick, setTick] = createSignal(Date.now())
  const [flowView, setFlowView] = createSignal<string | null>(null)
  const [lastAgent, setLastAgent] = createSignal<{ text: string; at: number } | null>(null)
  const interval = setInterval(() => {
    setTick(Date.now())
    expireTimers()
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

  const strangs = () => state.cook.strangs

  const active = createMemo(() => {
    const all = strangs()
    if (all.length === 0) return undefined
    return all.find((s) => s.id === state.cook.focusedStrangId) ?? all[0]
  })

  function focusStrang(id: string) {
    executeTool('focus_strang', { strang_id: id })
  }

  /* ── Schritt-Zustände ──────────────────────────────────────────────── */
  function depDone(s: Strang, step: Step, dep: { strang_id: string; step_index: number }): boolean {
    const ts = strangs().find((x) => x.id === dep.strang_id)
    if (!ts) return false
    const dstep = ts.steps[dep.step_index]
    return dstep?.done === true
  }

  function stepState(s: Strang, step: Step): 'done' | 'blocked' | 'active' {
    if (step.done) return 'done'
    if (step.dependsOn.some((d) => !depDone(s, step, d))) return 'blocked'
    return 'active'
  }

  function strangDone(s: Strang): boolean {
    return s.done || s.steps.every((st) => st.done)
  }

  function blockedBy(s: Strang, step: Step): string[] {
    return step.dependsOn
      .filter((d) => !depDone(s, step, d))
      .map((d) => {
        const ts = strangs().find((x) => x.id === d.strang_id)
        const label = ts?.steps[d.step_index]?.summary ?? '?'
        return `${ts?.icon ?? ''} ${label}`.trim()
      })
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
  const expiredTimers = createMemo(() =>
    strangs().flatMap((s) => s.steps.map((st, i) => ({ s, st, i })).filter((x) => x.st.timerExpired)),
  )

  function jumpToStep(s: Strang, i: number) {
    focusStrang(s.id)
    executeTool('set_step', { strang_id: s.id, step_index: i })
  }

  function completeAndAdvance(s: Strang, i: number) {
    executeTool('complete_step', { strang_id: s.id, step_index: i })
    if (i < s.steps.length - 1) {
      executeTool('set_step', { strang_id: s.id, step_index: i + 1 })
    }
  }

  /* ── Aktive Karten (Mobile „Jetzt") ───────────────────────────────── */
  const flowsWithActive = createMemo(() =>
    strangs()
      .map((s) => ({
        s,
        cards: s.steps
          .map((st, i) => ({ st, i }))
          .filter((x) => !strangDone(s) && stepState(s, x.st) === 'active'),
      }))
      .filter((f) => f.cards.length > 0),
  )

  const flowStrang = createMemo(() => strangs().find((x) => x.id === flowView()))

  /* ── Schritt-Karte (flach, klein, nie verschachtelt) ──────────────── */
  function StepCard(props: { s: Strang; i: number }) {
    const s = () => props.s
    const i = () => props.i
    const st = () => s().steps[i()]
    const stateName = () => stepState(s(), st())
    const urgent = () => stepUrgent(st())
    return (
      <div
        class="step-card"
        data-color={s().color}
        classList={{
          'is-active': stateName() === 'active',
          'is-past': stateName() === 'done',
          'is-blocked': stateName() === 'blocked',
        }}
        onClick={() => jumpToStep(s(), i())}
      >
        <div class="flex items-center gap-2">
          <Show when={s().icon}>
            <span class="text-base leading-none shrink-0">{s().icon}</span>
          </Show>
          <span class="step-card-title text-sm flex-1 min-w-0 truncate">{st().summary}</span>
          <Show when={stateName() === 'blocked'}>
            <FiLock size={12} class="shrink-0 opacity-60" />
          </Show>
          <Show when={stateName() === 'done'}>
            <FiCheck size={12} class="shrink-0" />
          </Show>
          <Show when={st().timerExpired}>
            <FiBell size={12} class="text-orange-400 shrink-0" />
          </Show>
          <Show when={st().timerEndsAt !== null && !st().timerExpired}>
            <span
              class="font-mono text-xs font-semibold shrink-0 tabular-nums"
              classList={{ 'text-amber-300 animate-pulse': urgent() }}
            >
              {tick() && fmtRemaining(st().timerEndsAt!)}
            </span>
          </Show>
          <span class="text-xs opacity-60 tabular-nums shrink-0">
            {i() + 1}/{s().steps.length}
          </span>
        </div>

        <Show when={st().description}>
          <div class="step-description mt-2">
            <Markdown>{st().description}</Markdown>
          </div>
        </Show>

        <Show when={stateName() === 'blocked'}>
          <p class="mt-2 text-xs opacity-70">Wartet auf: {blockedBy(s(), st()).join(', ')}</p>
        </Show>

        <Show when={stateName() === 'active' && !strangDone(s())}>
          <div class="flex justify-end mt-3">
            <button
              class="jump-btn"
              onClick={(e) => {
                e.stopPropagation()
                completeAndAdvance(s(), i())
              }}
            >
              ✓ Weiter
            </button>
          </div>
        </Show>
      </div>
    )
  }

  /* ── Flow-Leiste (Mobile „Jetzt"): alle Flows oben, wie B-Strips ── */
  function FlowBar(props: { s: Strang; isFocused: boolean; onOpen: () => void }) {
    const s = () => props.s
    return (
      <button
        class="flow-bar"
        data-color={s().color}
        classList={{ 'is-active': props.isFocused, 'is-done': strangDone(s()) }}
        onClick={props.onOpen}
      >
        <span class="flow-bar-mark" />
        <Show when={s().icon}>
          <span class="text-base leading-none shrink-0">{s().icon}</span>
        </Show>
        <span class="text-sm truncate" style={{ color: 'var(--strang-text)' }}>
          {s().name}
        </span>
        <Show when={strangDone(s())}>
          <FiCheck size={12} class="text-emerald-400 shrink-0" />
        </Show>
      </button>
    )
  }

  /* ── Spalten-Header (Desktop) ─────────────────────────────────────── */
  function StrangColumn(props: { s: Strang; isFocused: boolean; onFocus: () => void }) {
    const s = () => props.s
    return (
      <div class="column" data-color={s().color} classList={{ 'is-focused': props.isFocused }}>
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
                <span class="text-xs truncate max-w-24">{x.st.summary}</span>
                <span class="font-mono font-semibold tabular-nums">
                  {tick() && fmtRemaining(x.st.timerEndsAt!)}
                </span>
              </button>
            )}
          </For>
          <For each={expiredTimers()}>
            {(x) => (
              <button class="chip is-expired" data-color={x.s.color} onClick={() => jumpToStep(x.s, x.i)}>
                <Show when={x.s.icon}>
                  <span class="text-base leading-none">{x.s.icon}</span>
                </Show>
                <span class="text-xs truncate max-w-24">{x.st.summary}</span>
                <FiBell size={12} />
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
          <button class="icon-btn" onClick={() => executeTool('open_zutaten', {})} title="Zutaten"><FiFileText size={16} /></button>
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
                <>
                  {/* Flow-Leiste: alle Flows (wie B-Strips), Tap → Flow-View */}
                  <div class="shrink-0 flex gap-2 px-3 py-2 overflow-x-auto border-b border-zinc-600">
                    <For each={strangs()}>
                      {(s) => (
                        <FlowBar
                          s={s}
                          isFocused={s.id === active()?.id}
                          onOpen={() => setFlowView(s.id)}
                        />
                      )}
                    </For>
                  </div>
                  {/* Alle aktiven Karten — flacher Stapel, mehrere pro Flow möglich */}
                  <div class="flex-1 min-h-0 overflow-y-auto p-3 flex flex-col gap-2">
                    <For each={flowsWithActive()}>
                      {(f) => (
                        <For each={f.cards}>
                          {(c) => <StepCard s={f.s} i={c.i} />}
                        </For>
                      )}
                    </For>
                    <Show when={flowsWithActive().length === 0}>
                      <p class="text-sm text-zinc-500 text-center py-8">Alles erledigt.</p>
                    </Show>
                  </div>
                </>
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

          {/* Desktop: eine Spalte pro Strang (nur Gliederung, Karten flach) */}
          <div class="hidden sm:flex flex-1 min-h-0 gap-3 p-3 overflow-x-auto items-stretch">
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
      <Show when={state.cook.zutatenOpen}>
        <div
          class="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col justify-end"
          onClick={(e) => e.target === e.currentTarget && executeTool('close_zutaten', {})}
        >
          <div class="bg-zinc-950 rounded-t-2xl max-h-[80vh] overflow-y-auto">
            <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-600 sticky top-0 bg-zinc-950">
              <h2 class="text-base font-semibold">Zutaten</h2>
              <button
                class="icon-btn"
                onClick={() => executeTool('close_zutaten', {})}
              >
                <FiX size={16} />
              </button>
            </div>
            <div class="px-4 py-2 pb-6 flex flex-col">
              <Show
                when={state.cook.zutaten.length > 0}
                fallback={<p class="text-sm text-zinc-500 py-2">Noch keine Zutaten.</p>}
              >
                <For each={state.cook.zutaten}>
                  {(item) => (
                    <button
                      class="flex items-center gap-3 py-3 px-1 border-b border-zinc-600 last:border-0 w-full text-left"
                      onClick={() => executeTool('toggle_zutaten', { id: item.id })}
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
