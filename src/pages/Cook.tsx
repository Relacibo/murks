import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js'
import { useConfig } from '../App'
import { state, expireTimers, type Strang } from '../state/store'
import { executeTool, fmtRemaining } from '../lib/tools'
import { createAgentVoice } from '../lib/agentVoice'

export function Cook() {
  const { configOpen, setConfigOpen } = useConfig()
  const voice = createAgentVoice({ configOpen })

  const [tick, setTick] = createSignal(Date.now())
  const interval = setInterval(() => {
    setTick(Date.now())
    expireTimers()
  }, 1000)
  onCleanup(() => clearInterval(interval))

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

  const lastUser = createMemo(() => {
    const msgs = state.agent.messages
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'user') return msgs[i].text
    }
    return ''
  })

  const remaining = (s: Strang) => (s.timerEndsAt !== null ? s.timerEndsAt - Date.now() : null)

  function isUrgent(s: Strang): boolean {
    tick()
    const r = remaining(s)
    return r !== null && r < 120_000
  }

  function instruction(s: Strang): string {
    if (s.timerExpired && s.timerInstruction) return s.timerInstruction
    return s.steps[s.stepIndex] ?? ''
  }

  return (
    <div class="h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-[430px] mx-auto overflow-hidden">
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header class="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-600">
        <span class="text-sm font-bold tracking-widest uppercase">MURKS</span>
        <div class="flex items-center gap-2">
          <button
            class="icon-btn"
            onClick={() => executeTool('open_zutaten', {})}
            title="Zutaten"
          >
            🧾
          </button>
          <button
            class="icon-btn"
            onClick={() => setConfigOpen(true)}
            title="Konfiguration"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* ── Strang-Chips ───────────────────────────────────────────────── */}
      <div class="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-zinc-600 overflow-x-auto">
        <For each={strangs()}>
          {(s, i) => (
            <button
              onClick={() => focusStrang(s.id)}
              class="chip"
              data-color={s.color}
              classList={{
                'is-active': i() === activeIdx(),
                'is-urgent': !s.timerExpired && isUrgent(s),
                'is-expired': s.timerExpired,
                'is-done': s.done,
              }}
            >
              <span class="font-medium">{s.name}</span>
              <Show when={s.done}>
                <span>✓</span>
              </Show>
              <Show when={!s.done && s.timerExpired}>
                <span>🔔</span>
              </Show>
              <Show when={!s.done && !s.timerExpired && s.timerEndsAt !== null}>
                <span class="font-mono font-semibold">
                  {tick() && fmtRemaining(s.timerEndsAt!)}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>

      {/* ── Active strang card ─────────────────────────────────────────── */}
      <main class="flex-1 flex flex-col px-4 py-4 min-h-0">
        <Show when={active()} fallback={<p class="text-sm text-zinc-500">Noch keine Stränge.</p>}>
          {(s) => {
            const urgent = () => {
              tick()
              const r = remaining(s())
              return r !== null && r < 120_000
            }
            return (
              <div class="card" data-color={s().color} classList={{ 'is-expired': s().timerExpired }}>
                <div class="flex items-start justify-between gap-2 mb-1">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="strang-dot mt-1.5" />
                    <span class="font-semibold text-lg leading-tight text-zinc-100 truncate">{s().name}</span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0 mt-0.5">
                    <span class="step-chip">
                      Schritt {s().stepIndex + 1} / {s().steps.length}
                    </span>
                    <Show when={s().timerExpired}>
                      <span class="text-lg leading-none">🔔</span>
                    </Show>
                  </div>
                </div>

                <div class="flex gap-1 mb-4">
                  <For each={Array.from({ length: s().steps.length })}>
                    {(_, i) => (
                      <div
                        class={`h-1 flex-1 rounded-full transition-colors ${
                          i() < s().stepIndex + 1 ? 'bg-zinc-400' : 'bg-zinc-700'
                        }`}
                      />
                    )}
                  </For>
                </div>

                <Show when={s().timerExpired}>
                  <div class="text-sm font-semibold text-orange-400 mb-1">Timer abgelaufen!</div>
                  <div class="text-xs text-zinc-400 mb-2">Jetzt:</div>
                </Show>

                <div class="flex-1 flex flex-col justify-center gap-5">
                  <Show
                    when={!s().done}
                    fallback={
                      <p class="text-base text-zinc-400 leading-relaxed">✓ Fertig.</p>
                    }
                  >
                    <p class="text-base text-zinc-200 leading-relaxed">{instruction(s())}</p>
                  </Show>

                  <Show when={!s().done && !s().timerExpired && s().timerEndsAt !== null}>
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

                <div class="flex items-center justify-between mt-5 pt-4 border-t border-zinc-600">
                  <div class="flex items-center gap-2">
                    <button
                      onClick={prev}
                      class="nav-btn"
                      aria-label="Vorheriger Strang"
                    >
                      ‹
                    </button>
                    <button
                      onClick={next}
                      class="nav-btn"
                      aria-label="Nächster Strang"
                    >
                      ›
                    </button>
                  </div>

                  <Show when={!s().done}>
                    <button
                      onClick={() => executeTool('complete_strang', { strang_id: s().id })}
                      class="done-btn"
                    >
                      ✓ Fertig
                    </button>
                  </Show>
                </div>
              </div>
            )
          }}
        </Show>
      </main>

      {/* ── Voice bar ──────────────────────────────────────────────────── */}
      <div class="shrink-0 border-t border-zinc-600 bg-zinc-950 px-4 py-3">
        <div class="transcript-strip">
          <Show
            when={voice.transcribing()}
            fallback={
              <Show
                when={voice.listening()}
                fallback={
                  <Show when={lastUser()} fallback={<p class="text-xs italic text-zinc-500">Sprechen, um mit dem Agenten zu interagieren …</p>}>
                    {(t) => <p class="text-xs text-zinc-400 text-right w-full">„{t()}"</p>}
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

        <div class="flex items-center gap-3">
          <div class="relative shrink-0">
            <Show when={voice.listening()}>
              <div class="absolute inset-0 rounded-full animate-ping bg-zinc-400 opacity-20" />
            </Show>
            <button
              class="mic-btn"
              classList={{ 'is-on': voice.listening(), 'is-off': !voice.listening() }}
              onClick={() => voice.toggleMic()}
              disabled={state.agent.busy}
              title={voice.micTitle()}
              aria-label="Mikrofon umschalten"
            >
              🎤
            </button>
          </div>
          <div class="flex flex-col">
            <span class="text-sm text-zinc-300">
              {voice.transcribing()
                ? 'Transkribiere …'
                : voice.speaking()
                  ? 'Sprache erkannt'
                  : voice.listening()
                    ? 'Höre zu …'
                    : 'Mikrofon einschalten'}
            </span>
            <span class="text-xs text-zinc-500">
              {voice.listening() ? 'Tippen zum Beenden' : 'Tippen zum Starten'}
            </span>
          </div>
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
