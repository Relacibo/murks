import { createSignal, Show, For } from 'solid-js'

// ── Demo state ────────────────────────────────────────────────────────────────
type DemoState = 'normal' | 'expired' | 'listening' | 'zutaten'

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

export function CookMock() {
  const [demo, setDemo] = createSignal<DemoState>('normal')
  const [checkedIngredients, setCheckedIngredients] = createSignal<Set<number>>(
    new Set(ZUTATEN.filter((z) => z.checked).map((z) => z.id))
  )

  const timerExpired = () => demo() === 'expired'
  const listening = () => demo() === 'listening'
  const zutatenOpen = () => demo() === 'zutaten'

  function toggleIngredient(id: number) {
    setCheckedIngredients((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div class="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col max-w-[430px] mx-auto relative">
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <span class="text-sm font-bold tracking-widest text-zinc-100 uppercase">Murks</span>
        <div class="flex items-center gap-2">
          <button
            class="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors"
            onClick={() => setDemo('zutaten')}
            title="Zutaten"
          >
            🧾
          </button>
          <button class="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 transition-colors">
            ⚙
          </button>
        </div>
      </header>

      {/* ── Demo toggle bar ─────────────────────────────────────────────── */}
      <div class="flex items-center gap-1 px-4 py-2 bg-zinc-900 border-b border-zinc-800 overflow-x-auto">
        <span class="text-xs text-zinc-500 shrink-0 mr-1">Demo:</span>
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
                : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-600'
            }`}
            onClick={() => setDemo(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Main scrollable area ─────────────────────────────────────────── */}
      <main class="flex-1 overflow-y-auto px-4 py-4 pb-40 flex flex-col gap-3">

        {/* Strang 1: Basmatireis — running timer */}
        <StrangCard
          name="Basmatireis"
          stepCurrent={2}
          stepTotal={4}
          instruction="Reis mit 400 ml Wasser aufkochen, dann auf niedrige Hitze reduzieren."
          timerActive={true}
          timerDisplay="12:34"
          timerExpired={false}
        />

        {/* Strang 2: Tomatensoße — no timer */}
        <StrangCard
          name="Tomatensoße"
          stepCurrent={1}
          stepTotal={3}
          instruction="Zwiebeln in Olivenöl bei mittlerer Hitze glasig dünsten."
          timerActive={false}
          timerDisplay=""
          timerExpired={false}
        />

        {/* Strang 3: Lasagne — expired when demo=expired */}
        <Show when={timerExpired()}>
          <StrangCard
            name="Lasagne"
            stepCurrent={3}
            stepTotal={3}
            instruction="Lasagne aus dem Ofen nehmen und 10 Minuten ruhen lassen."
            timerActive={false}
            timerDisplay=""
            timerExpired={true}
          />
        </Show>
        <Show when={!timerExpired()}>
          <StrangCard
            name="Lasagne"
            stepCurrent={2}
            stepTotal={3}
            instruction="Lasagne bei 180 °C (Umluft) für 45 Minuten im Ofen backen."
            timerActive={true}
            timerDisplay="38:12"
            timerExpired={false}
          />
        </Show>

        {/* Add strang ghost button */}
        <button class="w-full border border-dashed border-zinc-700 rounded-xl py-3 text-sm text-zinc-500 hover:border-zinc-500 hover:text-zinc-400 transition-colors mt-1">
          + Strang hinzufügen
        </button>
      </main>

      {/* ── Agent toast (shown in all states as demo) ───────────────────── */}
      <Show when={timerExpired()}>
        <div class="fixed bottom-28 left-1/2 -translate-x-1/2 z-30 pointer-events-none">
          <div class="bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2 text-xs text-zinc-100 whitespace-nowrap shadow-lg">
            🔔 Timer abgelaufen: Lasagne
          </div>
        </div>
      </Show>

      {/* ── Voice bar (fixed bottom) ─────────────────────────────────────── */}
      <div class="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] border-t border-zinc-800 bg-zinc-950 px-4 py-3 z-20">
        {/* Transcript */}
        <div class="mb-3 min-h-[44px] bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2">
          <Show
            when={listening()}
            fallback={
              <p class="text-xs italic text-zinc-500">
                Sprechen, um mit dem Agenten zu interagieren
              </p>
            }
          >
            <p class="text-xs italic text-zinc-400">
              💬 „ok ich hab die lasagne in den ofen getan"
            </p>
          </Show>
        </div>

        {/* Mic row */}
        <div class="flex items-center gap-4">
          {/* Mic button with optional pulse ring */}
          <div class="relative shrink-0">
            <Show when={listening()}>
              <div class="absolute inset-0 rounded-full animate-ping bg-zinc-400 opacity-30" />
              <div class="absolute -inset-2 rounded-full animate-pulse bg-zinc-600 opacity-20" />
            </Show>
            <button
              class={`relative w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-lg transition-all ${
                listening()
                  ? 'bg-zinc-100 text-zinc-900 ring-2 ring-zinc-400'
                  : 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200'
              }`}
              onClick={() => setDemo(listening() ? 'normal' : 'listening')}
              aria-label="Mikrofon"
            >
              🎤
            </button>
          </div>
          <span class="text-sm text-zinc-400">
            {listening() ? 'Höre zu…' : 'Tippen zum Sprechen'}
          </span>
        </div>
      </div>

      {/* ── Zutaten Modal ────────────────────────────────────────────────── */}
      <Show when={zutatenOpen()}>
        <div
          class="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col justify-end"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDemo('normal')
          }}
        >
          <div class="bg-zinc-950 rounded-t-2xl max-h-[80vh] overflow-y-auto">
            {/* Modal header */}
            <div class="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h2 class="text-base font-semibold text-zinc-100">Zutaten</h2>
              <button
                class="w-8 h-8 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors"
                onClick={() => setDemo('normal')}
              >
                ✕
              </button>
            </div>

            {/* Ingredient list */}
            <div class="px-4 py-3 flex flex-col gap-1">
              <For each={ZUTATEN}>
                {(item) => (
                  <button
                    class="flex items-center gap-3 py-3 px-1 border-b border-zinc-800 last:border-0 w-full text-left"
                    onClick={() => toggleIngredient(item.id)}
                  >
                    {/* Custom checkbox */}
                    <div
                      class={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        checkedIngredients().has(item.id)
                          ? 'border-zinc-400 bg-zinc-700'
                          : 'border-zinc-600 bg-zinc-900'
                      }`}
                    >
                      <Show when={checkedIngredients().has(item.id)}>
                        <span class="text-zinc-100 text-xs leading-none">✓</span>
                      </Show>
                    </div>
                    <span
                      class={`flex-1 text-sm transition-colors ${
                        checkedIngredients().has(item.id) ? 'text-zinc-500 line-through' : 'text-zinc-100'
                      }`}
                    >
                      {item.name}
                    </span>
                    <span class="text-xs text-zinc-500 shrink-0">{item.amount}</span>
                  </button>
                )}
              </For>
            </div>
            <div class="h-6" />
          </div>
        </div>
      </Show>
    </div>
  )
}

