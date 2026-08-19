import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { useConfig } from '../App'
import { state, expireTimers, type Strang } from '../state/store'
import { executeTool, fmtRemaining } from '../lib/tools'
import { createAgentVoice } from '../lib/agentVoice'
import {
  FiMic, FiMicOff, FiMoreHorizontal, FiFileText, FiSettings,
  FiArrowUp, FiArrowDown, FiChevronLeft, FiChevronRight,
  FiRotateCcw, FiCheckCircle, FiCheck, FiBell, FiX,
} from 'solid-icons/fi'

export function Cook() {
  const { configOpen, setConfigOpen } = useConfig()
  const voice = createAgentVoice({ configOpen })

  const [tick, setTick] = createSignal(Date.now())
  const [previewSteps, setPreviewSteps] = createSignal<Record<string, number | null>>({})
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

  const barVisible = () =>
    voice.listening() ||
    voice.transcribing() ||
    voice.speaking() ||
    state.agent.busy ||
    (lastAgent() !== null && tick() > 0 && Date.now() - lastAgent()!.at < 8000)

  const strangs = () => state.cook.strangs

  const active = createMemo(() => {
    const all = strangs()
    if (all.length === 0) return undefined
    return all.find((s) => s.id === state.cook.focusedStrangId) ?? all[0]
  })

  const activeIdx = createMemo(() => {
    const a = active()
    return a ? strangs().findIndex((s) => s.id === a.id) : 0
  })

  createEffect(() => {
    // Reset all previews when strang list changes
    strangs()
    setPreviewSteps({})
  })

  function focusStrang(id: string) {
    executeTool('focus_strang', { strang_id: id })
  }
  function prev() {
    const n = strangs().length
    if (n > 0) focusStrang(strangs()[(activeIdx() - 1 + n) % n].id)
  }
  function next() {
    const n = strangs().length
    if (n > 0) focusStrang(strangs()[(activeIdx() + 1) % n].id)
  }

  function getPreview(strangId: string): number | null {
    return previewSteps()[strangId] ?? null
  }
  function setPreview(strangId: string, idx: number | null) {
    setPreviewSteps((prev) => ({ ...prev, [strangId]: idx }))
  }

  const remaining = (s: Strang) => (s.timerEndsAt !== null ? s.timerEndsAt - Date.now() : null)

  function isUrgent(s: Strang): boolean {
    tick()
    const r = remaining(s)
    return r !== null && r < 120_000
  }

  function StrangCard(props: { s: Strang; isFocused: boolean; onFocus: () => void }) {
    const s = () => props.s
    const [expanded, setExpanded] = createSignal(props.isFocused)

    createEffect(() => {
      if (props.isFocused) setExpanded(true)
    })

    const urgent = () => { tick(); const r = remaining(s()); return r !== null && r < 120_000 }
    const previewStep = () => getPreview(s().id)

    function toggleExpand(e: MouseEvent) {
      e.stopPropagation()
      if (!props.isFocused) props.onFocus()
      setExpanded((v) => !v)
    }

    return (
      <div class="card" data-color={s().color} classList={{ 'is-expired': s().timerExpired, 'is-focused': props.isFocused }}>
        {/* ── Decorator ───────────────────────────────────────────── */}
        <button class="card-decorator" onClick={toggleExpand}>
          <span class="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--strang-text-active)' }}>
            {s().name}
          </span>
          <div class="flex items-center gap-2 shrink-0">
            <Show when={s().timerExpired}>
              <FiBell size={13} class="text-orange-400" />
            </Show>
            <Show when={!s().done && !s().timerExpired && s().timerEndsAt !== null}>
              <span class="font-mono text-xs font-semibold" style={{ color: 'var(--strang-text-active)' }}>
                {tick() && fmtRemaining(s().timerEndsAt!)}
              </span>
            </Show>
            <Show when={s().done}>
              <FiCheck size={13} class="text-emerald-400" />
            </Show>
            <span class="text-xs text-zinc-400 opacity-60 tabular-nums">
              {s().stepIndex + 1}/{s().steps.length}
            </span>
          </div>
        </button>

        {/* ── Body (collapsible) ──────────────────────────────────── */}
        <Show when={expanded()}>
          <Show when={s().timerExpired}>
            <div class="px-4 pt-2 text-xs font-semibold text-orange-400">Timer abgelaufen!</div>
          </Show>

          {/* Steps list */}
          <div class="steps-list">
            <For each={s().steps}>
              {(step, i) => {
                const isActive = () => i() === s().stepIndex
                const isDone = () => i() < s().stepIndex
                const isPreview = () => previewStep() === i()
                const text = () =>
                  isActive() && s().timerExpired && s().timerInstruction
                    ? s().timerInstruction!
                    : step
                return (
                  <button
                    class="step-row"
                    classList={{ 'is-done': isDone(), 'is-active': isActive() && previewStep() === null, 'is-preview': isPreview() }}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPreview(s().id, isPreview() ? null : i())
                    }}
                  >
                    <span class="step-row-num">{i() + 1}</span>
                    <span class="flex-1 text-left">{text()}</span>
                    <Show when={isDone()}>
                      <FiCheck size={12} class="shrink-0 text-zinc-600 mt-0.5" />
                    </Show>
                  </button>
                )
              }}
            </For>
          </div>

          {/* Timer pill */}
          <Show when={!s().done && !s().timerExpired && s().timerEndsAt !== null}>
            <div class="px-4 py-3">
              <div class="pill" classList={{ 'is-urgent': urgent() }}>
                <span class="text-sm leading-none text-zinc-400">⏱</span>
                <span class="font-mono text-xl font-bold tabular-nums text-zinc-100">
                  {tick() && fmtRemaining(s().timerEndsAt!)}
                </span>
                <span class="text-xs text-zinc-400">verbleib.</span>
              </div>
            </div>
          </Show>

          {/* Footer */}
          <Show when={!s().done || previewStep() !== null}>
            <div class="flex items-center justify-end px-4 py-3 border-t border-zinc-700/60">
              <Show when={!s().done}>
                <Show
                  when={previewStep() === null}
                  fallback={
                    <button
                      class="icon-btn"
                      title={`Schritt ${previewStep()! + 1} aktiv setzen`}
                      onClick={(e) => {
                        e.stopPropagation()
                        executeTool('set_step', { strang_id: s().id, step_index: previewStep()! })
                        setPreview(s().id, null)
                      }}
                    >
                      <FiRotateCcw />
                    </button>
                  }
                >
                  <button
                    class="icon-btn text-emerald-400 border-emerald-700 hover:border-emerald-500 hover:text-emerald-300"
                    onClick={(e) => { e.stopPropagation(); executeTool('complete_strang', { strang_id: s().id }) }}
                    title="Strang fertig"
                  >
                    <FiCheckCircle />
                  </button>
                </Show>
              </Show>
            </div>
          </Show>
        </Show>
      </div>
    )
  }

  return (
    <div class="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header class="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-600">
        <span class="text-sm font-bold tracking-widest uppercase text-zinc-300">MURKS</span>
        <div class="flex items-center gap-2">
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

      {/* ── Topbar-Timerleiste: nur laufende/abgelaufene Timer ───────── */}
      <Show when={strangs().some((s) => (s.timerEndsAt !== null && !s.timerExpired) || s.timerExpired)}>
        <div class="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-zinc-600 overflow-x-auto">
          <For each={strangs().filter((s) => s.timerEndsAt !== null && !s.timerExpired)}>
            {(s) => (
              <button
                onClick={() => focusStrang(s.id)}
                class="chip"
                data-color={s.color}
                classList={{ 'is-active': s.id === active()?.id, 'is-urgent': isUrgent(s) }}
              >
                <span class="font-mono font-semibold">{tick() && fmtRemaining(s.timerEndsAt!)}</span>
              </button>
            )}
          </For>
          <For each={strangs().filter((s) => s.timerExpired)}>
            {(s) => (
              <button
                onClick={() => focusStrang(s.id)}
                class="chip is-expired"
                data-color={s.color}
              >
                <FiBell size={12} />
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* ── Strang cards ────────────────────────────────────────────── */}
      <main class="flex-1 min-h-0 overflow-hidden">
        <Show
          when={strangs().length > 0}
          fallback={
            <div class="flex items-center justify-center h-full">
              <p class="text-sm text-zinc-500">Noch keine Stränge.</p>
            </div>
          }
        >
          {/* Mobile: vertikal gestapelt, scrollbar */}
          <div class="sm:hidden h-full overflow-y-auto flex flex-col gap-2 p-3">
            <For each={strangs()}>
              {(s) => (
                <StrangCard s={s} isFocused={s.id === active()?.id} onFocus={() => focusStrang(s.id)} />
              )}
            </For>
          </div>
          {/* Desktop: horizontal nebeneinander, scrollbar */}
          <div class="hidden sm:flex h-full overflow-x-auto gap-3 p-4 items-start">
            <For each={strangs()}>
              {(s) => (
                <div class="w-[320px] shrink-0">
                  <StrangCard s={s} isFocused={s.id === active()?.id} onFocus={() => focusStrang(s.id)} />
                </div>
              )}
            </For>
          </div>
        </Show>
      </main>

      {/* ── Voice-Overlay: erscheint bei Aktivität, sonst versteckt ───── */}
      <div class="voice-overlay" classList={{ 'is-visible': barVisible() }}>
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
                          <Show when={lastAgent()}>
                            {(a) => <p class="text-sm text-zinc-400 line-clamp-2">{a().text}</p>}
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
