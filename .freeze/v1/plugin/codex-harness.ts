import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import os from "os"
import { execFile } from "child_process"

const HOME = os.homedir()
const MEM_ROOT = path.join(HOME, ".config/opencode/memory/projects")

// CODEX HARNESS — the Astra trick: persistent project memory + surgical reads.
// Goal: replace "read 70 files" with "recall 1 memory, read 3 slices".

const slug = (d: string) =>
  path.basename(d).replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase() || "root"

const memPath = (d: string) => path.join(MEM_ROOT, slug(d) + ".md")

// Memory is SPLIT so a Builder never receives the Playbook of an Architect.
// Retrieval is selective: you ask for the parts you need, not all of them.
const SECTIONS = [
  "ARCHITECTURE",
  "DECISIONS",
  "FAILURES",
  "STATE",
  "PERFORMANCE",
] as const

// which memory parts each role actually needs
const PART_NEEDS: Record<string, string[]> = {
  scout: ["ARCHITECTURE"],
  builder: ["ARCHITECTURE", "DECISIONS"],
  planner: ["ARCHITECTURE", "DECISIONS", "FAILURES", "STATE", "PERFORMANCE"],
  debugger: ["FAILURES", "STATE"],
  reviewer: ["DECISIONS", "FAILURES"],
  "kit-scout": ["ARCHITECTURE"],
  "kit-build": ["ARCHITECTURE", "DECISIONS"],
}

// Models and some clients hand args flat, wrapped in {properties:{...}}, or as a
// JSON string. Unwrap all three or lookups silently miss and tools return empty.
function unwrap(raw: any): any {
  let a = raw
  if (typeof a === "string") {
    try {
      a = JSON.parse(a)
    } catch {
      a = {}
    }
  }
  for (const k of ["properties", "args", "input", "arguments"]) {
    if (a?.[k] && typeof a[k] === "object" && !Array.isArray(a[k])) {
      a = a[k]
      break
    }
  }
  return a && typeof a === "object" ? a : {}
}

function memDir(d: string) {
  return path.join(MEM_ROOT, slug(d))
}
function partFile(d: string, sec: string) {
  return path.join(memDir(d), sec.toLowerCase() + ".md")
}
function header(d: string, sec: string) {
  return `# ${sec} — ${path.basename(d)}\n_path: ${d}\n> ctx_recall ${sec.toLowerCase()} | written by ctx_save ${sec.toLowerCase()}\n`
}
function render(d: string, sec: string, body: string): string {
  return header(d, sec) + (body || "- (empty)").trim() + "\n"
}

function readPart(dir: string, sec: string): string {
  const p = partFile(dir, sec)
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : ""
  } catch {
    return ""
  }
}

// selective: which parts does this role need?
function readFor(dir: string, role?: string, only?: string): string {
  const want = only
    ? SECTIONS.filter((x) => only.toUpperCase().includes(x.slice(0, 4)))
    : SECTIONS.filter((x) => (PART_NEEDS[role || "scout"] ?? SECTIONS).includes(x))
  const got = want.map((sec) => readPart(dir, sec)).filter(Boolean)
  if (!got.length) return ""
  return got.join("\n")
}

// ---- surgical helpers -------------------------------------------------

const SKIP_DIR = /(node_modules|\.git|\.godot|dist|build|\.next|__pycache__|\.venv|vendor|coverage)/

