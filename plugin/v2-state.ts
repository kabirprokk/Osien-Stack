import type { Plugin } from "@opencode-ai/plugin"
import { loadState, saveState, EMPTY, BUDGET } from "../lib/v2state"
import type { State } from "../lib/v2state"

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()
  let cache: State | null = null
  let dirty = false

  const st = () => (cache ||= loadState(DIR))
  const flush = () => {
    if (dirty && cache) {
      saveState(DIR, cache)
      dirty = false
    }
  }

  return {
    // ---- automatic tracking: real tool calls, not model assertions ----------
    "tool.execute.after": async (input: any, output: any) => {
      try {
        const s = st()
        const name = String(input?.tool ?? "")
        const a = (input?.args ?? {}) as any
        s.execution.tools_called.push(name)
        s.meta.tool_call_count++

        const f = a?.filePath || a?.file
        if (f && typeof f === "string") {
          if (["read", "read_slice", "code_search", "smart_grep"].includes(name)) {
            if (!s.execution.files_read.includes(f)) s.execution.files_read.push(f)
          }
          if (["edit", "write", "patch_apply"].includes(name)) {
            if (!s.execution.files_modified.includes(f)) s.execution.files_modified.push(f)
            if (!s.evidence.relevant_files.includes(f)) s.evidence.relevant_files.push(f)
          }
        }
        if (a?.pattern && typeof a.pattern === "string") {
          if (!s.evidence.symbols.includes(a.pattern)) s.evidence.symbols.push(a.pattern)
        }
        if (name === "try_check" || name === "verify_chain") {
          const cmd = [a?.cmd, ...(Array.isArray(a?.cmd) ? a.cmd : [])].filter(Boolean).join(" ")
          if (cmd && !s.execution.tests_run.includes(cmd)) s.execution.tests_run.push(cmd)
          const status = String(output?.output ?? "").match(/PASS|FAIL/)?.[0]
          if (status) s.evidence.errors.push(`${status} ${cmd}`)
        }

        // exploration budget is consumed by LOOKING, not by editing
        if (["read", "read_slice", "code_search", "smart_grep", "grep", "glob", "repo_health"].includes(name)) {
          s.limits.exploration_remaining = Math.max(0, s.limits.exploration_remaining - 1)
        }

        dirty = true
        flush()
      } catch {}
    },

    // ---- model-facing: read + edit the state -------------------------------
    tool: {
      task_state: {
        description:
          "Structured WORKING STATE for the current task, outside the chat. Read it to recover where you are; write it to record objective, hypothesis, complexity and status. Exploration budget is tracked automatically from real tool calls - you do not set it.",
        args: {
          type: "object",
          properties: {
            op: { type: "string", description: "get | set | summary" },
            objective: { type: "string" },
            complexity: { type: "string", description: "L1 | L2 | L3 — sets the exploration budget" },
            status: { type: "string", description: "investigating | patching | verifying | blocked | done" },
            hypothesis: { type: "string", description: "what you currently believe is true and why" },
            confidence: { type: "string", description: "high | medium | low" },
            unresolved: { type: "string", description: "semicolon-separated open questions" },
            evidence_files: { type: "string", description: "semicolon-separated file paths that matter" },
          },
        },
        async execute(args: any) {
          let a: any = args ?? {}
          if (typeof a === "string") {
            try {
              a = JSON.parse(a)
            } catch {
              a = {}
            }
          }
          for (const k of ["properties", "args", "input"]) {
            if (a?.[k] && typeof a[k] === "object") {
              a = a[k]
              break
            }
          }
          const s = st()
          const op = a?.op ?? "get"

          if (op === "set") {
            if (a.objective) s.task.objective = a.objective
            if (a.status) s.task.status = a.status
            if (a.hypothesis) s.reasoning_state.hypothesis = a.hypothesis
            if (a.confidence) s.reasoning_state.confidence = a.confidence
            if (a.complexity) {
              s.task.complexity = a.complexity
              const b = BUDGET[a.complexity] ?? BUDGET.L2
              s.limits.exploration_remaining = b.explore
              s.limits.tool_budget = b.tools
            }
            if (a.unresolved)
              s.reasoning_state.unresolved = String(a.unresolved)
                .split(";")
                .map((x: string) => x.trim())
                .filter(Boolean)
            if (a.evidence_files)
              s.evidence.relevant_files = String(a.evidence_files)
                .split(";")
                .map((x: string) => x.trim())
                .filter(Boolean)
            if (!s.task.started) s.task.started = Date.now()
            dirty = true
            flush()
            return `state updated | ${s.task.complexity} explore_left=${s.limits.exploration_remaining}`
          }

          if (op === "summary") {
            const lines = [
              `objective: ${s.task.objective || "(unset)"}`,
              `complexity: ${s.task.complexity}  status: ${s.task.status}`,
              `hypothesis: ${s.reasoning_state.hypothesis || "(none)"} (${s.reasoning_state.confidence || "?"})`,
              `exploration: ${s.limits.exploration_remaining} left of ${BUDGET[s.task.complexity]?.explore ?? "?"}`,
              `files read: ${s.execution.files_read.length}  modified: ${s.execution.files_modified.length}  tool calls: ${s.meta.tool_call_count}`,
              `verified: ${s.verification.verified.length}  unresolved: ${s.reasoning_state.unresolved.length}`,
            ]
            return lines.join("\n")
          }

          return JSON.stringify(s, null, 1)
        },
      },

      state_reset: {
        description:
          "Clear working state at the start of a NEW task. Without this, stale objective/hypothesis/files from the previous task corrupt the next one.",
        args: { type: "object", properties: {} },
        async execute(args: any) {
          let complexity = args?.complexity
          if (typeof args === "string") {
            try {
              complexity = JSON.parse(args)?.complexity
            } catch {}
          }
          const s: State = JSON.parse(JSON.stringify(EMPTY))
          s.task.started = Date.now()
          if (complexity && BUDGET[complexity]) {
            s.task.complexity = complexity
            s.limits.exploration_remaining = BUDGET[complexity].explore
            s.limits.tool_budget = BUDGET[complexity].tools
          }
          cache = s
          dirty = true
          flush()
          return `state reset -> ${s.task.complexity}, ${s.limits.exploration_remaining} exploration calls available`
        },
      },
    },
  }
}) satisfies Plugin