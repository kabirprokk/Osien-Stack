import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import os from "os"
import { ensure, HARNESS_ROOT, bus } from "../lib/v3core"

// V3 PHASE E — unified trace. Every subsystem writes to one append-only JSONL
// stream, so benchmark.py can compare stock/V1/V2/V3 without guessing.

const tracePath = () => path.join(ensure(HARNESS_ROOT), "telemetry.jsonl")

function emit(kind: string, data: Record<string, any>) {
  try {
    fs.appendFileSync(tracePath(), JSON.stringify({ at: new Date().toISOString(), kind, ...data }) + "\n")
  } catch {}
}

function read(limit = 100) {
  try {
    return fs.readFileSync(tracePath(), "utf8").trim().split("\n").filter(Boolean).slice(-limit).map((x) => JSON.parse(x))
  } catch { return [] }
}

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()
  const starts = new Map<string, number>()
  return {
    "chat.params": async (input: any) => {
      emit("model_call", { session: input?.sessionID, agent: input?.agent, model: input?.model?.id || input?.model?.modelID || "unknown", project: DIR })
    },
    "tool.execute.before": async (input: any) => {
      const id = String(input?.tool || "")
      starts.set(id, Date.now())
      emit("tool_start", { tool: id, args: input?.args || {} })
    },
    "tool.execute.after": async (input: any, output: any) => {
      const id = String(input?.tool || "")
      const ms = Date.now() - (starts.get(id) || Date.now())
      starts.delete(id)
      const text = String(output?.output ?? output?.result ?? "")
      emit("tool_finish", { tool: id, latency_ms: ms, ok: output?.status !== "error" && !output?.error, result_chars: text.length })
    },
    event: async ({ event }: any) => {
      if (event?.type) emit("bus_event", { event: event.type, properties: event.properties || {} })
    },
    tool: {
      telemetry_status: {
        description: "Show compact unified telemetry counts and recent actions for this project.",
        args: { type: "object", properties: { limit: { type: "number" } } },
        async execute(args: any) {
          const rows = read(Math.min(args?.limit || 40, 200))
          const counts: Record<string, number> = {}
          for (const r of rows) counts[r.kind] = (counts[r.kind] || 0) + 1
          return JSON.stringify({ project: DIR, file: tracePath(), counts, recent: rows.slice(-12) }, null, 1)
        },
      },
      telemetry_export: {
        description: "Export a bounded telemetry trace path and summary; full raw events remain on disk outside model context.",
        args: { type: "object", properties: {} },
        async execute() {
          const rows = read(500)
          emit("export", { rows: rows.length })
          bus.emitEvent("BUILD_FINISHED", { kind: "telemetry_export", rows: rows.length })
          return `telemetry: ${tracePath()}\nrecent events: ${rows.length}\nfull trace remains outside context`
        },
      },
    },
  }
}) satisfies Plugin
