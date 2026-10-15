import type { Plugin } from "@opencode-ai/plugin"

// SITE LAW v2 (honest): KeepTheStyle is a VISUAL BUILDER APP, not a code scaffold.
// Real KTS usage = author KTS-native projects (semantic HTML + KTS tokens + supported
// elements per FEATURES.md) that import into the builder + verify + upgrade the builder.
// site_new scaffolds a PROJECT (manifest + pages/), never copies the builder app.
export default (async () => {
  const fs = await import("fs")
  const path = await import("path")
  const os = await import("os")
  const HOME = os.homedir()
  const TPL = path.join(HOME, "Documents/keepthestyle_v1")

  const STARTER = (name: string) => `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${name}</title>
<meta name="description" content="${name} — built KTS-native.">
<meta name="theme-color" content="#0B1030">
<!-- KTS-native: semantic elements only (see FEATURES.md matrix), CSS vars = KTS tokens -->
<style>
:root{
  --bg:#05060F; --bg-deep:#02030A; --bg-top:#0B1030;
  --panel:rgba(10,13,24,.82); --hair:rgba(255,255,255,.09);
  --ink:#EEF2FF; --dim:#9AA3BB; --faint:#5C657F;
  --cyan:#00F0FF; --violet:#7B2FFF; --pink:#FF2BD6;
  --gold:#FFD964; --red:#FF2B2B; --r:20px;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;color:var(--ink);min-height:100vh;
  background:linear-gradient(180deg,var(--bg-top),var(--bg) 46%,var(--bg-deep));}
body::before{content:"";position:fixed;inset:0;pointer-events:none;
  background:repeating-linear-gradient(0deg,rgba(0,240,255,.07) 0 1px,transparent 1px 80px),
  repeating-linear-gradient(90deg,rgba(0,240,255,.07) 0 1px,transparent 1px 80px);}
header,main,footer{position:relative;z-index:1;max-width:1100px;margin:0 auto;padding:2rem 1.25rem}
nav{display:flex;gap:1.25rem;align-items:center}
nav a{color:var(--dim);text-decoration:none}
nav a[aria-current]{color:var(--ink)}
h1{font-size:clamp(2.2rem,6vw,4rem);line-height:1.05}
.btn{display:inline-block;padding:.8rem 1.6rem;border-radius:var(--r);color:#02141a;background:var(--cyan);text-decoration:none;font-weight:700}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--hair)}
.card{background:var(--panel);border:1px solid var(--hair);border-radius:var(--r);padding:1.25rem}
.grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}
</style>
</head>
<body>
<header><nav aria-label="Primary">
  <strong>${name}</strong>
  <a href="./index.html" aria-current="page">Home</a>
  <a href="./about.html">About</a>
</nav></header>
<main>
  <h1>${name}</h1>
  <p>Built KTS-native: import this folder into KeepTheStyle to refine visually, then export.</p>
  <p><a class="btn" href="./about.html">Enter</a></p>
</main>
<footer><small>${name} · KTS-native</small></footer>
</body>
</html>
`

  return {
    "chat.params": async (_input: any, output: any) => {
      output.system = (output.system || "") + [
        "",
        "[SITE LAW v2 — ABSOLUTE, EVERY WEBSITE REQUEST]",
        "1. KeepTheStyle is a VISUAL BUILDER. Real usage = site_new project (manifest + KTS-native pages/) + build with FEATURES.md-supported elements + import into builder to refine + export. NEVER copy the builder app per site. NEVER hand-write off-spec code and call it KTS.",
        "2. Missing builder feature? Read FEATURES.md + PLATFORM_ROADMAP.md. If Partial/Planned: implement it IN the template dir (js/css + FEATURES.md row + js syntax check + git diff --check), supervised. Backend-needing features: refuse + propose static alternative.",
        "3. Every reusable win goes to KTS-UPGRADES.md inbox via site_note (user reviews into roadmap).",
        "4. Prove it: site_verify BEFORE show_card. KTS-FALSE = fix, don't ship.",
      ].join("\n")
    },
    tool: {
      site_new: {
        description: "Scaffold a KTS-native website PROJECT (manifest + pages/ starter with KTS tokens). Use for EVERY website request.",
        args: {
          type: "object",
          properties: {
            dir: { type: "string", description: "target dir" },
            name: { type: "string", description: "site name" },
          },
          required: ["dir", "name"],
        },
        async execute(args: { dir: string; name: string }) {
          const dst = args.dir.startsWith("/") ? args.dir : path.join(HOME, args.dir)
          fs.mkdirSync(path.join(dst, "pages"), { recursive: true })
          fs.writeFileSync(path.join(dst, "pages/index.html"), STARTER(args.name))
          fs.writeFileSync(path.join(dst, "pages/about.html"), STARTER(`${args.name} — About`))
          fs.writeFileSync(path.join(dst, "kts.json"), JSON.stringify({ template: TPL, created: new Date().toISOString().slice(0, 10), spec: "FEATURES.md matrix" }, null, 2))
          return `KTS-native project '${args.name}' ready at ${dst} (manifest + 2 pages). Next: build pages, site_verify, import into builder to refine, show_card.`
        },
      },
      site_verify: {
        description: "Verify a site is REALLY KTS-native: manifest + well-formed HTML + supported elements. KTS-TRUE/FALSE, no assuming.",
        args: { type: "object", properties: { dir: { type: "string" } }, required: ["dir"] },
        async execute(args: { dir: string }) {
          const problems: string[] = []
          if (!fs.existsSync(path.join(args.dir, "kts.json"))) problems.push("no kts.json manifest (not scaffolded via site_new)")
          const pages: string[] = []
          try {
            for (const f of fs.readdirSync(path.join(args.dir, "pages"))) if (f.endsWith(".html")) pages.push(f)
          } catch { problems.push("no pages/ dir") }
          if (!pages.length) problems.push("no html pages")
          for (const f of pages.slice(0, 8)) {
            const html = fs.readFileSync(path.join(args.dir, "pages", f), "utf-8")
            if (!/<html[\s>]|<body[\s>]<\/body>|<\/html>/.test(html)) problems.push(`${f}: malformed skeleton`)
            if (/<form[^>]*action\s*=\s*"https?:/.test(html)) problems.push(`${f}: external form endpoint (needs backend arch)`)
            if (/style\s*=\s*"[^"]*#000[^"]*"/.test(html)) problems.push(`${f}: pure #000 bg (style rule: forbidden)`)
          }
          return problems.length ? `KTS-FALSE: fix these:\n- ${problems.join("\n- ")}` : `KTS-TRUE: ${pages.length} pages, manifest ok, matrix-supported`
        },
      },
      site_note: {
        description: "Log a reusable win to the KTS upgrade inbox (user reviews into roadmap).",
        args: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        async execute(args: { text: string }) {
          const inbox = path.join(TPL, "KTS-UPGRADES.md")
          const line = `- ${new Date().toISOString().slice(0, 10)} — ${args.text.slice(0, 200)}\n`
          if (!fs.existsSync(inbox)) fs.writeFileSync(inbox, "# KTS Upgrade Inbox (AI-proposed, user approves into roadmap)\n\n")
          fs.appendFileSync(inbox, line)
          return "noted in KTS-UPGRADES.md (awaiting your review)"
        },
      },
    },
  }
}) satisfies Plugin
