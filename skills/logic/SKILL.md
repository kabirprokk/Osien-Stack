---
name: logic
description: Anti-self-sabotage + parallelism doctrine. Prevents killing own terminals, interrupted processes, redundant sequential tool calls. Auto-applied to every task.
---

# LOGIC SKILL — read before acting

## 1. Never kill your own terminal / process
- Do NOT call Stop-Process, taskkill, or Ctrl+C on a process you just launched unless it is hung (>120s with no output).
- If a command is still running, WAIT and poll output — do not abort and re-launch.
- Never run two commands that both touch the same resource in parallel.
- Before killing anything, check `Get-Process` / `proc_status`. If unsure, leave it.

## 2. Think before acting (no reflexive commands)
- State the plan in 1-3 lines BEFORE issuing commands.
- Prefer ONE well-formed command over many tiny ones.
- If a command might take >30s, redirect output to a file and poll; don't block the tool.

## 3. Parallelism by default (speed)
- Independent tool calls ? issue them in ONE message (parallel), never sequential.
- Use `crew_batch` for parallel headless jobs; multiple `Task` calls in one message for subagents.
- Use `patch_apply` for edits; batch file reads with `read` in one message.
- Never do "tool A, wait, tool B" when A and B are independent.

## 4. Don't interrupt running work
- If a background process (opencode run, dev server, build) is running, do not kill it to "retry". Wait, then inspect logs.
- If you must retry, use a NEW process with a different output file; never clobber a running one.

## 5. Verify before declaring done
- `verify_chain` / `try_check` / `errors_now` before "done".
- `review_pass` diff-only review before any completion claim.

## 6. Context discipline
- `state_reset` on new task. `ctx_save`/`soul_write` at end. Rotate at ~40% context.

Apply these rules to every task. No exceptions.
