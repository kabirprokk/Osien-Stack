#!/usr/bin/env python3
"""AUTO-PERFECT cross-platform runner. Each iteration = fresh opencode process => tokens reset to ~0."""
import subprocess, sys, time, os, argparse

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-t", "--task", required=True)
    ap.add_argument("-m", "--model", default="opencode/space-bunny-free")
    ap.add_argument("--max", type=int, default=5)
    ap.add_argument("--summary", default=os.path.join(os.path.expanduser("~"), "CONTEXT_SUMMARY.md"))
    args = ap.parse_args()

    models = [args.model, "opencode/beam-free", "opencode/nemotron-3.5-super-vl-free",
              "opencode/longcat-2.5-preview-free", "opencode/nemotron-3.5-lightning-free"]
    mi = 0
    for i in range(1, args.max + 1):
        print(f"\n===== AUTO-PERFECT iteration {i} / {args.max} =====", flush=True)
        ctx = ""
        if os.path.exists(args.summary):
            with open(args.summary, encoding="utf-8") as f: ctx = f.read()
        prompt = f"""You are running AUTO-PERFECT iteration {i} of {args.max}. Task: {args.task}

CONTEXT (from previous iteration, if any):
{ctx}

INSTRUCTIONS:
- Do the NEXT cycle of work toward the task (plan, execute with tools, verify).
- Produce the BEST you can. Run tools (forge/bash/verify) - do not just describe.
- Update {args.summary} with: iteration {i}, what you did, files changed, errors found, next step, model used.
- At the END of your reply, output EXACTLY one line: AUTO_PERFECT_STATUS: CONTINUE  OR  AUTO_PERFECT_STATUS: DONE
- If the task is fully complete and verified (tests green), output DONE.
- Never auto-run destructive ops without explicit YES in the context.
- Keep reply caveman-terse.
"""
        attempt = 0
        text = ""
        while attempt < 3:
            attempt += 1
            model = models[mi % len(models)]
            mi += 1
            print(f"[iter {i} attempt {attempt}] model={model}", flush=True)
            t0 = time.time()
            try:
                r = subprocess.run(["opencode", "run", "-m", model, prompt],
                                   capture_output=True, text=True, timeout=300)
                code = r.returncode
                text = r.stdout + "\n" + r.stderr
            except subprocess.TimeoutExpired:
                code = -1
                text = "TIMEOUT"
            dt = time.time() - t0
            has_err = (code != 0) or any(k in text.lower() for k in ("error", "failed", "503", "400", "429", "timeout", "overloaded"))
            print(f"[iter {i}] exit={code} dur={dt:.1f}s err={has_err}", flush=True)
            if has_err and attempt < 3:
                print("[retry] error detected, trying next model", flush=True)
                time.sleep(3)
                continue
            print(text, flush=True)
            break
        if "AUTO_PERFECT_STATUS: DONE" in text:
            print("\n=== TASK COMPLETE ===", flush=True)
            break
        if "AUTO_PERFECT_STATUS: CONTINUE" not in text:
            print("[warn] no status line; continuing", flush=True)
        time.sleep(2)
    print(f"\nFinished. Check {args.summary} for final state.", flush=True)

if __name__ == "__main__":
    main()
