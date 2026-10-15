import type { Plugin } from "@opencode-ai/plugin"

// SOUL-MEMORY v2: flowchart DB. Every log = ONE structured line + index bump.
// Format: - [HH:MM] [category] [project] did X → outcome Y
const CATS = ["build", "fix", "research", "clean", "ship", "ui", "mcp", "other"] as const

export default (async () => {
  const fs = await import("fs")
  const path = await import("path")
  const os = await import("os")
  const SOUL = path.join(os.homedir(), ".config/opencode/memory/OSIEN_SOUL.md")
  const PAUSED = path.join(os.homedir(), ".config/opencode/memory/.soul-paused")

  function read(): string {
    try {
      return fs.readFileSync(SOUL, "utf-8")
    } catch {
      return ""
    }
  }

  function append(line: string) {
    try {
      fs.appendFileSync(SOUL, line + "\n")
    } catch {}
  }

  function bumpIndex(cat: string) {
    try {
      let t = read()
      // increment trailing count in matching index row: | emoji cat | ... | N |
      const re = new RegExp(`(\\|[^|]*\\b${cat}\\b[^|]*\\|[^|]*\\|\\s*)(\\d+)(\\s*\\|)`)
      if (re.test(t)) {
        t = t.replace(re, (_m, a, n, c) => `${a}${parseInt(n) + 1}${c}`)
        fs.writeFileSync(SOUL, t)
      } else {
        // self-build: new category row
        t = t.replace(
          "| 📦 other | everything else | 2 |",
          `| 📦 other | everything else | 2 |\n| 🆕 ${cat} | auto-created | 1 |`
        )
        fs.writeFileSync(SOUL, t)
      }
    } catch {}
  }

  function flowLine(cat: string, project: string, text: string): string {
    const hm = new Date().toISOString().slice(11, 16)
    const c = CATS.includes(cat as any) ? cat : "other"
    const p = (project || "system").slice(0, 24)
    return `- [${hm}] [${c}] [${p}] ${String(text).slice(0, 220)}`
  }

  return {
    "chat.params": async (_input: any, output: any) => {
      try { if (fs.existsSync(PAUSED)) return } catch {}
      const rule = [
        "",
        "[SOUL FLOWCHART RULE — STRICT, EVERY REPLY]",
        "ONE memory file: ~/.config/opencode/memory/OSIEN_SOUL.md. Never another.",
        "End every meaningful exchange with ONE flowchart line in '## 🌊 Flow Stream':",
        "  - [HH:MM] [category] [project] did X → outcome Y   (newest at bottom)",
        "Categories: build fix research clean ship ui mcp other. New kind of work? Add its row to Flow Index + ### chain under Chains (+ ### 📁 <project> if the project needs its own thread).",
        "Then bump the category Count in '## 🗂️ Flow Index'. Use soul_write (it formats + bumps automatically).",
        "Keep lines tiny. Chain threads carry the story, stream carries the pulse.",
      ].join("\n")
      output.system = (output.system || "") + "\n" + rule
    },

    event: async ({ event }: any) => {
      try { if (fs.existsSync(PAUSED)) return } catch {}
      if (event?.type === "session.created")
        append(`- [${new Date().toISOString().slice(11, 16)}] [other] [system] session started`)
      if (event?.type === "session.idle") {
        append(`- [${new Date().toISOString().slice(11, 16)}] [other] [system] checkpoint — say /mind-map for the flowchart`)
      }
    },

    tool: {
      soul_read: {
        description: "Read the ONE memory file (OSIEN_SOUL.md). Use before any big task.",
        args: { type: "object", properties: {} },
        async execute() {
          return read().slice(0, 12000)
        },
      },
      soul_write: {
        description: "Log ONE flowchart line: auto-formats + bumps index. Call at end of EVERY task.",
        args: {
          type: "object",
          properties: {
            text: { type: "string", description: "'did X → outcome Y'" },
            category: { type: "string", description: "build|fix|research|clean|ship|ui|mcp|other" },
            project: { type: "string", description: "project slug, e.g. way-to-home" },
          },
          required: ["text"],
        },
        async execute(args: { text: string; category?: string; project?: string }) {
          append(flowLine(args.category || "other", args.project || "system", args.text))
          bumpIndex(CATS.includes((args.category || "other") as any) ? args.category! : "other")
          return "flowchart logged ✅"
        },
      },
      soul_map: {
        description: "Render the SOUL as an ASCII flowchart: index counts + chains + last stream lines.",
        args: { type: "object", properties: {} },
        async execute() {
          const t = read()
          const idx = (t.match(/\| (?:🛠️|🐛|🧠|🧹|🚀|🎨|🔌|📦|🆕)[^\n]*/g) || []).join("\n")
          const stream = (t.match(/^- \[\d\d:\d\d\][^\n]*/gm) || []).slice(-12).join("\n")
          return ["🗂️ FLOW INDEX", idx || "(empty)", "", "🌊 LAST 12 PULSES", stream || "(empty)"].join("\n")
        },
      },
    },
  }
}) satisfies Plugin
