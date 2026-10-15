import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import os from "os"
import { bus, circuitOf, ensure, HARNESS_ROOT, healthTable, unwrapArgs } from "../lib/v3core"
import { loadState } from "../lib/v2state"

// V3 PHASE C — brain layer.
// Compile only the high-information package needed for this call, stop loops,
// and route models/tools from observed evidence rather than vibes.

const ROOT = path.join(os.homedir(), ".config/opencode")
const loopFile = (dir: string) => path.join(ensure(HARNESS_ROOT), "loops-" + path.basename(dir) + ".json")

function stable(value: any): string {
  if (value === undefined) return ""
  if (value === null || typeof value !== "object") return String(value)
  if (Array.isArray(value)) return "[" + value.map(stable).join(",") + "]"
  return "{" + Object.keys(value).sort().map((k) => k + ":" + stable(value[k])).join(",") + "}"
}

function readMemory(dir: string, role: string) {
  const folder = path.join(ROOT, "memory/projects", path.basename(dir))
  const parts = role === "debugger" ? ["failures", "state"] : role === "reviewer" ? ["decisions", "failures"] : role === "planner" ? ["architecture", "decisions", "failures", "state", "performance"] : ["architecture", "decisions"]
  return parts.map((p) => {
    const file = path.join(folder, p + ".md")
    try { return fs.existsSync(file) ? fs.readFileSync(file, "utf8").slice(0, 1800) : "" } catch { return "" }
  }).filter(Boolean).join("\n")
}

function compactDiff(dir: string) {
  try {
    const { execFileSync } = require("child_process")
    return String(execFileSync("git", ["-C", dir, "diff", "--stat", "--", "."], { encoding: "utf8", timeout: 3000 })).slice(0, 1200)
  } catch { return "no git diff available" }
}

function readLoop(dir: string): any[] {
  try { return JSON.parse(fs.readFileSync(loopFile(dir), "utf8")) } catch { return [] }
}

function writeLoop(dir: string, events: any[]) {
  try { fs.writeFileSync(loopFile(dir), JSON.stringify(events.slice(-200), null, 1)) } catch {}
}

