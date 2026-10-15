import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import os from "os"
import { execFileSync } from "child_process"
import {
  HARNESS_ROOT,
  ensure,
  bus,
  circuitOf,
  healthTable,
  toolFail,
  toolOk,
  loadProcs,
  alive,
  unwrapArgs,
} from "../lib/v3core"
import { readRegistry } from "../lib/registry"

// V3 PHASE B — immune system.
// Deterministic probes outrank model claims. Broken tools stop receiving calls.

const EXEMPT = new Set(["registry_report", "watchdog_status", "verify_claim"])
const started = new Map<string, number>()

function sh(command: string, cwd = process.cwd()) {
  try {
    return execFileSync("/bin/sh", ["-c", command], {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 2_000_000,
    }).trim()
  } catch {
    return ""
  }
}

function fileExists(p: string) {
  try {
    return fs.existsSync(p)
  } catch {
    return false
  }
}

type Verdict = "CONFIRMED" | "CONTRADICTED" | "UNKNOWN"

function verifyClaim(claim: string, dir: string): { verdict: Verdict; evidence: string } {
  const c = claim.toLowerCase()
  const registry = readRegistry()
  const tool = c.match(/(?:tool|function)\s+[`'" ]?([a-z][a-z0-9_-]+)/)?.[1]
  if (tool && /(broken|doesn't work|not available|missing)/.test(c)) {
    const state = circuitOf(tool)
    const seen = registry.registered.includes(tool)
    if (state === "open") return { verdict: "CONFIRMED", evidence: `${tool} circuit is OPEN after repeated failures` }
    if (seen) return { verdict: "CONTRADICTED", evidence: `${tool} is runtime-registered; circuit=${state}` }
    return { verdict: "UNKNOWN", evidence: `${tool} was not observed in the runtime registry` }
  }

  if (/(build|compile|typecheck)\s+(passed|succeeded|is green)/.test(c)) {
    const marker = sh("git status --porcelain", dir)
    const recent = sh("find . -maxdepth 3 -type f -mmin -5 -print | head -20", dir)
    return recent || marker
      ? { verdict: "UNKNOWN", evidence: "machine found recent activity but no build result was supplied; run verify_chain" }
      : { verdict: "UNKNOWN", evidence: "no deterministic build result available" }
  }

  if (/(tests?|test suite)\s+(passed|failed|fail)/.test(c)) {
    return { verdict: "UNKNOWN", evidence: "claim verifier requires the recorded verify_chain result" }
  }

  if (/(file|path) .*does not exist|file .*missing/.test(c)) {
    const quoted = claim.match(/[`'"`]([^`'"`]+)[`'"`]/)?.[1]
    if (!quoted) return { verdict: "UNKNOWN", evidence: "no quoted path to probe" }
    const p = path.isAbsolute(quoted) ? quoted : path.join(dir, quoted)
    return fileExists(p)
      ? { verdict: "CONTRADICTED", evidence: `exists: ${p}` }
      : { verdict: "CONFIRMED", evidence: `missing: ${p}` }
  }

  if (/(server|process) .*running|server is up/.test(c)) {
    const procs = Object.values(loadProcs())
    const live = procs.filter((p) => alive(p.pid))
    return live.length
      ? { verdict: "CONFIRMED", evidence: live.map((p) => `${p.name}:${p.pid}`).join(", ") }
      : { verdict: "CONTRADICTED", evidence: "no supervised process is alive" }
  }

  if (/(port|address) .*occupied|port .*in use/.test(c)) {
    const port = claim.match(/port\s+(\d+)/)?.[1]
    if (!port) return { verdict: "UNKNOWN", evidence: "no port number to probe" }
    const result = sh(`ss -ltn 2>/dev/null | grep -E ':${port}[[:space:]]'`)
    return result
      ? { verdict: "CONFIRMED", evidence: result.slice(0, 300) }
      : { verdict: "CONTRADICTED", evidence: `no listener found on port ${port}` }
  }

  return { verdict: "UNKNOWN", evidence: "claim has no safe deterministic probe" }
}

function watchdog(dir: string) {
  const checks: { name: string; state: string; evidence: string }[] = []
  const registry = readRegistry()
  checks.push({
    name: "tool_registry",
    state: registry.registered.length ? "HEALTHY" : "FAILED",
    evidence: `${registry.registered.length} registered, ${registry.executed.length} executed, ${registry.errored.length} errored`,
  })
  const stateDir = path.join(os.homedir(), ".config/opencode/.state")
  checks.push({ name: "working_state", state: fileExists(stateDir) ? "HEALTHY" : "DEGRADED", evidence: stateDir })
  checks.push({
    name: "event_bus",
    state: fileExists(path.join(HARNESS_ROOT, "events", "bus.json")) ? "HEALTHY" : "DEGRADED",
    evidence: path.join(HARNESS_ROOT, "events", "bus.json"),
  })
  const procs = Object.values(loadProcs())
  const dead = procs.filter((p) => !alive(p.pid) && p.restarts < p.max_restarts)
  checks.push({ name: "process_supervisor", state: dead.length ? "DEGRADED" : "HEALTHY", evidence: `${procs.length} tracked, ${dead.length} unexpected exits` })
  const mem = sh("free -m | awk '/Mem:/{print $7}'")
  checks.push({ name: "resources", state: Number(mem) < 500 ? "DEGRADED" : "HEALTHY", evidence: `${mem || "?"} MB available` })
  const open = healthTable().filter((t) => t.circuit === "open")
  checks.push({ name: "circuits", state: open.length ? "DEGRADED" : "HEALTHY", evidence: open.map((t) => t.tool).join(", ") || "none open" })
  const failed = checks.filter((c) => c.state === "FAILED")
  const degraded = checks.filter((c) => c.state === "DEGRADED")
  const overall = failed.length ? "FAILED" : degraded.length ? "DEGRADED" : "HEALTHY"
  return { overall, checks, at: new Date().toISOString(), project: dir }
}

function recover(dir: string) {
  const recoveryFile = path.join(ensure(HARNESS_ROOT), "recovery.json")
  let record: { attempts: number; window: number } = { attempts: 0, window: Date.now() }
  try {
    record = { ...record, ...JSON.parse(fs.readFileSync(recoveryFile, "utf8")) }
  } catch {}
  if (Date.now() - record.window > 10 * 60_000) record = { attempts: 0, window: Date.now() }
  if (record.attempts >= 2) {
    return { state: "FAILED", action: "STOPPED", evidence: "recovery budget exhausted (2 attempts per 10 minutes)" }
  }
  record.attempts++
  fs.writeFileSync(recoveryFile, JSON.stringify(record, null, 1))
  const repaired: string[] = []
  for (const d of [HARNESS_ROOT, path.join(HARNESS_ROOT, "events"), path.join(HARNESS_ROOT, "logs"), path.join(os.homedir(), ".config/opencode/.state")]) {
    if (!fileExists(d)) {
      ensure(d)
      repaired.push(d)
    }
  }
  const after = watchdog(dir)
  bus.emitEvent("HARNESS_PLUGIN_FAILED", { kind: "recovery_attempt", repaired, overall: after.overall })
  return { state: after.overall === "HEALTHY" ? "HEALTHY" : "DEGRADED", repaired, checks: after.checks, attempts: record.attempts }
}

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()
  return {
    "tool.execute.before": async (input: any) => {
      const tool = String(input?.tool || "")
      if (!tool || EXEMPT.has(tool)) return
      const circuit = circuitOf(tool)
      if (circuit === "open") throw new Error(`circuit open for ${tool}; use a fallback or wait for half-open cooldown`)
      started.set(tool, Date.now())
    },

    "tool.execute.after": async (input: any, output: any) => {
      const tool = String(input?.tool || "")
      if (!tool || EXEMPT.has(tool)) return
      const ms = Date.now() - (started.get(tool) || Date.now())
      started.delete(tool)
      const text = String(output?.output ?? output?.result ?? "")
      const failed = output?.status === "error" || !!output?.error || /^\s*(Error|✗)/.test(text)
      if (failed) toolFail(tool, text.slice(0, 200), ms)
      else toolOk(tool, ms)
    },

    "experimental.text.complete": async (_input: any, output: any) => {
      try {
        const text = String(output?.text || "")
        const claims = text.match(/[^.!?]*(?:tool|server|process|build|tests?|file|port|patch)[^.!?]*(?:broken|failed|passed|running|missing|does not exist|not available|zero references)[^.!?]*[.!?]/gi) || []
        const corrections: string[] = []
        for (const claim of claims.slice(0, 3)) {
          const result = verifyClaim(claim, DIR)
          if (result.verdict !== "UNKNOWN") {
            corrections.push(`[CLAIM ${result.verdict}] ${result.evidence}`)
            bus.emitEvent("TOOL_FAILED", { kind: "claim", claim: claim.slice(0, 160), verdict: result.verdict, evidence: result.evidence })
          }
        }
        if (corrections.length && !text.includes("[CLAIM ")) output.text = text + "\n\nObserved evidence:\n" + corrections.join("\n")
      } catch {}
    },

    tool: {
      watchdog_status: {
        description: "Run deterministic health checks for the runtime nervous system. Returns HEALTHY, DEGRADED, or FAILED with evidence.",
        args: { type: "object", properties: { project: { type: "string" } } },
        async execute(args: any) {
          const a = unwrapArgs(args)
          return JSON.stringify(watchdog(a?.project ? path.resolve(a.project) : DIR), null, 1)
        },
      },
      watchdog_recover: {
        description: "Perform one bounded, safe runtime repair: recreate missing harness directories and re-check health. It never loops, kills processes, or claims recovery without a fresh watchdog result.",
        args: { type: "object", properties: { project: { type: "string" } } },
        async execute(args: any) {
          const a = unwrapArgs(args)
          return JSON.stringify(recover(a?.project ? path.resolve(a.project) : DIR), null, 1)
        },
      },
      verify_claim: {
        description: "Verify a machine-checkable model claim against filesystem, process, port, registry, or recorded verification evidence. Observed truth outranks the claim.",
        args: {
          type: "object",
          required: ["claim"],
          properties: { claim: { type: "string" }, project: { type: "string" } },
        },
        async execute(args: any) {
          const a = unwrapArgs(args)
          const claim = String(a?.claim || "")
          const result = verifyClaim(claim, a?.project ? path.resolve(a.project) : DIR)
          bus.emitEvent("TOOL_FAILED", { kind: "claim", claim: claim.slice(0, 120), verdict: result.verdict, evidence: result.evidence })
          return `${result.verdict}\nclaim: ${claim}\nevidence: ${result.evidence}`
        },
      },
      circuit_status: {
        description: "Show tool circuit health and cooldown state. OPEN tools must not be hammered; use a fallback.",
        args: { type: "object", properties: { tool: { type: "string" } } },
        async execute(args: any) {
          const a = unwrapArgs(args)
          const rows = healthTable().filter((t) => !a?.tool || t.tool === a.tool)
          if (!rows.length) return "no health samples recorded"
          return rows.map((t) => `${t.tool} ${t.circuit.toUpperCase()} ok=${t.ok} fail=${t.fail} consecutive=${t.consecutive_fail} avg_ms=${(t as any).avg_ms || 0} last=${t.last_error || "none"}`).join("\n")
        },
      },
      circuit_reset: {
        description: "Close a tool circuit only after a human or deterministic probe establishes that the tool is healthy again.",
        args: { type: "object", required: ["tool"], properties: { tool: { type: "string" } } },
        async execute(args: any) {
          const a = unwrapArgs(args)
          const name = String(a?.tool || "")
          if (!name) return "tool is required"
          toolOk(name, 0)
          return `circuit reset to CLOSED for ${name}; run one real probe and verify the result`
        },
      },
    },
  }
}) satisfies Plugin
