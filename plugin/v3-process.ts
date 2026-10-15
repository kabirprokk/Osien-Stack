import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import { spawn, execFileSync } from "child_process"
import { loadProcs, saveProcs, alive, bus, HARNESS_ROOT, ensure } from "../lib/v3core"

// V3.4 — PROCESS SUPERVISOR
// Deterministic code owns background processes. The LLM never babysits them.
// Bounded restarts: a process that dies repeatedly is marked BROKEN and is NOT
// restarted again. Infinite restart loops burn CPU and hide the real fault.

const MAX_RESTART_CAP = 5

function logPath(name: string) {
  return path.join(ensure(path.join(HARNESS_ROOT, "logs")), name + ".log")
}

const CLASSIFIERS: [RegExp, string][] = [
  [/EADDRINUSE|address already in use|already in use/i, "PORT_CONFLICT"],
  [/Cannot find module|MODULE_NOT_FOUND|ModuleNotFoundError|node_modules.*not found/i, "DEPENDENCY"],
  [/SyntaxError|Unexpected token|parse error|ParseError|Invalid or unexpected token/i, "SYNTAX"],
  [/TypeError|ReferenceError|is not a function|undefined is not/i, "TYPE"],
  [/permission denied|EACCES|Operation not permitted/i, "PERMISSION"],
  [/ENOSPC|no space left on device/i, "RESOURCE"],
  [/heap out of memory|JavaScript heap/i, "RESOURCE"],
  [/ECONNREFUSED|ENOTFOUND|ETIMEDOUT|getaddrinfo|fetch failed/i, "NETWORK"],
  [/configuration .*(missing|not found)|missing required variable/i, "CONFIG"],
]

function classifyFailure(log: string): string {
  const s = log.slice(-20_000)
  for (const [re, name] of CLASSIFIERS) if (re.test(s)) return name
  return "UNKNOWN"
}

/** pull the failure signature out of a log without shipping the whole log */
function signature(log: string, max = 30): string {
  const lines = log.split("\n").filter((l) => l.trim())
  if (lines.length <= max) return lines.join("\n")
  const SIG = /error|Error|ERROR|FATAL|failed|Failed|FAIL|panic|Traceback|Exception|assert|EADDRINUSE|ENOENT|Cannot find|not found|SyntaxError|TypeError|ReferenceError|ModuleNotFound|Segmentation/i
  const i = lines.findIndex((l) => SIG.test(l))
  if (i === -1) return "[no error signature - last lines]\n" + lines.slice(-Math.floor(max / 2)).join("\n")
  const from = Math.max(0, i - 4)
  return "[log " + lines.length + " lines, showing " + (from + 1) + "-" + (from + max) + "]\n" + lines.slice(from, from + max).join("\n")
}

