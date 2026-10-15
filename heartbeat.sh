#!/bin/bash
# OSIEN night-shift overseer (stolen from Munder Difflin: "come back to finished work").
# Headless run, small free model, READ-ONLY except one SOUL flowchart line. Burns ~1 cheap call.
PROJ=$(head -n 1 "$HOME/.config/opencode/memory/.last-project" 2>/dev/null)
[ -d "$PROJ" ] || PROJ="$HOME/way-to-home"
[ -d "$PROJ" ] || PROJ="$HOME"
timeout 300 "$HOME/.opencode/bin/opencode" run --dir "$PROJ" \
  -m "opencode/mimo-v2.6-flash-free" --title "night-shift" \
  "You are the night-shift overseer. READ-ONLY. Do: 1) git status --porcelain + git diff --stat (if git repo), 2) list top 3 risks/bugs you see, 3) log ONE flowchart line via soul_write(category research/project, text 'night-shift: <risks> → <proposed next move>'). Change NO files except SOUL. Under 12 lines total." \
  >> "$HOME/.config/opencode/memory/.night-shift.log" 2>&1
tail -n 20 "$HOME/.config/opencode/memory/.night-shift.log" > /tmp/ns.tmp 2>/dev/null && mv /tmp/ns.tmp "$HOME/.config/opencode/memory/.night-shift.log" 2>/dev/null || true
