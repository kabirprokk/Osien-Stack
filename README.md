<p align="center">
  <img src="assets/logo.png" alt="Osien-Stack" width="120" />
</p>

<h1 align="center">Osien-Stack</h1>
<p align="center"><strong>The AI tooling that installs itself.</strong></p>
<p align="center">
  <a href="https://github.com/kabirprokk/Osien-Stack"><img src="https://img.shields.io/github/stars/kabirprokk/Osien-Stack?style=flat-square" alt="stars"></a>
  <a href="https://github.com/kabirprokk/Osien-Stack/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="license"></a>
  <a href="https://kabirprokk.github.io/Osien-Stack/"><img src="https://img.shields.io/badge/website-live-brightgreen?style=flat-square" alt="website"></a>
  <img src="https://img.shields.io/badge/tools-57-orange?style=flat-square" alt="tools">
  <img src="https://img.shields.io/badge/MCP-compatible-purple?style=flat-square" alt="mcp">
</p>

## For AI agents (read this first)

If you are an AI reading this repo to help a user install osien-stack, follow
\AI_INSTALL.md\ exactly and autonomously. Do not ask for confirmation unless a
step fails. Report progress after each major step.

**One-prompt install (copy into any AI):**

> Install osien-stack: clone https://github.com/kabirprokk/Osien-Stack, run
> \
pm install\ in \mcp-server/\, wire it as an MCP server named \osien-tools\,
> copy \skills/\, \commands/\, \gents/\ into your config dir, then run
> \
pm test\ in \mcp-server/\ to confirm 57 tools pass.

Works with: opencode, Claude Code, Cursor, Cline, Windsurf, or any MCP client.

---
# osien-stack — Portable AI Tooling Stack

A distributable package of AI orchestration tools, skills, commands, agents, and
an MCP server. Works with any MCP-compatible CLI (opencode, Claude Code, Cursor,
Cline, Windsurf) and degrades gracefully elsewhere.

## Contents
- `mcp-server/` - Node MCP server exposing 57 tools via stdio. Any MCP client can use these:
  - Memory: ctx_recall, ctx_save, soul_read, soul_write, fast_note, task_state, state_reset
  - Search/Read: smart_grep, read_slice, impact_analyze
  - Verify: verify_chain, security_scan, test_gap, repro_capsule, context_budget, consensus
  - State: machine_state, repo_health, project_map, loop_status, checkpoint_create
  - Auto-heal: auto_heal, rollback_on_failure, perf_regression, test_synthesizer, memory_compactor
  - Code quality: dead_code_detector, dependency_graph, changelog_generator, token_budget_enforcer, architecture_drift, session_replay, auto_document, feature_flag_manager, license_checker, schema_validator, cost_estimator, self_critique_loop
  - City Mode (AI-to-AI): city_status, city_post, city_read, city_broadcast, city_mode, city_clear
  - Driftpost publishing: driftpost_connect, driftpost_finish_connect, driftpost_connect_account, driftpost_accounts, driftpost_disconnect_account, driftpost_publish_video, driftpost_publish_status, driftpost_list_schedules, driftpost_cancel_schedule, driftpost_disconnect
- `skills/` — portable skills (osien-3d-forge, logic, ai-manager, caveman, stop-slop) as SKILL.md + examples.
- `commands/` — slash-command templates (flow-perfect, auto-perfect, make-3d-perfect, mind-rotate, etc.).
- `agents/` — agent definitions (builder, debugger, planner, reviewer, scout, etc.).
- `runner/` — cross-platform (Python) auto-perfect runner. Replaces auto-perfect.ps1.
- `instructions/` — methodology as portable markdown.

## Quick start

### 1. MCP server (tools for any CLI)
```bash
cd mcp-server && npm install
```
Add to your MCP client config:
```json
{
  "mcpServers": {
    "osien-tools": {
      "command": "node",
      "args": ["/absolute/path/to/osien-stack/mcp-server/server.js"]
    }
  }
}
```
Environment: `OSIEN_MEMORY_ROOT` (default `~/.config/opencode/memory`) controls where memory is stored.

Driftpost uses its production API by default. Set `DRIFTPOST_API_URL` only for a self-hosted API. Call `driftpost_connect`, approve Osien in the opened browser, then call `driftpost_finish_connect`. The scoped token is stored in `~/.config/osien-stack/` with owner-only permissions. Install `skills/driftpost/` in your AI client for guided account selection and publishing.

