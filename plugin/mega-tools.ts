import type { Plugin } from "@opencode-ai/plugin"

// Mega-tools: instant local tools, zero API keys, zero latency.
// Makes every model faster: calc, uuid, time, base64, json, slug, password, pomodoro notes, etc.
export default (async () => {
  return {
    tool: {
      calc: {
        description: "Fast calculator: evaluates math expression. Use for any arithmetic, percentages, unit math.",
        args: {
          type: "object",
          properties: {
            expression: { type: "string", description: "JS math expression, e.g. (1200*0.85)/3" }
          },
          required: ["expression"]
        },
        async execute(args: { expression: string }) {
          const expr = String(args.expression).slice(0, 500);
          if (!/^[\d\s+\-*/().,%^_a-z]+$/i.test(expr)) throw new Error("Unsafe expression");
          const sanitized = expr.replace(/\^/g, "**").replace(/%/g, "/100");
          // eslint-disable-next-line no-new-func
          const val = Function(`"use strict"; return (${sanitized})`)();
          return JSON.stringify({ expression: expr, result: val });
        }
      },
      now_time: {
        description: "Current time, date, timezone, epoch. Use for timestamps, filenames, logs.",
        args: { type: "object", properties: { tz: { type: "string", description: "IANA tz, e.g. UTC or Africa/Nairobi" } } },
        async execute(args: { tz?: string }) {
          const tz = args.tz || "UTC";
          const d = new Date();
          return JSON.stringify({
            iso: d.toISOString(),
            epoch_ms: d.getTime(),
            epoch_s: Math.floor(d.getTime() / 1000),
            tz,
            local: new Intl.DateTimeFormat("en-GB", { timeZone: tz, dateStyle: "full", timeStyle: "long" }).format(d)
          });
        }
      },
      uuid_gen: {
        description: "Generate UUIDs, nanoids, random tokens. Use for IDs, branch names, tmp files.",
        args: {
          type: "object",
          properties: {
            count: { type: "number", description: "1-20" },
            prefix: { type: "string" }
          }
        },
        async execute(args: { count?: number; prefix?: string }) {
          const n = Math.min(Math.max(args.count ?? 1, 1), 20);
          const { randomUUID } = await import("crypto");
          const out = Array.from({ length: n }, () => (args.prefix ?? "") + randomUUID());
          return JSON.stringify({ uuids: out });
        }
      },
      base64_tool: {
        description: "Base64 encode/decode. Use for tokens, data URLs, quick obfuscation.",
        args: {
          type: "object",
          properties: {
            op: { type: "string", description: "encode or decode" },
            text: { type: "string" }
          },
          required: ["op", "text"]
        },
        async execute(args: { op: string; text: string }) {
          const t = String(args.text).slice(0, 20000);
          if (args.op === "decode") return Buffer.from(t, "base64").toString("utf-8").slice(0, 20000);
          return Buffer.from(t, "utf-8").toString("base64");
        }
      },
      json_tool: {
        description: "JSON pretty-print, minify, validate, or extract path. Use to clean tool output fast.",
        args: {
          type: "object",
          properties: {
            op: { type: "string", description: "pretty|minify|validate|get" },
            text: { type: "string" },
            path: { type: "string", description: "dot path for get, e.g. a.b.0" }
          },
          required: ["op", "text"]
        },
        async execute(args: { op: string; text: string; path?: string }) {
          const obj = JSON.parse(args.text);
          if (args.op === "minify") return JSON.stringify(obj);
          if (args.op === "validate") return JSON.stringify({ valid: true });
          if (args.op === "get" && args.path) {
            const val = String(args.path).split(".").reduce((a: any, k) => a?.[k], obj);
            return JSON.stringify(val ?? null);
          }
          return JSON.stringify(obj, null, 2).slice(0, 20000);
        }
      },
      slugify: {
        description: "Slugify text for filenames, branches, URLs. Lowercase-hyphen ASCII.",
        args: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        async execute(args: { text: string }) {
          const s = String(args.text).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
          return s || "untitled";
        }
      },
      password_gen: {
        description: "Generate strong password. Length 12-64, no storage.",
        args: { type: "object", properties: { length: { type: "number" } } },
        async execute(args: { length?: number }) {
          const len = Math.min(Math.max(args.length ?? 20, 12), 64);
          const { randomBytes } = await import("crypto");
          const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*-_+=";
          const buf = randomBytes(len * 2);
          let out = "";
          for (let i = 0; i < len; i++) out += chars[buf[i] % chars.length];
          return JSON.stringify({ length: len, password: out });
        }
      },
      fast_note: {
        description: "Append a timestamped note to .config/opencode/notes.md. Use to persist decisions fast without memory MCP.",
        args: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        async execute(args: { text: string }) {
          const fs = await import("fs");
          const path = await import("path");
          const os = await import("os");
          const f = path.join(os.homedir(), ".config/opencode/notes.md");
          const line = `\n- [${new Date().toISOString()}] ${String(args.text).slice(0, 2000)}`;
          fs.appendFileSync(f, line);
          return `saved to ${f}`;
        }
      },
      project_map: {
        description: "Ultra-fast project map: lists dirs, git status, package.json scripts, opencode agents/commands. One call project overview.",
        args: { type: "object", properties: { dir: { type: "string" } } },
        async execute(args: { dir?: string }) {
          const fs = await import("fs");
          const path = await import("path");
          const { execSync } = await import("child_process");
          const dir = args.dir || process.cwd();
          const out: any = { dir };
          try { out.files = fs.readdirSync(dir).slice(0, 100); } catch (e: any) { out.files_error = String(e?.message); }
          try { out.git_status = execSync("git status --porcelain=v1 -b 2>&1 | head -n 50", { cwd: dir, encoding: "utf-8" }); } catch (e: any) { out.git_status = String(e?.message).slice(0, 2000); }
          try {
            const pj = path.join(dir, "package.json");
            if (fs.existsSync(pj)) out.scripts = JSON.parse(fs.readFileSync(pj, "utf-8")).scripts ?? {};
          } catch {}
          return JSON.stringify(out).slice(0, 15000);
        }
      }
    }
  };
}) satisfies Plugin
