import type { Plugin } from "@opencode-ai/plugin"

// FLOW: instant resume + supervised overseer + anti-slowdown.
// No doom loops: overseer SUGGESTS the next prompt, you approve with one word.
export default (async () => {
  const fs = await import("fs")
  const path = await import("path")
  const os = await import("os")
  const { execSync } = await import("child_process")
  const HOME = os.homedir()
  const SOUL = path.join(HOME, ".config/opencode/memory/OSIEN_SOUL.md")
  const LAST = path.join(HOME, ".config/opencode/memory/.last-project")
  const DB = path.join(HOME, ".local/share/opencode/opencode.db")

  function sh(cmd: string, cwd?: string): string {
    try {
      return execSync(cmd, { cwd, encoding: "utf-8", timeout: 8000, maxBuffer: 200000 }).trim()
    } catch {
      return ""
    }
  }

  function prevChat(): string {
    try {
      const { execSync: ex } = require("child_process") as typeof import("child_process");
      const out = ex(`python3 "${(require("os") as typeof import("os")).homedir()}/.config/opencode/social/prev_chat.py"`, {
        encoding: "utf-8",
        timeout: 10000,
      } as any).trim().split("\n").slice(0, 2).join(" / ");
      return out.slice(0, 300);
    } catch {
      return "";
    }
  }

  function lastProject(): { dir: string; title: string; when: string } {
    // 1. fast file first
    try {
      const raw = fs.readFileSync(LAST, "utf-8").trim().split("\n")
      if (raw[0]) return { dir: raw[0], title: raw[1] || "", when: raw[2] || "" }
    } catch {}
    // 2. DB fallback
    try {
      const { DatabaseSync } = process as any
      void DatabaseSync
    } catch {}
    try {
      const out = sh(
        `python3 -c "import sqlite3,os,datetime;db=os.path.expanduser('~/.local/share/opencode/opencode.db');con=sqlite3.connect(db,timeout=5);r=con.execute('SELECT directory,title,time_updated FROM session ORDER BY time_updated DESC LIMIT 1').fetchone();print((r[0] or '')+'\\n'+(r[1] or '')+'\\n'+str(datetime.datetime.fromtimestamp((r[2] or 0)/1000)))"`
      ).split("\n")
      if (out[0]) return { dir: out[0], title: out[1] || "", when: out[2] || "" }
    } catch {}
    return { dir: HOME, title: "", when: "" }
  }

  function gitReview(cwd: string): string {
    if (!cwd || !fs.existsSync(path.join(cwd, ".git"))) return "not a git repo — review = file list only."
    const status = sh("git status --porcelain | head -n 20", cwd)
    const stat = sh("git diff --stat | tail -n 10", cwd)
    return [`changed:\n${status || "(clean)"}`, `diff:\n${stat || "(no diff)"}`].join("\n")
  }

  return {
    // remember where you work, every session
    "chat.message": async (input: any) => {
      const sid = (input as any)?.sessionID || (input as any)?.sessionId;
      const cl = (input as any)?.client;
      if (sid && cl) await tokenWatch(cl, sid);
    },

    event: async ({ event }: any) => {
      if (event?.type === "session.created") {
        try {
          const dir = (event as any)?.directory || (event as any)?.session?.directory || ""
          if (dir) fs.writeFileSync(LAST, `${dir}\n\n${new Date().toISOString().slice(0, 16)}`)
        } catch {}
      }
      // overseer checkpoint: supervised, never auto-executes
      if (event?.type === "session.idle") {
        try {
          const lp = lastProject()
          const rev = lp.dir && lp.dir !== HOME ? gitReview(lp.dir).split("\n").slice(0, 6).join(" | ") : ""
          fs.appendFileSync(
            SOUL,
            `- ${new Date().toISOString().slice(0, 16).replace("T", " ")} — 🛰️ overseer checkpoint @ ${lp.dir}${rev ? " — " + rev.slice(0, 160) : ""} — say /flow-next for the next move.\n`
          )
        } catch {}
      }
    },

    // trim giant tool outputs so context never explodes (the mid-coding slowdown)
    "tool.execute.after": async (input: any, output: any) => {
      try {
        const txt = String(output?.output ?? output?.result ?? "")
        if (txt.length > 8000) {
          const head = txt.slice(0, 3000)
          const tail = txt.slice(-1500)
          const note = `\n…[trimmed ${txt.length}→4500 chars by flow-guard: head+tail kept]…\n`
          if (typeof output.output === "string") output.output = head + note + tail
          else if (typeof output.result === "string") output.result = head + note + tail
        }
      } catch {}
    },

    tool: {
      project_resume: {
        description: "Resume: compact summary of the LAST chat, nothing more.",
        args: { type: "object", properties: {} },
        async execute() {
          const { execSync: ex } = await import("child_process");
          const osMod = await import("os");
          try {
            return ex(`python3 "${osMod.homedir()}/.config/opencode/social/prev_chat.py"`, {
              encoding: "utf-8", timeout: 15000,
            } as any).trim().slice(0, 900);
          } catch { return "LAST CHAT: unreadable — fresh start."; }
        },
      },
      overseer_next: {
        description: "Overseer proposes the single next move (review bugs → next prompt). Supervised: you approve, nothing auto-runs.",
        args: { type: "object", properties: {} },
        async execute() {
          const lp = lastProject()
          const rev = lp.dir !== HOME ? gitReview(lp.dir) : "no repo"
          const lines = [
            `🛰️ OVERSEER @ ${lp.dir}`,
            rev,
            "",
            "PROPOSED NEXT (reply YES to run, or edit it):",
            "1. review_pass on changed files only (not whole repo)",
            "2. fix smallest bug first, test, then compact (/compact)",
          ]
          return lines.join("\n")
        },
      },
      review_pass: {
        description: "Codex-style low-context review: git changed files only (or vs --base branch), never whole repo.",
        args: { type: "object", properties: { dir: { type: "string", description: "project dir (default: last project)" }, base: { type: "string", description: "optional base branch, e.g. main (codex review --base)" } } },
        async execute(args: { dir?: string; base?: string }) {
          const dir = args.dir || lastProject().dir
          if (!fs.existsSync(path.join(dir, ".git"))) return `no git at ${dir} — tell me the dir.`
          const range = args.base ? `${args.base}...HEAD` : ""
          const extra = args.base ? ` ; git diff --name-only ${range} | head -n 15` : ""
          const files = sh(`git status --porcelain | awk '{print $2}' | head -n 15${extra}`, dir)
          const stat = sh(args.base ? `git diff --stat ${range} | tail -n 8` : "git diff --stat | tail -n 8", dir)
          return [`🔍 REVIEW (changed files only, low context) @ ${dir}`, `files:\n${files || "(clean)"}`, `stat:\n${stat || "(no diff)"}`, "", "Reply with a filename for deep dive, or /compact to shrink context."].join("\n")
        },
      },
    },
  }
}) satisfies Plugin
