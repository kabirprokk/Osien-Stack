import fs from "fs"
import path from "path"
import { HARNESS_ROOT, ensure } from "./v3core"

// V3 REGISTRY — the single source of truth for "what can this harness actually DO".
//
// OpenCode loses capabilities SILENTLY in several ways. Static analysis catches
// the ones we know about. This file catches the ones we DON'T, by recording
// the tools the core genuinely resolved at runtime (via the tool.definition
// hook) and the tools that genuinely executed without throwing.
//
// "source parses"  is not proof.
// "the tool answers" IS proof.

const REG_PATH = () => path.join(ensure(HARNESS_ROOT), "registry.json")

export type Registry = {
  /** tool IDs the core actually resolved (definition hook fired) */
  registered: string[]
  /** tool IDs that have been executed at least once */
  executed: string[]
  /** tool IDs that threw or returned an error status */
  errored: string[]
  /** when this snapshot was taken */
  at: number
  session_hint: string
}

const EMPTY: Registry = { registered: [], executed: [], errored: [], at: 0, session_hint: "" }

export function readRegistry(): Registry {
  try {
    return { ...EMPTY, ...JSON.parse(fs.readFileSync(REG_PATH(), "utf8")) }
  } catch {
    return { ...EMPTY }
  }
}

export function writeRegistry(r: Registry) {
  try {
    fs.writeFileSync(REG_PATH(), JSON.stringify(r, null, 1))
  } catch {}
}

const setAdd = (arr: string[], v: string, cap = 400) => {
  if (!arr.includes(v)) {
    arr.push(v)
    if (arr.length > cap) arr.splice(0, arr.length - cap)
  }
}

/** merge in a registration observation */
export function noteRegistered(toolID: string) {
  const r = readRegistry()
  if (r.registered.includes(toolID)) return
  setAdd(r.registered, toolID)
  r.at = Date.now()
  writeRegistry(r)
}

/** merge in an execution observation */
export function noteExecuted(toolID: string, ok: boolean) {
  const r = readRegistry()
  setAdd(r.executed, toolID)
  if (!ok) setAdd(r.errored, toolID)
  else {
    const i = r.errored.indexOf(toolID)
    if (i >= 0) r.errored.splice(i, 1)
  }
  r.at = Date.now()
  writeRegistry(r)
}

export function resetRegistry() {
  writeRegistry({ ...EMPTY, at: Date.now() })
}

/**
 * The only question that matters:
 *   expected  -> how many tools did we INTEND to have?
 *   registered-> how many does the core ACTUALLY resolve?
 *   executed  -> how many have proven they can run?
 */
export function capabilityReport(expected: Record<string, string[]>) {
  const r = readRegistry()
  const regSet = new Set(r.registered)
  const exeSet = new Set(r.executed)
  const errSet = new Set(r.errored)

  const rows: {
    plugin: string
    expected: number
    registered: number
    executed: number
    errored: string[]
    missing: string[]
    verdict: "OK" | "DEGRADED" | "LOST"
  }[] = []

  for (const [plugin, tools] of Object.entries(expected)) {
    const missing = tools.filter((t) => !regSet.has(t))
    const executedCount = tools.filter((t) => exeSet.has(t)).length
    const errored = tools.filter((t) => errSet.has(t))
    rows.push({
      plugin,
      expected: tools.length,
      registered: tools.length - missing.length,
      executed: executedCount,
      errored,
      missing,
      verdict: missing.length === tools.length ? "LOST" : missing.length ? "DEGRADED" : "OK",
    })
  }
  return rows
}