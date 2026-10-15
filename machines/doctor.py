#!/usr/bin/env python3
"""
PLUGIN/AGENT DOCTOR — opencode fails SILENTLY on several classes of mistake.
This catches them before they waste your time.

Silent-failure classes found the hard way:
  1. `const x = ...` then `x += ...`  -> TS transpile dies, WHOLE PLUGIN vanishes
  2. `export const FOO` (named export beside default) -> plugin never loads
  3. YAML frontmatter with an unquoted ':' -> AGENT never registers
  4. YAML duplicate key -> agent never registers
  5. Two plugins defining the same tool name -> BOTH plugins die
  6. Tool name colliding with a built-in -> shadowed
"""
import json, re, sys, glob, os, collections, subprocess
from pathlib import Path

CFG = Path(os.path.expanduser("~/.config/opencode/opencode.json"))
PLUGDIR = CFG.parent / "plugin"
MANIFEST = Path(os.path.expanduser("~/.config/opencode/.v3/expected-tools.json"))
REGISTRY = Path(os.path.expanduser("~/.config/opencode/.v3/registry.json"))

BUILTIN = {
    "bash", "edit", "write", "read", "grep", "glob", "list", "patch", "todowrite",
    "webfetch", "websearch", "task", "skill", "question", "lsp", "invalid",
}

fail, warn = [], []


def red(m):
    fail.append(m)
    print(f"  FAIL  {m}")


def yellow(m):
    warn.append(m)
    print(f"  warn  {m}")


print("=" * 64)
print("  HARNESS DOCTOR")
print("=" * 64)

# ---------------------------------------------------------------- config
print("\n[1] config")
cfg = json.loads(CFG.read_text())
print(f"  ok    config parses, {len(cfg.get('plugin', []))} plugins, "
      f"{len(cfg.get('command', {}))} commands, {len(cfg.get('agent', {}))} inline agents")

# ---------------------------------------------------------------- plugins
print("\n[2] plugin source — silent-death classes")
declared: dict[str, str] = {}
for f in sorted(PLUGDIR.glob("*.ts")):
    src = f.read_text()
    name = f.name

    # class 1: const reassignment (scope-aware — a `const re` in one function must
    # not be blamed for a `re =` in a different function)
    lines = src.split("\n")
    depth = 0
    scopes: dict[str, int] = {}
    for ln in lines:
        code = re.sub(r"//.*", "", ln)
        m = re.match(r"^\s*(const|let|var)\s+(\w+)\s*[:=]", code)
        if m:
            kind, name2 = m.group(1), m.group(2)
            if kind == "const":
                scopes.setdefault(name2, depth)
            else:
                # a `let`/`var` of the same name shadows any const — not a const bug
                scopes.pop(name2, None)
        m2 = re.match(r"^\s*([A-Za-z_]\w*)\s*(\+=|-=|\*=|=[^=>])", code)
        if m2:
            v = m2.group(1)
            if v in scopes and depth == scopes[v]:
                red(f"{name}: `const {v}` is reassigned in the same scope "
                    f"(line {ln[:60].strip()}) -> transpile dies, whole plugin vanishes")
                del scopes[v]
        depth += code.count("{") - code.count("}")

    # class 2: named export beside default
    named = re.findall(r"^export\s+(?!default\b)(?:const|let|var|function|class|type|interface)\s+(\w+)",
                       src, re.M)
    if named:
        red(f"{name}: named export(s) {named} beside default -> plugin never loads")

    # class 6: nested template literals inside ${ } — this silently killed
    # v3-machine.ts. A backtick appearing INSIDE an interpolation is the tell.
    for m in re.finditer(r"`[^`]*\$\{[^}]*`", src):
        seg = m.group(0)
        inner = seg[seg.index("${") + 2: seg.rindex("}")] if "${" in seg and "}" in seg else ""
        if "`" in inner:
            red(f"{name}: nested template literal at offset {m.start()} "
                f"-> backtick inside ${{ }} silently kills the whole plugin")
            break

    # class 7: `${` immediately followed by a template/` call (fragile nesting)
    for m in re.finditer(r"\$\{\s*`", src):
        red(f"{name}: nested template inside ${{{{ ... }}}} at offset {m.start()}")
        break

    # class 5: tool names
    tools = re.findall(r"^\s{6}([a-z_][a-z_0-9]*):\s*\{\s*$", src, re.M)
    tools = [t for t in tools if t not in ("config", "tool", "args", "properties", "auth", "provider")]
    for t in tools:
        if t in declared:
            red(f"{name}: tool '{t}' ALSO defined in {declared[t]} -> both plugins die")
        declared[t] = name
        if t in BUILTIN:
            yellow(f"{name}: tool '{t}' shadows a built-in")

    print(f"  ok    {name:24s} {len(tools)} tools")

