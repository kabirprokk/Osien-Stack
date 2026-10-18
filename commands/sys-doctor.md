---
description: Environment diagnostic — login, config, sandbox, server
---
Run all, report PASS/FAIL per line (10 max): 1) curl 127.0.0.1:4096/global/health (bg server), 2) ls ~/.local/share/opencode/auth.json (login), 3) node validates opencode.json + tui.json, 4) du -sh opencode.db (<500M healthy), 5) df -h / free>10G, 6) systemctl --user is-active opencode-bg, 7) crons present (autoclean+heartbeat), 8) vault file exists?, 9) last-project set?, 10) verdict + one-line fix for each FAIL.
