import fs from "fs"
import path from "path"
import os from "os"

// V3 shared runtime core — event bus, process registry, tool health, checkpoints.
// Kept OUT of plugin/ on purpose: a plugin module may only export `default`
// or opencode silently refuses to load it.

export const HARNESS_ROOT = path.join(os.homedir(), ".config/opencode/.v3")
export const ensure = (p: string) => {
  try {
    fs.mkdirSync(p, { recursive: true })
  } catch {}
  return p
}

export function unwrapArgs(raw: any): any {
  let a = raw
  if (typeof a === "string") {
    try { a = JSON.parse(a) } catch { a = parseArgString(a) }
  }
  for (const key of ["properties", "args", "input", "arguments"]) {
    if (a?.[key] && typeof a[key] === "object" && !Array.isArray(a[key])) return a[key]
    if (a?.[key] && typeof a[key] === "string") return parseArgString(a[key])
  }
  return a && typeof a === "object" ? a : {}
}

function parseArgString(text: string): Record<string, string> {
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed
  } catch {}
  const out: Record<string, string> = {}
  const xml = [...text.matchAll(/<([A-Za-z_][\w-]*)>([\s\S]*?)<\/\1>/g)]
  for (const m of xml) out[m[1]] = m[2].trim()
  if (xml.length) return out
  const looseXml = [...text.matchAll(/<([A-Za-z_][\w-]*)>\s*([\s\S]*?)(?=\n<|$)/g)]
  for (const m of looseXml) out[m[1]] = m[2].trim()
  if (looseXml.length) return out
  for (const part of text.split(/;\s*/)) {
    const m = part.match(/^\s*([A-Za-z_][\w-]*)\s*=\s*(?:'([^']*)'|"([^"]*)"|(.*))\s*$/)
    if (m) out[m[1]] = m[2] ?? m[3] ?? m[4] ?? ""
  }
  return out
}

// ------------------------------------------------------------------ events

