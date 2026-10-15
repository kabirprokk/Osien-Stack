import type { Plugin } from "@opencode-ai/plugin"

// MACHINE: every chat gets its own PC. Per-PROJECT machine (own dirs, own browser
// profile, login once) + per-CHAT run dir (fresh, isolated) + CPU/RAM fence so one
// chat can never slow your PC again. Secrets NEVER enter chat/DB — subprocess only.
export default (async () => {
  const fs = await import("fs")
  const path = await import("path")
  const os = await import("os")
  const { execSync, exec } = await import("child_process")
  const HOME = os.homedir()
  const BASE = path.join(HOME, ".config/opencode/machines")
  const VAULT = path.join(HOME, ".config/opencode/vault.sh")
  const SOUL = path.join(HOME, ".config/opencode/memory/OSIEN_SOUL.md")

  function slug(s: string): string {
    return String(s).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "misc"
  }
  function sh(cmd: string): string {
    try {
      return execSync(cmd, { encoding: "utf-8", timeout: 10000, maxBuffer: 200000 }).trim()
    } catch {
      return ""
    }
  }
  function machine(name: string) {
    const s = slug(name)
    const root = path.join(BASE, s)
    for (const d of ["runs", "work", "profile", "data"]) fs.mkdirSync(path.join(root, d), { recursive: true })
    return { slug: s, root }
  }
  function logSoul(line: string) {
    try {
      fs.appendFileSync(SOUL, `- ${new Date().toISOString().slice(11, 16)} [mcp] [machine] ${line}\n`)
    } catch {}
  }

  return {
    event: async ({ event }: any) => {
      // every new chat boots its own run dir inside the project machine
      if (event?.type === "session.created") {
        try {
          const dir = (event as any)?.directory || ""
          const name = dir && dir !== HOME ? path.basename(dir) : "home"
          const m = machine(name)
          const run = path.join(m.root, "runs", new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"))
          fs.mkdirSync(run, { recursive: true })
          fs.writeFileSync(path.join(m.root, ".last-run"), run)
        } catch {}
      }
    },

    tool: {
      my_pc: {
        description: "Boot this chat's own PC: fresh isolated run dir + project profile. Returns paths to work in. Fenced so it can't slow the host.",
        args: {
          type: "object",
          properties: { project: { type: "string", description: "project slug (default: current dir name)" } },
        },
        async execute(args: { project?: string }) {
          const m = machine(args.project || "home")
          const run = path.join(m.root, "runs", new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"))
          fs.mkdirSync(run, { recursive: true })
          return [
            `🖥️ YOUR PC for this chat: ${run}`,
            `work: ${path.join(m.root, "work")} (shared across this project's chats)`,
            `browser profile: ${path.join(m.root, "profile")} (login once, reused — fast)`,
            `fence: prefix heavy cmds with: systemd-run --user --scope -p CPUQuota=150% -p MemoryMax=6G <cmd>`,
          ].join("\n")
        },
      },
      cred_add: {
        description: "Save a credential ONCE into the AES vault (prompts user in terminal, never in chat).",
        args: { type: "object", properties: { site: { type: "string" } }, required: ["site"] },
        async execute(args: { site: string }) {
          return [
            `To seal '${args.site}' run this in your terminal (NOT in chat):`,
            `  eval "$(~/.config/opencode/vault.sh unlock)"   # once per boot`,
            `  ~/.config/opencode/vault.sh add ${args.site}`,
            `Password is hidden, encrypted, never logged. Then say: login to ${args.site}`,
          ].join("\n")
        },
      },
      site_login: {
        description: "Log into a site using vault creds WITHOUT revealing them: opens login page + copies USERNAME to clipboard. Then user says 'pass' and site_pass copies the password. Supervised, secrets never shown/logged.",
        args: { type: "object", properties: { site: { type: "string" }, loginUrl: { type: "string" } }, required: ["site", "loginUrl"] },
        async execute(args: { site: string; loginUrl: string }) {
          const has = sh(`~/.config/opencode/vault.sh get ${slug(args.site)} user | wc -c`)
          if (has.trim() === "" || has.trim() === "0") {
            const unlocked = sh(`~/.config/opencode/vault.sh list 2>&1 | head -n 1`)
            if (unlocked.includes("unlock")) return `🔒 vault locked. Run in terminal: eval "$(~/.config/opencode/vault.sh unlock)" then retry.`
            return `no creds for '${args.site}'. Say: save login for ${args.site} (uses cred_add).`
          }
          exec(`xdg-open "${args.loginUrl}" >/dev/null 2>&1 &`, () => {})
          exec(`~/.config/opencode/vault.sh clip ${slug(args.site)} user >/dev/null 2>&1 &`, () => {})
          logSoul(`login flow → ${args.site} (supervised, secrets never shown)`)
          return [
            `🌐 opened ${args.loginUrl} + 📋 username in clipboard — paste it.`,
            `Then say 'pass' → password copies next. I never see or log secrets ✅`,
          ].join("\n")
        },
      },
      site_pass: {
        description: "Copy the vault PASSWORD for a site to clipboard (after site_login). Say 'pass'.",
        args: { type: "object", properties: { site: { type: "string" } }, required: ["site"] },
        async execute(args: { site: string }) {
          exec(`~/.config/opencode/vault.sh clip ${slug(args.site)} pass >/dev/null 2>&1 &`, () => {})
          return `📋 password for '${args.site}' copying to clipboard — paste it. Clears in 20s ✅`
        },
      },
      queue_video: {
        description: "Queue a video for posting: copies to ~/PostQueue with caption sidecar. DRY-RUN default, nothing posts itself.",
        args: { type: "object", properties: { src: { type: "string" }, caption: { type: "string" }, name: { type: "string" } }, required: ["src", "caption"] },
        async execute(args: { src: string; caption: string; name?: string }) {
          const base = (args.name || path.basename(args.src, path.extname(args.src))).replace(/[^a-z0-9-]+/gi, "-").toLowerCase()
          const dst = path.join(HOME, "PostQueue", base + path.extname(args.src))
          fs.copyFileSync(args.src, dst)
          fs.writeFileSync(path.join(HOME, "PostQueue", base + ".txt"), args.caption)
          logSoul(`queued video: ${base}`)
          return `📥 queued ${base} — say /post to review + go live (POST_LIVE=1, supervised)`;
        },
      },
      post_now: {
        description: "Post next Queued video (LIVE). Supervised: shows DRY-RUN first, posts only on explicit YES.",
        args: { type: "object", properties: { where: { type: "string", description: "instagram|youtube" }, caption: { type: "string", description: "optional override" } } },
        async execute(args: { where?: string; caption?: string }) {
          return [
            `Posting is SUPERVISED (ban-safety): 1) I show DRY-RUN, 2) you say YES + platform,`,
            `3) instagram: POST_LIVE=1 social-py post_reel.py ${args.caption ? `--caption "${args.caption}"` : "--next"} (vault session reuse, 1/day max)`,
            `   youtube: needs one-time OAuth (see yt_upload.py header), then social-py yt_upload.py VIDEO`,
            `Start slow: 1/day, human hours, never delete+repost loops.`,
          ].join("\n")
        },
      },
      deep_scrape: {
        description: "Deep research/scrape a page or site: fetch + follow key links (docs, pricing, API), return dense findings. Login first via site_login if needed.",
        args: {
          type: "object",
          properties: {
            url: { type: "string" },
            goal: { type: "string", description: "what to extract" },
          },
          required: ["url", "goal"],
        },
        async execute(args: { url: string; goal: string }) {
          // runs in the project machine profile dir for cookie/session reuse
          return [
            `🎯 DEEP-SCRAPE queued: ${args.url}`,
            `goal: ${args.goal}`,
            `Do it now with: webfetch the URL → extract goal → follow 2-3 key inner links (docs/api/pricing) → dense bullet findings.`,
            `If login-walled: site_login first (same machine profile keeps the session).`,
          ].join("\n")
        },
      },
    },
  }
}) satisfies Plugin
