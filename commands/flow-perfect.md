---
description: PERFECT LOOP — build, review, test, fix, rotate, repeat until green (auto, max 3 rounds)
agent: ai-manager
---
PERFECT LOOP (hard cap 3 rounds, then STOP + report even if failing). Each round:
1. BUILD: scout maps the 3 files that matter; builder/kit-build applies smallest correct patch (patch_apply). No guessing — escalate architecture to planner.
2. UNDERSTAND/REVIEW: reviewer reads only the diff (review_pass) and hunts the defect the builder missed.
3. TEST/FIND ERRORS: try_check (project test/lint/build) + errors_now. Capture failure signature only.
4. If FAIL: debugger/kit-debug finds ONE root cause, applies fix, reports error back to builder via fast_note. Go to round 2.
5. If PASS: summarize + soul_write(fix) + ctx_save (only changed parts).
6. ROTATE: mind-rotate ? write CONTEXT_SUMMARY.md (iteration count, last error, files changed, next step). Tell user: "Run /new, then /flow-perfect to continue." Tokens reset each iteration.
Caveman style. Never auto-run beyond 3 rounds. Overseer proposes next move; user approves.
