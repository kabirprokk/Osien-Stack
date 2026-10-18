#!/usr/bin/env python3
"""
osien-batch - high-throughput task orchestrator for the Osien crew.

Runs N tasks with bounded concurrency, retries, dedupe, resume and reporting.
Python 3 standard library only - no third-party deps, matching the repo rule.

    python batch.py --manifest tasks.json
    python batch.py --manifest tasks.json --workers 16 --timeout 300
    python batch.py --manifest tasks.json --dry-run
    python batch.py --manifest tasks.json --mock          # verify without spawning AI
    python batch.py --manifest tasks.json --only 12,45,90 # a slice of the batch

Design notes
------------
* Bounded concurrency: a 100+ task manifest must NOT become 100+ live AI
  processes. --workers is a hard ceiling and defaults to a safe value.
* Dedupe: identical task text runs once; repeats are reported as "skipped".
* Resume: --state persists completed task ids so a crashed batch continues.
* Executors are pluggable. --mock proves the orchestration at scale without
  spending a single token; the real executor passes task text as a plain
  argv element so it can never be re-read as shell syntax.
"""

import argparse
import concurrent.futures
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time

DEFAULT_WORKERS = 8
MAX_WORKERS = 64
DEFAULT_TIMEOUT = 600
DEFAULT_RETRIES = 1

AGENTS = [
    "mayor", "builder", "debugger", "reviewer", "planner", "scout",
    "researcher", "devops", "data-wrangler", "game-builder",
    "physics-engine", "model-creator", "git-pusher", "monitor",
]

_print_lock = threading.Lock()
_state_lock = threading.Lock()


def log(msg):
    with _print_lock:
        print(msg, flush=True)


# ---------------------------------------------------------------- manifest

def normalize(text):
    """Collapse whitespace/case so near-identical tasks dedupe together."""
    return re.sub(r"\s+", " ", str(text or "").strip().lower())


def task_key(task):
    agent = normalize(task.get("agent", ""))
    payload = agent + "\x00" + normalize(task.get("task", ""))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_manifest(path):
    """Accept a JSON array, {"tasks": [...]}, or newline-delimited text."""
    if not os.path.exists(path):
        sys.exit("manifest not found: %s" % path)
    raw = open(path, "r", encoding="utf-8").read().strip()
    if not raw:
        sys.exit("manifest is empty: %s" % path)

    if raw[0] in "[{":
        data = json.loads(raw)
        tasks = data.get("tasks", []) if isinstance(data, dict) else data
    else:
        tasks = [{"task": line.strip()} for line in raw.splitlines() if line.strip()]

    if not isinstance(tasks, list):
        sys.exit("manifest must be a list of tasks")

    out = []
    for i, t in enumerate(tasks):
        if isinstance(t, str):
            t = {"task": t}
        if not isinstance(t, dict):
            continue
        body = t.get("task") or t.get("prompt") or t.get("instruction")
        if not body:
            continue
        item = {
            "id": str(t.get("id") or i),
            "agent": t.get("agent"),
            "task": str(body),
            "priority": t.get("priority", "normal"),
            "weight": int(t.get("weight", 1)),
        }
        if item["agent"] and item["agent"] not in AGENTS:
            log("  ! unknown agent %r on task %s - passing through" % (item["agent"], item["id"]))
        out.append(item)
    return out


def dedupe(tasks):
    """Returns (unique_tasks, skipped_list)."""
    seen = {}
    unique, skipped = [], []
    for t in tasks:
        k = task_key(t)
        if k in seen:
            skipped.append({"id": t["id"], "reason": "duplicate of task %s" % seen[k]})
        else:
            seen[k] = t["id"]
            unique.append(t)
    return unique, skipped


def load_state(path):
    if path and os.path.exists(path):
        try:
            return json.load(open(path, "r", encoding="utf-8"))
        except Exception:
            log("  ! state file unreadable, starting fresh")
    return {"done": [], "results": {}}


def save_state(path, state):
    if not path:
        return
    tmp = path + ".tmp"
    try:
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(state, fh, indent=2)
        os.replace(tmp, path)
    except Exception as exc:
        log("  ! could not persist state: %s" % exc)


# ---------------------------------------------------------------- executors

class Executor:
    name = "base"

    def run(self, task, timeout):
        raise NotImplementedError


