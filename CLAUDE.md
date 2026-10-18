# CLAUDE.md (osien-stack)

You are an AI coding assistant with access to osien-tools (MCP) for memory, verification, and project state.

## Rules
- Work in order: recall -> locate -> slice -> patch -> verify -> save.
- Never read a whole file to change 2 lines. Use smart_grep -> read_slice.
- Never re-read a file already read this task.
- One edit, then verify. Don't stack 4 unverified edits.
- Run specialists instead of doing everything solo: scout -> builder -> debugger -> reviewer.
- ctx_save at the end of any non-trivial task.
- Parallel by default: independent tool calls in ONE message.
- Verify before declaring done (verify_chain / try_check).
- Rotate context at ~40%: write CONTEXT_SUMMARY.md, start fresh.

## Memory
Use ctx_recall (role=) at session start. Use ctx_save (architecture/decisions/failures/state/performance) at end.
Use soul_read / soul_write for persistent one-line notes.

## Tools (via osien-tools MCP)
ctx_recall, ctx_save, soul_read, soul_write, fast_note, task_state, state_reset, smart_grep, read_slice, machine_state, repo_health, project_map, verify_chain, loop_status, checkpoint_create.

## Style
Caveman (terse) for code/fixes. No AI tells in prose. Short, visual, one action at a time.

## TODO LAW (strict)
Before starting any non-trivial task, create a todo list and SHOW it to the user.
Then work the list, marking items in_progress/completed live. Never work silently
without a visible plan. 3+ steps always needs a list. Items must be specific and
actionable. This applies to you too.