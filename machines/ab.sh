#!/usr/bin/env bash
# A/B BENCHMARK — stock behaviour vs the new harness.
# Same task, same project, measured from the real session DB.
set -uo pipefail
BIN=~/.opencode/bin/opencode
BENCH=~/.config/opencode/machines/bench.py
PROJ=/home/osien/way-to-home
OUT=/tmp/opencode/ab
mkdir -p "$OUT"

TASK="Where is the ocean water colour defined, and which files consume it? Just tell me the locations."

run_arm () {
  local name="$1"; local agent="$2"; shift 2
  python3 "$BENCH" before >/dev/null 2>&1
  local start=$(date +%s%N)
  ( cd "$PROJ" && timeout 300 "$BIN" run ${agent:+--agent "$agent"} "$@" "$TASK" ) \
      > "$OUT/$name.log" 2>&1
  local end=$(date +%s%N)
  local ms=$(( (end - start) / 1000000 ))
  python3 "$BENCH" after --tag "$name" --out "$OUT/$name.json" >/dev/null 2>&1
  python3 - "$OUT/$name.json" "$ms" "$name" <<'PY'
import json,sys
try:
    m=json.load(open(sys.argv[1]))
except Exception:
    print(f"{sys.argv[3]}: NO DATA"); sys.exit()
m["wall_ms"]=int(sys.argv[2])
print(json.dumps(m))
PY
}

echo "TASK: $TASK"
echo

echo "### ARM A — stock agent (full toolbox, no routing, no memory)"
run_arm baseline general -m opencode/muse-spark-1.3-contributor-free

echo
echo "### ARM B — new harness (kit-scout + memory + scored search)"
run_arm harness kit-scout