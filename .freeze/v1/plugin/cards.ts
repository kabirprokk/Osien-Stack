import type { Plugin } from "@opencode-ai/plugin"

// CARDS: CLI answer to browser result-cards. After codegen, AI shows a card:
// bordered box + file/rows + preview + ONE-KEY copy (xclip, the copy button).
// AI develops its own cards: custom rows[] per need.
export default (async () => {
  const fs = await import("fs");
  const { exec } = await import("child_process");

  function box(title: string, rows: string[], preview: string): string {
    const W = 62;
    const bar = (s: string) => `┃ ${s.slice(0, W - 2).padEnd(W - 2)} ┃`;
    const top = `┏${"━".repeat(W)}┓`;
    const sep = `┣${"━".repeat(W)}┫`;
    const bot = `┗${"━".repeat(W)}┛`;
    const titleRow = `┃ 🃏 ${title.slice(0, W - 5).padEnd(W - 5)} ┃`;
    const body = rows.map(bar).join("\n");
    const prev = preview
      ? `\n${sep}\n${preview.split("\n").slice(0, 8).map((l) => bar(l)).join("\n")}`
      : "";
    return [top, titleRow, sep, body, prev, bot].join("\n");
  }

  function toClipboard(text: string) {
    // never-hang copy: detached spawn, force-killed after 3s, errors swallowed
    try {
      const { spawn } = require("child_process") as typeof import("child_process");
      const p = spawn(`xclip`, ["-selection", "clipboard"], { stdio: ["pipe", "ignore", "ignore"] });
      const killer = setTimeout(() => {
        try {
          p.kill("SIGKILL");
        } catch {}
      }, 3000);
      if (typeof (killer as any)?.unref === "function") (killer as any).unref();
      p.stdin?.write(text);
      p.stdin?.end();
      p.unref?.();
    } catch {}
  }

  return {
    tool: {
      show_card: {
        description: "Show a result CARD on CLI after generating code/files: bordered card + auto-copy to clipboard (the copy button) + copy-cmd. AI adds custom rows as needed.",
        args: {
          type: "object",
          properties: {
            title: { type: "string", description: "card title, e.g. hero-section.html" },
            file: { type: "string", description: "absolute file path (optional, content auto-read + copied)" },
            code: { type: "string", description: "code text (if no file)" },
            lang: { type: "string", description: "html|css|js|py|..." },
            rows: { type: "string", description: "extra custom rows, one per line, e.g. 'preview: python3 -m http.server'" },
          },
          required: ["title"],
        },
        async execute(args: { title: string; file?: string; code?: string; lang?: string; rows?: string }) {
          let content = args.code || "";
          if (args.file) {
            try {
              content = fs.readFileSync(args.file, "utf-8");
            } catch {
              content = "";
            }
          }
          const lines = content ? content.split("\n").length : 0;
          const size = content ? Buffer.byteLength(content) : 0;
          const meta = [
            args.file ? `📄 ${args.file}` : `⌨️ inline ${args.lang || "code"}`,
            content ? `📏 ${lines} lines · ${(size / 1024).toFixed(1)} KB` : "⚠️ empty",
            "📋 copied to clipboard ✅ (paste anywhere)",
            args.file ? `⤵️ re-copy: cat "${args.file}" | xclip -selection clipboard` : "",
            ...(args.rows ? args.rows.split("\n").filter(Boolean).map((r) => `▸ ${r}`) : []),
          ].filter(Boolean);
          if (content) toClipboard(content);
          return box(args.title, meta, content);
        },
      },
    },
  }
}) satisfies Plugin
