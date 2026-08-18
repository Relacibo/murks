import { A, useLocation } from '@solidjs/router'
import type { JSX } from 'solid-js'

const links = [
  { href: '/config', label: 'Config' },
  { href: '/agent', label: 'Agent' },
]

export function Layout(props: { children?: JSX.Element }) {
  const location = useLocation()
  return (
    <div class="min-h-screen bg-neutral-950 text-neutral-100">
      <header class="border-b border-neutral-800">
        <nav class="mx-auto flex max-w-3xl items-center gap-6 px-4 py-3">
          <span class="text-sm font-bold tracking-widest">MURKS</span>
          {links.map((l) => (
            <A
              href={l.href}
              class={`text-sm ${
                location.pathname === l.href ? 'text-neutral-100' : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              {l.label}
            </A>
          ))}
        </nav>
      </header>
      <main class="mx-auto max-w-3xl px-4 py-6">{props.children}</main>
    </div>
  )
}
