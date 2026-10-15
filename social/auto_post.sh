#!/bin/bash
# auto_post.py: VIDEO -> understand -> caption -> queue -> browser post. ONE command.
# Usage: auto_post.sh VIDEO [--dry] [--headed]   (default: full DRY-RUN, posts nothing)
set -e
SOC="$HOME/.config/opencode/social"
VID="$1"; BASE=$(basename "$VID" | sed 's/\.[^.]*$//' | tr 'A-Z ' 'a-z-' | tr -cd 'a-z0-9-')
WORK="/tmp/auto-$BASE"
mkdir -p "$WORK"
echo "═══ 1/4 UNDERSTAND ═══"
"$SOC/social-py" understand.py "$VID" "$WORK/out"
echo "═══ 2/4 CAPTION ═══"
"$SOC/caption.sh" "$WORK/out" >/dev/null
head -c 150 "$WORK/out/caption.txt"; echo; echo "..."
echo "═══ 3/4 QUEUE ═══"
cp "$VID" "$HOME/PostQueue/$BASE.mp4"
cp "$WORK/out/caption.txt" "$HOME/PostQueue/$BASE.txt"
echo "queued: $BASE"
echo "═══ 4/4 BROWSER POST ${2:---dry} ═══"
"$SOC/social-py" post_browser.py "$VID" "$WORK/out/caption.txt" "$2" ${3:-}
echo "═══ DONE ($BASE) ═══"
