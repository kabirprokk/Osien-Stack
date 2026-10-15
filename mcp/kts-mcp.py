#!/usr/bin/env python3
"""KTS MCP server: KeepTheStyle as real MCP tools. stdio JSON-RPC, zero deps.
EXTEND ME (AI tool-making): to add a tool, write tool_<name>(args)->str, add one
TOOLS row (name, description, {arg: hint}), add to FUNCS. Rich pages go in
kts_pages.py as new kinds + KINDS entry. Then tools/list picks it up, no restart
of the file needed (server reloads per session).

Tools: site_new, site_verify, site_note, page_add, features_check, tokens.
Websites are built ONLY through these tools. Hand-written site code is a violation.
"""
import json
import os
import re
import sys
sys.path.insert(0, os.path.join(os.path.expanduser("~"), ".config/opencode/mcp"))
import kts_pages

HOME = os.path.expanduser("~")
TPL = os.path.join(HOME, "Documents/keepthestyle_v1")
FEATS = os.path.join(TPL, "FEATURES.md")
ROAD = os.path.join(TPL, "PLATFORM_ROADMAP.md")
INBOX = os.path.join(TPL, "KTS-UPGRADES.md")

OGS_TOKENS = """:root{
  --bg:#05060F; --bg-deep:#02030A; --bg-top:#0B1030;
  --panel:rgba(10,13,24,.82); --hair:rgba(255,255,255,.09);
  --ink:#EEF2FF; --dim:#9AA3BB; --faint:#5C657F;
  --cyan:#00F0FF; --violet:#7B2FFF; --pink:#FF2BD6;
  --gold:#FFD964; --red:#FF2B2B; --r:20px;
}"""


def starter(name, nav_extra=""):
    return """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>%s</title>
<meta name="description" content="%s">
<meta name="theme-color" content="#0B1030">
<!-- KTS-native: generated ONLY via kts-mcp page_add. Semantic elements, KTS tokens. -->
<style>
%s
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;color:var(--ink);min-height:100vh;
  background:linear-gradient(180deg,var(--bg-top),var(--bg) 46%%,var(--bg-deep));}
body::before{content:"";position:fixed;inset:0;pointer-events:none;
  background:repeating-linear-gradient(0deg,rgba(0,240,255,.07) 0 1px,transparent 1px 80px),
  repeating-linear-gradient(90deg,rgba(0,240,255,.07) 0 1px,transparent 1px 80px);}
header,main,footer{position:relative;z-index:1;max-width:1100px;margin:0 auto;padding:2rem 1.25rem}
nav{display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap}
nav a{color:var(--dim);text-decoration:none}
nav a[aria-current]{color:var(--ink)}
h1{font-size:clamp(2.2rem,6vw,4rem);line-height:1.05}
.btn{display:inline-block;padding:.8rem 1.6rem;border-radius:var(--r);color:#02141a;background:var(--cyan);text-decoration:none;font-weight:700}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--hair)}
.card{background:var(--panel);border:1px solid var(--hair);border-radius:var(--r);padding:1.25rem;margin-top:1rem}
</style>
</head>
<body>
<header><nav aria-label="Primary">
  <strong>%s</strong>%s
</nav></header>
<main>
  <h1>%s</h1>
  <div class="card"><p>Built KTS-native via kts-mcp. Import into KeepTheStyle to refine visually, then export.</p></div>
</main>
<footer><small>%s</small></footer>
</body>
</html>
""" % (name, name + " — built KTS-native.", OGS_TOKENS, name.split(" — ")[0], nav_extra, name, name)


def tool_site_new(a):
    dst = a["dir"] if a["dir"].startswith("/") else os.path.join(HOME, a["dir"])
    name = a["name"]
    os.makedirs(os.path.join(dst, "pages"), exist_ok=True)
    nav = '\n  <a href="./index.html" aria-current="page">Home</a>\n  <a href="./about.html">About</a>'
    open(os.path.join(dst, "pages/index.html"), "w").write(starter(name, nav))
    open(os.path.join(dst, "pages/about.html"), "w").write(starter(name + " — About", nav))
    open(os.path.join(dst, "kts.json"), "w").write(json.dumps(
        {"via": "kts-mcp", "template": TPL, "spec": "FEATURES.md matrix"}, indent=1))
    return f"KTS project '{name}' ready at {dst} (manifest + 2 pages, MCP-made). Next: page_add, site_verify."


