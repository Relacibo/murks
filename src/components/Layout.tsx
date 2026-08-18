import type { JSX } from 'solid-js'

export function Layout(props: { children?: JSX.Element }) {
  return <div class="min-h-screen bg-neutral-950 text-neutral-100">{props.children}</div>
}
