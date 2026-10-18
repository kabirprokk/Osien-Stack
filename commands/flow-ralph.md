---
description: Bounded self-correct loop — fix, verify, refine, max 3 rounds then stop + report
---
RALPH LOOP (hard cap 3 rounds, then STOP and report even if failing): each round = 1) smallest fix attempt, 2) `try_check` with the project's test/lint/build command, 3) if PASS → summarize + soul_write(fix). If FAIL after round 3 → show last error tail + propose next move, do NOT loop. Caveman style.
