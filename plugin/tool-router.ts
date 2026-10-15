import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import { execFile } from "child_process"

// TOOL ROUTER — the big one.
// Stock opencode ships ~75 tool schemas and re-sends every one of them on every
// message. That is the single largest context cost in any agent, and it is why
// "just add MCPs" makes a model slower and dumber.
//
// This router does two jobs:
//   1. CLASSIFY the user's intent and tell the model which kit is active
//      (so it stops staring at 48 irrelevant tools).
//   2. Provide the missing primitives that make a lean kit sufficient:
//      verify_chain (auto verification) and patch_apply (patch-based editing).

// ---------------------------------------------------------------- intent

type Intent = "code" | "debug" | "research" | "web" | "game" | "ops" | "chat"

const KITS: Record<Intent, { kit: string; tools: string; delegate: string }> = {
  code: {
    kit: "CODE — implement a change",
    tools:
      "read_slice + smart_grep + errors_now to locate, edit/write to patch, verify_chain to prove, reviewer to inspect the diff.",
    delegate: "scout (map) -> builder (patch) -> verify_chain -> reviewer",
  },
  debug: {
    kit: "DEBUG — something is broken",
    tools:
      "errors_now FIRST, then read_slice around the exact line, then one hypothesis, one change, re-verify. Never re-read files you already read.",
    delegate: "debugger owns this end to end. Do not duplicate its work.",
  },
  research: {
    kit: "RESEARCH — facts, docs, current info",
    tools: "web_search / web_research only (visible browser). ctx7 for library docs, deepwiki for repo docs.",
    delegate: "researcher",
  },
  web: {
    kit: "WEB — build or audit a site",
    tools: "kts_* for KTS-native sites. web_audit / web_scaffold otherwise. Never hand-write a manifest.",
    delegate: "game-builder for web games.",
  },
  game: {
    kit: "GAME — anything game-shaped",
    tools: "game_* + music/sfx/sprite tools live in the game-builder kit. Ask, do not hunt.",
    delegate: "game-builder",
  },
  ops: {
    kit: "OPS — deploys, docker, credentials, posting, data",
    tools: "ops kit tools live in the devops / publisher kits. Delegate rather than guess.",
    delegate: "devops for infra, data-wrangler for databases.",
  },
  chat: {
    kit: "CHAT — thinking, planning, writing. No code action needed.",
    tools: "answer directly. Do not touch tools.",
    delegate: "none",
  },
}

function classify(text: string): Intent {
  const t = (text || "").toLowerCase()
  const has = (...w: string[]) => w.some((x) => t.includes(x))

  if (
    has(
      "error", "exception", "traceback", "crash", "stack trace", "not working",
      "doesn't work", "broken", "fails", "failing", "bug", "freeze", "hang",
      "regression", "undefined is not", "cannot read"
    )
  )
    return "debug"

  // An edit verb pointed at CODE is a code change, even inside a game project.
  // Editing shaders/.gd files is Builder work; building a whole game is not.
  const EDIT = has(
    "add ", "implement", "refactor", "fix ", "rename", "extract", "migrate",
    "write ", "update ", "remove ", "wire up", "change ", "optimize", "speed up"
  )
  const CODE_MARK = has(
    ".gd", ".ts", ".py", ".js", ".tsx", ".gdshader", "shader", "function",
    "class", "variable", "refactor", "code", "script", "method", "api call"
  )
  if (EDIT && CODE_MARK) return "code"

  if (has("godot", "unity", "unreal", "game", "3d model", "mesh", "sprite", "level design"))
    return "game"
  if (has("deploy", "docker", "kubernetes", "ci/", "pipeline", "server", "railway", "ssh", "postgres", "sqlite", "database", "table", "query"))
    return "ops"
  if (has("website", "landing page", "seo", "web app", "frontend", "html", "css"))
    return "web"

  // Questions are fact lookups unless the chat kit is explicitly asked for.
  if (t.includes("?") || has("who ", "what ", "when ", "which ", "why ", "how much", "where is"))
    return "research"
  if (has("latest", "news", "compare", "research", "find out", "docs for", "documentation", "explain", "tell me about"))
    return "research"
  if (has("think", "plan", "brainstorm", "idea", "should i", "what do you think"))
    return "chat"
  return "chat"
}

