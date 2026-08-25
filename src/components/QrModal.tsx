import { createEffect, createSignal, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { encode } from 'uqr'
import { FiX, FiCopy, FiShare2, FiLink, FiLink2 } from 'solid-icons/fi'
import { state } from '../state/store'
import { buildRecipeUrl } from '../lib/serializeRecipe'

export function QrModal(props: {
  open: boolean
  onClose: () => void
  shareActive?: boolean
  onToggleShare?: () => void
}) {
  const [url, setUrl] = createSignal<string | null>(null)
  const [copied, setCopied] = createSignal(false)

  createEffect(() => {
    if (!props.open) { setUrl(null); return }
    buildRecipeUrl(state.cook).then(setUrl)
  })

  // Schließen räumt auf: ?recipe= wieder aus der URL entfernen — der Param
  // war nur für „Tab senden" gedacht, solange das Modal offen ist.
  let wasOpen = false
  createEffect(() => {
    const o = props.open
    if (wasOpen && !o && props.shareActive) props.onToggleShare?.()
    wasOpen = o
  })

  const qr = () => {
    const u = url()
    if (!u) return null
    return encode(u, { ecc: 'L' })
  }

  const svgPath = () => {
    const q = qr()
    if (!q) return ''
    let d = ''
    for (let y = 0; y < q.data.length; y++) {
      for (let x = 0; x < q.data[y].length; x++) {
        if (q.data[y][x]) d += `M${x},${y}h1v1h-1z`
      }
    }
    return d
  }

  function copy() {
    const u = url()
    if (!u) return
    navigator.clipboard.writeText(u).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function share() {
    const u = url()
    if (!u) return
    void navigator.share({ title: 'Rezept', url: u })
  }

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="fixed inset-0 z-[80] flex items-center justify-center bg-zinc-950/80 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) props.onClose() }}
        >
          <div class="relative flex flex-col items-center gap-4 rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl w-full max-w-xs">
            {/* Header */}
            <div class="flex w-full items-center justify-between">
              <span class="text-sm font-semibold text-zinc-200">Rezept teilen</span>
              <button
                class="rounded-lg p-1 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-100"
                onClick={props.onClose}
                aria-label="Schließen"
              >
                <FiX size={18} />
              </button>
            </div>

            {/* QR Code */}
            <Show
              when={qr()}
              fallback={
                <div class="flex h-52 w-52 items-center justify-center rounded-lg bg-white text-sm text-zinc-400">
                  Lädt…
                </div>
              }
            >
              {(q) => {
                const pad = 3
                const size = q().size
                return (
                  <svg
                    viewBox={`${-pad} ${-pad} ${size + pad * 2} ${size + pad * 2}`}
                    class="h-52 w-52 rounded-lg"
                    role="img"
                    aria-label="QR-Code"
                  >
                    <rect fill="white" x={-pad} y={-pad} width={size + pad * 2} height={size + pad * 2} />
                    <path fill="black" d={svgPath()} />
                  </svg>
                )
              }}
            </Show>

            {/* Optionen */}
            <div class="flex w-full flex-col gap-2">
              <Show when={url()}>
                {(u) => (
                  <p class="truncate rounded bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-400">
                    {u()}
                  </p>
                )}
              </Show>

              <div class="flex gap-2">
                <button
                  class="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
                  onClick={copy}
                >
                  <FiCopy size={13} />
                  {copied() ? 'Kopiert!' : 'Link kopieren'}
                </button>
                <Show when={'share' in navigator}>
                  <button
                    class="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
                    onClick={share}
                    aria-label="Teilen"
                  >
                    <FiShare2 size={13} />
                  </button>
                </Show>
              </div>

              <Show when={props.onToggleShare}>
                <button
                  class="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs"
                  classList={{
                    'border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700': !props.shareActive,
                    'border-sky-700 bg-sky-950 text-sky-200 hover:bg-sky-900': props.shareActive,
                  }}
                  onClick={props.onToggleShare}
                >
                  {props.shareActive ? <FiLink2 size={13} /> : <FiLink size={13} />}
                  {props.shareActive ? 'Link aus URL entfernen' : 'Link in URL schreiben'}
                </button>
              </Show>

              <Show when={props.onToggleShare && !props.shareActive}>
                <p class="text-center text-[11px] leading-snug text-zinc-500">
                  Schreibt das Rezept in die Adresszeile — danach funktioniert z.B.
                  Firefox „Tab an Gerät senden". Beim Schließen wird der Link
                  wieder aus der URL entfernt.
                </p>
              </Show>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  )
}
