import type { CookState } from '../state/store'

/** CookState → Recipe-JSON-Objekt (strukturell, ohne Runtime-State wie done/timer) */
export function serializeRecipeCook(cook: CookState): Record<string, unknown> {
  const flowIndexMap = new Map<string, number>()
  const stepIndexMap = new Map<string, Map<string, number>>()

  cook.flows.forEach((flow, fi) => {
    flowIndexMap.set(flow.id, fi)
    const stepMap = new Map<string, number>()
    flow.steps.forEach((step, si) => stepMap.set(step.id, si))
    stepIndexMap.set(flow.id, stepMap)
  })

  const flows = cook.flows.map((flow) => {
    const fi = flowIndexMap.get(flow.id)!
    const steps = flow.steps.map((step) => {
      const depends_on = step.dependsOn
        .map((dep) => {
          const depFi = flowIndexMap.get(dep.flow_id)
          const depSi = stepIndexMap.get(dep.flow_id)?.get(dep.step_id)
          if (depFi === undefined || depSi === undefined) return null
          const entry: Record<string, number> = depFi === fi
            ? { step_index: depSi }
            : { flow_index: depFi, step_index: depSi }
          if (dep.timer_seconds) entry.timer_seconds = dep.timer_seconds
          return entry
        })
        .filter(Boolean)
      const s: Record<string, unknown> = { description: step.description }
      if (step.priority === 'high') s.priority = 'high'
      if (step.score !== 0) s.score = step.score
      if (depends_on.length > 0) s.depends_on = depends_on
      return s
    })
    const f: Record<string, unknown> = { name: flow.name, steps }
    if (flow.icon) f.icon = flow.icon
    return f
  })

  const recipe: Record<string, unknown> = { flows }
  if (cook.ingredients.length > 0) {
    recipe.ingredients = cook.ingredients.map(({ name, amount }) =>
      amount ? { name, amount } : { name }
    )
  }
  return recipe
}

/** JSON-String → gzip → base64url */
export async function compressToBase64url(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text)
  const cs = new CompressionStream('gzip')
  const writer = cs.writable.getWriter()
  writer.write(bytes)
  void writer.close()
  const chunks: Uint8Array[] = []
  const reader = cs.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  let len = 0
  for (const c of chunks) len += c.length
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  let bin = ''
  for (const b of out) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

/** base64url → gzip → JSON-String */
export async function decompressFromBase64url(b64: string): Promise<string> {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/')
  const pad = '='.repeat((4 - padded.length % 4) % 4)
  const bin = atob(padded + pad)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const ds = new DecompressionStream('gzip')
  const writer = ds.writable.getWriter()
  writer.write(bytes)
  void writer.close()
  const chunks: Uint8Array[] = []
  const reader = ds.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }
  let len = 0
  for (const c of chunks) len += c.length
  const out = new Uint8Array(len)
  let off = 0
  for (const c of chunks) { out.set(c, off); off += c.length }
  return new TextDecoder().decode(out)
}

/** CookState → ?recipe=/ ?share= Payload („gz:<base64url>"), null bei leerem Brett */
export async function buildRecipePayload(cook: CookState): Promise<string | null> {
  if (cook.flows.length === 0) return null
  const json = JSON.stringify(serializeRecipeCook(cook))
  const compressed = await compressToBase64url(json)
  return `gz:${compressed}`
}

/** CookState → vollständige ?recipe= URL (leer = nur Basis-URL) */
export async function buildRecipeUrl(cook: CookState): Promise<string> {
  const base = window.location.origin + import.meta.env.BASE_URL
  const payload = await buildRecipePayload(cook)
  return payload === null ? base : `${base}?recipe=${payload}`
}