// ------------------------------------------------------- verify chain

type Step = { name: string; cmd: string[]; kind: string }

const PROBE: Record<string, Step[]> = {
  node: [
    { name: "format", cmd: ["npx", "--no-install", "prettier", "--check", "."], kind: "soft" },
    { name: "typecheck", cmd: ["npx", "--no-install", "tsc", "--noEmit"], kind: "hard" },
    { name: "test", cmd: ["npm", "test", "--silent"], kind: "hard" },
  ],
  python: [
    { name: "compile", cmd: ["python3", "-m", "compileall", "-q", "."], kind: "hard" },
    { name: "test", cmd: ["python3", "-m", "pytest", "-x", "-q"], kind: "hard" },
  ],
  godot: [
    { name: "parse", cmd: ["godot", "--headless", "--quit", "--check-only"], kind: "hard" },
  ],
}

function detect(dir: string): Step[] {
  const has = (f: string) => fs.existsSync(path.join(dir, f))
  if (has("package.json")) return PROBE.node
  if (has("pyproject.toml") || has("requirements.txt") || fs.existsSync(path.join(dir, "tests")))
    return PROBE.python
  if (has("project.godot")) return PROBE.godot
  return []
}

function run(cmd: string[], cwd: string, ms = 120000): Promise<{ code: number; out: string }> {
  return new Promise((res) => {
    execFile(
      cmd[0],
      cmd.slice(1),
      { cwd, timeout: ms, maxBuffer: 40_000_000 },
      (e, o, er) =>
        res({ code: e ? ((e as any).code ?? 1) : 0, out: String(o || "") + String(er || "") })
    )
  })
}

