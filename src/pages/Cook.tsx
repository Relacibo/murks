import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import { useConfig } from '../App'
import { state, expireTimers, type Strang } from '../state/store'
import { executeTool, fmtRemaining } from '../lib/tools'
import { createAgentVoice } from '../lib/agentVoice'

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
    const urgent = () => {
      tick()
      const r = remaining(s())
      return r !== null && r < 120_000
    }
    const previewStep = () => getPreview(s().id)
    const shownIdx = () => (previewStep() !== null ? previewStep()! : s().stepIndex)
    const text = () => {
      const i = shownIdx()
      if (i === s().stepIndex && s().timerExpired && s().timerInstruction) {
        return s().timerInstruction
      }
      return s().steps[i] ?? ''
    }
    function stepPrev() {
      const cur = previewStep() ?? s().stepIndex
      if (cur > 0) setPreview(s().id, cur - 1)
    }
    function stepNext() {
      const cur = previewStep() ?? s().stepIndex
      if (cur < s().steps.length - 1) setPreview(s().id, cur + 1)
    }

    return (
      <div
        class="card"
        data-color={s().color}
        classList={{
          'is-expired': s().timerExpired,
          'is-focused': props.isFocused,
        }}
        onClick={props.onFocus}
      >
        <div class="flex items-center gap-2 mb-3">
          <span class="text-xs text-zinc-400 truncate flex-1 min-w-0">{s().name}</span>
          <div class="flex items-center gap-2 shrink-0">
            <span class="step-chip">
              Schritt {(previewStep() ?? s().stepIndex) + 1} / {s().steps.length}
            </span>
            <Show when={s().timerExpired}>
              <span class="text-base leading-none">🔔</span>
            </Show>
          </div>
        </div>

        <div class="flex gap-1.5 mb-4">
          <For each={Array.from({ length: s().steps.length })}>
            {(_, i) => (
              <button
                class="step-dot"
                classList={{
                  'is-done': i() < s().stepIndex,
                  'is-active': i() === s().stepIndex,
                  'is-preview': previewStep() === i(),
                }}
                onClick={(e) => {
                  e.stopPropagation()
                  setPreview(s().id, previewStep() === i() ? null : i())
                }}
                aria-label={`Schritt ${i() + 1} ansehen`}
              />
            )}
          </For>
        </div>

        <Show when={s().timerExpired && previewStep() === null}>
          <div class="text-sm font-semibold text-red-400 mb-1">Timer abgelaufen!</div>
          <div class="text-xs text-zinc-400 mb-2">Jetzt:</div>
        </Show>

        <div class="flex-1 flex flex-col justify-center gap-5">
          <p
            class="text-base leading-relaxed transition-opacity"
            classList={{
              'text-zinc-200': previewStep() === null && !s().done,
              'text-zinc-400 opacity-60': previewStep() !== null || s().done,
            }}
          >
            {text()}
          </p>

          <Show when={!s().done && !s().timerExpired && s().timerEndsAt !== null && previewStep() === null}>
            <div class="flex items-center">
              <div class="pill" classList={{ 'is-urgent': urgent() }}>
                <span class="text-base leading-none">⏱</span>
                <span class="font-mono text-2xl font-bold tabular-nums text-zinc-100">
                  {tick() && fmtRemaining(s().timerEndsAt!)}
                </span>
                <span class="text-xs text-zinc-400">verbleib.</span>
              </div>
            </div>
          </Show>
        </div>

        {/* ── In-card footer: step nav + done/revert ──────────────── */}
        <div class="flex items-center justify-between mt-5 pt-4 border-t border-zinc-600">
          <div class="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); stepPrev() }}
              class="nav-btn"
              aria-label="Vorheriger Schritt"
              disabled={shownIdx() === 0}
            >
              ↑
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); stepNext() }}
              class="nav-btn"
              aria-label="Nächster Schritt"
              disabled={shownIdx() >= s().steps.length - 1}
            >
              ↓
            </button>
          </div>

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
                  ↩
                </button>
              }
            >
              <button
                class="icon-btn text-emerald-400 border-emerald-700 hover:border-emerald-500 hover:text-emerald-300"
                onClick={(e) => { e.stopPropagation(); executeTool('complete_strang', { strang_id: s().id }) }}
                title="Strang fertig"
              >
                ✓
              </button>
            </Show>
          </Show>
        </div>
      </div>
    )
  }

  function CompactStrang(props: { s: Strang }) {
    const s = () => props.s
    return (
      <button
        class="compact-card"
        data-color={s().color}
        classList={{
          'is-urgent': !s().timerExpired && isUrgent(s()),
          'is-expired': s().timerExpired,
          'is-done': s().done,
        }}
        onClick={() => focusStrang(s().id)}
      >
        <span class={`flex-1 min-w-0 truncate text-sm font-medium text-zinc-100 ${s().done ? 'line-through' : ''}`}>
          {s().name}
        </span>
        <span class="text-xs text-zinc-500 shrink-0">
          Schritt {s().stepIndex + 1}/{s().steps.length}
        </span>
        <Show when={s().done}>
          <span class="text-emerald-400 shrink-0">✓</span>
        </Show>
        <Show when={!s().done && s().timerExpired}>
          <span class="shrink-0">🔔</span>
        </Show>
        <Show when={!s().done && !s().timerExpired && s().timerEndsAt !== null}>
          <span class="font-mono text-xs font-semibold text-zinc-300 shrink-0">
            {tick() && fmtRemaining(s().timerEndsAt!)}
          </span>
        </Show>
      </button>
    )
  }

  return (
    <div class="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header class="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-600">
        <div class="flex items-center gap-3">
          {/* Globale Strang-Navigation */}
          <Show when={strangs().length > 1}>
            <div class="flex items-center gap-1">
              <button onClick={prev} class="nav-btn text-sm" aria-label="Vorheriger Strang">‹</button>
              <span class="text-xs text-zinc-500">{activeIdx() + 1}/{strangs().length}</span>
              <button onClick={next} class="nav-btn text-sm" aria-label="Nächster Strang">›</button>
            </div>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="mic-btn"
            classList={{ 'is-on': voice.listening(), 'is-off': !voice.listening() }}
            onClick={() => voice.toggleMic()}
            disabled={state.agent.busy}
            title={voice.micTitle()}
            aria-label="Mikrofon umschalten"
          >
            {voice.transcribing() ? '…' : voice.listening() ? '■' : '🎤'}
          </button>
          <button class="icon-btn" onClick={() => executeTool('open_zutaten', {})} title="Zutaten">🧾</button>
          <button class="icon-btn" onClick={() => setConfigOpen(true)} title="Konfiguration">⚙</button>
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
                🔔
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
          {/* Desktop: Karten nebeneinander, max-Breite pro Karte */}
          <div class="hidden sm:flex gap-4 p-4 h-full overflow-x-auto justify-start items-stretch">
            <For each={strangs()}>
              {(s) => (
                <div class="w-[340px] shrink-0 flex flex-col">
                  <StrangCard
                    s={s}
                    isFocused={s.id === active()?.id}
                    onFocus={() => focusStrang(s.id)}
                  />
                </div>
              )}
            </For>
          </div>
          {/* Mobile: expandierte Karte oben, kompakte Strang-Liste darunter */}
          <div class="sm:hidden h-full flex flex-col px-4 py-3 gap-2 overflow-hidden">
            <Show when={active()}>
              {(s) => (
                <div class="flex-1 min-h-[280px] flex flex-col min-h-0">
                  <StrangCard s={s()} isFocused={true} onFocus={() => {}} />
                </div>
              )}
            </Show>
            <Show when={strangs().length > 1}>
              <div class="shrink-0 max-h-[45%] overflow-y-auto flex flex-col gap-2 pb-1">
                <For each={strangs().filter((s) => s.id !== active()?.id)}>
                  {(s) => <CompactStrang s={s} />}
                </For>
              </div>
            </Show>
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
                class="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-700 text-zinc-400 hover:text-zinc-100"
                onClick={() => executeTool('close_zutaten', {})}
              >
                ✕
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
                          <span class="text-zinc-100 text-xs leading-none">✓</span>
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
