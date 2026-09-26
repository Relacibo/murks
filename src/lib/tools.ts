export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

const depRefSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      flow_id: { type: 'string' },
      step_id: { type: 'string', description: 'Stable step ID (from get_cook_state)' },
      timer_seconds: {
        type: 'number',
        description:
          'Optional delay in seconds: the card only becomes free X seconds AFTER this dependency completes ("I will join X seconds after this card").',
      },
    },
    required: ['flow_id', 'step_id'],
  },
  description:
    'Optional dependencies (steps that must finish first). There is NO implicit ordering — without depends_on a step runs immediately in parallel. Chain every follow-up step explicitly to its predecessor (including step 2 → step 1). EVERY time span in the recipe MUST be modeled as timer_seconds on the edge to the follow-up card ("simmer for 10 minutes" → follow-up card with timer_seconds 600). WAITING TIME vs. active work: the edge means passive waiting (baking, steeping, chilling). If the RESULT determines the end ("until golden", "until creamy") or the cook is active ("bring to a boil while stirring"), there is NO edge — the time belongs in the card\'s own description. Time spans go at the END of the triggering card (key statement first); the waiting follow-up card mentions NO time, only what to do once it elapses. If the recipe ends with a waiting period, append a final step that waits via timer_seconds ("carve and serve"). Across flows the edge is the scheduling tool: "whip the cream" hangs with a smaller timer_seconds on the SAME anchor as the waiting card — it appears shortly before it. PLAN AS LATE AS POSSIBLE (with buffer): results that age (preheated oven, whipped cream, melted butter) must NOT sit free at the start — anchor them so they are ready exactly when they are needed. Millet example: [bring to a boil] →(540s)→ [let it swell] →(600s)→ [fluff up]. "Preheat oven to 180°" (≈ 5 min) should be hot when the swelling ends: attach it with timer_seconds=300 to the swelling card — math: timer = swelling time 600 − preheat time 300, so the oven starts 5 min before the swelling ends and is exactly on time. The math lives in timer_seconds, not in the description. When in doubt, start slightly earlier — a hot oven holds its temperature, waiting food gets cold.',
}

/** depends_on in add_flow: predecessors within the SAME new flow via
    step_index (0-based, must be smaller than the own index) OR to already
    existing steps of other flows via flow_id + step_id. */
const addFlowDepRefSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      step_index: {
        type: 'number',
        description:
          'Predecessor within THIS new flow: 0-based index of the step in the steps array (must be smaller than the own index).',
      },
      flow_id: { type: 'string', description: 'For predecessors in a different, already existing flow' },
      step_id: { type: 'string', description: 'Stable step ID (from get_cook_state)' },
      timer_seconds: {
        type: 'number',
        description:
          'Optional delay in seconds: the card only becomes free X seconds AFTER this dependency completes ("I will join X seconds after this card").',
      },
    },
  },
  description:
    'Optional dependencies. There is NO implicit ordering — without depends_on a step runs immediately in parallel. Chain every follow-up step explicitly to its predecessor: within this new flow via step_index, to existing steps of other flows via flow_id + step_id. EVERY time span in the recipe MUST be modeled as timer_seconds on the edge to the follow-up card ("simmer for 10 minutes" → follow-up card with timer_seconds 600). WAITING TIME vs. active work: the edge means passive waiting (baking, steeping, chilling). If the RESULT determines the end ("until golden", "until creamy") or the cook is active ("bring to a boil while stirring"), there is NO edge — the time belongs in the card\'s own description. Time spans go at the END of the triggering card (key statement first); the waiting follow-up card mentions NO time, only what to do once it elapses. If the recipe ends with a waiting period, append a final step that waits via timer_seconds ("carve and serve"). Across flows the edge is the scheduling tool: "whip the cream" hangs with a smaller timer_seconds on the SAME anchor as the waiting card — it appears shortly before it. PLAN AS LATE AS POSSIBLE (with buffer): results that age (preheated oven, whipped cream, melted butter) must NOT sit free at the start — anchor them so they are ready exactly when they are needed. Millet example: [bring to a boil] →(540s)→ [let it swell] →(600s)→ [fluff up]. "Preheat oven to 180°" (≈ 5 min) should be hot when the swelling ends: attach it with timer_seconds=300 to the swelling card — math: timer = swelling time 600 − preheat time 300, so the oven starts 5 min before the swelling ends and is exactly on time. The math lives in timer_seconds, not in the description. When in doubt, start slightly earlier — a hot oven holds its temperature, waiting food gets cold.',
}

