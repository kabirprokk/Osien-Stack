import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import os from "os"

// CONTEXT MANAGER — makes the model behave like Astra in Codex.
// 1. injects the surgical-work doctrine into every session
// 2. auto-injects the project memory digest so nothing gets rediscovered
// 3. hard-trims every tool result (the single biggest token sink in any agent)

const HOME = os.homedir()
const MEM_ROOT = path.join(HOME, ".config/opencode/memory/projects")

const slug = (d: string) =>
  path.basename(d).replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase() || "root"

const DOCTRINE = `
[CODEX DOCTRINE — token efficiency is a hard requirement]
Work in the order: recall -> locate -> slice -> patch -> verify -> save.

1. repo_health or ctx_recall FIRST in any project. Do not rediscover architecture.
2. Never read a whole file to change 2 lines. smart_grep -> read_slice.
3. Never re-read a file you already read this task. Facts you already hold are free.
4. One edit, then verify. Do not stack 4 unverified edits.
5. Verify claims with a real command. Untested is not done.
6. Run specialists instead of doing everything yourself:
   scout (map, read-only, cheap) -> builder (patch) -> debugger (root cause) -> reviewer (diff).
   One of them almost always beats you solo, and they cost the main thread nothing.
7. ctx_save at the end of any non-trivial task so the next session starts warm.
8. Prefer one combined call over five narrow ones. Batch your questions.

NEVER: read 70 files -> think -> reread -> giant rewrite -> fail -> reread everything.
ALWAYS: map -> 3 files -> minimal patch -> targeted verify -> fix -> done.
`

// Trim rules per tool. Numbers = lines kept.
const KEEP: Record<string, { lines: number; bytes: number; note: string }> = {
  read: { lines: 150, bytes: 12_000, note: "use read_slice for more" },
  bash: { lines: 80, bytes: 8_000, note: "re-run narrower" },
  grep: { lines: 40, bytes: 4_000, note: "use smart_grep" },
  glob: { lines: 120, bytes: 8_000, note: "" },
  webfetch: { lines: 60, bytes: 8_000, note: "" },
}

const DEFAULT_KEEP = { lines: 100, bytes: 10_000, note: "" }

function trim(s: string, tool: string) {
  const k = KEEP[tool] ?? DEFAULT_KEEP
  const originalLines = s.split("\n").length
  let out = s
  let cut = false

  if (out.length > k.bytes) {
    // keep the head (setup/error) AND the tail (the actual failure) — the middle is noise
    const head = out.slice(0, Math.floor(k.bytes * 0.4))
    const tail = out.slice(-Math.floor(k.bytes * 0.6))
    const dropped = Math.round((out.length - k.bytes) / 120) || 1
    out =
      `${head}\n\n… [~${dropped}KB / ~${out.split("\n").length - Math.round(k.bytes / 80)} lines elided by context-manager] …\n\n${tail}`
    cut = true
  }

  const lines = out.split("\n")
  if (lines.length > k.lines) {
    const head = lines.slice(0, Math.floor(k.lines * 0.5))
    const tail = lines.slice(-Math.ceil(k.lines * 0.5))
    out = `${head.join("\n")}\n… [${lines.length - k.lines} lines elided — ${k.note || "narrow your query"}] …\n${tail.join("\n")}`
    cut = true
  }

  if (cut) out += `\n[trimmed by context-manager: was ${originalLines} lines]`
  return out
}

// Binary / giant-asset detector — these are pure token waste.
const BLOB = /\.(png|jpe?g|gif|webp|glb|gltf|fbx|obj|blend|mp3|wav|ogg|mp4|mov|avi|zip|tar|gz|exe|so|dll|ttf|otf|woff2?|bin|db|sqlite|pak|import|uid)$/i

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()

  function digest(): string {
    const p = path.join(MEM_ROOT, slug(DIR) + ".md")
    try {
      if (!fs.existsSync(p)) return ""
      const md = fs.readFileSync(p, "utf8")
      const head = md.split("\n").slice(0, 70).join("\n")
      return `\n[PROJECT MEMORY — already loaded, do NOT rediscover]\n${head}\n`
    } catch {
      return ""
    }
  }

  let memo = ""
  let inject = false
  // resolve lazily so we never block startup on IO
  const warm = () => {
    if (!inject) {
      inject = true
      setTimeout(() => {
        try {
          memo = digest()
        } catch {}
      }, 0)
    }
  }

  return {
    config: (cfg: any) => {
      // tighter global caps — every byte here is paid on EVERY tool call
      cfg.tool_output = { max_lines: 150, max_bytes: 12_000 }
      if (cfg.compaction) {
        cfg.compaction.auto = true
        cfg.compaction.tail_turns = 6
      }
    },

    "chat.params": async (_i: any, output: any) => {
      warm()
      const sys = (output.system = output.system || "")
      if (!sys.includes("[CODEX DOCTRINE")) sys += DOCTRINE
      if (memo && !sys.includes("[PROJECT MEMORY — already loaded")) sys += memo
      if (memo) memo = "" // inject once per session, not per message
    },

    "tool.execute.after": async (input: any, output: any) => {
      try {
        const tool = String(input?.tool ?? input?.toolID ?? "")
        for (const key of ["output", "result"]) {
          if (typeof output?.[key] === "string") {
            const v = output[key]
            if (BLOB.test(input?.args?.filePath ?? input?.args?.file ?? "")) {
              output[key] = "[binary/asset — not readable as text, skipped to save tokens]"
            } else {
              output[key] = trim(v, tool)
            }
          }
        }
      } catch {}
    },
  }
}) satisfies Plugin