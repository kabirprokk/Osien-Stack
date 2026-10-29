---
description: Run 100+ crew tasks in one batch with bounded concurrency, retries, dedupe and resume
agent: mayor
---

# /batch - high-throughput crew execution

Run a manifest of tasks across the crew with a hard concurrency ceiling.

## Usage

```bash
# 1. Plan only - spawns nothing, validates the manifest
python runner/batch.py --manifest tasks.json --dry-run

# 2. Prove the orchestration at full scale, zero tokens spent
python runner/batch.py --manifest tasks.json --mock --workers 16

# 3. Real run. --bin is REQUIRED and never auto-guessed
python runner/batch.py --manifest tasks.json --bin <path-to-cli> \
  --workers 16 --retries 2 \
  --state .batch-state.json --out .batch-report.md --json .batch-report.json
```

## Manifest format

```json
{ "tasks": [
  { "id": "1", "task": "audit the auth module",  "agent": "debugger" },
  { "id": "2", "task": "refactor the renderer",  "agent": "builder"  }
]}
```

Also accepts a bare JSON array, or one task per line as plain text.
`agent` is optional - it round-robins across the 14 crew agents.

## Rules

1. **Never raise `--workers` past 64.** That is a hard cap, not advice.
   100+ tasks must NOT become 100+ live AI processes.
2. **Always `--dry-run` first** on a new manifest. Catches bad shape before
   spending anything.
3. **Always pass `--state`.** A crashed batch then resumes instead of
   restarting from zero.
4. **`--bin` is explicit by design.** This runner never searches for or
   guesses an install path - a wrong guess silently runs the wrong program.
   Do not "helpfully" add an auto-resolve step.
5. **Task text is inert.** It is passed as one argv element with
   `shell=False`. Never add `shell=True` or string-concatenate a command.
6. **Exit code 0 means every task passed.** Anything else, read the report
   before rerunning.

## After a batch

Read `.batch-report.md` for the failure list. Fix the cause, then re-run
only the affected slice:

```bash
python runner/batch.py --manifest tasks.json --bin <path> \
  --state .batch-state.json --only 12,45,90
```

Deleted state file? Delete the entries for the failed ids from it first,
otherwise `--only` will match nothing and skip them.