const prioritySchema = {
  type: 'string',
  enum: ['normal', 'high'],
  description:
    '"high" for time-critical steps (e.g. something in the oven): the card sits at the top of "Jetzt" and pulses (a real alarm). A "high" step may have at most ONE dependency (the step whose completion — possibly plus delay — determines the wait). Use sparingly.',
}

const scoreSchema = {
  type: 'number',
  description:
    'Optional scheduling hint (default 0): the higher, the further up in the active queue ("do this first"). Not an alarm — that is priority "high". Put the value directly on the time-critical step (e.g. the step that must happen right after a wait: "drain the fat" after resting, "dough into the oven" after proofing). The engine automatically pulls all preceding steps up with it recursively — the score propagates backwards over depends_on, even through waiting times. Predecessors therefore need no score of their own. Only set it if the default would be wrong.',
}

const stepIdSchema = (description: string) => ({
  type: 'string',
  description: `${description} (stable step ID from get_cook_state)`,
})

const ingredientsSchema = {
  type: 'array',
  description:
    'Ingredients of this card as chips ({name, amount}). The app renders them below the step text as clickable chips — a click reveals the amount. If an amount is given here, do NOT repeat it in the description text ("fold in the flour" instead of "fold in 250 g of flour"). The ingredient list (ingredients modal) is derived automatically from all card chips — one line per ingredient, colored by flow. "To taste" ingredients (salt, oil) go without amount; only list them if the card actually uses them.',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Ingredient, e.g. "Basmatireis" (user-facing — German)' },
      amount: {
        type: 'string',
        description: 'Amount, e.g. "300 g" or "2 Stück" — empty/omitted for "to taste"',
      },
    },
    required: ['name'],
  },
}

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_cook_state',
      description:
        'Fetch the current cooking state: all flows, steps (with stable IDs), timers, ingredients modal. Contains now_local (the user\'s local wall-clock time) and, for every waiting card, ends_in_s/ends_at_local — call this for time questions ("ready by 14:30?", "how long is the timer still running?") and whenever you do not know the current state.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_flow',
      description:
        'Create a new flow (parallel component with its own step sequence). Steps may only reference steps of other flows that already exist. If the amount basis is unclear (how many portions — or how much of the perishable main ingredient is on hand), ASK first and build only after the answer — never guess portion sizes. EVERY build starts with set_loading({scope:"all", loading:true}) as the FIRST tool call of your reply (before you think through the schedule — not only when you start creating flows) and ends with set_loading({loading:false}) after the last tool call — even for a single flow. The tool result may contain "warnings" (e.g. a time span that no follow-up card waits on via timer_seconds) — fix them immediately in the same reply via update_step/add_step, unless the situation is intentional (e.g. a card that really should run in parallel right away).',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name, e.g. "Reis" (user-facing — German)' },
          icon: { type: 'string', description: 'Matching emoji, e.g. "🍚" — identifies the flow visually' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string', description: 'Complete, independently executable instruction (Markdown allowed); start with a short key statement (user-facing — German)' },
                ingredients: ingredientsSchema,
                priority: prioritySchema,
                score: scoreSchema,
                depends_on: addFlowDepRefSchema,
              },
              required: ['description'],
            },
            description: 'Step sequence',
          },
        },
        required: ['name', 'icon', 'steps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_step',
      description:
        'Append a step to an existing flow or insert it behind a specific step (after_step_id). The tool result may contain "warnings" (e.g. a time span with no follow-up card on timer_seconds) — fix them immediately via update_step/add_step, unless the situation is intentional.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          description: { type: 'string', description: 'Complete, independently executable instruction (Markdown allowed); start with a short key statement (user-facing — German)' },
          ingredients: ingredientsSchema,
          after_step_id: { type: 'string', description: 'Optional: stable ID of the step to insert behind (otherwise appended at the end)' },
          priority: prioritySchema,
          score: scoreSchema,
          depends_on: depRefSchema,
        },
        required: ['flow_id', 'description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_step',
      description:
        'Edit a step: change description, ingredients, dependencies (including edge delays), priority or score (only the given fields). A waiting time after a card completes belongs as timer_seconds on the edge (depends_on) — not on the completed card. The tool result may contain "warnings" — fix them immediately in the same reply.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('The step'),
          description: { type: 'string', description: 'New instruction (Markdown allowed; user-facing — German)' },
          ingredients: {
            ...ingredientsSchema,
            description:
              'REPLACES this card\'s chips (give the complete list, including unchanged ones) — e.g. scaled amounts or a swapped ingredient. Amounts live ONLY here, not in the description text.',
          },
          depends_on: depRefSchema,
          priority: prioritySchema,
          score: scoreSchema,
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_step',
      description:
        'Remove a step. Dependencies of other steps on it are removed with it; steps that become free become active.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('The step'),
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'split_step',
      description:
        'Split a step in two: part 1 stays in place, part 2 is inserted behind it and depends on part 1. Steps that pointed at the original step afterwards point at part 2. Only for steps that are not completed yet.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('The step to split'),
          first_description: { type: 'string', description: 'Instruction for part 1 (stays in place; user-facing — German)' },
          second_description: { type: 'string', description: 'Instruction for part 2 (follows afterwards; user-facing — German)' },
        },
        required: ['flow_id', 'step_id', 'first_description', 'second_description'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_step',
      description:
        'Complete a step (done). Dependent cards with a delay on the edge (timer_seconds on the depends_on entry) only become free after it elapses.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('The step'),
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'revert_step',
      description:
        'Set a completed step back to not-done. Only possible if no card that depends on this step is itself completed.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('The step'),
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_timer',
      description:
        'Set or overwrite a step\'s timer — calling it again replaces the previous timer. "seconds": duration from now. Alternatively "delta_seconds" (signed): shift the current end by X seconds — positive = "X longer", negative = shorten (on a waiting card without its own timer, the base is that card\'s planned wait). On a waiting card the timer replaces the planned wait; on an active card it puts the card into the waiting state. Its expiry frees the card — the planned wait does NOT come back.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('The step'),
          seconds: { type: 'number', description: 'Duration from now, in seconds (replaces a running timer)' },
          delta_seconds: {
            type: 'number',
            description: 'Optional instead of seconds: shift the running timer by these seconds — positive extends, negative shortens',
          },
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'pause_timer',
      description:
        'Pause a step\'s running timer — the remaining time freezes until it is continued with resume_timer. On a waiting card without its own timer, pause_timer freezes its planned wait.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('The step'),
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'resume_timer',
      description: 'Resume a paused step timer.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('The step'),
        },
        required: ['flow_id', 'step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_flow',
      description: 'Mark a flow as finished (all steps done, all timers cancelled).',
      parameters: {
        type: 'object',
        properties: { flow_id: { type: 'string' } },
        required: ['flow_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_flow',
      description: 'Edit a flow: change name and/or emoji.',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          name: { type: 'string', description: 'New name (user-facing — German)' },
          icon: { type: 'string', description: 'New emoji (empty removes it)' },
        },
        required: ['flow_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_flow',
      description:
        'Delete a flow. Dependencies of other flows on its steps are removed.',
      parameters: {
        type: 'object',
        properties: { flow_id: { type: 'string' } },
        required: ['flow_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'start_new_recipe',
      description:
        'ONLY for a completely different dish — when the user explicitly wants to cook something else entirely (e.g. "let\'s make pasta instead"). Deletes all flows and ingredients (no backup). NEVER call it for changes to the current dish (adjust a step, swap an ingredient, scale amounts, add or remove a flow) — use update_step / add_step / delete_step / add_flow / delete_flow / update_flow instead. Sequence: set_loading(true) → start_new_recipe → build via add_flow (ingredients as per-step chips) → set_loading(false).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_loading',
      description:
        'Build spinner. EVERY schedule build — even a single add_flow — starts with loading:true as the FIRST tool call of your reply, BEFORE you think through and build the schedule — the user should see the spinner while you work; never think/build first and turn the spinner on later. Pure answers/questions without a plan change get no spinner. scope "all" (default) = small spinner bottom-left (the existing plan stays visible); scope "flow" + flow_id = spinner on that existing flow only. loading=false after the last tool call of the build (also on abort/error). Purely visual: timers, cards and completions keep running normally.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['all', 'flow'],
            description: '"all" = whole schedule (default), "flow" = a single flow',
          },
          flow_id: { type: 'string', description: 'Only for scope "flow"' },
          loading: { type: 'boolean', description: 'true = show, false = hide' },
        },
        required: ['loading'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'show_step',
      description:
        'Deliberately show a step to the user: focus the flow, switch the view, scroll the step into the visible area and let it pulse briefly. view: "jetzt" (default) for active steps, "flow" for blocked/done ones; speak:true reads the description aloud. If the user says "weiter" or "nächster Schritt" without context, they mean the topmost card in "Jetzt" (the first element of the queue field of get_cook_state — exactly the display order) — show it with view "jetzt" and answer only "OK.".',
      parameters: {
        type: 'object',
        properties: {
          flow_id: { type: 'string' },
          step_id: stepIdSchema('The step'),
          view: {
            type: 'string',
            enum: ['jetzt', 'flow'],
            description: '"jetzt" (default) for active steps, "flow" for blocked/done ones',
          },
          speak: { type: 'boolean', description: 'Read the card\'s description aloud (e.g. for "Was mache ich als Nächstes?")' },
        },
        required: ['step_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'focus_flow',
      description: 'Focus a flow (highlights the column) without showing a single step.',
      parameters: {
        type: 'object',
        properties: { flow_id: { type: 'string' } },
        required: ['flow_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_ingredients',
      description:
        'ONLY for ingredients WITHOUT a step mapping (staples like "Salz", "Öl" that belong to no card). Regular recipe ingredients belong in the steps\' ingredients arrays (add_flow/add_step) — the ingredient list is derived from those chips, NOT maintained here. Replaces the entire list of free-standing ingredients.',
      parameters: {
        type: 'object',
        properties: {
          ingredients: {
            type: 'array',
            description: 'Free-standing ingredients (no step mapping)',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Ingredient, e.g. "Basmatireis" (user-facing — German)' },
                amount: { type: 'string', description: 'Amount, e.g. "300 g" or "2 Stück"' },
              },
              required: ['name'],
            },
          },
        },
        required: ['ingredients'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_ingredients',
      description: 'Open the ingredients list (modal).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_ingredients',
      description: 'Close the ingredients list (modal).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_chat',
      description: 'Open the chat history (modal).',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'close_chat',
      description: 'Close the chat history (modal).',
      parameters: { type: 'object', properties: {} },
    },
  },
]

function fmtRemaining(endsAt: number): string {
  const s = Math.max(0, Math.round((endsAt - Date.now()) / 1000))
  const mm = Math.floor(s / 60)
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

export { fmtRemaining }

export function stepLabel(description: string, max = 40): string {
  const first =
    description
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l !== '') ?? ''
  const text = first.replace(/\s+/g, ' ')
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}
