# 🛠️ OSIEN ARSENAL — software the AI wields (all verified on this machine)

## Post machine (social automation)
- `social-py post_reel.py [--now F|--next] [--caption T]` — IG Reels, DRY-RUN default, POST_LIVE=1 to fire
- `social-py yt_upload.py VIDEO [--title/--desc/--tags/--short]` — YouTube (one-time OAuth setup in file header)
- `~/PostQueue/` — drop video + same-name .txt caption; `posted/` archive
- creds: vault `instagram` (user/pass), YT via .vault/yt-token.json — never in chat/DB
- AI: queue_video / post_now tools, /post command. Rules: supervised YES, 1/day, human hours.

## Media (make the videos)
- ffmpeg/ffprobe (user-local, newest) — cut, crop 9:16, captions, compress
- yt-dlp (uv tool) — fetch clips/audio for edits
- Pillow (py) — thumbnails, overlays, text cards
- convert (ImageMagick) — quick image ops; pdftotext/pdfinfo — read PDFs

## Code/data (research + scrape)
- rg (ripgrep 15, static) — instant codebase search; jq — JSON; sql (wrapper) — any .db
- fzf — fuzzy pick; gh — GitHub; curl/wget/rsync/zip — transport
- node 22 + uv python 3.12 + venvs (social) — run anything user-local, no sudo

## Voice (ready, not yet wired)
- arecord + ffmpeg + SpeechRecognition (py) present; mic HW present
- Say `add voice` → mic-to-prompt via Google free STT