// ── Strang Card ───────────────────────────────────────────────────────────────
interface StrangCardProps {
  name: string
  stepCurrent: number
  stepTotal: number
  instruction: string
  timerActive: boolean
  timerDisplay: string
  timerExpired: boolean
}

function StrangCard(props: StrangCardProps) {
  return (
    <div
      class={`rounded-xl p-4 border bg-zinc-900 flex flex-col gap-3 transition-colors ${
        props.timerExpired
          ? 'border-orange-500'
          : 'border-zinc-700'
      }`}
    >
      {/* Card header */}
      <div class="flex items-center justify-between gap-2">
        <span class="font-semibold text-zinc-100 text-sm leading-tight">{props.name}</span>
        <div class="flex items-center gap-2 shrink-0">
          <span class="text-xs text-zinc-500">
            Schritt {props.stepCurrent} von {props.stepTotal}
          </span>
          <Show when={props.timerExpired}>
            <span class="text-base leading-none">🔔</span>
          </Show>
        </div>
      </div>

      {/* Timer expired banner */}
      <Show when={props.timerExpired}>
        <div class="text-sm font-medium text-orange-400 border-b border-zinc-800 pb-2 -mt-1">
          Timer abgelaufen!
        </div>
        <p class="text-xs text-zinc-500 -mt-1 mb-0.5">Jetzt:</p>
      </Show>

      {/* Instruction */}
      <p class="text-sm text-zinc-300 leading-relaxed">{props.instruction}</p>

      {/* Timer pill */}
      <Show when={props.timerActive && props.timerDisplay}>
        <div class="flex items-center">
          <div class="inline-flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2">
            <span class="text-base leading-none">⏱</span>
            <span class="font-mono text-base font-semibold text-zinc-100 tabular-nums">
              {props.timerDisplay}
            </span>
            <span class="text-xs text-zinc-500">verbleib.</span>
          </div>
        </div>
      </Show>

      {/* Done button */}
      <div class="flex justify-end">
        <button class="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-600 text-sm text-zinc-300 hover:border-zinc-400 hover:text-zinc-100 transition-colors min-h-[44px]">
          <span class="text-xs">✓</span>
          <span>Fertig</span>
        </button>
      </div>
    </div>
  )
}
