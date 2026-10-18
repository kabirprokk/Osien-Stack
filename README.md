# osien-stack — Portable AI Tooling Stack

A distributable package of AI orchestration tools, skills, commands, agents, and
an MCP server. Works with any MCP-compatible CLI (opencode, Claude Code, Cursor,
Cline, Windsurf) and degrades gracefully elsewhere.

## Contents
- `mcp-server/` - Node MCP server exposing 45 forged tools via stdio. Any MCP client can use these:
  - Memory: ctx_recall, ctx_save, soul_read, soul_write, fast_note, task_state, state_reset
  - Search/Read: smart_grep, read_slice, impact_analyze
  - Verify: verify_chain, security_scan, test_gap, repro_capsule, context_budget, consensus
  - State: machine_state, repo_health, project_map, loop_status, checkpoint_create
  - Auto-heal: auto_heal, rollback_on_failure, perf_regression, test_synthesizer, memory_compactor
  - Code quality: dead_code_detector, dependency_graph, changelog_generator, token_budget_enforcer, architecture_drift, session_replay, auto_document, feature_flag_manager, license_checker, schema_validator, cost_estimator, self_critique_loop
  - City Mode (AI-to-AI): city_status, city_post, city_read, city_broadcast, city_mode, city_clear
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

## License
MIT (or your choice).

## Windows App (no terminal needed)
`app/` - A simple, interactive web-based control center. No terminal required.
- Run: `start.bat` (Windows) or `node server.js` then open http://localhost:4096
- Features: chat interface, quick action buttons, 14-agent city panel, memory viewer, city mode visualization, 44 tools listed.
- Works on any OS with Node.js. Perfect for non-technical users.
