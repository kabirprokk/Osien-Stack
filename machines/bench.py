#!/usr/bin/env python3
"""
HARNESS METRICS — measures a real opencode run straight from the SQLite DB.

Usage:
  bench.py before          snapshot session ids
  bench.py after  --tag X  measure everything since the snapshot

Metrics reported:
  input/output tokens, model calls, tool calls, tool-result tokens,
  files read, lines read, REPEATED reads, wall time, errors.
"""
import sqlite3, json, sys, os, time, argparse
from pathlib import Path

DB = os.path.expanduser("~/.local/share/opencode/opencode.db")
SNAP = Path("/tmp/opencode/.bench-snapshot.json")


def jload(d, *keys):
    for k in keys:
        if d is None:
            return None
        d = d.get(k) if isinstance(d, dict) else None
    return d


def rows(sql, args=()):
    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row
    try:
        return [dict(r) for r in con.execute(sql, args).fetchall()]
    finally:
        con.close()


def sessions():
    return [r["id"] for r in rows("SELECT id FROM session")]


def parts(sid):
    return rows("SELECT data FROM part WHERE session_id=?", (sid,))


def metrics(sids, since_ts=None):
    m = dict(
        input_tokens=0, output_tokens=0, reasoning=0, cache_read=0, cache_write=0,
        model_calls=0, tool_calls=0, tool_result_tokens=0,
        files_read=0, lines_read=0, repeated_reads=0,
        steps=0, errors=0, wall_ms=0, sessions=0,
        registered_tools=0, executed_tools=0, telemetry_events=0,
        loop_events=0, claim_events=0,
    )
    seen_reads = {}

    for sid in sids:
        m["sessions"] += 1
        for r in parts(sid):
            try:
                p = json.loads(r["data"])
            except Exception:
                continue
            t = p.get("type")

            if t == "step-finish":
                m["steps"] += 1
                u = jload(p, "tokens") or {}
                m["input_tokens"] += u.get("input", 0) or 0
                m["output_tokens"] += u.get("output", 0) or 0
                m["reasoning"] += u.get("reasoning", 0) or 0
                cr = jload(p, "tokens", "cache") or {}
                m["cache_read"] += cr.get("read", 0) or 0
                m["cache_write"] += cr.get("write", 0) or 0
                m["model_calls"] += 1

            elif t == "tool":
                m["tool_calls"] += 1
                st = p.get("state") or {}
                if st.get("status") == "error":
                    m["errors"] += 1
                out = st.get("output")
                if isinstance(out, str):
                    m["tool_result_tokens"] += len(out) // 4

            elif t == "text":
                pass

        # file-read accounting, from tool calls
        for r in parts(sid):
            try:
                p = json.loads(r["data"])
            except Exception:
                continue
            if p.get("type") != "tool":
                continue
            name = p.get("tool", "")
            args = (p.get("state") or {}).get("args") or {}
            f = args.get("filePath") or args.get("file")
            if name in ("read", "read_slice", "edit", "write", "patch_apply") and f:
                m["files_read"] += 1
                seen_reads[f] = seen_reads.get(f, 0) + 1
                m["lines_read"] += int(args.get("end", 0) or 0) or 120

    m["repeated_reads"] = sum(v - 1 for v in seen_reads.values() if v > 1)
    m["distinct_files"] = len(seen_reads)
    try:
        root = Path(os.path.expanduser("~/.config/opencode/.v3"))
        reg = json.loads((root / "registry.json").read_text())
        m["registered_tools"] = len(reg.get("registered", []))
        m["executed_tools"] = len(reg.get("executed", []))
        trace = root / "telemetry.jsonl"
        if trace.exists():
            events = [json.loads(x) for x in trace.read_text().splitlines() if x.strip()]
            m["telemetry_events"] = len(events)
            m["loop_events"] = sum(1 for e in events if e.get("kind") == "loop")
            m["claim_events"] = sum(1 for e in events if e.get("kind") == "claim")
    except Exception:
        pass
    return m


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["before", "after", "diff"])
    ap.add_argument("--tag", default="run")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()

    all_s = sessions()

    if a.cmd == "before":
        SNAP.parent.mkdir(parents=True, exist_ok=True)
        SNAP.write_text(json.dumps({"ids": all_s, "ts": int(time.time())}))
        print(f"snapshot: {len(all_s)} sessions exist")
        return

    ids = set(all_s)
    if SNAP.exists():
        prev = json.loads(SNAP.read_text())
        ids = ids - set(prev["ids"])
    m = metrics(sorted(ids))
    m["tag"] = a.tag
    m["ts"] = int(time.time())
    m["fresh_sessions"] = len(ids)

    if a.cmd == "after":
        SNAP.write_text(json.dumps({"ids": all_s, "ts": int(time.time())}))

    out = Path(a.out) if a.out else SNAP.parent / f"bench-{a.tag}.json"
    out.write_text(json.dumps(m, indent=2))
    print(json.dumps(m, indent=2))


if __name__ == "__main__":
    main()