async function healthCheck(url: string, timeoutMs = 3000) {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ac.signal })
    return { ok: r.status < 500, status: r.status, err: undefined as string | undefined }
  } catch (e: any) {
    return { ok: false, status: undefined as number | undefined, err: String(e?.message ?? e).slice(0, 120) }
  } finally {
    clearTimeout(t)
  }
}

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()

  function reap() {
    const all = loadProcs()
    let changed = false
    for (const p of Object.values(all)) {
      if (!alive(p.pid) && p.last_exit === undefined) {
        let log = ""
        try { log = fs.readFileSync(p.log, "utf8") } catch {}
        p.last_exit = null
        changed = true
        bus.emitEvent("PROCESS_EXITED", { name: p.name, pid: p.pid, failure: classifyFailure(log) })
      }
    }
    if (changed) saveProcs(all)
    return all
  }

  const tail = (p: any) => {
    let log = ""
    try { log = fs.readFileSync(p.log, "utf8") } catch {}
    return { log, cls: classifyFailure(log) }
  }

  return {
    tool: {
      proc_start: {
        description:
          "Start a long-running background process (dev server, watcher, test runner) with bounded automatic restarts and a log file. Use this instead of launching with & in bash - you get a PID, health checks, a restart policy and a log location back.",
        args: {
          type: "object",
          required: ["name", "command"],
          properties: {
            name: { type: "string" },
            command: { type: "string", description: "shell command, e.g. npm run dev" },
            cwd: { type: "string" },
            health_url: { type: "string", description: "e.g. http://localhost:3000 - polled for liveness" },
            max_restarts: { type: "number", description: "default 3, hard cap 5" },
          },
        },
        async execute(args: any) {
          const all = loadProcs()
          if (all[args.name] && alive(all[args.name].pid))
            return '"' + args.name + '" already running (pid ' + all[args.name].pid + '). Use proc_restart.'
          const max = Math.min(args.max_restarts ?? 3, MAX_RESTART_CAP)
          const cwd = args.cwd ? path.resolve(args.cwd) : DIR
          const log = logPath(args.name)
          const fd = fs.openSync(log, "a")
          const child = spawn("/bin/sh", ["-c", args.command], {
            cwd, detached: true, stdio: ["ignore", fd, fd], env: { ...process.env },
          })
          child.unref()
          all[args.name] = {
            name: args.name, pid: child.pid ?? -1, command: args.command, cwd,
            started_at: Date.now(), restarts: 0, max_restarts: max, log,
            health_url: args.health_url, last_exit: undefined,
          }
          saveProcs(all)
          bus.emitEvent("PROCESS_STARTED", { name: args.name, pid: child.pid })
          await new Promise((r) => setTimeout(r, 1200))
          const up = alive(child.pid ?? -1)
          const lines = [
            "started " + args.name + " pid=" + child.pid,
            "cmd: " + args.command,
            "cwd: " + cwd,
            "log: " + log,
            "restarts allowed: " + max,
            "process: " + (up ? "ALIVE" : "DEAD IMMEDIATELY"),
          ]
          if (args.health_url) {
            const h = await healthCheck(args.health_url)
            lines.push("health " + args.health_url + ": " + (h.ok ? "OK " + h.status : "FAIL " + (h.err || h.status)))
          }
          if (!up) {
            const t = tail(all[args.name])
            lines.push("failure class: " + t.cls, signature(t.log))
          }
          return lines.join("\n")
        },
      },

      proc_status: {
        description:
          "Status of every supervised process: alive or exited, restart count, health. Call this INSTEAD of running ps, or of repeatedly asking whether the server is up yet.",
        args: { type: "object", properties: { name: { type: "string", description: "one name, or omit for all" } } },
        async execute(args: any) {
          const all = reap()
          const list = args?.name ? [all[args.name]].filter(Boolean) : Object.values(all)
          if (!list.length) return "no supervised processes."
          const out: string[] = []
          for (const p of list as any[]) {
            const up = alive(p.pid)
            let health = ""
            if (p.health_url && up) {
              const h = await healthCheck(p.health_url)
              health = "  health=" + (h.ok ? "OK" : "FAIL " + (h.err || h.status))
            }
            out.push((up ? "ALIVE  " : "EXITED ") + p.name.padEnd(14) + " pid=" + String(p.pid).padEnd(7) +
              " restarts=" + p.restarts + "/" + p.max_restarts +
              " up=" + Math.round((Date.now() - p.started_at) / 1000) + "s" + health)
            if (!up) {
              const t = tail(p)
              out.push("        failure class: " + t.cls)
              out.push("        " + (p.restarts >= p.max_restarts
                ? "RESTART BUDGET EXHAUSTED - diagnose, do not restart again"
                : "restartable via proc_restart"))
            }
          }
          return out.join("\n")
        },
      },

      proc_logs: {
        description:
          "Read a supervised process log with the failure signature extracted and bulk elided. Never read the raw log file - a dev server log can be 20,000 lines.",
        args: { type: "object", required: ["name"], properties: { name: { type: "string" }, lines: { type: "number", description: "default 60" } } },
        async execute(args: any) {
          const all = loadProcs()
          const p = all[args.name]
          if (!p) return "no supervised process named " + args.name + ". Known: " + (Object.keys(all).join(", ") || "none")
          const t = tail(p)
          if (!t.log) return "log empty or unreadable: " + p.log
          const n = args.lines ?? 60
          const total = t.log.split("\n").length
          const body = total > n * 2 ? signature(t.log, n) : t.log.split("\n").slice(-n).join("\n")
          return "LOG " + p.name + " (" + total + " lines, showing ~" + n + ")\nfailure class: " + t.cls + "\n" + body
        },
      },

      proc_restart: {
        description:
          "Restart a supervised process. REFUSES when the restart budget is exhausted - that is the signal to diagnose, not to retry. Restarts never exceed max_restarts.",
        args: { type: "object", required: ["name"], properties: { name: { type: "string" }, force: { type: "boolean" } } },
        async execute(args: any) {
          const all = loadProcs()
          const p = all[args.name]
          if (!p) return "no supervised process named " + args.name
          if (alive(p.pid)) {
            try { process.kill(-p.pid, "SIGTERM") } catch { try { process.kill(p.pid, "SIGTERM") } catch {} }
            await new Promise((r) => setTimeout(r, 400))
          }
          if (p.restarts >= p.max_restarts && !args.force)
            return "REFUSED: " + p.name + " restarted " + p.restarts + "/" + p.max_restarts +
              " times. Restarting again cannot fix a deterministic fault.\nNEXT: proc_logs to classify the failure, fix the CAUSE, then proc_start fresh."
          const fd = fs.openSync(p.log, "a")
          const child = spawn("/bin/sh", ["-c", p.command], {
            cwd: p.cwd, detached: true, stdio: ["ignore", fd, fd], env: { ...process.env },
          })
          child.unref()
          p.pid = child.pid ?? -1
          p.restarts++
          p.started_at = Date.now()
          p.last_exit = undefined
          saveProcs(all)
          bus.emitEvent("PROCESS_STARTED", { name: p.name, pid: child.pid, restart: p.restarts })
          await new Promise((r) => setTimeout(r, 1200))
          const up = alive(child.pid ?? -1)
          let note = ""
          if (p.health_url) {
            const h = await healthCheck(p.health_url)
            note = "  health=" + (h.ok ? "OK " + h.status : "FAIL " + (h.err || h.status))
          }
          if (!up) {
            const t = tail(p)
            note += "\nDIED AGAIN. failure class: " + t.cls + "\n" + signature(t.log, 25)
          }
          return "restarted " + p.name + " pid=" + child.pid + " (" + p.restarts + "/" + p.max_restarts + ")" +
            (up ? "  ALIVE" : "  DEAD") + note
        },
      },

      proc_stop: {
        description: "Stop a supervised process. Safe to call on an already-stopped one.",
        args: { type: "object", required: ["name"], properties: { name: { type: "string" } } },
        async execute(args: any) {
          const all = loadProcs()
          const p = all[args.name]
          if (!p) return "no supervised process named " + args.name
          if (!alive(p.pid)) return p.name + " is already stopped (pid " + p.pid + ")."
          try { process.kill(-p.pid, "SIGTERM") } catch {
            try { process.kill(p.pid, "SIGTERM") } catch { return "could not signal pid " + p.pid }
          }
          delete all[args.name]
          saveProcs(all)
          bus.emitEvent("PROCESS_EXITED", { name: p.name, pid: p.pid, reason: "stopped_by_agent" })
          return "stopped " + p.name + " (pid " + p.pid + ")"
        },
      },

      proc_prune: {
        description: "Remove exited supervised-process records after their logs and failure evidence have been collected. Never restarts anything.",
        args: { type: "object", properties: { name: { type: "string" } } },
        async execute(args: any) {
          const all = loadProcs()
          const names = args?.name ? [String(args.name)] : Object.keys(all)
          const removed: string[] = []
          for (const name of names) {
            const p = all[name]
            if (p && !alive(p.pid)) {
              delete all[name]
              removed.push(name)
            }
          }
          saveProcs(all)
          return removed.length ? "pruned exited records: " + removed.join(", ") : "no exited records to prune"
        },
      },

      exec: {
        description:
          "Run a command with structured capture: exit code, duration, and a FAILURE SIGNATURE instead of the full log. Use for anything that might produce thousands of lines. The full log is written to disk and only a slice is returned to you.",
        args: {
          type: "object",
          required: ["command"],
          properties: {
            command: { type: "string" },
            cwd: { type: "string" },
            timeout_ms: { type: "number" },
            expect_exit: { type: "number", description: "expected exit code; a mismatch is reported as FAIL" },
          },
        },
        async execute(args: any) {
          const cwd = args.cwd ? path.resolve(args.cwd) : DIR
          const started = Date.now()
          const tmp = path.join(ensure(path.join(HARNESS_ROOT, "logs")), "exec-" + Date.now() + ".log")
          let code = 0, timedOut = false, captured = ""
          try {
            captured = execFileSync("/bin/sh", ["-c", args.command], {
              cwd, timeout: args.timeout_ms ?? 120000, encoding: "utf8",
              stdio: ["ignore", "pipe", "pipe"], maxBuffer: 200_000_000,
            }) || ""
          } catch (e: any) {
            code = typeof e?.status === "number" ? e.status : 1
            timedOut = !!(e?.killed || e?.signal === "SIGTERM")
            captured = String(e?.stdout ?? "") + String(e?.stderr ?? "")
            try { fs.writeFileSync(tmp, captured) } catch {}
          }
          const ms = Date.now() - started
          const expect = args.expect_exit ?? 0
          const pass = code === expect
          const head = [(pass ? "PASS" : "FAIL") + "  exit=" + code +
            (expect ? " (expected " + expect + ")" : "") + "  " + ms + "ms" + (timedOut ? "  TIMED OUT" : "")]
          if (!pass) {
            head.push("failure class: " + classifyFailure(captured))
            head.push("full log: " + tmp)
            head.push(signature(captured, 35))
          } else if (captured.trim()) {
            const lines = captured.trim().split("\n")
            head.push(lines.length > 25
              ? "[PASS - last 25 of " + lines.length + " lines]\n" + lines.slice(-25).join("\n")
              : captured.trim())
          }
          return head.join("\n")
        },
      },
    },
  }
}) satisfies Plugin
