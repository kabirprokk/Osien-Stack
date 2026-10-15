#!/bin/bash
# caption.py: contact sheet + transcript -> caption via headless opencode (vision-capable main model).
# Usage: caption.py OUTDIR [model]  -> writes caption.txt
OUT="$1"; MODEL="${2:-opencode/muse-spark-1.3-contributor-free}"
TRAN=$(cat "$OUT/transcript.txt" 2>/dev/null)
META=$(cat "$OUT/meta.json" 2>/dev/null | head -c 400)
timeout 180 ~/.opencode/bin/opencode run --pure --dir /tmp \
  -m "$MODEL" --title "caption-job" \
  "You are a viral-shorts copywriter. Attached: 6-col contact sheet of video frames. Transcript: \"$TRAN\". Meta: $META. Write a Reel caption: hook line, 2 value lines, CTA, then 8-12 hashtags (mix niche+broad). Under 2200 chars. Output ONLY the caption, no commentary." \
  -f "$OUT/sheet.jpg" \
  2>/dev/null | sed -n '/^$/,$p' | head -c 2200 > "$OUT/caption.txt"
echo "caption: $(wc -c < "$OUT/caption.txt") chars"
head -c 200 "$OUT/caption.txt"; echo
