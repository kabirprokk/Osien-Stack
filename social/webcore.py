#!/usr/bin/env python3
"""OSIEN reflex core: browse/read/click/type with a SELF-UPGRADING brain.
Visible by default for research (user watches automation), headless for web_act.
Usage:
  webcore.py tree <url>
  webcore.py act <url> "<goal>"
  webcore.py research "<question>" <url> [url...]
  webcore.py learn
"""
import json
import os
import re
import sys
import time
from os import getenv

HOME = os.path.expanduser("~")
sys.path.insert(0, os.path.join(HOME, ".config/opencode/.venvs/social/lib/python3.12/site-packages"))
sys.path.insert(0, os.path.join(HOME, ".config/opencode/social"))
import cursor
LEARN = os.path.join(HOME, ".config/opencode/memory/browse-learn.json")
VISIBLE = getenv("OSIEN_VISIBLE", "0") == "1"
if not getenv("DISPLAY") and not getenv("WAYLAND_DISPLAY"):
    os.environ["DISPLAY"] = ":0"
if not getenv("WAYLAND_DISPLAY") and getenv("XDG_SESSION_TYPE") == "wayland":
    os.environ["WAYLAND_DISPLAY"] = "wayland-0"
BRAVE = "/usr/bin/brave-browser"
ARGS = ["--no-sandbox", "--disable-dev-shm-usage"] + (["--window-size=1280,900"] if VISIBLE else [])

HOOK = """() => {
  const out = [];
  document.querySelectorAll('button,a,input,select,textarea,[role=button],[onclick]').forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    out.push({t:e.tagName.toLowerCase(), n:(e.innerText||e.placeholder||e.getAttribute('aria-label')||'').trim().slice(0,30),
              x:Math.round(r.x), y:Math.round(r.y),
              sel: e.id ? '#'+e.id : (e.dataset.label ? '[data-label="'+e.dataset.label+'"]' : e.tagName.toLowerCase())});
  });
  return {title: document.title, url: location.href, text: document.body.innerText.slice(0,1200), els: out}; }"""


def load():
    try:
        return json.load(open(LEARN))
    except Exception:
        return {"sites": {}, "stats": {"hit": 0, "miss": 0}}


def save(d):
    os.makedirs(os.path.dirname(LEARN), exist_ok=True)
    json.dump(d, open(LEARN, "w"), indent=1)


def domain(u):
    m = re.search(r'https?://([^/]+)', u or '')
    return m.group(1) if m else 'local'


def tgt(e):
    return {"k": "click", "sel": e["sel"], "xy": (e["x"], e["y"]), "txt": e["n"]}


def plan(tree, goal, learn):
    """reflex brain: learned patterns first, then heuristics"""
    g = goal.lower()
    els = tree["els"]
    dom = domain(tree["url"])
    for key, sel in learn["sites"].get(dom, {}).get("patterns", {}).items():
        if key in g:
            for e in els:
                if e["sel"] == sel:
                    return tgt(e), "learned:" + key
            return {"k": "sel", "sel": sel}, "learned-raw"
    if "type" in g or "search" in g or "enter" in g or "fill" in g:
        inp = next((e for e in els if e["t"] in ("input", "textarea")), None)
        if inp:
            return tgt(inp), "type"
    verb = re.search(r'click(?: on)?(?: the)? (.+)$', g)
    if verb:
        want = re.sub(r'\b(button|btn|link|div)\b', '', verb.group(1)).strip()
        best = None
        for e in els:
            nm = e["n"].lower()
            if nm and (nm in want or want.endswith(nm) or want.startswith(nm[:len(want)])):
                if not best or len(nm) > len(best["n"]):
                    best = e
        if best:
            return tgt(best), "click:" + best["n"]
        for e in els:
            if want and want[:6] in e["n"].lower():
                return tgt(e), "click-fuzzy"
    if any(w in g for w in ("first", "go", "home", "start")):
        for e in els:
            if e["t"] in ("button", "a") and e["n"]:
                return tgt(e), "first-click"
    return None, "nomatch"