def tool_site_verify(a):
    d = a["dir"]
    bad = []
    if not os.path.exists(os.path.join(d, "kts.json")):
        bad.append("no kts.json manifest (NOT made via kts-mcp site_new)")
    pages = []
    pdir = os.path.join(d, "pages")
    if os.path.isdir(pdir):
        pages = [f for f in os.listdir(pdir) if f.endswith(".html")]
    if not pages:
        bad.append("no pages/")
    for f in pages[:8]:
        html = open(os.path.join(pdir, f)).read()
        if "kts-mcp" not in html:
            bad.append(f"{f}: no kts-mcp origin marker (hand-written, NOT MCP-made)")
        if not re.search(r"<html[\s>]|</html>", html):
            bad.append(f"{f}: malformed skeleton")
        if re.search(r"<form[^>]*action\s*=\s*\"https?:", html):
            bad.append(f"{f}: external form endpoint (needs backend arch)")
    if bad:
        return "KTS-FALSE:\n- " + "\n- ".join(bad)
    return f"KTS-TRUE: {len(pages)} MCP-made pages, manifest ok"


def tool_site_note(a):
    line = f"- {a.get('text', '')[:200]}\n"
    if not os.path.exists(INBOX):
        open(INBOX, "w").write("# KTS Upgrade Inbox (AI-proposed via kts-mcp, user approves)\n\n")
    open(INBOX, "a").write(line)
    return "noted in KTS-UPGRADES.md (awaiting review)"


def tool_page_add(a):
    d = a["dir"]
    slug = re.sub(r"[^a-z0-9-]+", "-", a["slug"].lower()).strip("-")
    nav = '\n  <a href="./index.html">Home</a>'
    try:
        idx = open(os.path.join(d, "pages/index.html")).read()
        links = re.findall(r'<a href="(\./[\w-]+\.html)"[^>]*>([^<]+)</a>', idx)
        if links:
            nav = "".join(f'\n  <a href="{h}">{t}</a>' for h, t in links[:8])
    except Exception:
        pass
    body = starter(a["title"], nav)
    dest = os.path.join(d, "pages", slug + ".html")
    open(dest, "w").write(body)
    return f"page added via kts-mcp: {dest}"


def tool_features_check(a):
    q = a["feature"].lower()
    out = []
    for path, label in ((FEATS, "FEATURES.md"), (ROAD, "PLATFORM_ROADMAP.md")):
        try:
            txt = open(path).read()
        except Exception:
            continue
        for line in txt.split("\n"):
            if q in line.lower():
                out.append(f"[{label}] {line.strip()[:160]}")
    if not out:
        return f"'{a['feature']}': NOT in matrix/roadmap → treat as missing: implement in template dir (supervised) or delegate to fast muscle."
    return "\n".join(out[:6])


def tool_tokens(_a):
    return "OGS locked tokens (KTS-native pages must use ONLY these):\n" + OGS_TOKENS


def tool_publish_patch(a):
    """Supervised push of template improvements to GitHub (user said YES already)."""
    import subprocess
    msg = a.get("message", "kts upgrade via kts-mcp")
    dry = str(a.get("dry", "true")).lower() == "true"
    def sh(cmd):
        r = subprocess.run(cmd, shell=True, cwd=TPL, capture_output=True, text=True, timeout=60000)
        return r.returncode, (r.stdout + r.stderr)[-1500:]
    code, js = sh("git status --porcelain | head -n 20")
    if not js.strip():
        return "nothing to publish (template clean)"
    if dry:
        return f"DRY-RUN would commit+push:\n{js}\nSay YES to fire publish_patch dry=false."
    sh("git add -A")
    code, dif = sh("git diff --cached --check")
    if code != 0:
        return f"BLOCKED: whitespace errors:\n{dif}"
    code, out = sh(f'git commit -m "{msg[:120]}"')
    if code != 0:
        return f"commit failed:\n{out[-800:]}"
    code, out = sh("git push origin main")
    tail = out[-800:]
    return ("PUSHED to main ✅\n" + tail) if code == 0 else ("PUSH FAILED:\n" + tail)


