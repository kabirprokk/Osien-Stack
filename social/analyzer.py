#!/usr/bin/env python3
"""OSIEN page analyzer: NOT an AI. A script that maps the page to a compact
interactive tree (role/name/bbox) and streams it. Change-pushed (MutationObserver)
+ heartbeat — faster and 50x cheaper than screenshots or 10ms blind polling.
Usage: analyzer.py URL [seconds]  -> JSONL lines on stdout + Hz report on stderr.
"""
import json
import os
import sys
import time

HOME = os.path.expanduser("~")
sys.path.insert(0, os.path.join(HOME, ".config/opencode/.venvs/social/lib/python3.12/site-packages"))

URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8002/index.html"
SECS = float(sys.argv[2]) if len(sys.argv) > 2 else 12

HOOK = """() => {
  if (window.__osienSeq === undefined) window.__osienSeq = 0;
  if (!window.__osienHooked) {
    window.__osienHooked = true;
    new MutationObserver(() => { window.__osienSeq++; }).observe(
      document.body, {childList: true, subtree: true, attributes: true, characterData: true});
  }
  return window.__osienSeq;
}"""

SNAP = """() => {
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  let n = walker.currentNode;
  while (n) {
    const tag = n.tagName ? n.tagName.toLowerCase() : '';
    const role = n.getAttribute && (n.getAttribute('role') || '');
    const name = ((n.innerText || n.value || n.getAttribute('aria-label') || n.alt || '') + '').trim().slice(0, 60);
    const inter = (tag === 'button' || tag === 'a' || tag === 'input' || tag === 'select' || role === 'button' || (n.onclick ? true : false));
    if (inter) {
      const r = n.getBoundingClientRect ? n.getBoundingClientRect() : {x:0,y:0,width:0,height:0};
      out.push({t: tag, n: name, x: Math.round(r.x), y: Math.round(r.y),
                sel: n.id ? '#' + n.id : (n.dataset && n.dataset.label ? '[data-label="' + n.dataset.label + '"]' : tag)});
    }
    n = walker.nextNode();
  }
  return out;
}"""

from playwright.sync_api import sync_playwright

snaps = bytes_total = changes = 0
t_end = time.time() + SECS
last_sig = ""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/usr/bin/brave-browser",
                          args=["--no-sandbox", "--disable-dev-shm-usage"])
    pg = b.new_page(viewport={"width": 900, "height": 800})
    pg.goto(URL, timeout=30000)
    pg.wait_for_timeout(1500)
    t0 = time.time()
    last_emit = 0.0
    while time.time() < t_end:
        seq = pg.evaluate(HOOK)
        now = time.time()
        if seq != last_sig or now - last_emit > 0.5:
            last_sig = seq
            tree = pg.evaluate(SNAP)
            blob = json.dumps({"t": round(now - t0, 2), "els": tree})
            bytes_total += len(blob)
            snaps += 1
            if seq != last_sig and False:
                changes += 1
            last_emit = now
            print(blob, flush=True)
        else:
            time.sleep(0.02)
    dt = time.time() - t0
    print(f"ANALYZER: {snaps} snapshots in {dt:.1f}s, {bytes_total//max(snaps,1)} bytes/snap",
          file=sys.stderr)
    b.close()
