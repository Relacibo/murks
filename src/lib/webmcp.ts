import { createSignal } from 'solid-js'
import { TOOLS } from './tools'
import { cookEngine, SYSTEM_PROMPT } from '../state/store'

/**
 * WebMCP (https://github.com/webmachinelearning/webmcp): Tools direkt im
 * Browser-Dokument registrieren — Browser-Agenten entdecken und rufen sie
 * auf, ohne Server/Transport. Externer Agent übernimmt STT/TTS und Dialog;
 * die Seite reagiert live über den bestehenden CookStore.
 *
 * Chrome: Origin Trial ab 149, lokal via chrome://flags/#enable-webmcp-testing.
 * navigator.modelContext ist ab Chrome 150 deprecated → document.modelContext.
 */

interface WebMCPToolDescriptor {
  name: string
  description: string
  inputSchema?: Record<string, unknown>
  execute: (args: Record<string, unknown>) => string | Promise<string>
  annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }
}

interface WebModelContext {
  registerTool(tool: WebMCPToolDescriptor, opts?: { signal?: AbortSignal }): Promise<unknown>
}

function modelContext(): WebModelContext | null {
  const doc = document as Document & { modelContext?: WebModelContext }
  const nav = navigator as Navigator & { modelContext?: WebModelContext }
  return doc.modelContext ?? nav.modelContext ?? null
}

/** Feature-Detection: WebMCP-API im Browser verfügbar (stabil pro Load). */
export function webmcpAvailable(): boolean {
  return modelContext() !== null
}

/** Anzahl erfolgreich registrierter Tools — für die Config-UI. */
export const [webmcpToolCount, setWebmcpToolCount] = createSignal(0)

/**
 * Alle Cook-Tools (TOOLS, OpenAI-Schema → WebMCP-inputSchema) plus ein
 * Regeln-Tool mit dem System-Prompt registrieren. Fällt zurück, wenn die
 * API im Browser nicht verfügbar ist (kein Fehler, reine Progression).
 * onExternalUse: wird bei jedem Tool-Aufruf eines externen Agenten gefeuert —
 * die App kann darüber den WebMCP-Modus (URL-Param) einwegig einschalten.
 */
export async function registerWebMCPTools(opts?: {
  onExternalUse?: () => void
}): Promise<boolean> {
  const ctx = modelContext()
  if (!ctx) return false

  let count = 0
  for (const tool of TOOLS) {
    const { name, description, parameters } = tool.function
    try {
      await ctx.registerTool({
        name,
        description,
        inputSchema: parameters,
        execute: (args) => {
          opts?.onExternalUse?.()
          return cookEngine.executeTool(name, args)
        },
      })
      count++
    } catch (e) {
      console.error(`WebMCP: Tool ${name} nicht registriert`, e)
    }
  }

  try {
    await ctx.registerTool({
      name: 'get_system_prompt',
      description:
        'Vollständige MURKS-Regeln (System-Prompt): Modellierung von Kochsträngen, Schritten, depends_on-Kanten, Timern, Zutatenliste und Antwortverhalten. Rufe das auf, bevor du Gerichte anlegst oder umbaust, und folge den Regeln exakt.',
      inputSchema: { type: 'object', properties: {} },
      execute: () => SYSTEM_PROMPT,
    })
    count++
  } catch (e) {
    console.error('WebMCP: Tool get_system_prompt nicht registriert', e)
  }

  if (count > 0) console.info(`WebMCP: ${count} Tools registriert`)
  setWebmcpToolCount(count)
  return count > 0
}