TOOLS = {
    "site_new": ("Scaffold KTS-native website PROJECT (manifest + pages/). ONLY way to start any website.", {"dir": "target dir", "name": "site name"}),
    "site_verify": ("Verify REALLY MCP-made: manifest + origin markers + matrix rules. KTS-TRUE/FALSE.", {"dir": "project dir"}),
    "site_note": ("Log reusable win to KTS upgrade inbox.", {"text": "one-line win"}),
    "page_add": ("Add a page to a KTS project (MCP-made shell, same tokens/nav).", {"dir": "project dir", "slug": "file-slug", "title": "page title"}),
    "features_check": ("Check FEATURES.md/roadmap for a capability before building.", {"feature": "e.g. hero video, forms, components"}),
    "tokens": ("Locked OGS token block for KTS-native pages.", {}),
    "page_build": ("Build a RICH page (hero/games/studio/download/about) via MCP. The ONLY way to author content pages.", {"dir": "project dir", "slug": "file-slug", "title": "page title", "desc": "lede/description", "kind": "hero|games|studio|download|about", "video": "optional mp4 path", "poster": "optional poster path", "nav": "optional raw nav links html"}),
    "publish_patch": ("SUPERVISED: commit+push template improvements to GitHub main. DRY-RUN default.", {"message": "commit msg", "dry": "true|false"}),
}
def tool_page_build(a):
    import kts_pages
    kind = a.get("kind", "about")
    if kind not in kts_pages.KINDS:
        return f"ERROR: kind must be one of {kts_pages.KINDS}"
    d = a["dir"]
    nav = ""
    try:
        idx = open(os.path.join(d, "pages/index.html")).read()
        links = re.findall(r'<a href="(\./[\w-]+\.html)"[^>]*>([^<]+)</a>', idx)
        if links:
            nav = "".join(f'\n  <a href="{h}">{t}</a>' for h, t in links[:8])
    except Exception:
        pass
    slug = re.sub(r"[^a-z0-9-]+", "-", a["slug"].lower()).strip("-")
    html = kts_pages.build(kind, a.get("title", slug), a.get("desc", a.get("title", slug)),
                           a.get("nav", nav), "", a.get("video", ""), a.get("poster", ""))
    open(os.path.join(d, "pages", slug + ".html"), "w").write(html)
    return f"rich page built via kts-mcp: pages/{slug}.html ({kind})"


FUNCS = {"publish_patch": tool_publish_patch, "site_new": tool_site_new, "site_verify": tool_site_verify, "site_note": tool_site_note,
         "page_add": tool_page_add, "page_build": tool_page_build, "features_check": tool_features_check, "tokens": tool_tokens}


def resp(i, result=None, error=None):
    m = {"jsonrpc": "2.0", "id": i}
    if error:
        m["error"] = {"code": -32603, "message": str(error)[:300]}
    else:
        m["result"] = result
    sys.stdout.write(json.dumps(m) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        mid, method, params = msg.get("id"), msg.get("method"), msg.get("params", {}) or {}
        try:
            if method == "initialize":
                resp(mid, {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}},
                           "serverInfo": {"name": "kts", "version": "1.0.0"}})
            elif method == "tools/list":
                resp(mid, {"tools": [
                    {"name": n, "description": d,
                     "inputSchema": {"type": "object",
                                     "properties": {k: {"type": "string"} for k in req},
                                     "required": list(req)}}
                    for n, (d, req) in TOOLS.items()]})
            elif method == "tools/call":
                name = params.get("name", "")
                if name not in FUNCS:
                    resp(mid, error=f"unknown tool {name}")
                else:
                    try:
                        text = FUNCS[name](params.get("arguments", {}) or {})
                        resp(mid, {"content": [{"type": "text", "text": text}]})
                    except Exception as e:
                        resp(mid, {"content": [{"type": "text", "text": f"ERROR: {e}"}]})
            elif method in ("ping",):
                resp(mid, {})
            elif method and method.startswith("notifications/"):
                pass
            elif mid is not None:
                resp(mid, {})
        except Exception as e:
            if mid is not None:
                resp(mid, error=e)


if __name__ == "__main__":
    main()
