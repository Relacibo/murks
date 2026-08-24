import { Show, createEffect, onCleanup } from 'solid-js'
import type { JSX, ParentProps } from 'solid-js'
import { FiX } from 'solid-icons/fi'

interface SheetModalProps extends ParentProps {
  open: boolean
  title: string
  onClose: () => void
  /** Extra-Klassen für das Sheet (Breite, Desktop-Höhe) */
  sheetClass?: string
  /** Klassen für den scrollenden Body */
  bodyClass?: string
  /** Buttons links neben dem X im Header */
  headerActions?: JSX.Element
  /** Zugriff auf den Body-Scroller (z.B. Auto-Scroll) */
  bodyRef?: (el: HTMLDivElement) => void
}

/** Gemeinsames Gerüst für Chat, Zutaten und Konfiguration: Bottom-Sheet
    mobil (85vh), zentrierter Dialog auf dem Desktop. Der Header liegt
    außerhalb des Scrollbereichs — die Scrollbar läuft nicht über den Titel. */
export function SheetModal(props: SheetModalProps) {
  createEffect(() => {
    if (!props.open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  })

  let touchStartY = 0
  function onTouchStart(e: TouchEvent) {
    touchStartY = e.touches[0].clientY
  }
  function onTouchEnd(e: TouchEvent) {
    if (e.changedTouches[0].clientY - touchStartY > 80) props.onClose()
  }

  return (
    <Show when={props.open}>
      <div
        class="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex flex-col justify-end pb-[max(4.5rem,env(safe-area-inset-bottom))] sm:items-center sm:justify-center sm:p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) props.onClose()
        }}
      >
        <div
          class={`bg-zinc-950 w-full h-[85vh] sm:max-h-[85vh] rounded-t-2xl sm:rounded-2xl sm:border sm:border-zinc-600 sm:shadow-2xl flex flex-col modal-pop ${props.sheetClass ?? ''}`}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        >
          <div class="flex items-center gap-2 px-5 py-3 border-b border-zinc-600 shrink-0">
            <h2 class="text-base font-semibold text-zinc-100 flex-1 min-w-0 truncate">
              {props.title}
            </h2>
            {props.headerActions}
            <button
              class="icon-btn"
              onClick={() => props.onClose()}
              title="Schließen"
              aria-label="Schließen"
            >
              <FiX size={16} />
            </button>
          </div>
          <div
            ref={props.bodyRef}
            class={`min-h-0 flex-1 overflow-y-auto ${props.bodyClass ?? ''}`}
          >
            {props.children}
          </div>
        </div>
      </div>
    </Show>
  )
}
