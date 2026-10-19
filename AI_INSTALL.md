# AI_INSTALL.md — Autonomous Installation Guide for AI Agents

You are an AI agent. Follow these steps EXACTLY and AUTONOMOUSLY to install the osien-stack.
Do not ask the user for confirmation unless a step fails. Report progress after each major step.

## Prerequisites (verify first)
1. Check Node.js: `node --version` (need >= 18). If missing, install via the OS package manager.
2. Check Python 3: `python --version` or `python3 --version` (need >= 3.8).
3. Check npm: `npm --version`.
4. Determine the OS (Windows/macOS/Linux) and the target CLI (opencode, Claude Code, Cursor, Cline, or generic MCP client).

## Step 1: Locate the stack
The stack is at a path provided by the user, or default: `~/osien-stack` (or the directory containing this file).
Set `STACK_DIR` to that path.

## Step 2: Install MCP server dependencies
```bash
cd "$STACK_DIR/mcp-server" && npm install
```
Verify: `node server.js` should print "osien-tools MCP server running" to stderr, then wait for stdin. Kill it after confirming.

`zod` is a **direct dependency**, not just an SDK transitive. Do not remove it:
`server.js` requires it directly, and on installs that do not hoist transitive
packages (pnpm, Yarn PnP, `npm install --install-strategy=nested`) an undeclared
`zod` makes the server fail to start on every MCP client.

On startup the server prints which registration API it picked, so you can tell
which MCP SDK generation you actually have:
- `osien-tools MCP SDK mode: registerTool` — SDK 1.16 or newer
- `osien-tools MCP SDK mode: legacy tool()` — older SDK, still fully supported

Both paths are exercised; the server negotiates any MCP protocol revision the
installed SDK supports (currently `2024-10-07` through `2025-11-25`).

## Step 3: Configure the MCP server in the target CLI

### opencode
Add to `~/.config/opencode/opencode.json` under `mcp` (opencode uses its own
shape - `type: local` with a command array, not the `mcpServers` key other
clients use). This shape is the same on opencode V1 and V2:
```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "osien-tools": {
      "type": "local",
      "command": ["node", "<STACK_DIR>/mcp-server/server.js"],
      "enabled": true
    }
  }
}
```
Prefer the CLI, which preserves your other settings:
```bash
opencode mcp add osien-tools --global --command node --args "<STACK_DIR>/mcp-server/server.js"
```
For a project-local install, drop `--global`.

### opencode project-local layout (V1 and V2)
Both versions discover the same directories, so Steps 4-6 can target either:
| What  | Global                              | Project-local              |
|-------|-------------------------------------|----------------------------|
| skills   | `~/.config/opencode/skills/`    | `.opencode/skills/`        |
| commands | `~/.config/opencode/commands/` | `.opencode/commands/`      |
| agents   | `~/.config/opencode/agents/`   | `.opencode/agents/`        |

`.opencode/` files must be at the source root (e.g. `skills/logic/SKILL.md`
works; a bare `skills/logic.md` does not).

### Claude Code
Add to `~/.claude/settings.json`:
```json
{
  "mcpServers": {
    "osien-tools": {
      "command": "node",
      "args": ["<STACK_DIR>/mcp-server/server.js"]
    }
  }
}
```
Also copy `CLAUDE.md` to the project root.

### Cursor
Add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "osien-tools": {
      "command": "node",
      "args": ["<STACK_DIR>/mcp-server/server.js"]
    }
  }
}
```
Also copy `.cursorrules` to the project root.

### Generic (any MCP client)
Use stdio transport with command `node <STACK_DIR>/mcp-server/server.js`.

## Step 4: Install skills
Copy `skills/*` into the CLI's skills directory:
- opencode: `~/.config/opencode/skills/`
- Claude Code: `~/.claude/skills/`
- Cursor: `.cursor/rules/` (adapt format)
Command: `cp -r "$STACK_DIR/skills/"* <target_skills_dir>/`

## Step 5: Install commands
Copy `commands/*` into the CLI's commands directory:
- opencode: `~/.config/opencode/commands/`
- Claude Code: `~/.claude/commands/`
Command: `cp -r "$STACK_DIR/commands/"* <target_commands_dir>/`

## Step 6: Install agents
Copy `agents/*` into the CLI's agents directory:
- opencode: `~/.config/opencode/agents/`
- Claude Code: `~/.claude/agents/`
Command: `cp -r "$STACK_DIR/agents/"* <target_agents_dir>/`

## Step 7: Install instructions / methodology
- For opencode: append the contents of `instructions/methodology.md` to the `instructions` array in `opencode.json` (as a single string entry).
- For Claude Code: append the contents of `CLAUDE.md` to the project's `CLAUDE.md`.
- For Cursor: append `.cursorrules` to the project's `.cursorrules`.

## Step 8: Verify installation
1. Restart the CLI (or reload MCP servers).
2. Call `machine_state` (or `repo_health`) via the MCP tool — should return OS info.
3. Call `ctx_recall` — should return "NO MEMORY" (first run) or existing memory.
4. Call `soul_read` — should return soul file or "NO SOUL FILE".
5. Call `city_mode` with task "test" — should show 14 agents with personalities.
6. Call `city_post` from mayor to builder — should confirm message posted.
7. Verify skills are loaded: ask the CLI to list available skills; `osien-3d-forge`, `logic`, `caveman`, `stop-slop`, `ai-manager` should appear.

Run the automated checks:
```bash
cd "$STACK_DIR/mcp-server" && npm install && npm test && npm run test:compat && npm run bench
```
`npm test` must print `SMOKE OK: 47 tools`. `npm run test:compat` must print
`COMPAT OK` (it handshakes every MCP protocol revision the installed SDK
supports and checks tools.json against the live tool list). `npm run bench`
prints the token-reduction table; a healthy install stays in the high-90% range.

## Step 9: Configure memory location (optional)
Set environment variable `OSIEN_MEMORY_ROOT` to customize where memory is stored.
Default: `~/.config/opencode/memory/` (shared with opencode).
Soul file: `<MEMORY_ROOT>/../OSIEN_SOUL.md`.

## Step 10: Test the auto-perfect runner (optional)
```bash
python "$STACK_DIR/runner/auto-perfect.py" -t "create a hello world file" --max 1
```
Should create the file, verify, and output `AUTO_PERFECT_STATUS: DONE`.

## Troubleshooting
- If MCP server fails to start: check Node.js version (>=18), run `npm install` in mcp-server/.
- If tools not found: verify MCP config path is absolute, restart CLI.
- If memory not persisting: check write permissions on `OSIEN_MEMORY_ROOT`.
- If skills not loading: verify SKILL.md has valid YAML frontmatter (name, description).

## Post-install checklist
- [ ] MCP server responds to `initialize` + `tools/list`
- [ ] At least one forged tool callable (e.g., `machine_state`)
- [ ] Skills visible in CLI
- [ ] City mode works: call city_mode, verify 14 agents respond
- [ ] Commands available as slash commands
- [ ] Agents available for delegation
- [ ] Memory directory writable

Report: "osien-stack installed. MCP tools: N. Skills: M. Status: OK/FAIL."

## TODO LAW (strict, for the installed AI)
Before starting any non-trivial task, create a todo list and SHOW it to the user.
Then work the list live. Never work silently without a visible plan.