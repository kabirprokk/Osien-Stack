import type { Plugin } from "@opencode-ai/plugin"

// CREW: temporary agents. Spawn one for a job, get the result, it evaporates.
// Two modes: crew_spawn (headless, nothing written = truly temporary) and
// crew_keep (writes a real agent file for repeat work) + crew_fire (removes it).
const HOME = process.env.HOME || "";
const AGENT_DIR = `${HOME}/.config/opencode/agents`;
const BIN = `${HOME}/.opencode/bin/opencode`;

const MODELS: Record<string, string> = {
  fast: "opencode/space-bunny-free",
  smart: "opencode/muse-spark-1.3-contributor-free",
  muscle: "opencode/nemotron-3-ultra-free",
};

export default (async () => {
  const fs = await import("fs");
  const path = await import("path");
  const { execFile } = await import("child_process");

  function roster(): string[] {
    try {
      return fs.readdirSync(AGENT_DIR).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""));
    } catch {
      return [];
    }
  }

  function runHeadless(dir: string, model: string, prompt: string, timeout = 240000): Promise<string> {
    return new Promise((resolve) => {
      execFile(
        BIN,
        ["run", "--dir", dir, "-m", model, prompt],
        { timeout, maxBuffer: 8_000_000, env: { ...(process.env as any) } },
        (err, out, errb) => resolve(String(out || errb || (err ? "ERR " + err.message : "")).trim().slice(0, 4000))
      );
    });
  }

  return {
    "chat.params": async (_i: any, output: any) => {
      output.system = (output.system || "") + [
        "",
        "[CREW RULE]",
        "If no existing agent fits the job, DO NOT shrug — spawn a temporary one with crew_spawn(name, role, task, dir).",
        "It runs headless, returns its answer, and leaves nothing behind. Use crew_keep only when the user will reuse that role repeatedly.",
        "Never invent a 'no specialist available' dead end.",
      ].join("\n");
    },
    tool: {
      crew_spawn: {
        description: "Spawn a TEMPORARY agent for one job: it works headless, returns the result, then evaporates (nothing written to disk). Use when no existing agent fits.",
        args: {
          type: "object",
          properties: {
            name: { type: "string", description: "short agent name, e.g. cjp-researcher" },
            role: { type: "string", description: "one line: what this temp agent is for" },
            task: { type: "string", description: "the concrete job + what to return" },
            dir: { type: "string", description: "working dir (default: current)" },
            power: { type: "string", description: "fast|smart|muscle (default fast)" },
          },
          required: ["name", "role", "task"],
        },
        async execute(args: any) {
          const dir = String(args?.dir || process.cwd());
          const model = MODELS[String(args?.power || "fast")] || MODELS.fast;
          const persona = [
            `You are a TEMPORARY specialist agent. Role: ${args?.role}`,
            `Work dir: ${dir}. Be terse (caveman). Do the task, return the result only.`,
            args?.task,
          ].join("\n");
          const res = await runHeadless(dir, model, persona, 240000);
          return `🧑‍🔧 ${args?.name} (${model.split("/")[1]}) done:\n${res}`;
        },
      },
      crew_keep: {
        description: "Promote a temp role into a REAL reusable agent (writes agent file). Use when the user will need that role repeatedly.",
        args: {
          type: "object",
          properties: {
            name: { type: "string", description: "agent name (hyphen-case)" },
            role: { type: "string", description: "what it does" },
            power: { type: "string", description: "fast|smart|muscle (default smart)" },
          },
          required: ["name", "role"],
        },
        async execute(args: any) {
          const slug = String(args?.name || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
          if (!slug) return "crew_keep needs a name.";
          fs.mkdirSync(AGENT_DIR, { recursive: true });
          fs.writeFileSync(
            path.join(AGENT_DIR, slug + ".md"),
            `---\ndescription: ${args?.role}. Uses todowrite todos for multi-step work.\nmode: subagent\nmodel: ${MODELS[String(args?.power || "smart")] || MODELS.smart}\ntemperature: 0.2\n---\n\n${args?.role}. Terse (caveman). Todowrite first on 3+ steps. Mark done as you go.\n`
          );
          return `agent '${slug}' kept → available permanently (restart not needed for file pick-up, worst case next session). roster: ${roster().join(", ")}`;
        },
      },
      crew_fire: {
        description: "Remove a temporary/kept agent file. Fire = it stops existing.",
        args: { type: "object", properties: { name: { type: "string" } }, required: ["name"] },
        async execute(args: any) {
          const slug = String(args?.name || "").toLowerCase().replace(/[^a-z0-9-]+/g, "-");
          const f = path.join(AGENT_DIR, slug + ".md");
          if (fs.existsSync(f)) {
            fs.unlinkSync(f);
            return `agent '${slug}' fired 🔥 — gone. roster: ${roster().join(", ") || "(empty)"}`;
          }
          return `no agent file '${slug}' (temp crews evaporate on their own). roster: ${roster().join(", ") || "(empty)"}`;
        },
      },
      crew_batch: {
        description: "Run N independent jobs headless in PARALLEL (cheap models), return one merged digest. Best quota+speeed move: chat stays tiny, work happens off-thread.",
        args: {
          type: "object",
          properties: {
            jobs: { type: "string", description: "one job per line (no numbering)" },
            dir: { type: "string", description: "working dir" },
            power: { type: "string", description: "fast|smart|muscle (default fast)" },
          },
          required: ["jobs"],
        },
        async execute(args: any) {
          const dir = String(args?.dir || process.cwd());
          const model = MODELS[String(args?.power || "fast")] || MODELS.fast;
          const jobs = String(args?.jobs || "").split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6);
          if (!jobs.length) return "crew_batch needs at least one job line.";
          const out = await Promise.all(jobs.map(async (j, i) => {
            const r = await runHeadless(dir, model, `TEMP BATCH WORKER ${i + 1}/${jobs.length}. Be terse. Job: ${j}`, 240000);
            return `[${i + 1}] ${j.slice(0, 50)} -> ${r.slice(0, 900)}`;
          }));
          return `📦 BATCH (${jobs.length} jobs, ${model.split("/")[1]}, parallel):\n` + out.join("\n\n");
        },
      },
      crew_roster: {
        description: "List kept agents + temp crew history from SOUL.",
        args: { type: "object", properties: {} },
        async execute() {
          return `kept agents: ${roster().join(", ") || "(none)"}\ntemp crews are headless and leave no trace — nothing to clean.`;
        },
      },
    },
  };
}) satisfies Plugin;