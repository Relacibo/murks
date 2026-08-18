import { createSignal, Show, For, createMemo } from 'solid-js'

// ── Types ────────────────────────────────────────────────────────────────────

interface Strang {
  id: string
  name: string
  stepCurrent: number
  stepTotal: number
  instruction: string
  timer: { display: string; urgent: boolean } | null
  expired: boolean
  expiredInstruction?: string
}

const STRANGS: Strang[] = [
  {
    id: 'reis',
    name: 'Basmatireis',
    stepCurrent: 2,
    stepTotal: 4,
    instruction: 'Reis mit 400 ml Wasser aufkochen, dann auf niedrige Hitze reduzieren.',
    timer: { display: '12:34', urgent: false },
    expired: false,
  },
  {
    id: 'sosse',
    name: 'Tomatensoße',
    stepCurrent: 1,
    stepTotal: 3,
    instruction: 'Zwiebeln in Olivenöl bei mittlerer Hitze glasig dünsten.',
    timer: null,
    expired: false,
  },
  {
    id: 'lasagne',
    name: 'Lasagne',
    stepCurrent: 2,
    stepTotal: 3,
    instruction: 'Lasagne bei 180 °C (Umluft) für 45 Minuten im Ofen backen.',
    timer: { display: '1:47', urgent: true },
    expired: false,
    expiredInstruction: 'Lasagne aus dem Ofen nehmen und 10 Minuten ruhen lassen.',
  },
]

const ZUTATEN = [
  { id: 1, name: 'Basmatireis', amount: '300 g', checked: true },
  { id: 2, name: 'Wasser', amount: '600 ml', checked: true },
  { id: 3, name: 'Salz', amount: '1 TL', checked: false },
  { id: 4, name: 'Tomaten (gehackt)', amount: '400 g', checked: true },
  { id: 5, name: 'Zwiebel', amount: '2 Stück', checked: false },
  { id: 6, name: 'Knoblauch', amount: '3 Zehen', checked: false },
  { id: 7, name: 'Olivenöl', amount: '2 EL', checked: true },
  { id: 8, name: 'Lasagneplatten', amount: '250 g', checked: false },
]

type DemoState = 'normal' | 'expired' | 'listening' | 'zutaten'

// ── Component ────────────────────────────────────────────────────────────────

