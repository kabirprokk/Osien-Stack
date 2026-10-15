import fs from "fs"
import path from "path"
import os from "os"

// V2.1 — WORKING STATE
// Structured task truth that lives OUTSIDE the chat. The Context Compiler
// reads this; it never infers state by re-reading conversation history.
//
// Most of it is maintained AUTOMATICALLY from real tool calls, so it cannot
// drift from reality the way a model-written summary does.

const ROOT = path.join(os.homedir(), ".config/opencode/.state")

export const EMPTY = {
  task: { objective: "", complexity: "L1", status: "investigating", started: 0 },
  evidence: { relevant_files: [] as string[], symbols: [] as string[], errors: [] as string[] },
  execution: {
    files_read: [] as string[],
    files_modified: [] as string[],
    tools_called: [] as string[],
    tests_run: [] as string[],
  },
  reasoning_state: { hypothesis: "", confidence: "", unresolved: [] as string[] },
  limits: { exploration_remaining: 3, tool_budget: 12, token_budget: 0 },
  verification: { claims: [] as string[], verified: [] as string[] },
  meta: { last_updated: 0, tool_call_count: 0, loop_score: 0, escalated_to: "" },
}

export type State = typeof EMPTY

const slug = (d: string) =>
  path.basename(d).replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase() || "root"

export function statePath(dir: string) {
  return path.join(ROOT, slug(dir), "state.json")
}

export function loadState(dir: string): State {
  try {
    const raw = fs.readFileSync(statePath(dir), "utf8")
    // shallow-merge each block so a schema addition never crashes an old file
    const got = JSON.parse(raw)
    const out: any = JSON.parse(JSON.stringify(EMPTY))
    for (const k of Object.keys(out)) out[k] = { ...out[k], ...(got[k] || {}) }
    return out as State
  } catch {
    return JSON.parse(JSON.stringify(EMPTY)) as State
  }
}

export function saveState(dir: string, s: State) {
  s.meta.last_updated = Date.now()
  try {
    fs.mkdirSync(path.dirname(statePath(dir)), { recursive: true })
    fs.writeFileSync(statePath(dir), JSON.stringify(s, null, 2))
  } catch {}
}

// complexity -> exploration budget (per task class)
export const BUDGET: Record<string, { explore: number; tools: number }> = {
  L1: { explore: 3, tools: 8 },
  L2: { explore: 6, tools: 20 },
  L3: { explore: 10, tools: 40 },
}
