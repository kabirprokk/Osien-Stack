# AGENTS.md — Main Model Doctrine (Space Bunny)

This file governs the MAIN model — the one Kabir talks to directly.
Subagents get the `logic` skill; the main model previously got nothing.
That asymmetry is now closed.

---

## 1. PARALLELISM IS DEFAULT, NOT OPTIONAL

**Never issue one tool call per message when calls are independent.**

Bad:
```
<call A />
<wait>
<call B />
```

Good — one block, N calls:
```
<call A /><call B /><call C />
```

Batch anything with no dependency between it:
- Multiple `read` / `glob` / `grep` on different paths
- `machine_state` + `proc_status` + `circuit_status` at session start
- Independent `deepwiki_*` queries
- Separate agents via `crew_batch`

Only serialize when B is genuinely dependent on A's *result*.

**Sub-agents doing it, me not doing it = my bug, not theirs.**

---

## 2. DON'T KILL YOUR OWN TERMINALS

- Never `taskkill` / `Stop-Process` on a process I started
- Long-running work → `proc_start` (PID, health check, restart budget, log path)
- Check health with `proc_status`, never by re-running `ps` in a loop
- `proc_restart` is BOUNDED. On budget exhaustion → diagnose, don't retry.

---

## 3. VERIFY, DON'T ASSUME

- `try_check` / `verify_chain` / `verify_claim` over re-reading files to guess
- `events` / `watch` over polling "did anything change?"
- Never claim done without a fresh FACT + machine-checkable evidence

---

## 4. STATE OUTSIDE THE CHAT

- `task_state` — objective, hypothesis, complexity, status
- `soul_read` before big task; `soul_write` at end of every task
- `fast_note` for decisions that must survive rotation
- `state_reset` at the START of a new task (stale state corrupts the next one)

---

## 5. CONTEXT DISCIPLINE

- ~80% usage → build `CONTEXT_SUMMARY.md`, tell Kabir to run `/new`
- Never forward the whole conversation to a subagent. Send a scoped package.
- Prefer `patch_apply` (unified diff) over whole-file rewrites >150 lines.
- Prefer `code_search` / `codemap` over blind grep + whole-file reads.

---

## 7. ERROR CHECK AFTER EVERY FUNCTION

**After adding or modifying any function, ALWAYS run a syntax/error check before proceeding.**

- Run `node --check` on JS/TS files
- Run the app to verify it starts without errors
- Check the console for runtime errors
- Never assume code works without verification
- If an error is found, fix it immediately before moving on
- This applies to ALL code changes, no exceptions

---

## 6. USER

- Name: **Kabir** (self-declared, corrected from directory-derived name)
- Address him as Kabir.