export function CookMock() {
  const [demo, setDemo] = createSignal<DemoState>('normal')
  const [activeIdx, setActiveIdx] = createSignal(0)
  const [checked, setChecked] = createSignal<Set<number>>(
    new Set(ZUTATEN.filter((z) => z.checked).map((z) => z.id))
  )

  const listening = () => demo() === 'listening'
  const zutatenOpen = () => demo() === 'zutaten'

  // Inject expired state into the lasagne strang
  const strangs = createMemo<Strang[]>(() =>
    STRANGS.map((s) =>
      s.id === 'lasagne' && demo() === 'expired'
        ? { ...s, expired: true, timer: null, stepCurrent: 3 }
        : s
    )
  )

  const active = createMemo(() => strangs()[activeIdx()] ?? strangs()[0])

  function prev() {
    setActiveIdx((i) => (i - 1 + strangs().length) % strangs().length)
  }
  function next() {
    setActiveIdx((i) => (i + 1) % strangs().length)
  }

  function toggleChecked(id: number) {
    setChecked((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div class="h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-[430px] mx-auto overflow-hidden">

      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <header class="shrink-0 flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span class="text-sm font-bold tracking-widest uppercase">MURKS</span>
        <div class="flex items-center gap-2">
          <button
            class="w-9 h-9 flex items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
            onClick={() => setDemo('zutaten')}
            title="Zutaten"
          >
            🧾
          </button>
          <button class="w-9 h-9 flex items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors">
            ⚙
          </button>
        </div>
      </header>

      {/* ── Demo toggles ───────────────────────────────────────────────── */}
      <div class="shrink-0 flex items-center gap-1 px-4 py-2 bg-zinc-900 border-b border-zinc-800 overflow-x-auto">
        <span class="text-xs text-zinc-600 shrink-0 mr-1">Demo:</span>
        {(
          [
            ['normal', 'Normal'],
            ['expired', 'Timer abgelaufen'],
            ['listening', 'Hört zu'],
            ['zutaten', 'Zutaten'],
          ] as [DemoState, string][]
        ).map(([key, label]) => (
          <button
            class={`text-xs px-2.5 py-1 rounded-full border transition-colors shrink-0 ${
              demo() === key
                ? 'border-zinc-400 bg-zinc-800 text-zinc-100'
                : 'border-zinc-700 text-zinc-500 hover:border-zinc-600'
            }`}
            onClick={() => setDemo(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Strang-Chips (sticky timer overview) ───────────────────────── */}
      <div class="shrink-0 flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800 overflow-x-auto">
        <For each={strangs()}>
          {(s, i) => (
            <button
              onClick={() => setActiveIdx(i())}
              class={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 border text-xs transition-colors ${
                i() === activeIdx()
                  ? 'border-zinc-300 bg-zinc-800 text-zinc-100'
                  : s.expired
                    ? 'border-orange-500 bg-zinc-900 text-orange-400'
                    : s.timer?.urgent
                      ? 'border-red-700 bg-zinc-900 text-red-400'
                      : s.timer
                        ? 'border-zinc-600 bg-zinc-900 text-zinc-300'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-500'
              }`}
            >
              <span class="font-medium">{s.name}</span>
              <Show when={s.expired}>
                <span>🔔</span>
              </Show>
              <Show when={!s.expired && s.timer}>
                <span class={`font-mono font-semibold ${s.timer?.urgent ? 'text-red-400' : 'text-zinc-300'}`}>
                  {s.timer?.display}
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>

      {/* ── Active strang card — full height, no scroll ─────────────────── */}
      <main class="flex-1 flex flex-col px-4 py-4 min-h-0">
        <div
          class={`flex-1 flex flex-col rounded-2xl border bg-zinc-900 p-5 transition-colors ${
            active().expired ? 'border-orange-500' : 'border-zinc-700'
          }`}
        >
          {/* Card header */}
          <div class="flex items-start justify-between gap-2 mb-1">
            <span class="font-semibold text-zinc-100 text-lg leading-tight">{active().name}</span>
            <div class="flex items-center gap-2 shrink-0 mt-0.5">
              <span class="text-xs text-zinc-500">
                Schritt {active().stepCurrent} / {active().stepTotal}
              </span>
              <Show when={active().expired}>
                <span class="text-lg leading-none">🔔</span>
              </Show>
            </div>
          </div>

          {/* Step progress dots */}
          <div class="flex gap-1 mb-4">
            <For each={Array.from({ length: active().stepTotal })}>
              {(_, i) => (
                <div
                  class={`h-1 flex-1 rounded-full transition-colors ${
                    i() < active().stepCurrent ? 'bg-zinc-400' : 'bg-zinc-700'
                  }`}
                />
              )}
            </For>
          </div>

          {/* Expired banner */}
          <Show when={active().expired}>
            <div class="text-sm font-semibold text-orange-400 mb-1">Timer abgelaufen!</div>
            <div class="text-xs text-zinc-500 mb-2">Jetzt:</div>
          </Show>

          {/* Instruction — big, readable */}
          <p class="text-base text-zinc-200 leading-relaxed flex-1">
            {active().expired && active().expiredInstruction
              ? active().expiredInstruction
              : active().instruction}
          </p>

          {/* Timer pill */}
          <Show when={!active().expired && active().timer}>
            <div class="flex items-center mt-4">
              <div
                class={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 border ${
                  active().timer?.urgent
                    ? 'bg-zinc-900 border-red-700'
                    : 'bg-zinc-800 border-zinc-700'
                }`}
              >
                <span class="text-base leading-none">⏱</span>
                <span
                  class={`font-mono text-2xl font-bold tabular-nums ${
                    active().timer?.urgent ? 'text-red-400' : 'text-zinc-100'
                  }`}
                >
                  {active().timer?.display}
                </span>
                <span class="text-xs text-zinc-500">verbleib.</span>
              </div>
            </div>
          </Show>

          {/* Bottom row: nav + done */}
          <div class="flex items-center justify-between mt-5 pt-4 border-t border-zinc-800">
            {/* Prev / Next strang navigation */}
            <div class="flex items-center gap-2">
              <button
                onClick={prev}
                class="w-10 h-10 flex items-center justify-center rounded-full border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors text-lg"
                aria-label="Vorheriger Strang"
              >
                ‹
              </button>
              <button
                onClick={next}
                class="w-10 h-10 flex items-center justify-center rounded-full border border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200 transition-colors text-lg"
                aria-label="Nächster Strang"
              >
                ›
              </button>
            </div>

            {/* Done button */}
            <button class="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-600 text-sm text-zinc-300 hover:border-zinc-300 hover:text-zinc-100 transition-colors min-h-[44px]">
              ✓ Fertig
            </button>
          </div>
        </div>
      </main>

      {/* ── Toast (expired demo) ───────────────────────────────────────── */}
      <Show when={demo() === 'expired'}>
        <div class="shrink-0 px-4 pb-1">
          <div class="bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2 text-xs text-zinc-100 text-center">
            🔔 Timer abgelaufen: Lasagne
          </div>
        </div>
      </Show>

      {/* ── Voice bar (fixed bottom) ───────────────────────────────────── */}
      <div class="shrink-0 border-t border-zinc-800 bg-zinc-950 px-4 py-3">
        {/* Transcript strip */}
        <div class="mb-3 min-h-[36px] flex items-center px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-xl">
          <Show
            when={listening()}
            fallback={<p class="text-xs italic text-zinc-600">Sprechen, um mit dem Agenten zu interagieren …</p>}
          >
            <p class="text-xs italic text-zinc-400">„ok ich hab die lasagne in den ofen getan"</p>
          </Show>
        </div>

        {/* Mic toggle row */}
        <div class="flex items-center gap-3">
          <div class="relative shrink-0">
            <Show when={listening()}>
              <div class="absolute inset-0 rounded-full animate-ping bg-zinc-400 opacity-20" />
            </Show>
            <button
              class={`relative w-14 h-14 rounded-full flex items-center justify-center text-2xl transition-all ${
                listening()
                  ? 'bg-zinc-100 text-zinc-900 ring-2 ring-zinc-300'
                  : 'bg-zinc-800 border border-zinc-600 text-zinc-300 hover:bg-zinc-700'
              }`}
              onClick={() => setDemo(listening() ? 'normal' : 'listening')}
              aria-label="Mikrofon umschalten"
            >
              🎤
            </button>
          </div>
          <div class="flex flex-col">
            <span class="text-sm text-zinc-300">
              {listening() ? 'Höre zu …' : 'Mikrofon einschalten'}
            </span>
            <span class="text-xs text-zinc-600">
              {listening() ? 'Tippen zum Beenden' : 'Tippen zum Starten'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Zutaten Modal ─────────────────────────────────────────────── */}
      <Show when={zutatenOpen()}>
        <div
          class="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col justify-end"
          onClick={(e) => e.target === e.currentTarget && setDemo('normal')}
        >
          <div class="bg-zinc-950 rounded-t-2xl max-h-[80vh] overflow-y-auto">
            <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-800 sticky top-0 bg-zinc-950">
              <h2 class="text-base font-semibold">Zutaten</h2>
              <button
                class="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                onClick={() => setDemo('normal')}
              >
                ✕
              </button>
            </div>
            <div class="px-4 py-2 pb-6 flex flex-col">
              <For each={ZUTATEN}>
                {(item) => (
                  <button
                    class="flex items-center gap-3 py-3 px-1 border-b border-zinc-800 last:border-0 w-full text-left"
                    onClick={() => toggleChecked(item.id)}
                  >
                    <div
                      class={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        checked().has(item.id) ? 'border-zinc-400 bg-zinc-700' : 'border-zinc-600 bg-zinc-900'
                      }`}
                    >
                      <Show when={checked().has(item.id)}>
                        <span class="text-zinc-100 text-xs leading-none">✓</span>
                      </Show>
                    </div>
                    <span
                      class={`flex-1 text-sm ${
                        checked().has(item.id) ? 'text-zinc-500 line-through' : 'text-zinc-100'
                      }`}
                    >
                      {item.name}
                    </span>
                    <span class="text-xs text-zinc-500 shrink-0">{item.amount}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </div>
      </Show>
    </div>
  )
}
