import { createSignal } from 'solid-js'

export type ToastType = 'default' | 'chat'

export interface Toast {
  id: number
  text: string
  type: ToastType
}

const [toasts, setToasts] = createSignal<Toast[]>([])
export { toasts }

let nextId = 1

// Wird von CookingRoute gesetzt wenn das Chat-Modal auf-/zuklappt.
const [_chatOpen, setChatOpenSignal] = createSignal(false)
export { setChatOpenSignal }

// Wird von CookingRoute registriert; Toasts.tsx ruft es bei Klick auf Chat-Toast auf.
let _onChatOpen: (() => void) | null = null
export function registerChatOpenHandler(fn: () => void) {
  _onChatOpen = fn
}
export function openChatFromToast() {
  _onChatOpen?.()
}

export function showToast(text: string) {
  const id = nextId++
  setToasts((t) => [...t, { id, text, type: 'default' }])
  setTimeout(() => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, 5000)
}

/** Chat-Toast: nur zeigen wenn das Chat-Modal geschlossen ist — sonst ist
    die Nachricht schon im Chatverlauf sichtbar. Klick öffnet den Chat. */
export function showChatToast(text: string) {
  if (_chatOpen()) return
  const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text
  const id = nextId++
  setToasts((t) => [...t, { id, text: preview, type: 'chat' }])
  setTimeout(() => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, 5000)
}

export function dismissToast(id: number) {
  setToasts((t) => t.filter((x) => x.id !== id))
}