class MockExecutor(Executor):
    """Deterministic, zero-cost. Tasks containing [fail] fail, so failure
    handling can be exercised without spawning anything real."""

    name = "mock"

    def run(self, task, timeout):
        time.sleep(0.001)
        if "[fail]" in task["task"].lower():
            raise RuntimeError("mock failure (task contained [fail])")
        return "ok: " + task["task"][:80]


class EchoExecutor(Executor):
    """Runs no process; returns the text. Plumbing test."""

    name = "echo"

    def run(self, task, timeout):
        return task["task"][:200]


class CliExecutor(Executor):
    """Runs one real task through the AI CLI.

    The binary is supplied explicitly via --bin. This runner never searches
    for or guesses an install location: a wrong guess silently runs the
    wrong program, and an implicit lookup makes the trust boundary unclear.

    Task text is passed as a discrete argv element with shell=False, so a
    task containing metacharacters is inert text rather than a command.
    """

    name = "cli"

    def __init__(self, bin_path, model, extra_args=None):
        self.bin = bin_path
        self.model = model
        self.extra = extra_args or []

    def run(self, task, timeout):
        argv = [self.bin, "run", "-m", self.model]
        argv.extend(self.extra)
        argv.append(task["task"])
        proc = subprocess.run(
            argv, capture_output=True, text=True, timeout=timeout,
            shell=False, encoding="utf-8", errors="replace",
        )
        if proc.returncode != 0:
            raise RuntimeError("exit %s: %s" % (proc.returncode, (proc.stderr or "")[:400]))
        return (proc.stdout or "")[:4000]


# ---------------------------------------------------------------- runner

def run_one(task, executor, timeout, retries, results):
    attempts = retries + 1
    last = None
    for attempt in range(1, attempts + 1):
        try:
            out = executor.run(task, timeout)
            results[task["id"]] = {"status": "ok", "agent": task.get("agent"),
                                   "output": out[:2000], "attempts": attempt}
            log("  [ok]   %s (%s) attempt %d" % (task["id"], task.get("agent") or "-", attempt))
            return "ok"
        except subprocess.TimeoutExpired:
            last = "timeout after %ss" % timeout
        except Exception as exc:
            last = "%s: %s" % (type(exc).__name__, exc)
        if attempt < attempts:
            time.sleep(min(2 ** attempt, 10))
    results[task["id"]] = {"status": "failed", "agent": task.get("agent"),
                           "error": last, "attempts": attempts}
    log("  [FAIL] %s (%s) %s" % (task["id"], task.get("agent") or "-", last))
    return "failed"


def execute(tasks, executor, workers, timeout, retries, state, state_path):
    done = set(state.get("done", []))
    results = state.setdefault("results", {})

    todo = [t for t in tasks if t["id"] not in done]
    if len(todo) < len(tasks):
        log("resume: %d already done, %d to run" % (len(tasks) - len(todo), len(todo)))
    if not todo:
        return results

    log("running %d tasks with %d workers (timeout %ss, retries %d)"
        % (len(todo), workers, timeout, retries))
    started = time.time()
    tally = {"ok": 0, "failed": 0}
    tally_lock = threading.Lock()

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(run_one, t, executor, timeout, retries, results): t
            for t in todo
        }
        for fut in concurrent.futures.as_completed(futures):
            t = futures[fut]
            try:
                outcome = fut.result()
            except Exception as exc:
                outcome = "failed"
                results[t["id"]] = {"status": "failed", "error": str(exc)}
            with tally_lock:
                tally[outcome] = tally.get(outcome, 0) + 1
            with _state_lock:
                state["done"].append(t["id"])
                if state_path:
                    save_state(state_path, state)

    elapsed = time.time() - started
    log("finished in %.1fs - ok %d, failed %d" % (elapsed, tally["ok"], tally["failed"]))
    return results


# ---------------------------------------------------------------- report

