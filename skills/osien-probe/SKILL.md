---
name: osien-probe
description: Mandatory static security, cross-file taint, AST bug, and dependency CVE scanner. Always use when testing, auditing, or checking code for bugs.
---

# OSIEN PROBE — Bug & Security Verification Skill

Whenever you are **testing, reviewing, debugging, or checking any codebase for bugs**, run **OSIEN Probe** first.

## 1. Preferred Tool (MCP)
If `osien-probe-mcp` is connected, call:
- `scan_project` with `{ path: ".", kind: "<Category>", bugsOnly: true }`
- `inspect_finding_context` to inspect surrounding lines before patching
- `list_rules` to inspect active rules and CWE mappings

## 2. CLI (`probe`)
```bash
# Interactive Terminal UI (all app options)
probe

# Automated agent/CI scan (JSON or fail-on gate)
probe scan . --kind Software --bugs-only --json
probe scan . --kind Website --bugs-only --fail-on high
```

## 3. Categories (2,262–2,293 rules each)
`Website` | `Software` | `API / backend` | `Mobile app` | `Library` | `Data / ML` | `Cloud / DevOps` | `Blockchain / Web3` | `Desktop / Electron` | `CLI / Automation`

## 4. Workflow
1. Run `scan_project` (or `probe scan . --kind <Category> --bugs-only --json`).
2. Prioritize `critical` / `high` findings, cross-file taint (`js-crossfile-taint`, `py-crossfile-taint`, `go-crossfile-taint`), Solidity CEI reentrancy (`sol-reentrancy-cei`), route auth gaps (`js-nextjs-api-no-auth`, `py-route-missing-auth`), and dependency CVEs (`dep-*`).
3. Inspect context, fix verified bugs cleanly, and re-run `probe scan` to confirm `0` critical/high findings.
