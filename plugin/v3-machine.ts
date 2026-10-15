import type { Plugin } from "@opencode-ai/plugin"
import path from "path"
import { execFileSync } from "child_process"
import { loadProcs, alive, bus, healthTable, HARNESS_ROOT } from "../lib/v3core"

// V3.2 — MACHINE STATE ENGINE
// One structured call instead of the model shelling out to uname/free/df/ps/
// git status/which… six times and guessing. Everything is filtered and
// compressed BEFORE it reaches the model.

const sh = (c: string): string => {
  try {
    return execFileSync("/bin/sh", ["-c", c], {
      timeout: 4000,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 8_000_000,
    }).trim()
  } catch {
    return ""
  }
}

const cmd = {
  uptimeM: "awk '{print int($1/60)}' /proc/uptime",
  load: "awk '{print $1\" \"$2\" \"$3}' /proc/loadavg",
  cores: "nproc",
  mem: "free -m | awk '/Mem:/{print $3\"/\"$2\" used, \"$7\" avail\"}'",
  memAvail: "free -m | awk '/Mem:/{print $7}'",
  diskFree: (d: string) => "df -h '" + d + "' | awk 'NR==2{print $4\" free of \"$2\" (\"$5\")\"}'",
  diskPct: (d: string) => "df -P '" + d + "' | awk 'NR==2{gsub(/%/,\"\",$5); print $5}'",
  isRepo: (d: string) => "git -C '" + d + "' rev-parse --is-inside-work-tree 2>/dev/null",
  branch: (d: string) => "git -C '" + d + "' branch --show-current",
  status: (d: string) => "git -C '" + d + "' status --porcelain | head -20",
  log: (d: string) => "git -C '" + d + "' log --oneline -3",
  procs: "ps -eo pid,etimes,args --no-headers 2>/dev/null | head -400",
}

const SERVERISH =
  /vite|next dev|nuxt|gatsby|node .*(server|dev|app)\.|nodemon|uvicorn|gunicorn|flask run|rails s|php -S|http-server|live-server|wrangler dev|astro dev/i

const BUILDERISH =
  /\b(tsc|vite build|next build|webpack|rollup|esbuild|cargo build|go build|make|ninja|pytest|jest|vitest|playwright|cypress)\b/i