def write_report(out_json, out_md, tasks, results, skipped, elapsed, workers):
    ok = sum(1 for r in results.values() if r.get("status") == "ok")
    failed = sum(1 for r in results.values() if r.get("status") == "failed")

    if out_json:
        payload = {
            "total": len(tasks),
            "ok": ok,
            "failed": failed,
            "skipped_duplicates": len(skipped),
            "workers": workers,
            "elapsed_sec": round(elapsed, 2),
            "results": results,
            "skipped": skipped,
        }
        with open(out_json, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=2)
        log("wrote %s" % out_json)

    if out_md:
        lines = [
            "# Osien Batch Report",
            "",
            "| metric | value |",
            "|---|---|",
            "| total tasks | %d |" % len(tasks),
            "| succeeded | %d |" % ok,
            "| failed | %d |" % failed,
            "| duplicates skipped | %d |" % len(skipped),
            "| workers | %d |" % workers,
            "| elapsed | %.1fs |" % elapsed,
            "",
        ]
        if failed:
            lines += ["## Failures", ""]
            for tid, r in sorted(results.items()):
                if r.get("status") == "failed":
                    lines.append("- **%s** (%s): `%s`"
                                 % (tid, r.get("agent") or "-", r.get("error", "?")))
            lines.append("")
        with open(out_md, "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines))
        log("wrote %s" % out_md)

    return ok, failed


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser(
        description="Run many Osien crew tasks with bounded concurrency.")
    ap.add_argument("--manifest", required=True,
                    help="JSON array, {tasks:[...]}, or .txt lines")
    ap.add_argument("--workers", type=int, default=DEFAULT_WORKERS,
                    help="hard concurrency ceiling (max %d)" % MAX_WORKERS)
    ap.add_argument("--timeout", type=int, default=DEFAULT_TIMEOUT)
    ap.add_argument("--retries", type=int, default=DEFAULT_RETRIES)
    ap.add_argument("--model", default="opencode/space-bunny-free")
    ap.add_argument("--bin", dest="bin_path", default="",
                    help="explicit CLI binary for real execution (required "
                         "unless --mock/--echo); never auto-guessed")
    ap.add_argument("--only", default="", help="comma-separated task ids to run")
    ap.add_argument("--state", default="", help="state json for resume")
    ap.add_argument("--out", default="", help="markdown report path")
    ap.add_argument("--json", dest="json_out", default="", help="json report path")
    ap.add_argument("--mock", action="store_true",
                    help="mock executor (no AI spawned)")
    ap.add_argument("--echo", action="store_true",
                    help="echo executor (plumbing test)")
    ap.add_argument("--dry-run", action="store_true",
                    help="validate + plan, run nothing")
    args = ap.parse_args()

    workers = max(1, min(args.workers, MAX_WORKERS))
    tasks = load_manifest(args.manifest)
    tasks, skipped = dedupe(tasks)

    if args.only:
        wanted = {s.strip() for s in args.only.split(",") if s.strip()}
        tasks = [t for t in tasks if t["id"] in wanted]

    agent_counts = {}
    for i, t in enumerate(tasks):
        agent = t.get("agent") or AGENTS[i % len(AGENTS)]
        t["agent"] = agent
        agent_counts[agent] = agent_counts.get(agent, 0) + 1

    log("manifest: %d unique tasks, %d duplicates skipped" % (len(tasks), len(skipped)))
    log("assigned across %d agents: %s" % (len(agent_counts), agent_counts))
    if workers < len(AGENTS):
        log("  ! %d workers for %d agents - agents will queue" % (workers, len(AGENTS)))

    if args.dry_run:
        log("dry-run: nothing executed")
        for t in tasks[:10]:
            log("  - [%s] %s" % (t["agent"], t["task"][:70]))
        if len(tasks) > 10:
            log("  ... and %d more" % (len(tasks) - 10))
        return 0

    if args.mock:
        executor = MockExecutor()
    elif args.echo:
        executor = EchoExecutor()
    else:
        if not args.bin_path:
            sys.exit("--bin is required for real execution. "
                     "Use --mock to verify orchestration without spawning AI.")
        if not os.path.exists(args.bin_path):
            sys.exit("binary not found: %s" % args.bin_path)
        log("executor: cli via explicit --bin")
        executor = CliExecutor(args.bin_path, args.model)

    state = load_state(args.state)
    started = time.time()
    results = execute(tasks, executor, workers, args.timeout,
                      args.retries, state, args.state)
    elapsed = time.time() - started

    ok, failed = write_report(args.json_out, args.out, tasks, results,
                              skipped, elapsed, workers)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())