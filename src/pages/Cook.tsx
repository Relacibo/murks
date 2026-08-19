import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { SolidMarkdown as Markdown } from 'solid-markdown'
import { useConfig } from '../App'
import { state, expireTimers, type Strang } from '../state/store'
import { executeTool, fmtRemaining } from '../lib/tools'
import { createAgentVoice } from '../lib/agentVoice'
import {
  FiMic, FiMicOff, FiMoreHorizontal, FiFileText, FiSettings,
  FiArrowUp, FiArrowDown, FiCheck, FiBell, FiX,
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

  /* ── Strip: kompakter Strang oben (Mobile) ───────────────────────── */
  function Strip(props: { s: Strang; isFocused: boolean; onFocus: () => void }) {
    const s = () => props.s
    const urgent = () => { tick(); const r = remaining(s()); return r !== null && r < 120_000 }
    const step = () => s().steps[s().stepIndex]
    return (
      <button
        class="strip"
        data-color={s().color}
        classList={{ 'is-active': props.isFocused, 'is-urgent': urgent(), 'is-expired': s().timerExpired }}
        onClick={props.onFocus}
      >
        <span class="strip-bar" />
        <Show when={s().icon}>
          <span class="text-base leading-none shrink-0">{s().icon}</span>
        </Show>
        <span class="text-sm truncate min-w-0 flex-1 text-left" style={{ color: 'var(--strang-text)' }}>
          {step()?.summary ?? '—'}
        </span>
        <Show when={s().done}>
          <FiCheck size={12} class="text-emerald-400 shrink-0" />
        </Show>
        <Show when={s().timerExpired}>
          <FiBell size={12} class="text-orange-400 shrink-0" />
        </Show>
        <Show when={!s().done && !s().timerExpired && s().timerEndsAt !== null}>
          <span class="font-mono text-xs font-semibold shrink-0" style={{ color: 'var(--strang-text)' }}>
            {tick() && fmtRemaining(s().timerEndsAt!)}
          </span>
        </Show>
        <span class="text-xs text-zinc-500 tabular-nums shrink-0">
          {s().stepIndex + 1}/{s().steps.length}
        </span>
      </button>
    )
  }

  /* ── Schritt-Karte des fokussierten Strangs (Mobile) ────────────── */
  function MobileStepCard(props: { s: Strang }) {
    const s = () => props.s
    const previewStep = () => getPreview(s().id)
    const shown = () => previewStep() ?? s().stepIndex
    const step = () => s().steps[shown()]
    const urgent = () => { tick(); const r = remaining(s()); return r !== null && r < 120_000 }

    function browse(delta: number) {
      const idx = Math.max(0, Math.min(shown() + delta, s().steps.length - 1))
      setPreview(s().id, idx === s().stepIndex ? null : idx)
    }
    function goNext() {
      if (s().stepIndex >= s().steps.length - 1) {
        executeTool('complete_strang', { strang_id: s().id })
      } else {
        executeTool('set_step', { strang_id: s().id, step_index: s().stepIndex + 1 })
        setPreview(s().id, null)
      }
    }

    return (
      <div class="card h-full flex flex-col" data-color={s().color} classList={{ 'is-expired': s().timerExpired }}>
        {/* Header: Name + Timer + x/y */}
        <div class="card-decorator">
          <span class="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--strang-text-active)' }}>
            {s().icon ? `${s().icon} ${s().name}` : s().name}
          </span>
          <Show when={s().timerExpired}>
            <FiBell size={13} class="text-orange-400 shrink-0" />
          </Show>
          <Show when={!s().done && !s().timerExpired && s().timerEndsAt !== null}>
            <span
              class="font-mono text-xs font-semibold shrink-0"
              style={{ color: urgent() ? '#fcd34d' : 'var(--strang-text-active)' }}
            >
              {tick() && fmtRemaining(s().timerEndsAt!)}
            </span>
          </Show>
          <Show when={s().done}>
            <FiCheck size={13} class="text-emerald-400 shrink-0" />
          </Show>
          <span class="text-xs text-zinc-400 opacity-60 tabular-nums shrink-0">
            {shown() + 1}/{s().steps.length}
          </span>
        </div>

        {/* Browse-Badges */}
        <Show when={previewStep() !== null}>
          <div class="flex items-center gap-2 px-4 pt-3">
            <span class="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-zinc-500 text-zinc-400 shrink-0">
              {shown() > s().stepIndex ? 'später' : 'bereits erledigt'}
            </span>
            <button
              class="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border border-zinc-500 text-zinc-300 hover:bg-zinc-700 transition-colors shrink-0"
              onClick={() => setPreview(s().id, null)}
            >
              ● Aktuell
            </button>
          </div>
        </Show>

        {/* Description (scrollt) + Timer */}
        <div class="flex-1 min-h-0 overflow-y-auto px-4 py-3">
          <Show when={step()} fallback={<p class="text-sm text-zinc-500">Kein Schritt.</p>}>
            <div class="step-description" classList={{ 'opacity-60': s().done }}>
              <Markdown>{step()!.description || step()!.summary}</Markdown>
            </div>
          </Show>

          <Show when={!s().done && !s().timerExpired && s().timerEndsAt !== null}>
            <div class="flex items-center mt-4">
              <div class="pill" classList={{ 'is-urgent': urgent() }}>
                <span class="text-sm leading-none text-zinc-400">⏱</span>
                <span class="font-mono text-xl font-bold tabular-nums text-zinc-100">
                  {tick() && fmtRemaining(s().timerEndsAt!)}
                </span>
                <span class="text-xs text-zinc-400">verbleib.</span>
              </div>
            </div>
          </Show>

          <Show when={s().timerExpired && s().timerInstruction}>
            <p class="mt-3 text-sm font-semibold text-red-400">{s().timerInstruction}</p>
          </Show>
        </div>

        {/* Footer: Browse-Nav + Fortschritt */}
        <div class="shrink-0 flex items-center gap-3 px-4 py-3 border-t border-zinc-700/60">
          <div class="flex items-center gap-2">
            <button class="nav-btn" onClick={() => browse(-1)} disabled={shown() === 0} aria-label="Vorherigen Schritt ansehen">
              <FiArrowUp />
            </button>
            <button
              class="nav-btn"
              onClick={() => browse(1)}
              disabled={shown() >= s().steps.length - 1}
              aria-label="Nächsten Schritt ansehen"
            >
              <FiArrowDown />
            </button>
          </div>
          <div class="flex-1 flex gap-1.5">
            <For each={s().steps}>
              {(_, i) => (
                <button
                  class="step-dot"
                  classList={{
                    'is-done': i() < s().stepIndex,
                    'is-active': i() === s().stepIndex,
                    'is-preview': i() === shown() && previewStep() !== null,
                  }}
                  onClick={() => setPreview(s().id, i() === s().stepIndex ? null : i())}
                  aria-label={`Schritt ${i() + 1} ansehen`}
                />
              )}
            </For>
          </div>
          <Show
            when={previewStep() !== null}
            fallback={
              <Show when={!s().done}>
                <button class="jump-btn" onClick={goNext}>
                  {s().stepIndex >= s().steps.length - 1 ? 'Fertig' : '✓ Weiter'}
                </button>
              </Show>
            }
          >
            <button
              class="jump-btn"
              onClick={() => {
                executeTool('set_step', { strang_id: s().id, step_index: previewStep()! })
                setPreview(s().id, null)
              }}
            >
              ↩ Hierhin
            </button>
          </Show>
        </div>
      </div>
    )
  }

  /* ── Strang-Spalte (Desktop) ────────────────────────────────────── */
  function StrangColumn(props: { s: Strang; isFocused: boolean; onFocus: () => void }) {
    const s = () => props.s
    const urgent = () => { tick(); const r = remaining(s()); return r !== null && r < 120_000 }
    return (
      <div
        class="column"
        data-color={s().color}
        classList={{ 'is-focused': props.isFocused, 'is-expired': s().timerExpired }}
      >
        <button class="column-header" onClick={props.onFocus}>
          <span class="text-sm font-semibold truncate flex-1 min-w-0" style={{ color: 'var(--strang-text-active)' }}>
            {s().icon ? `${s().icon} ${s().name}` : s().name}
          </span>
          <Show when={s().timerExpired}>
            <FiBell size={13} class="text-orange-400 shrink-0" />
          </Show>
          <Show when={!s().done && !s().timerExpired && s().timerEndsAt !== null}>
            <span
              class="font-mono text-xs font-semibold shrink-0"
              style={{ color: urgent() ? '#fcd34d' : 'var(--strang-text-active)' }}
            >
              {tick() && fmtRemaining(s().timerEndsAt!)}
            </span>
          </Show>
          <Show when={s().done}>
            <FiCheck size={13} class="text-emerald-400 shrink-0" />
          </Show>
          <span class="text-xs text-zinc-400 opacity-60 tabular-nums shrink-0">
            {s().stepIndex + 1}/{s().steps.length}
          </span>
        </button>

        <div class="column-body">
          <For each={s().steps}>
            {(step, i) => {
              const isActive = () => i() === s().stepIndex
              const isPast = () => i() < s().stepIndex
              return (
                <button
                  class="step-card"
                  classList={{ 'is-active': isActive(), 'is-past': isPast() }}
                  onClick={() => {
                    if (!isActive()) executeTool('set_step', { strang_id: s().id, step_index: i() })
                  }}
                >
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-mono shrink-0 opacity-60">{i() + 1}</span>
                    <Show when={isPast()}>
                      <FiCheck size={12} class="shrink-0" />
                    </Show>
                    <span class="step-card-title text-sm flex-1 min-w-0 truncate">{step.summary}</span>
                  </div>
                  <Show when={isActive() && step.description}>
                    <div class="step-description mt-2">
                      <Markdown>{step.description}</Markdown>
                    </div>
                  </Show>
                </button>
              )
            }}
          </For>
          <Show when={!s().done && !s().timerExpired && s().timerEndsAt !== null}>
            <div class="pill self-center" classList={{ 'is-urgent': urgent() }}>
              <span class="text-sm leading-none text-zinc-400">⏱</span>
              <span class="font-mono text-xl font-bold tabular-nums text-zinc-100">
                {tick() && fmtRemaining(s().timerEndsAt!)}
              </span>
              <span class="text-xs text-zinc-400">verbleib.</span>
            </div>
          </Show>
        </div>
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

      {/* ── Stränge: Strips + Karte (Mobile) / Spalten (Desktop) ────── */}
      <main class="flex-1 min-h-0 flex flex-col">
        <Show
          when={strangs().length > 0}
          fallback={
            <div class="flex items-center justify-center h-full">
              <p class="text-sm text-zinc-500">Noch keine Stränge.</p>
            </div>
          }
        >
          {/* Mobile: Strips oben, fokussierte Karte unten */}
          <div class="sm:hidden shrink-0 flex gap-2 px-3 py-2 overflow-x-auto border-b border-zinc-600">
            <For each={strangs()}>
              {(s) => (
                <Strip
                  s={s}
                  isFocused={s.id === active()?.id}
                  onFocus={() => focusStrang(s.id)}
                />
              )}
            </For>
          </div>
          <div class="sm:hidden flex-1 min-h-0 p-3">
            <Show when={active()}>
              {(a) => <MobileStepCard s={a()} />}
            </Show>
          </div>

          {/* Desktop: eine Spalte pro Strang */}
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
