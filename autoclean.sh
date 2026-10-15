#!/bin/bash
# OSIEN weekly auto-clean — keeps the 98%-full nightmare from ever returning.
# Safe only: caches, trash, journals, old snaps. NEVER touches projects, SOUL, or /usr/lib.
LOG="$HOME/.config/opencode/memory/.autoclean.log"
{
echo "=== $(date) ==="
rm -rf ~/.local/share/Trash/* 2>/dev/null; echo "trash: done"
rm -rf ~/.npm/_npx/* 2>/dev/null; echo "npx: done"
npm cache clean --force >/dev/null 2>&1; echo "npm: done"
rm -rf ~/.cache/BraveSoftware/* ~/.cache/mesa_shader_cache/* 2>/dev/null; echo "gpu/browser cache: done"
sudo apt clean 2>/dev/null || apt clean 2>/dev/null; echo "apt: done"
sudo journalctl --vacuum-time=7d >/dev/null 2>&1; echo "journal: done"
flatpak uninstall --unused -y >/dev/null 2>&1; echo "flatpak unused: done"
# opencode session trim: keep 30 newest (fast, no vacuum — vacuum on restart)
rm -rf ~/.local/share/opencode/tool-output/* 2>/dev/null
python3 -c "
import sqlite3,os
try:
  db=os.path.expanduser('~/.local/share/opencode/opencode.db')
  con=sqlite3.connect(db,timeout=10)
  cur=con.cursor()
  cur.execute('SELECT id FROM session ORDER BY time_updated DESC LIMIT 20')
  keep=[r[0] for r in cur.fetchall()]
  q=','.join(['?']*len(keep))
  cur.execute(f'DELETE FROM session WHERE id NOT IN ({q})',keep); s=cur.rowcount
  cur.execute(f'DELETE FROM event WHERE aggregate_id NOT IN ({q})',keep); e=cur.rowcount or 0
  cur.execute(f'DELETE FROM event_sequence WHERE aggregate_id NOT IN ({q})',keep)
  con.commit()
  con.isolation_level=None
  try:
    con.execute('VACUUM;'); print('vacuum ok')
  except Exception as ex:
    print('vacuum skip:',str(ex)[:80])
  con.close()
  print(f'sessions pruned:{s} events:{e}')
except Exception as ex:
  print('skip:',str(ex)[:100])
" 2>&1
df -h / | head -n 2
} >> "$LOG" 2>&1
# keep log tiny
tail -n 30 "$LOG" > "$LOG.tmp" 2>/dev/null && mv "$LOG.tmp" "$LOG" 2>/dev/null || true
