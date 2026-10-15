#!/bin/bash
# OSIEN update-safe switch: stash custom TUI layer before update, restore after.
# Usage:
#   opencode-update-safe.sh stash    — revert to stock (safe to update)
#   opencode-update-safe.sh restore  — bring our layer back
#   opencode-update-safe.sh update   — stash → update → restore (full auto)
set -e
CFG="$HOME/.config/opencode/opencode.json"
PLUGIN_DIR="$HOME/.config/opencode/plugin"
TUI="$HOME/.config/opencode/tui.json"
THEMES="$HOME/.config/opencode/themes/osien-dope.json"
EXTRA="profiles PERSONA.md"
STASH="$HOME/.config/opencode/.tui-stash"
MEM="$HOME/.config/opencode/memory/OSIEN_SOUL.md"

# OUR layer (everything else = stock). Edit here if you forge new core plugins.
OUR_PLUGINS=("soul-memory.ts" "forge.ts" "aimanager.ts" "mega-tools.ts" "webgame-tools.ts" "forged-*.ts")

log() { echo "[tui-switch] $1"; }

stash() {
  mkdir -p "$STASH/plugin" "$STASH"
  cp "$CFG" "$STASH/opencode.json.pre-update.$(date +%F-%H%M%S).bak"
  cp "$CFG" "$STASH/opencode.json.last"
  cp "$TUI" "$STASH/tui.json.last" 2>/dev/null || true
  cp "$THEMES" "$STASH/" 2>/dev/null || true
  cp -r "$HOME/.config/opencode/mcp" "$STASH/" 2>/dev/null || true
  for e in $EXTRA; do cp -r "$HOME/.config/opencode/$e" "$STASH/" 2>/dev/null || true; done
  log "config backed up"
  for pat in "${OUR_PLUGINS[@]}"; do
    for f in $PLUGIN_DIR/$pat; do
      [ -f "$f" ] && cp "$f" "$STASH/plugin/" && log "stashed $(basename "$f")"
    done
  done
  # revert config to stock plugin list (keep file, just unload ours for update)
  python3 - "$CFG" <<'PY'
import json,sys
p=sys.argv[1]
j=json.load(open(p))
j['_stashed_plugins']=j.get('plugin',[])
j['plugin']=[]
json.dump(j,open(p,'w'),indent=2)
print("reverted to stock: 0 custom plugins loaded")
PY
  log "STASH DONE — safe to update now."
}

restore() {
  [ -f "$STASH/opencode.json.last" ] || { log "nothing stashed, abort"; exit 1; }
  # restore tui layer
  cp "$STASH/tui.json.last" "$TUI" 2>/dev/null || true
  cp "$STASH/osien-dope.json" "$THEMES" 2>/dev/null || true
  cp -r "$HOME/.config/opencode/mcp" "$STASH/" 2>/dev/null || true
  for e in $EXTRA; do cp -r "$STASH/$e" "$HOME/.config/opencode/$e" 2>/dev/null || true; done
  cp -r "$STASH/mcp" "$HOME/.config/opencode/mcp" 2>/dev/null || true
  # restore plugin files
  for f in "$STASH"/plugin/*.ts; do
    [ -f "$f" ] && cp "$f" "$PLUGIN_DIR/" && log "restored $(basename "$f")"
  done
  # restore plugin list + merge (preserve any new keys the update added)
  python3 - "$CFG" "$STASH/opencode.json.last" <<'PY'
import json,sys
cur=json.load(open(sys.argv[1]))
old=json.load(open(sys.argv[2]))
stashed=cur.pop('_stashed_plugins',None) or old.get('plugin',[])
# merge: keep current mcp/model/instructions, restore our plugin list (dedup, only existing files)
import os
base=os.path.expanduser('~/.config/opencode/plugin')
plugins=[p for p in stashed if os.path.exists(os.path.join(os.path.expanduser('~/.config/opencode'),p.lstrip('./')))]
cur['plugin']=plugins
# never touch memory path; ensure instructions still have SOUL rule
inst=cur.get('instructions',[])
if not any('OSIEN_SOUL' in s for s in inst):
    inst=old.get('instructions',inst); cur['instructions']=inst
json.dump(cur,open(sys.argv[1],'w'),indent=2)
print("restored plugins:",plugins)
PY
  log "RESTORE DONE — our TUI layer is back."
  echo "- $(date +%F) — opencode update: stashed → updated → restored." >> "$MEM"
}

case "${1:-}" in
  stash) stash ;;
  restore) restore ;;
  update)
    stash
    log "updating opencode..."
    curl -fsSL https://opencode.ai/install | bash
    ~/.opencode/bin/opencode --version
    restore
    log "UPDATE COMPLETE ✅"
    ;;
  *) echo "usage: $0 {stash|restore|update}"; exit 1 ;;
esac