export const EVENT_TYPES = [
  "FILE_CHANGED",
  "BUILD_STARTED",
  "BUILD_FINISHED",
  "BUILD_FAILED",
  "TEST_FAILED",
  "PROCESS_EXITED",
  "PROCESS_STARTED",
  "SERVER_STARTED",
  "SERVER_CRASHED",
  "PORT_CHANGED",
  "DEPENDENCY_CHANGED",
  "GIT_CHANGED",
  "HARNESS_PLUGIN_FAILED",
  "TOOL_FAILED",
  "RESOURCE_PRESSURE",
  "CHECKPOINT_CREATED",
  "ROLLBACK_COMPLETED",
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export type HarnessEvent = {
  type: EventType
  at: number
  detail: Record<string, any>
}

// Minimal emitter. We deliberately avoid Node's `events` — bundling a Node
// builtin into a plugin module makes the loader fail with no error message.
type Handler = (e: HarnessEvent) => void

class Bus {
  private log: HarnessEvent[] = []
  private seq = 0
  private handlers: Record<string, Handler[]> = {}
  private wildcards: Handler[] = []

  on(type: string, fn: Handler) {
    ;(this.handlers[type] ||= []).push(fn)
    return this
  }

  private fire(type: string, e: HarnessEvent) {
    for (const fn of this.handlers[type] || []) {
      try {
        fn(e)
      } catch {}
    }
    for (const fn of this.wildcards) {
      try {
        fn(e)
      } catch {}
    }
  }

  emitEvent(type: EventType, detail: Record<string, any> = {}) {
    const e: HarnessEvent = { type, at: Date.now(), detail: { seq: this.seq++, ...detail } }
    this.log.push(e)
    if (this.log.length > 400) this.log = this.log.slice(-300)
    try {
      const d = ensure(path.join(HARNESS_ROOT, "events"))
      fs.writeFileSync(path.join(d, "bus.json"), JSON.stringify(this.log.slice(-80), null, 1))
    } catch {}
    this.fire(type, e)
    return e
  }

  recent(limit = 20, since = 0): HarnessEvent[] {
    return this.log.filter((e) => e.at > since).slice(-limit)
  }

  /** which event types fired since a timestamp — lets the compiler ask
   *  "what changed?" instead of the model polling everything */
  summary(since = 0) {
    const r = this.recent(200, since)
    const counts: Record<string, number> = {}
    for (const e of r) counts[e.type] = (counts[e.type] || 0) + 1
    return counts
  }
}

export const bus = new Bus()

// --------------------------------------------------------- tool health
// Circuit breakers: 3 consecutive failures opens the circuit so the router
// stops exposing a broken tool instead of the agent hammering it.

export type ToolHealth = {
  tool: string
  ok: number
  fail: number
  consecutive_fail: number
  circuit: "closed" | "open" | "half-open"
  last_error: string
  last_failure_at: number
  total_ms: number
  samples: number
}

const healthPath = () => path.join(ensure(HARNESS_ROOT), "tool-health.json")

function loadHealth(): Record<string, ToolHealth> {
  try {
    return JSON.parse(fs.readFileSync(healthPath(), "utf8"))
  } catch {
    return {}
  }
}

function saveHealth(h: Record<string, ToolHealth>) {
  try {
    fs.writeFileSync(healthPath(), JSON.stringify(h, null, 1))
  } catch {}
}

const OPEN_AFTER = 3 // consecutive failures before the circuit opens
const HALF_OPEN_AFTER = 60_000 // ms before a retry is allowed

export function toolOk(tool: string, ms: number) {
  const h = loadHealth()
  const t: ToolHealth = h[tool] ?? {
    tool,
    ok: 0,
    fail: 0,
    consecutive_fail: 0,
    circuit: "closed",
    last_error: "",
    last_failure_at: 0,
    total_ms: 0,
    samples: 0,
  }
  t.ok++
  t.consecutive_fail = 0
  t.circuit = "closed"
  t.total_ms += ms
  t.samples++
  h[tool] = t
  saveHealth(h)
}

export function toolFail(tool: string, err: string, ms: number) {
  const h = loadHealth()
  const t: ToolHealth = h[tool] ?? {
    tool,
    ok: 0,
    fail: 0,
    consecutive_fail: 0,
    circuit: "closed",
    last_error: "",
    last_failure_at: 0,
    total_ms: 0,
    samples: 0,
  }
  t.fail++
  t.consecutive_fail++
  t.last_error = String(err).slice(0, 200)
  t.last_failure_at = Date.now()
  t.total_ms += ms
  t.samples++
  if (t.consecutive_fail >= OPEN_AFTER) {
    t.circuit = "open"
    bus.emitEvent("TOOL_FAILED", { tool, consecutive: t.consecutive_fail, circuit: "open", error: t.last_error })
  }
  h[tool] = t
  saveHealth(h)
}

export function circuitOf(tool: string): "closed" | "open" | "half-open" {
  const t = loadHealth()[tool]
  if (!t || t.circuit === "closed") return "closed"
  if (Date.now() - t.last_failure_at > HALF_OPEN_AFTER) return "half-open"
  return "open"
}

export function healthTable(): ToolHealth[] {
  const h = loadHealth()
  return Object.values(h)
    .map((t) => ({
      ...t,
      avg_ms: t.samples ? Math.round(t.total_ms / t.samples) : 0,
    }))
    .sort((a, b) => b.fail - a.fail) as any
}

// ------------------------------------------------------ process registry

export type Proc = {
  name: string
  pid: number
  command: string
  cwd: string
  started_at: number
  restarts: number
  max_restarts: number
  log: string
  health_url?: string
  ports?: number[]
  last_exit?: number | null
}

const procPath = () => path.join(ensure(HARNESS_ROOT), "processes.json")

export function loadProcs(): Record<string, Proc> {
  try {
    return JSON.parse(fs.readFileSync(procPath(), "utf8"))
  } catch {
    return {}
  }
}

export function saveProcs(p: Record<string, Proc>) {
  try {
    fs.writeFileSync(procPath(), JSON.stringify(p, null, 1))
  } catch {}
}

export function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// --------------------------------------------------------- file watcher
// fs.watch is unreliable on some editors (rename storms). A short-interval
// stat scan over a filtered set is boring and correct.

const SKIP =
  /(^|[\\/])(node_modules|\.git|\.godot|dist|build|out|target|__pycache__|\.venv|vendor|coverage|\.next|\.cache|\.v3)([\\/]|$)/

export function isInteresting(rel: string): boolean {
  if (SKIP.test(rel)) return false
  return /\.(ts|tsx|js|jsx|mjs|py|gd|gdshader|glsl|json|jsonc|yml|yaml|toml|html|css|scss|rs|go|java|cs|rb|php|md|sh|sql|cfg|tres)$/i.test(
    rel
  )
}

/** subsystem guess so the compiler can route an event to the right agent */
export function subsystemOf(rel: string): string {
  if (/shaders?|glsl|gdshader|\.gd$/.test(rel)) return "rendering"
  if (/test|spec/i.test(rel)) return "tests"
  if (/\.(ts|tsx|jsx)$/.test(rel)) return "app"
  if (/\.(yml|yaml|toml)$/.test(rel)) return "ci"
  if (/package(-lock)?\.json|requirements|pyproject|Godot\.godot/.test(rel)) return "dependencies"
  if (/^src\//.test(rel)) return "core"
  return "project"
}
