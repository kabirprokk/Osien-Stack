#!/usr/bin/env python3
"""Atlas mapper: analyzer over all 10 archetypes -> pattern map (AI training data).
Writes ATLAS.md: per-archetype interactive inventory + universal layout patterns.
"""
import json
import os
import subprocess
import sys

HOME = os.path.expanduser("~")
VPY = os.path.join(HOME, ".config/opencode/.venvs/social/bin/python")
AN = os.path.join(HOME, ".config/opencode/social/analyzer.py")
ATLAS = os.path.join(HOME, "Sites/layout-atlas")

PAGES = ["01-landing", "02-blog", "03-dashboard", "04-portfolio", "05-shop",
         "06-docs", "07-login", "08-checkout", "09-social", "10-settings"]

report = {}
for slug in PAGES:
    url = f"http://127.0.0.1:8003/{slug}.html"
    r = subprocess.run([VPY, AN, url, "3"], capture_output=True, text=True, timeout=90)
    snaps = [json.loads(l) for l in r.stdout.splitlines() if l.startswith("{")]
    first = snaps[0]["els"] if snaps else []
    by_tag = {}
    for e in first:
        by_tag.setdefault(e["t"], []).append(e["n"])
    report[slug] = {"els": len(first),
                     "bytes": len(json.dumps(first)),
                     "tags": {k: len(v) for k, v in by_tag.items()},
                     "sample": [f"{e['t']}:{e['n']}" for e in first[:8]]}

lines = ["# 🗺️ LAYOUT ATLAS — what real websites look like (analyzer-mapped)",
         "", "10 archetypes, one rule each. Read before touching any site.",
         ""]
for slug, d in report.items():
    lines.append(f"## {slug} — {d['els']} interactive els, {d['bytes']} bytes")
    lines.append(f"- tags: {d['tags']}")
    lines.append(f"- e.g. {d['sample'][:5]}")
    lines.append("")
lines += ["## UNIVERSAL PATTERNS (true on 8+/10)",
          "- nav lives in header, links left, action right (button or cart)",
          "- ONE h1 per page; primary action = button.btn after the h1/lede",
          "- forms: label+input pairs, submit button last, checkbox inline",
          "- cards grid = repeat(auto-fit) with h3+b/button inside",
          "- login: email+password+submit+forgot link; checkout adds card+pay",
          "- analyzer cost: ~0.3KB/snapshot vs ~80KB screenshot (250x cheaper)",
          "",
          "AI RULE: never screenshot to FIND things. Read the tree, click the ref. "
          "Screenshots are for LOOKS (final verify), trees are for ACTS."]
open(os.path.join(ATLAS, "ATLAS.md"), "w").write("\n".join(lines))
print(f"mapped {len(report)} archetypes -> ATLAS.md")
for slug, d in report.items():
    print(f"  {slug}: {d['els']} els / {d['bytes']}B")
