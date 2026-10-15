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
import json, re, sys, glob, os, collections
from pathlib import Path

CFG = Path(os.path.expanduser("~/.config/opencode/opencode.json"))
PLUGDIR = CFG.parent / "plugin"

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

print(f"\n  registered tools: {len(declared)}")

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

# ---------------------------------------------------------------- report
print("\n" + "=" * 64)
print(f"  {len(fail)} FAIL   {len(warn)} warn")
if fail:
    print("\n  FIX EVERY FAIL BEFORE TRUSTING THE HARNESS.")
    print("  A failed plugin vanishes with no error message.")
print("=" * 64)
sys.exit(1 if fail else 0)