const OURSELF = /--agent|machines\/bench|doctor\.py|opencode run/

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()

  return {
    tool: {
      machine_state: {
        description:
          "Structured snapshot of the real machine: OS, resources, git, dev servers, build processes, toolchain, harness health. Compressed and filtered. Call this instead of running a dozen shell commands — it is OBSERVED TRUTH and outranks anything the model believes.",
        args: {
          type: "object",
          properties: {
            section: {
              type: "string",
              description: "all (default) | system | resources | git | processes | toolchain | harness",
            },
            project: { type: "string" },
          },
        },
        async execute(args: any) {
          const dir = args?.project ? path.resolve(args.project) : DIR
          const want = args?.section || "all"
          const all = want === "all"
          const out: string[] = ["MACHINE STATE " + new Date().toISOString().slice(11, 19) + "Z"]

          if (all || want === "system") {
            out.push("", "[system]")
            out.push("os: " + process.platform + " " + process.arch + " node " + process.version)
            out.push("shell: " + (process.env.SHELL || "?") + "  uptime: " + (sh(cmd.uptimeM) || "?") + "m")
            out.push("cwd: " + dir)
          }

          if (all || want === "resources") {
            const cores = parseInt(sh(cmd.cores) || "1")
            const diskPct = parseInt(sh(cmd.diskPct(dir)) || "0")
            const avail = parseInt(sh(cmd.memAvail) || "999999")
            const load = sh(cmd.load)
            const loadNum = parseFloat(load) || 0
            let pressure = "ok"
            if (diskPct > 92) pressure = "DISK CRITICAL"
            else if (avail < 500) pressure = "MEMORY CRITICAL"
            else if (loadNum > cores * 1.5) pressure = "CPU SATURATED"

            out.push("", "[resources]")
            out.push("ram: " + (sh(cmd.mem) || "?") + " MB")
            out.push("cpu: " + cores + " cores, load " + load)
            out.push("disk: " + (sh(cmd.diskFree(dir)) || "?"))
            out.push("pressure: " + pressure)
            if (pressure !== "ok") bus.emitEvent("RESOURCE_PRESSURE", { level: pressure, dir })
          }

          if (all || want === "git") {
            out.push("", "[git]")
            if (sh(cmd.isRepo(dir)) === "true") {
              const br = sh(cmd.branch(dir)) || "?"
              const st = sh(cmd.status(dir))
              const n = st ? st.split("\n").length : 0
              out.push("branch: " + br + "   dirty: " + n + " file(s)")
              if (st) out.push(st.split("\n").map((l) => "  " + l).join("\n"))
              const lg = sh(cmd.log(dir))
              if (lg) out.push("recent: " + lg.split("\n").join(" | "))
              if (n) bus.emitEvent("GIT_CHANGED", { branch: br, dirty: n })
            } else {
              out.push("not a repository — no diff baseline, rollback needs filesystem checkpoints")
            }
          }

          if (all || want === "processes") {
            const sup = loadProcs()
            const managed = Object.values(sup).filter((p) => alive(p.pid))
            const dead = Object.values(sup).filter((p) => !alive(p.pid))
            const servers: string[] = []
            const builds: string[] = []
            for (const l of sh(cmd.procs).split("\n")) {
              if (!l.trim() || OURSELF.test(l)) continue
              if (SERVERISH.test(l)) servers.push(l.trim().slice(0, 140))
              else if (BUILDERISH.test(l)) builds.push(l.trim().slice(0, 140))
            }
            out.push("", "[processes]")
            out.push("supervised: " + managed.length + " alive, " + dead.length + " exited")
            for (const p of managed)
              out.push(
                "  ALIVE " + p.name + " pid=" + p.pid + " restarts=" + p.restarts + "/" + p.max_restarts +
                " up=" + Math.round((Date.now() - p.started_at) / 1000) + "s"
              )
            for (const p of dead) out.push("  EXITED " + p.name + " pid=" + p.pid + " code=" + (p.last_exit ?? "?") + " log=" + p.log)
            out.push("dev servers (" + servers.length + "):")
            out.push(servers.slice(0, 6).map((s) => "  " + s).join("\n") || "  none")
            out.push("build/test now (" + builds.length + "):")
            out.push(builds.slice(0, 4).map((s) => "  " + s).join("\n") || "  none")
          }

          if (all || want === "toolchain") {
            const rt = ["node", "npm", "pnpm", "yarn", "bun", "python3", "pip", "go", "cargo", "rustc",
                        "java", "dotnet", "godot", "docker", "git", "rg"].filter((c) =>
              sh("command -v " + c + " >/dev/null 2>&1 && echo y") === "y"
            )
            const markers = [["node", "package.json"], ["python", "pyproject.toml"], ["godot", "project.godot"],
                             ["rust", "Cargo.toml"], ["go", "go.mod"]]
              .filter((m) => {
                try {
                  return require("fs").existsSync(path.join(dir, m[1]))
                } catch {
                  return false
                }
              })
              .map((m) => m[0] + "(" + m[1] + ")")
            out.push("", "[toolchain] " + (rt.join(" ") || "none"))
            out.push("project markers: " + (markers.join(", ") || "none in this dir"))
          }

          if (all || want === "harness") {
            const ht = healthTable() as any[]
            const open = ht.filter((t) => t.circuit === "open")
            out.push("", "[harness] " + HARNESS_ROOT)
            out.push("tools tracked: " + ht.length + "   circuits OPEN: " + open.length)
            for (const t of open)
              out.push("  OPEN " + t.tool + ": " + t.consecutive_fail + " consecutive failures - " + t.last_error)
            if (open.length) out.push("  Do NOT call those tools. Use the fallback, then circuit_check.")
            const counts = bus.summary(Date.now() - 300000)
            const pairs = Object.entries(counts).map((e) => e[0] + "x" + e[1])
            out.push("events (last 5m): " + (pairs.join(" ") || "none"))
          }

          return out.join("\n")
        },
      },

      watch: {
        description:
          "Detect real file changes under the project and emit FILE_CHANGED events with an inferred subsystem. Use instead of re-running git status or ls to find out what changed.",
        args: {
          type: "object",
          properties: {
            dir: { type: "string" },
            save: { type: "boolean", description: "store the snapshot as the new baseline (default true)" },
          },
        },
        async execute(args: any) {
          const dir = args?.dir ? path.resolve(args.dir) : DIR
          const fs = await import("fs")
          const snapPath = path.join(HARNESS_ROOT, "watch-" + path.basename(dir) + ".json")
          const RE = /\.(ts|tsx|js|jsx|py|gd|gdshader|glsl|json|yml|yaml|toml|html|css|rs|go|md|sh|cfg|tres)$/i
          const SKIP = /(^|[\\/])(node_modules|\.git|\.godot|dist|build|out|__pycache__|\.venv|coverage|\.next)([\\/]|$)/

          const scan = (): Record<string, number> => {
            const m: Record<string, number> = {}
            const stack = [dir]
            let n = 0
            while (stack.length && n < 6000) {
              const d = stack.pop()!
              let ents: fs.Dirent[] = []
              try {
                ents = fs.readdirSync(d, { withFileTypes: true })
              } catch {
                continue
              }
              for (const e of ents) {
                if (n > 6000) break
                const full = path.join(d, e.name)
                const rel = path.relative(dir, full)
                if (SKIP.test(rel)) continue
                if (e.isDirectory()) stack.push(full)
                else if (RE.test(e.name)) {
                  try {
                    m[rel] = fs.statSync(full).mtimeMs
                    n++
                  } catch {}
                }
              }
            }
            return m
          }

          const now = scan()
          let prev: Record<string, number> = {}
          try {
            prev = JSON.parse(fs.readFileSync(snapPath, "utf8"))
          } catch {}
          if (!Object.keys(prev).length) prev = now // first run establishes the baseline

          const changed: { file: string; kind: string }[] = []
          for (const f of Object.keys(now)) {
            if (prev[f] === undefined) changed.push({ file: f, kind: "created" })
            else if (prev[f] < now[f]) changed.push({ file: f, kind: "modified" })
          }
          for (const f of Object.keys(prev)) if (now[f] === undefined) changed.push({ file: f, kind: "deleted" })

          if (args?.save !== false) {
            try {
              fs.mkdirSync(path.dirname(snapPath), { recursive: true })
              fs.writeFileSync(snapPath, JSON.stringify(now))
            } catch {}
          }

          for (const c of changed.slice(0, 25)) {
            bus.emitEvent("FILE_CHANGED", {
              file: c.file,
              kind: c.kind,
              subsystem: /shader|glsl|\.gd$/.test(c.file)
                ? "rendering"
                : /test|spec/i.test(c.file)
                  ? "tests"
                  : "project",
            })
          }

          if (!changed.length) return "no changes under " + path.basename(dir) + " (" + Object.keys(now).length + " files watched). Nothing to re-check."
          const head = changed.slice(0, 25).map((c) => "  " + c.kind.padEnd(9) + c.file).join("\n")
          const more = changed.length > 25 ? "\n... +" + (changed.length - 25) + " more" : ""
          return changed.length + " file(s) changed:\n" + head + more +
            "\nNEXT: read only these files, only the relevant ranges."
        },
      },

      events: {
        description:
          "Read harness events (file changes, process exits, build results, resource pressure) from the last N seconds. Call this INSTEAD of polling 'check status' repeatedly — no events means nothing changed.",
        args: {
          type: "object",
          properties: {
            since_seconds: { type: "number" },
            type: { type: "string", description: "filter to one event type" },
          },
        },
        async execute(args: any) {
          const secs = args?.since_seconds ?? 300
          let r = bus.recent(30, Date.now() - secs * 1000)
          if (args?.type) r = r.filter((e) => e.type === args.type)
          if (!r.length) return "no events in the last " + secs + "s — nothing changed, nothing to re-check."
          return r
            .map((e) => Math.round((Date.now() - e.at) / 1000) + "s ago  " + e.type + "  " + JSON.stringify(e.detail).slice(0, 150))
            .join("\n")
        },
      },
    },
  }
}) satisfies Plugin