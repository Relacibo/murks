import { createSignal } from 'solid-js'

export interface Toast {
  id: number
  text: string
}

const [toasts, setToasts] = createSignal<Toast[]>([])

export { toasts }

let nextId = 1

export function showToast(text: string) {
  const id = nextId++
  setToasts((t) => [...t, { id, text }])
  setTimeout(() => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, 5000)
}

export function dismissToast(id: number) {
  setToasts((t) => t.filter((x) => x.id !== id))
}
