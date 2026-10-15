import type { Plugin } from "@opencode-ai/plugin"

export default (async ({ client, project, directory, $ }) => {
  let messageCount = 0
  let warningShown = false
  let speedShown = false

  return {
    config: (cfg) => {
      cfg.usageThreshold = cfg.usageThreshold ?? 80
    },

    "chat.message": async (input, output) => {
      messageCount++

      const threshold = 80
      const speedMark = 30
      const estimatedUsage = Math.min(100, Math.round((messageCount / 200) * 100))

      if (estimatedUsage >= speedMark && !speedShown) {
        speedShown = true
        console.log(`\n[SPEED] ~${estimatedUsage}% context — answers slowing? Run /mind-reset (checkpoint+compact) or fresh oo-bg-new + /go-resume. Flat speed lives under 30%.\n`)
      }
      if (estimatedUsage >= threshold && !warningShown) {
        warningShown = true
        console.log(`\n[AI Manager] Usage estimate: ~${estimatedUsage}%`)
        console.log(`[AI Manager] Approaching limit. Run /rotate to generate context summary.`)
        console.log(`[AI Manager] Run /new in a fresh session with CONTEXT_SUMMARY.md\n`)
      }
    },

    "chat.params": async (input, output) => {
      try {
        const _fs = await import("fs")
        const _os = await import("os")
        const persona = `${_os.homedir()}/.config/opencode/PERSONA.md`
        if (_fs.existsSync(persona)) output.system = (output.system || "") + `\n\n[Persona]\n${_fs.readFileSync(persona, "utf-8").slice(0, 800)}`
      } catch {}
      const contextFile = `${directory}/CONTEXT_SUMMARY.md`
      try {
        const fs = await import("fs")
        if (fs.existsSync(contextFile)) {
          const summary = fs.readFileSync(contextFile, "utf-8")
          output.system = (output.system || "") + `\n\n[Project Context]\n${summary}`
        }
      } catch {}
    },

    event: async (input) => {
      if (input.type === "usage-warning") {
        console.log("[AI Manager] Usage warning triggered")
      }
    },
  }
}) satisfies Plugin
