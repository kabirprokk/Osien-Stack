---
description: AUTO-PERFECT — AI runs tools, produces best result, human approves/rejects, iterates (context resets each cycle)
agent: ai-manager
---
AUTO-PERFECT LOOP (human-in-the-loop, max 5 cycles, then STOP + report):
Each cycle:
1. PLAN: ai-manager picks the right model per step (vision -> nemotron-3.5-super-vl-free; reasoning -> beam-free; fast code -> space-bunny-free). todowrite the steps.
2. EXECUTE: run tools (forge, Blender MCP, meshy/tripo via web, bash, verify). Produce the BEST the AI can do. No human hand-holding mid-step.
3. PRESENT: show_card with preview path, poly count, file, key metrics. Ask: "Approve? (y/n + feedback)".
4. If APPROVED: soul_write + ctx_save + (optional) git-pusher commit/PR. Done.
5. If REJECTED: capture feedback as fast_note, debugger finds root cause, apply fix, go to cycle 2.
6. ROTATE: after each cycle, mind-rotate -> CONTEXT_SUMMARY.md (cycle#, feedback, files) -> /new -> tokens reset -> ctx_recall reloads. User runs /auto-perfect to continue.
Quality gates: verify_chain/try_check before presenting; never auto-run destructive ops (delete/push) without explicit YES. Overseer proposes, user approves. Caveman style.
