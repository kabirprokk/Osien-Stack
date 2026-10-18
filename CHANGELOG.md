# Changelog

## 1.1.0 (2026-10-18)
### Added
- `test/smoke.js` + `npm test` (44-tool smoke test).
- `.gitignore`, `LICENSE` (MIT).
- File-read cache (mtime+size keyed, 2s TTL) and exec cache (3s TTL).
- Graceful shutdown (SIGINT/SIGTERM) and uncaughtException handler.
- `osien-extra` skill (situational 3D/CURSOR rules).

### Changed
- Tool descriptions shortened 3369 → 1113 chars (67% reduction).
- Instructions array trimmed 5600 → 2844 chars (50% reduction).
- README tool count corrected (21 → 44).
- Moved 3D-forge `examples/` out of skill bundle to top-level `examples/`.

### Fixed
- Stray `?` characters breaking `node --check`.
- UTF-8 BOM in `package.json` breaking JSON parsers.
- Deleted `slug` function breaking `ctx_save`.
- `security_scan`/`schema_validator` absolute-path handling.
- `opencode.json` instruction bloat.

## 1.0.0 (2026-10-17)
- Initial release: 44 MCP tools, 5 skills, 6 agents, 47 commands, runner, docs.
