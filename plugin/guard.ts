import type { Plugin } from "@opencode-ai/plugin"

// GUARD v2: secret scrub + secret-path block + bounded ralph + codemap + voice.
// Block rule: secret FILE paths are refused; normal code refs are allowed.
export default (async () => {
  const fs = await import("fs")
  const path = await import("path")
  const os = await import("os")
  const { execSync, exec } = await import("child_process")
  const HOME = os.homedir()
  const NO_VOICE = path.join(HOME, ".config/opencode/.no-voice")
  const D = String.fromCharCode(46)
  const secretPath = (s: string) => {
    if (s.includes(D + "vault")) return true
    if (s.includes("creds" + D + "enc")) return true
    const scrubbed = s.replace(/process[.]env|os[.]environ|node[.]env|Deno[.]env/gi, "X")
    return new RegExp("(^|[/\\s\"'=])" + D + "env\\b").test(scrubbed)
  }

  const SECRET_RE =
    /(sk-[A-Za-z0-9-_]{8,}|nvapi-[A-Za-z0-9-_]{8,}|xox[bap]-[A-Za-z0-9-]+|gh[pousr]_[A-Za-z0-9_]{8,}|AIza[A-Za-z0-9-_]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/g

  function scrub(s: string): string {
    return s.replace(SECRET_RE, "▓REDACTED▓")
  }

  return {
    "tool.execute.before": async (input: any, output: any) => {
      const a = JSON.stringify(output?.args || "")
      if (secretPath(a)) throw new Error("guard: blocked secret path")
    },
    "tool.execute.after": async (_input: any, output: any) => {
      try {
        if (typeof output?.output === "string") output.output = scrub(output.output)
        if (typeof output?.result === "string") output.result = scrub(output.result)
      } catch {}
    },

    event: async ({ event }: any) => {
      if (event?.type === "session.idle" && !fs.existsSync(NO_VOICE)) {
        exec(`~/.config/opencode/sound/chime.sh >/dev/null 2>&1 &`, () => {})
      }
    },

    tool: {
      try_check: {
        description: "RALPH check: run a verify command (tests/lint/build), returns PASS/FAIL + tail. Bounded loops only (max 3 rounds, enforced by /flow-ralph).",
        args: {
          type: "object",
          properties: {
            cmd: { type: "string", description: "e.g. npm test, python -m pytest -x -q" },
            dir: { type: "string", description: "project dir" },
          },
          required: ["cmd", "dir"],
        },
        async execute(args: { cmd: string; dir: string }) {
          try {
            const out = execSync(args.cmd, { cwd: args.dir, encoding: "utf-8", timeout: 120000, maxBuffer: 300000 })
            return `✅ PASS\n${scrub(String(out).slice(-2000))}`
          } catch (e: any) {
            const txt = String(e?.stdout || "") + String(e?.stderr || "") + String(e?.message || "")
            return `❌ FAIL\n${scrub(txt.slice(-3000))}`
          }
        },
      },
      codemap: {
        description: "Understand-anything-lite: grep symbol map of a project (defs, callers) without indexing 33GB. Scoped, instant.",
        args: {
          type: "object",
          properties: {
            dir: { type: "string" },
            symbol: { type: "string", description: "optional: focus symbol, shows defs + callers" },
          },
          required: ["dir"],
        },
        async execute(args: { dir: string; symbol?: string }) {
          const ex = `--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=.godot`
          try {
            if (args.symbol) {
              const defs = execSync(`grep -rn ${ex} -E "(function|class|def|const|fn) +${args.symbol}" "${args.dir}" 2>/dev/null | head -n 10`, { encoding: "utf-8", timeout: 15000 }).trim()
              const callers = execSync(`grep -rln ${ex} "${args.symbol}" "${args.dir}" 2>/dev/null | head -n 15`, { encoding: "utf-8", timeout: 15000 }).trim()
              return `🗺️ ${args.symbol}\ndefs:\n${defs || "(none)"}\nfiles:\n${callers || "(none)"}`
            }
            const files = execSync(`find "${args.dir}" -maxdepth 3 -type f \\( -name "*.ts" -o -name "*.js" -o -name "*.py" -o -name "*.gd" \\) -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -n 30`, { encoding: "utf-8", timeout: 15000 }).trim()
            return `🗺️ codemap @ ${args.dir}\n${files || "(no code files top-3 levels)"}\n\nNarrow with symbol=<name>.`
          } catch {
            return "codemap failed (timeout?) — narrow dir or symbol."
          }
        },
      },
    },
  }
}) satisfies Plugin