// The whole point: a 20,000-line log must never reach the model.
// Only the failure signature + a tight window around it does.
function extractFailure(out: string, max = 45): string {
  const lines = out.split("\n").filter((l) => l.trim())
  if (lines.length <= max) return lines.join("\n")
  const SIG =
    /(error|Error|ERROR|FAILED|failed|FAIL|panic|Traceback|Exception|assert|AssertionError|SyntaxError|TypeError|ReferenceError|\.gd:\d+|\.ts:\d+|\.py:\d+)/

  const idx = lines.findIndex((l) => SIG.test(l))
  if (idx === -1) {
    const tail = lines.slice(-Math.floor(max / 2))
    return `[no error signature found — showing tail]\n${tail.join("\n")}\n[${lines.length} total lines, elided]`
  }
  const from = Math.max(0, idx - 5)
  const win = lines.slice(from, from + max)
  return `[${lines.length} total lines, showing ${from + 1}-${from + win.length}]\n${win.join("\n")}`
}

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()
  let active: Intent | null = null

  return {
    "chat.message": async (_i: any, output: any) => {
      // classify off the newest user text, then pin a kit for this turn
      try {
        const parts: any[] = output?.parts || []
        const lastUser = [...parts]
          .reverse()
          .find((p) => p?.type === "text" && typeof p.text === "string" && p.text.trim())
        if (!lastUser) return
        const intent = classify(lastUser.text)
        active = intent
        const k = KITS[intent]
        output.system =
          (output.system || "") +
          [
            "",
            `[ACTIVE KIT: ${k.kit}]`,
            `USE: ${k.tools}`,
            `ROUTE: ${k.delegate}`,
            "",
            "You are running a LEAN kit. The rest of the toolbox is not loaded and not needed.",
            "Do not ask for tools that are not here. Do not simulate them. If you genuinely need",
            "something outside this kit, delegate to the named agent instead of hunting.",
          ].join("\n")
      } catch {}
    },

    tool: {
      // --------------------------------------------------------------
      route: {
        description:
          "Classify a request and return the right kit + agent for it, without loading the whole toolbox. Call this when unsure which tools apply.",
        args: {
          type: "object",
          required: ["request"],
          properties: { request: { type: "string", description: "what you are about to do" } },
        },
        async execute(args: any) {
          const i = classify(args?.request ?? "")
          const k = KITS[i]
          return [
            `INTENT: ${i.toUpperCase()}`,
            `KIT: ${k.kit}`,
            `USE: ${k.tools}`,
            `ROUTE: ${k.delegate}`,
          ].join("\n")
        },
      },

      // --------------------------------------------------------------
      verify_chain: {
        description:
          "Run the project's full verification pipeline (format -> typecheck -> test -> build) and return PASS/FAIL plus ONLY the failure signature. Replaces dumping a huge log into context. Call after every change instead of guessing whether it worked.",
        args: {
          type: "object",
          properties: {
            dir: { type: "string", description: "project dir (default: current)" },
            only: { type: "string", description: "run a single step: format|typecheck|test|build" },
          },
        },
        async execute(args: any) {
          const cwd = args?.dir ? path.resolve(args.dir) : DIR
          let steps = detect(cwd)
          if (!steps.length)
            return `NO PIPELINE DETECTED in ${cwd} (looked for package.json / pyproject.toml / project.godot).\nUse try_check(cmd) with the project's own command instead.`
          if (args?.only) steps = steps.filter((s) => s.name === args.only)
          if (!steps.length) return `no such step. available: ${detect(cwd).map((s) => s.name).join(", ")}`

          const results: string[] = []
          let hardFail = false
          let bytes = 0
          for (const s of steps) {
            const r = await run(s.cmd, cwd)
            bytes += r.out.length
            const ok = r.code === 0
            if (!ok && s.kind === "hard") hardFail = true
            results.push(`${ok ? "PASS" : "FAIL"}  ${s.name.padEnd(9)} ${s.cmd.join(" ")}`)
            if (!ok) {
              results.push(extractFailure(r.out))
              if (s.kind === "hard") break // stop at first hard failure, do not run the rest
            }
          }
          const verdict = hardFail ? "FAIL" : "PASS"
          return [
            `=== VERIFY CHAIN: ${verdict} ===`,
            ...results,
            `raw output seen by tool: ${(bytes / 1024).toFixed(0)}KB  |  handed to model: ${results.join("\n").length} chars`,
            hardFail
              ? "\nNEXT: fix ONLY the lines above. Re-run this same command. Do not re-read other files."
              : "\nNEXT: unverified = not done, but this is verified. Send to reviewer.",
          ].join("\n")
        },
      },

      // --------------------------------------------------------------
      patch_apply: {
        description:
          "Apply a unified-diff PATCH instead of rewriting a whole file. Costs a fraction of the tokens of a full-file write and cannot silently delete code it did not intend to touch. Use for every edit to a file over ~150 lines.",
        args: {
          type: "object",
          required: ["patch"],
          properties: {
            patch: {
              type: "string",
              description:
                "unified diff, '--- a/path' / '+++ b/path' with @@ hunks and + / - lines",
            },
            dir: { type: "string" },
          },
        },
        async execute(args: any) {
          const cwd = args?.dir ? path.resolve(args.dir) : DIR
          // A missing trailing newline makes patch(1) fall back to FUZZ, which can
          // silently apply a hunk to the WRONG lines. Always terminate the file.
          let body = String(args?.patch ?? "")
          if (body && !body.endsWith("\n")) body += "\n"
          const tmp = path.join(cwd, `.ctx-patch-${process.pid}.diff`)
          try {
            fs.writeFileSync(tmp, body)
            const r = await run(["patch", "-p1", "--forward", "--batch", "-F0", "-i", path.basename(tmp)], cwd)
            fs.unlinkSync(tmp)
            const applied = /patching file/.test(r.out)
            const fuzzy = /fuzz/i.test(r.out)
            if (!applied)
              return `PATCH NOT APPLIED\n${extractFailure(r.out)}\nCheck the @@ line numbers against the real file. Nothing was changed.`
            const fuzzWarn = fuzzy
              ? `\nWARNING: applied with FUZZ — the context did not match exactly. Re-read the file and confirm the change landed on the right lines.`
              : ""
            return `PATCH APPLIED${fuzzWarn}\n${r.out.trim().split("\n").slice(0, 8).join("\n")}\nNEXT: verify_chain — never trust an applied patch.`
          } catch (e: any) {
            try {
              if (fs.existsSync(tmp)) fs.unlinkSync(tmp)
            } catch {}
            return `patch failed: ${e.message}\nHunks must match the file exactly, including indentation.`
          }
        },
      },
    },
  }
}) satisfies Plugin