Verify and measure:
```bash
cd mcp-server
npm test    # smoke test - 45 tools registered, core calls pass
npm run bench   # token-reduction benchmark (see below)
```

### Token reduction (morph)
`npm run bench` measures the same work done two ways - whole-file reads vs the
bounded tools. Latest run on this repo:

| Scenario | naive | morph | less |
|---|---|---|---|
| S1 read 20 lines | 1,984 tok | 306 tok | 85% |
| S2 find `MCP` in README | 1,984 tok | 189 tok | 90% |
| S3 find a symbol across 6 files | 19,981 tok | 97 tok | 100% |
| S4 cost of a file | 1,984 tok | 23 tok | 99% |
| **total** | **25,932 tok** | **615 tok** | **98%** |

The tools cut context because they return bounded slices and matches instead of
whole files.

### 2. Skills
Copy `skills/*` into your CLI's skills directory:
- opencode: `~/.config/opencode/skills/`
- Claude Code: `~/.claude/skills/`
- Cursor: `.cursor/rules/` (adapt format)

### 3. Commands
Copy `commands/*` into your CLI's commands directory:
- opencode: `~/.config/opencode/commands/`
- Claude Code: `~/.claude/commands/`

### 4. Agents
Copy `agents/*` into your CLI's agents directory:
- opencode: `~/.config/opencode/agents/`

### 5. Auto-perfect runner (cross-platform)
```bash
python runner/auto-perfect.py -t "your task" --max 5
```
Each iteration = fresh process => tokens reset to ~0.

### 5b. Batch runner — 100+ tasks in one shot
```bash
# plan only, spawns nothing
python runner/batch.py --manifest tasks.json --dry-run

# verify the orchestration end-to-end without spawning any AI
python runner/batch.py --manifest tasks.json --mock --workers 16

# real run — the binary is explicit, never auto-guessed
python runner/batch.py --manifest tasks.json --bin /path/to/cli \
  --workers 16 --retries 2 --state batch-state.json --out report.md
```

Manifest accepts a JSON array, `{"tasks":[...]}`, or one-task-per-line text.
Each entry: `{"id":"12","task":"audit the auth module","agent":"debugger"}`
(`agent` is optional — it round-robins across the 14 crew agents).

What it gives you at scale:

| capability | why it matters |
|---|---|
| `--workers` ceiling (max 64) | 100+ tasks never become 100+ live AI processes |
| auto-dedupe | identical task text runs once, repeats reported as skipped |
| `--state` resume | a crashed batch continues instead of restarting |
| `--retries` + backoff | transient failures recover without manual triage |
| `--only 1,2,3` | re-run a slice after a fix |
| `--mock` / `--dry-run` | prove the plan at full scale for zero tokens |
| md + json report | machine-readable pass/fail per task |

Exit code is `0` only when every task passed.

### 6. Instructions / methodology
Read `instructions/` and paste into your CLI's system prompt / CLAUDE.md / .cursorrules.

## Portability notes
- Memory is shared via `~/.config/opencode/memory/` by default (override with `OSIEN_MEMORY_ROOT`).
- All paths use `$HOME` / `~`. No hardcoded Windows paths.
- MCP server uses Node stdlib + @modelcontextprotocol/sdk only.
- Runner uses Python 3 stdlib only.

## What's NOT portable (opencode-specific, kept in original location)
- `opencode.json` config (opencode schema) — convert to target CLI's format manually.
- `plugin/*.ts` (opencode plugin API) — superseded by the MCP server.
- `auto-perfect.ps1` (PowerShell) — superseded by `runner/auto-perfect.py`.


## 7. TUI Upgrade (OpenTUI)
Upgrade your terminal experience with OpenTUI � the same TUI engine OpenCode uses in production.

### What you get
- Flexbox layout (boxes, text, padding, margins)
- Interactive widgets: selects, inputs, scroll boxes with keyboard + mouse
- Sounds, images, and 3D graphics in the terminal
- React & Solid renderers available
- Keymap library for command routing

### Quick start
\\\ash
# Install the skill (gives your AI assistant full OpenTUI docs)
npx skills add https://opentui.com --skill opentui -g

# Add to your project
npm install @opentui/core
\\\

### Demo
See \examples/tui-demo/\ for a working example with flexbox layout, scrollable file list, input, and select widgets.

### Resources
- Website: https://opentui.com
- Docs: https://opentui.com/docs
- Packages: https://opentui.com/packages
- GitHub: https://github.com/anomalyco/opentui
- License: MIT

## License
MIT (or your choice).

