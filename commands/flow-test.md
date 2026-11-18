---
description: Detect + run project tests (pytest/Jest/Go/npm), report PASS/FAIL
---
Detect (package.json? pytest.ini? go.mod?): run the right one via `try_check` in last-project dir AND run `probe scan . --bugs-only --fail-on high` (or `scan_project` MCP tool) for static bug/CVE verification. Caveman output. On FAIL -> suggest /ralph (max 3 rounds).
