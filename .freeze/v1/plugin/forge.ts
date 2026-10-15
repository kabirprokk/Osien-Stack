import type { Plugin } from "@opencode-ai/plugin"

// FORGE: the self-building core. AI creates its own skills/tools/MCPs on demand.
// Lean by design: zero heavy deps, instant local file writes, browser-verify MCP flow.
export default (async () => {
  const fs = await import("fs")
  const path = await import("path")
  const os = await import("os")
  const { exec } = await import("child_process")
  const HOME = os.homedir()
  const CFG = path.join(HOME, ".config/opencode/opencode.json")
  const SKILL_DIR = path.join(HOME, ".config/opencode/skills")
  const PLUGIN_DIR = path.join(HOME, ".config/opencode/plugin")
  const SOUL = path.join(HOME, ".config/opencode/memory/OSIEN_SOUL.md")

  function openBrowser(url: string) {
    const cmd =
      process.platform === "linux"
        ? `xdg-open "${url}" >/dev/null 2>&1 &`
        : process.platform === "darwin"
          ? `open "${url}"`
          : `cmd /c start "" "${url}"`
    exec(cmd, () => {})
  }

  function logSoul(line: string) {
    try {
      fs.appendFileSync(SOUL, `- ${new Date().toISOString().slice(0, 16).replace("T", " ")} — ${line}\n`)
    } catch {}
  }

  // Curated remote MCPs that support browser-verify (open page → copy key → done)
  const REMOTE_CATALOG: Record<string, { url: string; verify: string; keyEnv: string }> = {
    supabase: { url: "https://mcp.supabase.com/mcp", verify: "https://supabase.com/dashboard", keyEnv: "SUPABASE_ACCESS_TOKEN" },
    exa: { url: "https://mcp.exa.ai/mcp", verify: "https://dashboard.exa.ai/api-keys", keyEnv: "EXA_API_KEY" },
    context7: { url: "https://mcp.context7.com/mcp", verify: "https://context7.com/dashboard", keyEnv: "" },
    deepwiki: { url: "https://mcp.deepwiki.com/mcp", verify: "https://deepwiki.com", keyEnv: "" },
  }

  return {
    tool: {
      forge_skill: {
        description: "Create a NEW skill for yourself from a name + purpose. Writes SKILL.md under skills/. Use when you repeat a workflow 2+ times.",
        args: {
          type: "object",
          properties: {
            name: { type: "string", description: "lowercase-hyphen, e.g. godot-export" },
            purpose: { type: "string", description: "one sentence: when to use" },
            steps: { type: "string", description: "numbered steps the skill follows" },
          },
          required: ["name", "purpose", "steps"],
        },
        async execute(args: { name: string; purpose: string; steps: string }) {
          const slug = String(args.name).toLowerCase().replace(/[^a-z0-9-]+/g, "-").slice(0, 40)
          const dir = path.join(SKILL_DIR, slug)
          fs.mkdirSync(dir, { recursive: true })
          const md = `# ${slug}\n\n${args.purpose}\n\n## Steps\n${args.steps}\n\n## Rules\n- Keep it instant. Zero heavy deps.\n- Log one line to SOUL forge index when used to create something reusable.\n`
          fs.writeFileSync(path.join(dir, "SKILL.md"), md)
          logSoul(`forged skill: ${slug} — ${String(args.purpose).slice(0, 80)}`)
          return `skill '${slug}' forged ✅ at skills/${slug}/SKILL.md`
        },
      },

      forge_tool: {
        description: "Create a NEW instant tool for yourself (writes a small plugin file). Use for repeatable instant utilities.",
        args: {
          type: "object",
          properties: {
            name: { type: "string", description: "snake_case, e.g. godot_clean" },
            description: { type: "string", description: "one line" },
            code: { type: "string", description: "JS body returning a string (runs as execute). Keep <30 lines, fs/path/os allowed." },
          },
          required: ["name", "description", "code"],
        },
        async execute(args: { name: string; description: string; code: string }) {
          const slug = String(args.name).toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40)
          const file = path.join(PLUGIN_DIR, `forged-${slug}.ts`)
          const src = `import type { Plugin } from "@opencode-ai/plugin"\n\n// forged ${new Date().toISOString().slice(0, 10)}: ${String(args.description).slice(0, 120)}\nexport default (async () => {\n  const fs = await import("fs")\n  const path = await import("path")\n  const os = await import("os")\n  return { tool: { ${slug}: {\n    description: ${JSON.stringify(args.description)},\n    args: { type: "object", properties: { input: { type: "string" } } },\n    async execute(a: any) {\n      ${args.code}\n    },\n  } } }\n}) satisfies Plugin\n`
          fs.writeFileSync(file, src)
          // auto-register in config
          try {
            const j = JSON.parse(fs.readFileSync(CFG, "utf-8"))
            const rel = `./plugin/forged-${slug}.ts`
            j.plugin = Array.from(new Set([...(j.plugin || []), rel]))
            fs.writeFileSync(CFG, JSON.stringify(j, null, 2))
          } catch {}
          logSoul(`forged tool: ${slug}`)
          return `tool '${slug}' forged ✅ restart opencode to load it`
        },
      },

      mcp_connect: {
        description: "Connect an MCP by itself: picks from catalog or adds custom. For keyless remotes it just works. For keyed ones it OPENS YOUR BROWSER to the verify/keys page — you copy the key, paste it back, done.",
        args: {
          type: "object",
          properties: {
            name: { type: "string", description: "supabase|exa|context7|deepwiki or custom name" },
            url: { type: "string", description: "optional custom remote URL" },
            apiKey: { type: "string", description: "paste key here AFTER browser step (optional on first call)" },
          },
          required: ["name"],
        },
        async execute(args: { name: string; url?: string; apiKey?: string }) {
          const key = String(args.name).toLowerCase()
          const known = REMOTE_CATALOG[key]
          const url = args.url || known?.url
          if (!url) return `unknown MCP '${args.name}'. Give a url. Known: ${Object.keys(REMOTE_CATALOG).join(", ")}`
          const j = JSON.parse(fs.readFileSync(CFG, "utf-8"))
          j.mcp = j.mcp || {}
          // step 1: no key yet + needs key → open browser, ask user
          if (known?.keyEnv && !args.apiKey) {
            openBrowser(known.verify)
            return `🌐 OPENED BROWSER → ${known.verify}\n1. Copy your key\n2. Call me again: mcp_connect(name="${key}", apiKey="PASTE_HERE")\nSimple. I'll do the rest.`
          }
          // step 2: save
          const entry: any = { type: "remote", url, enabled: true }
          if (known?.keyEnv && args.apiKey) {
            entry.headers = { Authorization: `Bearer ${args.apiKey}` }
            try {
              const sh = path.join(HOME, ".config/opencode/.keys")
              fs.mkdirSync(sh, { recursive: true, mode: 0o700 } as any)
              fs.appendFileSync(path.join(sh, key), `# ${new Date().toISOString()}\n${args.apiKey}\n`)
            } catch {}
          }
          j.mcp[key] = entry
          fs.writeFileSync(CFG, JSON.stringify(j, null, 2))
          logSoul(`connected MCP: ${key}`)
          return `MCP '${key}' connected ✅ restart opencode to load it`
        },
      },

      mcp_drop: {
        description: "Disconnect an MCP instantly (removes it from config). Use for anything unused/broken.",
        args: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        async execute(args: { name: string }) {
          const j = JSON.parse(fs.readFileSync(CFG, "utf-8"))
          if (j.mcp?.[args.name]) {
            delete j.mcp[args.name]
            fs.writeFileSync(CFG, JSON.stringify(j, null, 2))
            logSoul(`dropped MCP: ${args.name}`)
            return `MCP '${args.name}' dropped ✅`
          }
          return `no MCP named '${args.name}'`
        },
      },
    },
  }
}) satisfies Plugin
