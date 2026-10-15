#!/usr/bin/env python3
"""prev_chat: compact summary of the previous chat session. Nothing more."""
import datetime
import json
import os
import sqlite3

db = os.path.expanduser("~/.local/share/opencode/opencode.db")
con = sqlite3.connect(db, timeout=5)
ss = con.execute(
    "SELECT id,title,time_updated FROM session ORDER BY time_updated DESC LIMIT 3"
).fetchall()
if len(ss) < 2:
    print("LAST CHAT: none yet — fresh start.")
    raise SystemExit
sid, title, updated = ss[1]
when = datetime.datetime.fromtimestamp((updated or 0) / 1000).strftime("%m-%d %H:%M")
texts = []
for (d,) in con.execute(
    "SELECT data FROM part WHERE session_id=? ORDER BY rowid LIMIT 400", (sid,)
):
    try:
        t = json.loads(d).get("text", "").strip().replace("\n", " ")
        if t and len(t) > 15:
            texts.append(t[:140])
    except Exception:
        pass
print(f"LAST CHAT ({when}){((' — ' + title[:50]) if title else '')}: {len(texts)} msgs")
if texts:
    print("TASK: " + texts[0][:160])
    for t in texts[-2:]:
        print("> " + t[:160])
print("Say /flow-next for the move, or just continue talking.")