function routeModel(dir: string) {
  const s: any = loadState(dir)
  const loops = readLoop(dir)
  const recent = loops.slice(-20)
  const same = recent.filter((x) => x.kind === "action").length
  const errors = s.evidence.errors.length
  const falseClaims = recent.filter((x) => x.kind === "claim" && x.verdict === "CONTRADICTED").length
  if (same >= 3 || errors >= 3 || falseClaims >= 2) return { tier: "REASONING", model: "opencode/nemotron-3-ultra-free", reason: "repeated failure, loop, or contradicted evidence" }
  if (s.task.complexity === "L1" && !s.reasoning_state.hypothesis) return { tier: "FAST", model: "opencode/space-bunny-free", reason: "simple retrieval with no failure evidence" }
  return { tier: "CODING", model: "opencode/muse-spark-1.3-contributor-free", reason: "normal implementation/debugging" }
}

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()
  return {
    "tool.execute.before": async (input: any) => {
      const tool = String(input?.tool || "")
      if (!tool) return
      const events = readLoop(DIR)
      const action = { kind: "action", key: tool + "(" + stable(input?.args || {}) + ")", tool, at: Date.now() }
      const repeats = events.filter((e) => e.key === action.key).length + 1
      events.push({ ...action, repeats })
      if (repeats >= 3) {
        bus.emitEvent("TOOL_FAILED", { kind: "loop", tool, key: action.key, repeats })
      }
      writeLoop(DIR, events)
    },
    "tool.execute.after": async (input: any, output: any) => {
      const text = String(output?.output ?? output?.result ?? "")
      if (/FAIL|Error|exception|not found/i.test(text)) {
        const events = readLoop(DIR)
        events.push({ kind: "error", key: text.replace(/\s+/g, " ").slice(0, 240), at: Date.now() })
        writeLoop(DIR, events)
      }
    },
    tool: {
      context_compile: {
        description: "Compile a small, fresh context package: role, objective, state, selective memory, diff, evidence, budget, and available healthy tools. Do not forward the whole chat.",
        args: { type: "object", properties: { role: { type: "string" }, objective: { type: "string" }, code: { type: "string" }, error: { type: "string" } } },
        async execute(args: any) {
          const a = unwrapArgs(args)
          const role = a?.role || "builder"
          const state: any = loadState(DIR)
          const tools = ["context_compile", "task_state", "code_search", "read_slice", "errors_now", "patch_apply", "verify_chain", "watchdog_status", "machine_state", "events"].filter((t) => circuitOf(t) !== "open").slice(0, 7)
          const memory = readMemory(DIR, role)
          const packageText = [
            "ROLE: " + role,
            "OBJECTIVE: " + (a?.objective || state.task.objective || "(unset)"),
            "SUCCESS: verified behavior + relevant checks pass; no unsupported claims",
            "STATE: " + state.task.status + " / " + state.task.complexity,
            "HYPOTHESIS: " + (state.reasoning_state.hypothesis || "(none)"),
            "FILES: " + state.evidence.relevant_files.slice(0, 8).join(", ")
              + "\nERRORS: " + state.evidence.errors.slice(-5).join(" | "),
            "MEMORY:\n" + (memory || "(none)"),
            "DIFF:\n" + compactDiff(DIR),
            "CURRENT ERROR: " + (a?.error || "none supplied"),
            "BUDGET: explore=" + state.limits.exploration_remaining + " tools=" + state.limits.tool_budget,
            "AVAILABLE TOOLS: " + tools.join(", "),
          ].join("\n")
          return packageText.slice(0, state.task.complexity === "L1" ? 4200 : state.task.complexity === "L2" ? 9000 : 16000)
        },
      },
      loop_status: {
        description: "Show normalized repeated actions, repeated errors, and whether the current strategy should stop.",
        args: { type: "object", properties: { clear: { type: "boolean" } } },
        async execute(args: any) {
          if (args?.clear) writeLoop(DIR, [])
          const events = readLoop(DIR)
          const counts: Record<string, number> = {}
          for (const e of events.filter((x) => x.kind === "action")) counts[e.key] = (counts[e.key] || 0) + 1
          const repeated = Object.entries(counts).filter(([, n]) => n >= 3)
          return JSON.stringify({ stop_strategy: repeated.length > 0, repeated, recent: events.slice(-12) }, null, 1)
        },
      },
      model_route: {
        description: "Choose FAST, CODING, or REASONING from observed failures, loops, false claims, complexity, and remaining budget.",
        args: { type: "object", properties: {} },
        async execute() { return JSON.stringify(routeModel(DIR), null, 1) },
      },
      capability_route: {
        description: "Return only healthy capabilities needed for an intent; circuit-open tools are excluded.",
        args: { type: "object", required: ["intent"], properties: { intent: { type: "string" } } },
        async execute(args: any) {
          const a = unwrapArgs(args)
          const intent = String(a?.intent || "code").toLowerCase()
          const map: Record<string, string[]> = {
            code: ["code_search", "read_slice", "errors_now", "patch_apply", "verify_chain", "task_state"],
            debug: ["errors_now", "context_compile", "read_slice", "exec", "verify_chain", "loop_status"],
            machine: ["machine_state", "events", "proc_status", "proc_logs", "watchdog_status"],
            research: ["web_search", "read_slice", "ctx_recall", "task_state"],
          }
          const wanted = map[intent] || map.code
          return JSON.stringify({ intent, tools: wanted.filter((t) => circuitOf(t) !== "open"), open: healthTable().filter((t) => t.circuit === "open").map((t) => t.tool) })
        },
      },
    },
  }
}) satisfies Plugin
