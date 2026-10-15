#!/usr/bin/env python3
"""AI reflex player: reads arena DOM, acts in ms. Measures CONTROL-layer speed.
Heuristic brain (no LLM latency) — the LLM sets strategy, reflexes are silicon.
Usage: arena_player.py [rounds-log] — prints per-round ms + final score.
"""
import os
import sys
import time

HOME = os.path.expanduser("~")
sys.path.insert(0, os.path.join(HOME, ".config/opencode/.venvs/social/lib/python3.12/site-packages"))

from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:8002/index.html"

with sync_playwright() as p:
    import os as _os
    _head = _os.environ.get("ARENA_HEADED", "0") == "1"
    b = p.chromium.launch(executable_path="/usr/bin/brave-browser", headless=not _head,
                          args=["--no-sandbox", "--disable-dev-shm-usage", "--window-size=920,900"])
    ctx = b.new_context(viewport={"width": 900, "height": 800}, record_video_dir="/tmp/vtest/arena-vid",
                        record_video_size={"width": 900, "height": 800})
    pg = ctx.new_page()
    pg.goto(URL, timeout=30000)
    pg.click("#start")
    print("TRIAL STARTED — AI playing")
    played = 0
    for i in range(400):
        pg.wait_for_timeout(150)
        state = pg.evaluate("""() => ({
            goal: document.getElementById('goal').innerText,
            word: document.getElementById('word').innerText,
            typing: document.getElementById('typebox').style.display !== 'none',
            done: !!(window.__arena && window.__arena.done),
            score: document.getElementById('score').innerText,
            btns: [...document.querySelectorAll('.tbtn')].map(b => b.dataset.label)
        })""")
        if state["done"]:
            break
        if state["typing"] and state["word"]:
            pg.fill("#tin", state["word"].lower())
            pg.press("#tin", "Enter")
        else:
            g = state["goal"]
            rnd = state.get("round", "")
            m2 = None
            import re
            if "THEN" in g:
                m2 = re.search(r"CLICK (\w+) THEN (\w+)", g)
                words = list(m2.groups()) if m2 else re.findall(r"CLICK (\w+)", g)
                for w in words:
                    try:
                        pg.click(f'.tbtn[data-label="{w}"]', timeout=1000)
                        pg.wait_for_timeout(80)
                    except Exception as e:
                        print("miss:", w, str(e)[:60])
                        break
            else:
                import re
                m = re.search(r"CLICK the (\w+)", g)
                if not m:
                    m = re.search(r"now CLICK (\w+)", g)
                if m:
                    try:
                        pg.click(f'.tbtn[data-label="{m.group(1)}"]', timeout=1000)
                    except Exception as e:
                        print("miss:", m.group(1), str(e)[:60])
        played += 1
        if played >= 30:
            break
        if i == 5:
            pg.screenshot(path="/tmp/vtest/arena-mid.png")
    pg.wait_for_timeout(1500)
    pg.screenshot(path="/tmp/vtest/arena-final.png")
    rows = pg.evaluate("() => [...document.querySelectorAll('#rows tr')].map(tr => tr.innerText)")
    score = pg.evaluate("() => document.getElementById('score').innerText")
    print(f"FINAL SCORE: {score}")
    for r in rows:
        print("  ", r.replace("\t", " | "))
    vpath = pg.video.path() if pg.video else "n/a"
    print("VIDEO:", vpath)
    ctx.close()
    b.close()