function walk(root: string, maxFiles = 4000): string[] {
  const out: string[] = []
  const stack = [root]
  while (stack.length && out.length < maxFiles) {
    const d = stack.pop()!
    let ents: fs.Dirent[] = []
    try {
      ents = fs.readdirSync(d, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of ents) {
      const full = path.join(d, e.name)
      if (e.isDirectory()) {
        if (!SKIP_DIR.test(e.name) && !e.name.startsWith(".")) stack.push(full)
      } else out.push(full)
    }
  }
  return out
}

const TEXTY = /\.(ts|tsx|js|jsx|mjs|cjs|py|gd|sh|json|jsonc|md|yml|yaml|toml|html|css|scss|glsl|gdshader|tres|cfg|sql|svg)$/

function sh(cmd: string[], cwd: string, ms = 9000): Promise<string> {
  return new Promise((res) => {
    execFile(cmd[0], cmd.slice(1), { cwd, timeout: ms, maxBuffer: 20_000_000 }, (e, o, er) =>
      res(String(o || er || (e ? "" : "")))
    )
  })
}

export default (async ({ client, directory }: any) => {
  const DIR = directory || process.cwd()

  async function lspErrors(): Promise<string> {
    // Try every plausible SDK shape; never throw.
    try {
      const paths = (await sh(["git", "ls-files"], DIR)) || ""
      const files = paths.split("\n").filter((f) => TEXTY.test(f)).slice(0, 60)
      const found: string[] = []
      for (const f of files) {
        try {
          const r =
            (await client?.app?.lsp?.diagnostics?.({ path: path.join(DIR, f), pathID: f })) ??
            (await client?.lsp?.diagnostics?.({ path: path.join(DIR, f), pathID: f }))
          const diags = Array.isArray(r) ? r : r?.diagnostics ?? []
          for (const d of diags) {
            const sev = d.severity === 1 ? "ERR" : d.severity === 2 ? "warn" : "info"
            if (d.severity === 4) continue // hint, pure noise
            found.push(`${f}:${(d.range?.start?.line ?? 0) + 1} ${sev} ${d.message}`)
          }
        } catch {}
        if (found.length > 40) break
      }
      return found.join("\n")
    } catch {
      return ""
    }
  }

  return {
    tool: {
      // ----------------------------------------------------------------
      ctx_recall: {
        description:
          "Load PROJECT MEMORY, selectively. Pass role= to get only what that specialist needs (scout gets architecture, builder gets architecture+decisions, debugger gets failures+state, reviewer gets decisions+failures). Omit role for everything. This is the Astra move: start the turn already-informed instead of re-reading the repo or an old 100k chat.",
        args: {
          type: "object",
          properties: {
            role: {
              type: "string",
              description: "scout | builder | planner | debugger | reviewer — selects which parts to load",
            },
            part: {
              type: "string",
              description: "single part: architecture | decisions | failures | state | performance",
            },
            grep: { type: "string", description: "filter returned lines by regex" },
          },
        },
        async execute(raw: any) {
          const args = unwrap(raw)
          const md = args.part ? readPart(DIR, String(args.part).toUpperCase()) : readFor(DIR, args.role)
          if (!md)
            return `NO MEMORY for ${path.basename(DIR)} (${args?.part ?? args?.role ?? "all"}). Build it with ctx_save — highest-leverage token move there is.`
          if (args?.grep) {
            const re = new RegExp(args.grep, "i")
            const hits = md.split("\n").filter((l) => re.test(l))
            return hits.length ? hits.join("\n") : `no memory line matches /${args.grep}/`
          }
          return md
        },
      },

      // ----------------------------------------------------------------
      ctx_save: {
        description:
          "Persist engineering memory for this project, split into five parts so nobody downloads what they do not need. architecture=how it is built. decisions=why it is built that way. failures=things already tried that FAILED (so nobody retries them). state=what is in flight right now. performance=measured numbers (fps, sizes, timings). Overwrites only the parts you pass.",
        args: {
          type: "object",
          properties: {
            architecture: { type: "string", description: "dirs, subsystems, file roles — the map" },
            decisions: { type: "string", description: "why the design is this way, and what was rejected" },
            failures: { type: "string", description: "approach -> result -> WHY it failed -> do-not-retry" },
            state: { type: "string", description: "current objective, in-flight work, blockers" },
            performance: { type: "string", description: "measured numbers only: 60->24 FPS, 340MB, 1.2s" },
          },
        },
        async execute(raw: any) {
          const args = unwrap(raw)
          fs.mkdirSync(memDir(DIR), { recursive: true })
          const wrote: string[] = []
          for (const sec of SECTIONS) {
            const key = sec.toLowerCase()
            const v = args[key]
            const body = typeof v === "string" ? v : v == null ? "" : JSON.stringify(v)
            if (!body.trim()) continue
            fs.writeFileSync(partFile(DIR, sec), render(DIR, sec, body))
            wrote.push(key)
          }
          if (!wrote.length)
            return `ERROR: nothing to write. Pass at least one of: architecture, decisions, failures, state, performance — as named top-level arguments.`
          return `memory written: ${wrote.join(", ")}
-> ${memDir(DIR)}/
NEXT SESSION: ctx_recall starts warm. Only the needed parts load.`
        },
      },

      // ----------------------------------------------------------------
      smart_grep: {
        description:
          "Regex search that returns ONLY file:line:match — never whole files, never context dumps. 10x cheaper than grep. The default search tool of this harness.",
        args: {
          type: "object",
          required: ["pattern"],
          properties: {
            pattern: { type: "string", description: "regex" },
            glob: { type: "string", description: "file filter, e.g. *.gd or *.ts" },
            path: { type: "string", description: "subdir to limit to" },
            max: { type: "number", description: "max hits (default 40)" },
            ignorecase: { type: "boolean" },
          },
        },
        async execute(args: any) {
          const max = Math.min(args?.max ?? 40, 200)
          const root = args?.path ? path.join(DIR, args.path) : DIR
          const files = walk(root).filter((f) => {
            if (!TEXTY.test(f)) return false
            if (args?.glob) {
              const g = args.glob.replace("*", "")
              if (!f.endsWith(g)) return false
            }
            return true
          })
          let re: RegExp
          try {
            re = new RegExp(args.pattern, args?.ignorecase ? "gi" : "g")
          } catch (e: any) {
            return `bad regex: ${e.message}`
          }
          const hits: string[] = []
          const filesHit = new Set<string>()
          for (const f of files) {
            if (hits.length >= max) break
            let txt = ""
            try {
              const st = fs.statSync(f)
              if (st.size > 2_000_000) continue
              txt = fs.readFileSync(f, "utf8")
            } catch {
              continue
            }
            if (txt.indexOf("\u0000") !== -1) continue
            const lines = txt.split("\n")
            for (let i = 0; i < lines.length; i++) {
              re.lastIndex = 0
              if (!re.test(lines[i])) continue
              hits.push(
                `${path.relative(DIR, f)}:${i + 1}: ${lines[i].trim().slice(0, 160)}`
              )
              filesHit.add(f)
              if (hits.length >= max) break
            }
          }
          if (!hits.length) return `no match for /${args.pattern}/ under ${path.relative(DIR, root) || "."}`
          const more =
            hits.length >= max ? `\n... truncated at ${max}. Narrow the pattern or set path= if needed.` : ""
          return `${hits.length} hits in ${filesHit.size} files\n${hits.join("\n")}${more}`
        },
      },

      // ----------------------------------------------------------------
      read_slice: {
        description:
          "Read a LINE RANGE of a file instead of the whole thing. Use on every file over ~150 lines. Returns the range with real line numbers.",
        args: {
          type: "object",
          required: ["file"],
          properties: {
            file: { type: "string" },
            start: { type: "number", description: "1-based, default 1" },
            end: { type: "number", description: "1-based inclusive, default start+119" },
          },
        },
        async execute(args: any) {
          const f = path.isAbsolute(args.file)
            ? args.file
            : path.join(DIR, args.file)
          if (!fs.existsSync(f)) return `no such file: ${args.file}`
          const st = fs.statSync(f)
          if (st.size > 5_000_000)
            return `${args.file} is ${(st.size / 1e6).toFixed(1)}MB — binary/asset, do not read.`
          let lines: string[]
          try {
            lines = fs.readFileSync(f, "utf8").split("\n")
          } catch {
            return `${args.file} is not UTF-8 text (binary asset).`
          }
          const s = Math.max(1, args.start ?? 1)
          const e = Math.min(lines.length, args.end ?? s + 119)
          const out: string[] = []
          for (let i = s; i <= e; i++) out.push(`${i}: ${lines[i - 1]}`)
          return `${args.file} [${s}-${e} of ${lines.length} lines]\n${out.join("\n")}`
        },
      },

      // ----------------------------------------------------------------
      errors_now: {
        description:
          "Live diagnostics (LSP/compile errors) for this project, one line per problem. Cheapest bug signal that exists — call it before reading anything when something is broken.",
        args: { type: "object", properties: {} },
        async execute() {
          const lsp = await lspErrors()
          if (lsp.trim()) return `${lsp.trim().split("\n").length} problems\n${lsp}`
          const j = await sh(["git", "ls-files"], DIR)
          const tracked = j ? j.split("\n").filter(Boolean) : []
          const notes = [
            tracked.length ? `git: ${tracked.length} tracked files` : "git: no repo (no diff baseline)",
            "LSP: client returned no diagnostics (no LSP server attached to these extensions)",
            "fallback: run run_check / try_check with the real project command instead.",
          ]
          return notes.join("\n")
        },
      },

      // ----------------------------------------------------------------
      repo_health: {
        description:
          "ONE call that replaces five: project memory + git state + live errors + hot files. Always the first call in a new session. Cheapest possible orientation.",
        args: { type: "object", properties: {} },
        async execute() {
          const out: string[] = []
          out.push(`=== REPO HEALTH: ${path.basename(DIR)} ===\n_path: ${DIR}`)

          const mem = readFor(DIR, undefined)
          out.push(
            mem
              ? `\n--- MEMORY (warm, all parts) ---\n${mem.trim().split("\n").slice(0, 60).join("\n")}`
              : `\n--- MEMORY: COLD (none yet) ---\nBuild it with ctx_save. Big token win next session.`
          )

          const st = await sh(["git", "status", "--short"], DIR)
          if (st.trim()) out.push(`\n--- UNCOMMITTED ---\n${st.trim().split("\n").slice(0, 25).join("\n")}`)
          else out.push(`\n--- GIT: clean`)

          const lg = await sh(["git", "log", "--oneline", "-5"], DIR)
          if (lg.trim()) out.push(`\n--- RECENT COMMITS ---\n${lg.trim()}`)

          const errs = await lspErrors()
          out.push(
            errs.trim()
              ? `\n--- ERRORS ---\n${errs.trim().split("\n").slice(0, 25).join("\n")}`
              : `\n--- ERRORS: none reported ---`
          )
          return out.join("\n")
        },
      },
    },
  }
}) satisfies Plugin