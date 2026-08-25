import type { CookEngine } from './cookEngine'
import { showToast } from './toast'
import { decompressFromBase64url } from './serializeRecipe'

/**
 * Rezept-Import aus dem ?recipe= URL-Param. Das Format ist ein kompaktes
 * JSON (siehe SKILL des opencode-Skills „murks"): Flows mit Schritten,
 * Abhängigkeiten per step_index (gleicher Flow, früherer Index) oder
 * flow_index + step_index (früherer Flow — Flows sind topologisch sortiert).
 * Der Import läuft komplett über die normalen Engine-Tools (start_new_recipe,
 * add_flow, set_ingredients) — Validierung, Linting und Aktivierung greifen
 * wie bei einem Agenten-Aufbau, es braucht aber KEINEN konfigurierten Agenten.
 */

interface RecipeDep {
  step_index?: number
  flow_index?: number
  timer_seconds?: number | null
}

interface RecipeStep {
  description: string
  priority: 'normal' | 'high'
  score: number
  depends_on: RecipeDep[]
}

interface RecipeFlow {
  name: string
  icon: string | null
  steps: RecipeStep[]
}

interface Recipe {
  title: string
  ingredients: { name: string; amount: string }[]
  flows: RecipeFlow[]
}

function fail(msg: string): never {
  throw new Error(msg)
}

function refStepCount(flows: unknown[], flowIndex: number): number {
  const flow = (flows[flowIndex] ?? {}) as Record<string, unknown>
  return Array.isArray(flow.steps) ? flow.steps.length : 0
}

function parseRecipe(json: string): Recipe {
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    fail('Rezept-Link kaputt: kein gültiges JSON')
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('Rezept-Link kaputt: JSON-Objekt erwartet')
  }
  const o = raw as Record<string, unknown>

  const title = typeof o.title === 'string' ? o.title.trim() : ''

  const rawIngredients = o.ingredients === undefined ? [] : o.ingredients
  if (!Array.isArray(rawIngredients)) fail('Rezept-Link kaputt: "ingredients" muss eine Liste sein')
  const ingredients = rawIngredients.map((x, i) => {
    const it = (x ?? {}) as Record<string, unknown>
    const name = String(it.name ?? '').trim()
    if (!name) fail(`Rezept-Link kaputt: Zutat ${i + 1} ohne name`)
    return { name, amount: it.amount ? String(it.amount) : '' }
  })

  if (!Array.isArray(o.flows) || o.flows.length === 0) {
    fail('Rezept-Link kaputt: "flows" muss eine nicht-leere Liste sein')
  }

  const flows = o.flows.map((f, fi) => {
    const flow = (f ?? {}) as Record<string, unknown>
    const name = String(flow.name ?? '').trim()
    if (!name) fail(`Rezept-Link kaputt: Flow ${fi + 1} ohne name`)
    const icon = typeof flow.icon === 'string' && flow.icon.trim() !== '' ? flow.icon.trim() : null
    if (!Array.isArray(flow.steps) || flow.steps.length === 0) {
      fail(`Rezept-Link kaputt: Flow „${name}" ohne steps`)
    }
    const steps = flow.steps.map((s, si) => {
      const step = (s ?? {}) as Record<string, unknown>
      const description = String(step.description ?? '').trim()
      if (!description) fail(`Rezept-Link kaputt: Schritt ${si + 1} in „${name}" ohne description`)
      const priority = step.priority === undefined ? 'normal' : step.priority
      if (priority !== 'normal' && priority !== 'high') {
        fail(`Rezept-Link kaputt: priority in „${name}" Schritt ${si + 1} muss "normal" oder "high" sein`)
      }
      const score = step.score === undefined ? 0 : Number(step.score)
      if (!Number.isFinite(score) || score < 0) {
        fail(`Rezept-Link kaputt: score in „${name}" Schritt ${si + 1} muss eine Zahl ≥ 0 sein`)
      }
      const rawDeps = step.depends_on === undefined ? [] : step.depends_on
      if (!Array.isArray(rawDeps)) {
        fail(`Rezept-Link kaputt: depends_on in „${name}" Schritt ${si + 1} muss eine Liste sein`)
      }
      const depends_on = rawDeps.map((d, di) => {
        const dep = (d ?? {}) as Record<string, unknown>
        const depLabel = `Abhängigkeit ${di + 1} von „${name}" Schritt ${si + 1}`
        const hasStepIndex = typeof dep.step_index === 'number' && Number.isInteger(dep.step_index)
        const hasFlowIndex = typeof dep.flow_index === 'number' && Number.isInteger(dep.flow_index)
        if (!hasStepIndex) fail(`Rezept-Link kaputt: ${depLabel} braucht step_index`)
        const step_index = dep.step_index as number
        if (step_index < 0) fail(`Rezept-Link kaputt: ${depLabel} mit negativem step_index`)
        let flow_index: number | undefined
        if (hasFlowIndex) {
          flow_index = dep.flow_index as number
          if (flow_index < 0) fail(`Rezept-Link kaputt: ${depLabel} mit negativem flow_index`)
          if (flow_index >= fi) {
            fail(`Rezept-Link kaputt: ${depLabel} zeigt auf Flow ${flow_index + 1} — nur frühere Flows sind referenzierbar (Flows topologisch sortieren)`)
          }
        }
        if (step_index >= (flow_index === undefined ? si : refStepCount(o.flows as unknown[], flow_index))) {
          fail(`Rezept-Link kaputt: ${depLabel} mit unbekanntem Schritt-Index ${step_index}`)
        }
        const rawTs = dep.timer_seconds
        let timer_seconds: number | null = null
        if (rawTs !== undefined && rawTs !== null) {
          const ts = Number(rawTs)
          if (!Number.isFinite(ts) || ts <= 0) {
            fail(`Rezept-Link kaputt: ${depLabel} timer_seconds muss positiv sein`)
          }
          timer_seconds = Math.round(ts)
        }
        return { step_index, flow_index, timer_seconds }
      })
      if (priority === 'high' && depends_on.length > 1) {
        fail(`Rezept-Link kaputt: Schritt ${si + 1} in „${name}" hat priority "high" und mehr als eine Abhängigkeit`)
      }
      return { description, priority: priority as 'normal' | 'high', score, depends_on }
    })
    return { name, icon, steps }
  })

  return { title, ingredients, flows }
}

