import type { Plugin } from "@opencode-ai/plugin"
import { noteRegistered, noteExecuted, readRegistry, resetRegistry } from "../lib/registry"

// V3.0 — REGISTRY PROBE
// Two hooks, no tools of its own to speak of. This plugin is how the harness
// learns what it can ACTUALLY do, rather than what it believes it can do.
//
//   tool.definition      -> the core resolved this tool (it exists)
//   tool.execute.after   -> it ran (or threw)
//
// Both feed lib/registry.ts, which doctor.py --runtime reads.

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()
  return {
    "tool.definition": async (input: any) => {
      try {
        noteRegistered(String(input?.toolID))
      } catch {}
    },

    "tool.execute.after": async (input: any, output: any) => {
      try {
        const id = String(input?.tool ?? "")
        if (!id || id === "registry_report") return
        const st = output?.status
        const bad = st === "error" || output?.error || /^\s*(Error|✗)/.test(String(output?.output ?? ""))
        noteExecuted(id, !bad)
      } catch {}
    },

    tool: {
      registry_report: {
        description:
          "What this harness can ACTUALLY do right now, measured at runtime: which tools the core resolved, which have executed, which have errored. Use this when you suspect a capability is missing — it reports observation, not assumption.",
        args: {
          type: "object",
          properties: {
            reset: { type: "boolean", description: "clear the observed registry first" },
          },
        },
        async execute(args: any) {
          if (args?.reset) resetRegistry()
          const r = readRegistry()
          const reg = new Set(r.registered)
          const exe = new Set(r.executed)
          const err = new Set(r.errored)
          return [
            "REGISTRY (runtime observation)",
            "project: " + DIR,
            "resolved by core: " + r.registered.length,
            "proven executable: " + r.executed.length,
            "errored at least once: " + r.errored.length,
            "",
            "RESOLVED but NEVER EXECUTED (untested):",
            ...r.registered.filter((t) => !exe.has(t)).slice(0, 40).map((t) => "  " + t),
            "",
            "ERRORED:",
            ...(r.errored.length ? r.errored.map((t) => "  " + t) : ["  none"]),
            "",
            "NOTE: a tool listed as resolved has not been proven to WORK.",
            "It is proven only after a successful call.",
          ].join("\n")
        },
      },
    },
  }
}) satisfies Plugin
