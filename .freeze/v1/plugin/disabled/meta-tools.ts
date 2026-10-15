import type { Plugin } from "@opencode-ai/plugin"

// META-TOOLS: things no AI assistant has.
// doctor = self-healing toolset (detects + fixes its own broken MCPs).
// fanout = ask N models, judge picks the winner.
// brain  = lessons that survive across sessions.
export default (async () => {
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const { execFileSync, execFile } = await import("child_process");

  const CFG = path.join(os.homedir(), ".config/opencode/opencode.json");
  const BRAIN = path.join(os.homedir(), ".config/opencode/brain.jsonl");

  // wrong package -> fixed command (safe, verified replacements only)
  const KNOWN_FIXES: Array<{ bad: string; good: string[] }> = [
    { bad: "repomix-mcp-server", good: ["npx", "-y", "repomix", "--mcp"] },
    { bad: "blender-mcp-server", good: ["npx", "-y", "blender-mcp"] },
    { bad: "@modelcontextprotocol/server-sqlite", good: ["npx", "-y", "mcp-server-sqlite", "--db", path.join(os.homedir(), ".config/opencode/app.db")] },
  ];

  function pkgOf(cmd: string[]): string | null {
    if (!cmd || cmd[0] !== "npx") return null;
    const rest = cmd.slice(1).filter((a) => a !== "-y" && a !== "--yes");
    const first = rest[0] || "";
    if (!first || first.startsWith("-")) return null;
    return first;
  }

  return {
    tool: {
      doctor_check: {
        description: "Self-diagnose ALL MCP servers: wrong npm names (verified via registry), missing binaries, missing API keys. Returns BROKEN/SLEEPING/OK per server. Run this before guessing why a tool fails.",
        args: { type: "object", properties: { include_sleeping: { type: "boolean", description: "default true" } } },
        async execute(args: { include_sleeping?: boolean }) {
          const cfg = JSON.parse(fs.readFileSync(CFG, "utf-8"));
          const report: any[] = [];
          for (const [name, s] of Object.entries<any>(cfg.mcp || {})) {
            if (s.enabled === false) { report.push({ name, status: "DISABLED" }); continue; }
            if (s.type === "remote") {
              const missing = Object.entries<string>(s.headers || {}).filter(([, v]) => /\{env:([A-Z_]+)\}/.test(v) && !process.env[RegExp.$1]).map(([k]) => k);
              report.push({ name, status: missing.length ? "SLEEPING" : "OK", reason: missing.length ? `needs env for headers: ${missing.join(",")}` : "remote url set", fix: missing.length ? "export the key, restart opencode" : "none" });
              continue;
            }
            const cmd: string[] = s.command || [];
            if (cmd[0] && path.isAbsolute(cmd[0])) {
              const ok = fs.existsSync(cmd[0]);
              report.push({ name, status: ok ? "OK" : "BROKEN", reason: ok ? "binary exists" : `missing binary ${cmd[0]}`, fix: ok ? "none" : "install it (uv / venv missing?)" });
              continue;
            }
            const pkg = pkgOf(cmd);
            if (!pkg) { report.push({ name, status: "UNKNOWN", reason: `custom command: ${cmd.join(" ")}`, fix: "manual check" }); continue; }
            let exists = false;
            try {
              const out = execFileSync("npm", ["view", pkg, "version"], { encoding: "utf-8", timeout: 30000 }).trim();
              exists = !!out && !/ERR/i.test(out);
            } catch { exists = false; }
            if (!exists) {
              const fix = KNOWN_FIXES.find((f) => f.bad === pkg);
              report.push({ name, status: "BROKEN", reason: `npm 404: ${pkg} does not exist`, fix: fix ? `auto-fixable: ${fix.good.join(" ")}` : "find the real package name" });
              continue;
            }
            const envMissing = Object.entries<string>(s.environment || {}).filter(([, v]) => /\{env:([A-Z_]+)\}/.test(v) && !process.env[RegExp.$1]).map(([k]) => k);
            report.push({ name, status: envMissing.length ? "SLEEPING" : "OK", reason: envMissing.length ? `needs env: ${envMissing.join(",")}` : `${pkg} exists on npm`, fix: envMissing.length ? "export the key, restart opencode" : "none" });
          }
          const broken = report.filter((r) => r.status === "BROKEN");
          const sleeping = report.filter((r) => r.status === "SLEEPING");
          return JSON.stringify({ total: report.length, broken: broken.length, sleeping: sleeping.length, ok: report.filter((r) => r.status === "OK").length, servers: (args.include_sleeping ?? true) ? report : report.filter((r) => r.status !== "SLEEPING") }, null, 2);
        }
      },
      doctor_fix: {
        description: "Self-heal: backs up opencode.json, applies ONLY verified package-name fixes, writes back. Returns the diff. Restart opencode after.",
        args: { type: "object", properties: {} },
        async execute() {
          const raw = fs.readFileSync(CFG, "utf-8");
          const cfg = JSON.parse(raw);
          fs.copyFileSync(CFG, CFG + `.bak-doctor-${Date.now()}`);
          const applied: string[] = [];
          for (const [name, s] of Object.entries<any>(cfg.mcp || {})) {
            const pkg = pkgOf(s.command || []);
            const fix = KNOWN_FIXES.find((f) => f.bad === pkg);
            if (fix && s.enabled !== false) {
              // preserve trailing args that are paths (sqlite db path already in fix)
              s.command = fix.good;
              applied.push(`${name}: ${pkg} -> ${fix.good.join(" ")}`);
            }
          }
          if (!applied.length) return "doctor_fix: nothing auto-fixable. All BROKEN entries need manual package research.";
          fs.writeFileSync(CFG, JSON.stringify(cfg, null, 2));
          return `doctor_fix applied ${applied.length}:\n- ${applied.join("\n- ")}\nBackup kept next to config. RESTART opencode (quit + new terminal + start).`;
        }
      },
      fanout: {
        description: "Ask 2-3 models the same question in parallel, then a judge model picks the best answer. Use when quality matters more than speed.",
        args: {
          type: "object",
          properties: {
            question: { type: "string" },
            models: { type: "array", items: { type: "string" }, description: "default: the 3 free workhorses" },
            judge: { type: "string", description: "judge model, default ling flash" }
          },
          required: ["question"]
        },
        async execute(args: { question: string; models?: string[]; judge?: string }) {
          const models = (args.models?.length ? args.models : ["opencode/muse-spark-1.3-contributor-free", "opencode/ling-3.0-flash-fin-free", "opencode/union-alpha"]).slice(0, 3);
          const judge = args.judge || "opencode/ling-3.0-flash-fin-free";
          const run = (model: string, msg: string) =>
            new Promise<string>((resolve) => {
              execFile("opencode", ["run", "-m", model, msg], { timeout: 180000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                resolve(err ? `[${model} ERROR: ${String(err.message).slice(0, 300)} ${String(stderr).slice(0, 300)}]` : String(stdout).slice(-6000));
              });
            });
          const answers = await Promise.all(models.map((m) => run(m, args.question)));
          const ballot = models.map((m, i) => `--- CANDIDATE ${i + 1} (${m}) ---\n${answers[i]}`).join("\n\n");
          const verdict = await run(judge, `You are a strict judge. Question: ${args.question.slice(0, 2000)}\n\n${ballot.slice(0, 12000)}\n\nReply with exactly: WINNER: <1|2|3> + one sentence why, then the winning answer verbatim.`);
          return JSON.stringify({ winner_judgement: verdict.slice(-3000), candidates: models.map((m, i) => ({ model: m, chars: answers[i].length, answer: answers[i].slice(0, 3000) })) }, null, 2).slice(0, 15000);
        }
      },
      brain_save: {
        description: "Save a lesson that survives sessions (bug->fix, what worked, decisions). Searchable later via brain_recall. Use after every non-trivial fix.",
        args: { type: "object", properties: { text: { type: "string" }, tags: { type: "array", items: { type: "string" } } }, required: ["text"] },
        async execute(args: { text: string; tags?: string[] }) {
          const line = JSON.stringify({ ts: new Date().toISOString(), text: String(args.text).slice(0, 2000), tags: args.tags || [] }) + "\n";
          fs.appendFileSync(BRAIN, line);
          return `brain saved (${line.length}b). brain_recall finds it by keywords.`;
        }
      },
      brain_recall: {
        description: "Search saved lessons by keywords before starting similar work. Returns top matches. Every agent should call this first on unfamiliar tasks.",
        args: { type: "object", properties: { query: { type: "string" }, limit: { type: "number" } }, required: ["query"] },
        async execute(args: { query: string; limit?: number }) {
          if (!fs.existsSync(BRAIN)) return "brain empty. brain_save lessons as you learn.";
          const words = args.query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
          const hits: Array<{ score: number; line: any }> = [];
          for (const raw of fs.readFileSync(BRAIN, "utf-8").split("\n")) {
            if (!raw.trim()) continue;
            try {
              const e = JSON.parse(raw);
              const hay = (e.text + " " + (e.tags || []).join(" ")).toLowerCase();
              const score = words.reduce((a, w) => a + (hay.includes(w) ? 1 + (e.tags || []).filter((t: string) => t.toLowerCase().includes(w)).length : 0), 0);
              if (score > 0) hits.push({ score, line: e });
            } catch {}
          }
          hits.sort((a, b) => b.score - a.score);
          const top = hits.slice(0, Math.min(args.limit || 5, 10)).map((h) => h.line);
          return top.length ? JSON.stringify(top, null, 2).slice(0, 8000) : "no matching lessons. Proceed, then brain_save what you learn.";
        }
      }
    }
  };
}) satisfies Plugin