def cmd_act(url, goal):
    from playwright.sync_api import sync_playwright
    learn = load()
    t0 = time.time()
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=BRAVE, headless=not VISIBLE, args=ARGS)
        pg = b.new_page(viewport={"width": 1280, "height": 900})
        pg.goto(url, timeout=30000)
        pg.wait_for_timeout(400)
        pg.evaluate("() => { window.__osCur = [window.innerWidth/2, window.innerHeight/2]; }")
        tree = pg.evaluate(HOOK)
        t, why = plan(tree, goal, learn)
        ok = False
        if t:
            typing = re.search(r'type|search|enter|fill', goal.lower())

            def by_sel():
                if VISIBLE:
                    okk = cursor.hover_click(pg, t["sel"])
                    if okk: return True
                pg.click(t["sel"], timeout=2000); return True

            def by_text():
                pg.get_by_text(t["txt"], exact=False).first.click(timeout=2000); return True

            def by_xy():
                pg.mouse.click(t["xy"][0] + 8, t["xy"][1] + 8); return True

            for fn, tag in ((by_sel, 'sel'), (by_text, 'text'), (by_xy, 'xy')):
                try:
                    if fn():
                        ok = True
                        why += "|via:" + tag
                        break
                except Exception:
                    pass
            if ok and typing:
                try:
                    pg.keyboard.type(goal.split()[-1])
                except Exception:
                    pass
        dom = domain(url)
        s = learn["sites"].setdefault(dom, {"patterns": {}, "hits": 0, "miss": 0})
        key = re.sub(r'\s+', ' ', goal.lower())[:24]
        if ok:
            s["hits"] += 1
            s["patterns"][key] = t.get("sel") if isinstance(t, dict) else t
            learn["stats"]["hit"] += 1
        else:
            s["miss"] += 1
            learn["stats"]["miss"] += 1
        save(learn)
        b.close()
    return {"ok": ok, "why": why, "goal": goal, "ms": int((time.time() - t0) * 1000),
            "domain": dom, "page": tree["title"], "text": tree["text"][:200],
            "els": len(tree["els"]), "learn": learn["stats"]}


def cmd_research(question, urls):
    """VISIBLE multi-tab research: user watches the automation work."""
    globals()["VISIBLE"] = True
    from playwright.sync_api import sync_playwright
    out = []
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=BRAVE, headless=not VISIBLE, args=ARGS)
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page()
        for u in urls:
            try:
                pg.goto(u, timeout=30000)
                pg.wait_for_timeout(1200)
                d = pg.evaluate(HOOK)
                out.append({"url": d["url"], "title": d["title"], "text": d["text"][:600]})
            except Exception as e:
                out.append({"url": u, "error": str(e)[:120]})
            time.sleep(0.3)
        time.sleep(1.5)
        b.close()
    return {"question": question, "visible": VISIBLE, "sources": out}



SEARCH_HOOK = r"""() => {
  const res = [];
  const bad = /category:|wikipedia - |sign in|log in|privacy policy/i;
  const seen = {};
  document.querySelectorAll('a[href^="http"]').forEach(a => {
    const host = (()=>{try{return new URL(a.href).hostname}catch(e){return ''}})();
    if (!host || /brave|startpage|marginalia|bing|google\./.test(host) || seen[host]) return;
    const title = (a.innerText||'').trim();
    if (!title || title.length < 10 || bad.test(title)) return;
    seen[host] = 1;
    const box = a.closest('div');
    const clean = (s)=>String(s||'').replace(/\s+/g,' ').trim();
    res.push({t:clean(title).slice(0,90), u:a.href, s:clean(box?box.innerText:'').slice(0,240)});
  });
  return {title: document.title, url: location.href, results: res.slice(0,10), n: res.length};
}"""

ENGINES = ["https://search.brave.com/search?q=", "https://www.startpage.com/sp/search?query=",
           "https://search\\.marginalia.nu/search?query="]

def cmd_search(query):
    globals()['VISIBLE'] = True
    """VISIBLE search: cycles engines until real results appear."""
    from playwright.sync_api import sync_playwright
    from urllib.parse import quote_plus
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=BRAVE, headless=not VISIBLE, args=ARGS)
        ctx = b.new_context(viewport={"width": 1280, "height": 900})
        pg = ctx.new_page()
        best = {"results": [], "used": None}
        for eng in ENGINES:
            try:
                pg.goto(eng + quote_plus(query), timeout=25000)
                pg.wait_for_timeout(1400)
                d = pg.evaluate(SEARCH_HOOK)
                if len(d["results"]) > len(best["results"]):
                    best = {"results": d["results"], "used": eng.split('/')[2]}
                if len(d["results"]) >= 3:
                    break
            except Exception:
                continue
        time.sleep(1.2)
        b.close()
    return {"query": query, "visible": VISIBLE, "engine": best["used"],
            "count": len(best["results"]), "results": best["results"],
            "note": "" if best["results"] else "NO RESULTS - do not guess, reword or open a known URL"}


def cmd_tree(url):
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=BRAVE, headless=True, args=ARGS)
        pg = b.new_page()
        pg.goto(url, timeout=30000)
        pg.wait_for_timeout(600)
        r = json.dumps(pg.evaluate(HOOK))
        b.close()
    return r


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'tree'
    if cmd == 'search':
        print(json.dumps(cmd_search(sys.argv[2] if len(sys.argv) > 2 else '')))
    elif cmd == 'act':
        print(json.dumps(cmd_act(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'click')))
    elif cmd == 'research':
        q = sys.argv[2] if len(sys.argv) > 2 else ''
        urls = sys.argv[3:] or ['https://en.wikipedia.org/wiki/Web_browser']
        print(json.dumps(cmd_research(q, urls)))
    elif cmd == 'learn':
        d = load()
        print(json.dumps({'stats': d['stats'],
                          'sites': {k: {'hits': v['hits'], 'miss': v['miss'], 'patterns': len(v['patterns'])}
                                    for k, v in d['sites'].items()}}, indent=1))
    else:
        print(cmd_tree(sys.argv[2]))