/** Validiert das Rezept-JSON komplett (wirft bei Fehlern) und baut dann das
    Brett auf: Import erstellt IMMER ein neues Rezept (start_new_recipe).
    Fehler beim Import lassen das bestehende Brett unangetastet —
    start_new_recipe läuft erst nach erfolgreicher Validierung.
    Unterstützt rohes JSON und „gz:"-Präfix (gzip + base64url). */
export async function importRecipe(engine: CookEngine, raw: string): Promise<void> {
  let json: string
  if (raw.startsWith('gz:')) {
    try {
      json = await decompressFromBase64url(raw.slice(3))
    } catch {
      showToast('Rezept-Link kaputt: Dekomprimierung fehlgeschlagen')
      return
    }
  } else {
    json = raw
  }

  let recipe: Recipe
  try {
    recipe = parseRecipe(json)
  } catch (e) {
    showToast(e instanceof Error ? e.message : String(e))
    return
  }

  engine.executeTool('set_loading', { loading: true }, { silent: true })
  try {
    engine.executeTool('start_new_recipe', {}, { silent: true })

    const built: { flow_id: string; step_ids: string[] }[] = []
    for (const flow of recipe.flows) {
      const steps = flow.steps.map((step) => {
        const depends_on = step.depends_on.map((dep) => {
          if (dep.flow_index !== undefined) {
            const ref = built[dep.flow_index]
            return {
              flow_id: ref.flow_id,
              step_id: ref.step_ids[dep.step_index!],
              ...(dep.timer_seconds !== null && dep.timer_seconds !== undefined
                ? { timer_seconds: dep.timer_seconds }
                : {}),
            }
          }
          return {
            step_index: dep.step_index!,
            ...(dep.timer_seconds !== null && dep.timer_seconds !== undefined
              ? { timer_seconds: dep.timer_seconds }
              : {}),
          }
        })
        return {
          description: step.description,
          priority: step.priority,
          score: step.score,
          depends_on,
        }
      })
      const res = JSON.parse(
        engine.executeTool(
          'add_flow',
          { name: flow.name, icon: flow.icon ?? '', steps },
          { silent: true },
        ),
      ) as { id?: string; step_ids?: string[]; error?: string; warnings?: string[] }
      if (res.error || !res.id || !Array.isArray(res.step_ids)) {
        throw new Error(`Flow „${flow.name}": ${res.error ?? 'Unbekannter Importfehler'}`)
      }
      built.push({ flow_id: res.id, step_ids: res.step_ids })
    }

    if (recipe.ingredients.length > 0) {
      engine.executeTool('set_ingredients', { ingredients: recipe.ingredients }, { silent: true })
    }
  } catch (e) {
    showToast(`Rezept-Link kaputt: ${e instanceof Error ? e.message : String(e)}`)
  } finally {
    engine.executeTool('set_loading', { loading: false }, { silent: true })
  }
  showToast(recipe.title ? `🍽 ${recipe.title}` : '🍽 Rezept geladen')
}
