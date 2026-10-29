---
description: Safely upgrade OpenCode and verify the installation
agent: ai-manager
---

Safely upgrade OpenCode. This command is an explicit request to perform the
upgrade; never run it automatically as part of an unrelated task.

1. Record `opencode --version` and inspect `opencode upgrade --help`.
2. Back up `~/.config/opencode/opencode.json`, `AGENTS.md`, `plugin/`, `mcp/`,
   and `skills/` to a dated folder before changing the OpenCode binary.
3. If the OSIEN update-safe script exists and Bash is available, run its
   `update` mode so custom plugins are stashed and restored. Otherwise, run the
   documented `opencode upgrade` command.
4. Verify the new version, parse the configuration, and run an OpenCode health
   check. If restore or verification fails, stop and report the exact issue;
   do not repeatedly retry.
5. Report old and new versions, backup location, and check results.