print(f"\n  declared tools: {len(declared)}")

# write the expected manifest so the RUNTIME test has something to compare to
manifest = {}
for t, owner in declared.items():
    manifest.setdefault(owner.replace(".ts", ""), []).append(t)
MANIFEST.write_text(json.dumps(manifest, indent=1))
print(f"  expected-manifest -> {MANIFEST}")

# ---------------------------------------------------------------- agents
print("\n[3] agent frontmatter — YAML must parse")
yaml = None
try:
    import yaml
    HAVE_YAML = True
except ImportError:
    HAVE_YAML = False
    yellow("pyyaml missing - agent YAML not checked")

seen_names = []
for pat in ("agent/*.md", "agents/*.md", "command/*.md", "commands/*.md"):
    for f in sorted(CFG.parent.glob(pat)):
        txt = f.read_text()
        if not txt.startswith("---"):
            red(f"{f.name}: no frontmatter")
            continue
        fm = txt.split("---")[1]
        if not HAVE_YAML:
            continue
        try:
            d = yaml.safe_load(fm)  # type: ignore[union-attr]
        except Exception as e:
            red(f"{f.name}: broken YAML -> {str(e).splitlines()[0]}  "
                f"(an unquoted ':' in description is the usual cause)")
            continue
        if "description" not in d:
            yellow(f"{f.name}: no description")
        nm = d.get("name")
        if nm:
            if nm in seen_names:
                red(f"{f.name}: duplicate agent name '{nm}'")
            seen_names.append(nm)

print(f"  ok    {len(seen_names)} named agents")


# ================================================================ RUNTIME
# "source parses" is NOT proof. This asks the only question that matters:
#   I EXPECTED n tools from this plugin. HOW MANY ACTUALLY EXIST?
#
# Two modes:
#   --runtime      spawn a probe session, then compare (authoritative)
#   (default)      compare against the last observed registry.json (fast)

def runtime_check(spawn: bool) -> bool:
    print("\n[4] RUNTIME REGISTRATION  (the only proof that matters)")
    if not MANIFEST.exists():
        red("no expected-tool manifest - run doctor.py once first")
        return False
    expected = json.loads(MANIFEST.read_text())

    if spawn:
        print("  spawning probe session to record what the core ACTUALLY resolves...")
        try:
            probe = subprocess.run(
                [os.path.expanduser("~/.opencode/bin/opencode"), "run",
                 "--model", "opencode/nemotron-3.5-lightning-free",
                 "Call registry_report once, then reply OK."],
                cwd=str(CFG.parent), capture_output=True, timeout=90,
            )
            if probe.returncode != 0:
                yellow("runtime probe exited nonzero; registry may be stale")
        except subprocess.TimeoutExpired:
            red("runtime probe timed out; no fresh registration evidence")
        except OSError as e:
            red(f"runtime probe could not start: {e}")

    if not REGISTRY.exists():
        red("no runtime registry - opencode has not recorded any tool yet")
        print("       run:  doctor.py --runtime")
        return False

    reg = json.loads(REGISTRY.read_text())
    resolved = set(reg.get("registered", []))
    executed = set(reg.get("executed", []))
    errored = set(reg.get("errored", []))

    print(f"  core resolved {len(resolved)} tool definitions")
    print(f"  proven executable: {len(executed)}   errored: {len(errored)}")
    if not resolved:
        red("registry is EMPTY - the probe never ran or every plugin failed")
        return False

    bad = False
    print()
    print(f"  {'PLUGIN':22s} {'EXPECT':>7s} {'GOT':>5s} {'RAN':>5s}  VERDICT")
    for plugin, tools in sorted(expected.items()):
        missing = [t for t in tools if t not in resolved]
        ran = [t for t in tools if t in executed]
        if missing:
            bad = True
        verdict = "LOST" if len(missing) == len(tools) else ("DEGRADED" if missing else "OK")
        print(f"  {plugin:22s} {len(tools):7d} {len(tools)-len(missing):5d} {len(ran):5d}  {verdict}")
        for m in missing:
            print(f"      LOST: {m}")
    print()
    if bad:
        red("RUNTIME MISMATCH - a plugin lost capabilities despite parsing cleanly.")
        print("       This is exactly the failure static analysis cannot predict.")
    else:
        print("  ok    every declared tool was resolved by the core")
    return bad

# ---------------------------------------------------------------- report
runtime_bad = runtime_check(spawn="--runtime" in sys.argv)

print("\n" + "=" * 64)
print(f"  {len(fail)} FAIL   {len(warn)} warn")
if fail:
    print("\n  FIX EVERY FAIL BEFORE TRUSTING THE HARNESS.")
    print("  A failed plugin vanishes with no error message.")
print("=" * 64)
sys.exit(1 if (fail or runtime_bad) else 0)
