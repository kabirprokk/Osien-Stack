"""HONEST tier arena: T1 control + T2 analyze-decide-act live on a real site. T3 visual optional.
Usage: tier_arena.py [rounds] [--visual]
"""
import os, re, statistics, sys, time
HOME = os.path.expanduser("~")
sys.path.insert(0, os.path.join(HOME, ".config/opencode/.venvs/social/lib/python3.12/site-packages"))
from playwright.sync_api import sync_playwright

ROUNDS = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 15
VISUAL = "--visual" in sys.argv
SITES = ["01-landing", "02-blog", "03-dashboard", "04-portfolio", "05-shop",
         "06-docs", "07-login", "08-checkout", "09-social", "10-settings"]
BASE = "http://127.0.0.1:8003/"

HOOK = """() => {
  const out = [];
  document.querySelectorAll('button,a,input,select,textarea').forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    out.push({t:e.tagName.toLowerCase(), n:(e.innerText||e.placeholder||e.type||'').trim().slice(0,24),
              x:Math.round(r.x), y:Math.round(r.y),
              sel: e.id ? '#'+e.id : (e.dataset.label ? '[data-label="'+e.dataset.label+'"]' : e.tagName.toLowerCase())});
  });
  return out; }"""

def pct(v): return sorted(v)[len(v)//2] if v else 0

snap_ms, decide_ms, act_ms, visual_ms, hit, miss = [], [], [], [], 0, 0
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/brave-browser", args=["--no-sandbox","--disable-dev-shm-usage"])
    for i in range(ROUNDS):
        pg = b.new_page(viewport={"width": 900, "height": 800})
        pg.goto(BASE + SITES[i % len(SITES)] + ".html", timeout=20000)
        t0 = time.time(); tree = pg.evaluate(HOOK); snap_ms.append((time.time()-t0)*1000)
        t0 = time.time()
        goal = ("TYPE" if any(e["t"] in ("input","textarea") for e in tree) and i % 3 == 0 else "CLICK")
        if VISUAL:
            pg.screenshot(path="/tmp/vtest/tier-shot.png"); visual_ms.append((time.time()-t0)*1000)
        if goal == "TYPE":
            inp = next((e for e in tree if e["t"] in ("input","textarea")), None)
            tgt = inp["sel"] if inp else None
            t0 = time.time()
            if tgt and tgt != "input":
                pg.click(tgt, timeout=1500); hit += 1
            else:
                pg.click("input", timeout=1500); miss += 1
            act_ms.append((time.time()-t0)*1000)
        else:
            btn = next((e for e in tree if e["t"] in ("button","a")), None)
            if btn and btn["sel"] not in ("a","button"):
                t0 = time.time(); pg.click(btn["sel"], timeout=1500); act_ms.append((time.time()-t0)*1000); hit += 1
            else:
                t0 = time.time()
                try: pg.click("button, a", timeout=1500); hit += 1
                except Exception: miss += 1
                act_ms.append((time.time()-t0)*1000)
        decide_ms.append((time.time()-t0)*1000)
        pg.close()
    b.close()

t2 = pct(snap_ms) + pct(decide_ms) + pct(act_ms)
print("═══ OSIEN TIER ARENA (honest ms) ═══")
print(f"rounds {ROUNDS} | hits {hit} | misses {miss}")
print(f"T1 analyze   page tree          : {pct(snap_ms):.0f}ms")
print(f"T1 decide    pick from tree     : {pct(decide_ms):.0f}ms")
print(f"T1 act       click/type by ref  : {pct(act_ms):.0f}ms")
print(f"─────────────────────────────────────")
print(f"T2 TOTAL     full react loop    : {t2:.0f}ms")
if VISUAL:
    print(f"T3 visual    screenshot layer   : {pct(visual_ms):.0f}ms (+ slow model vision)")
print("model: heuristic reflex brain (no LLM in the loop = no 10s stall)")
