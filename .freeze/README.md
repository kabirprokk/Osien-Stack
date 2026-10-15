# FROZEN HARNESS VERSIONS — benchmark controls

| Tag | What | Path | Status |
|---|---|---|---|
| **stock** | opencode + user's original plugins | (git-less baseline, `--agent general`) | immutable reference |
| **harness-v1** | measurement + doctor + verification + lean kits | `.freeze/v1/` | **FROZEN 2026-10-15** — benchmark B |
| **harness-v2** | working state, context compiler, loop detector, claim verifier… | `plugin/v2-*.ts` | in development — benchmark C |

## Rule
Never edit a frozen tag. V2 is additive only: new `v2-*.ts` files, new `agent/v2-*` files.
If a V2 change would alter V1 behaviour, it is the wrong change.

## Restore V1
```bash
cp .freeze/v1/opencode.json opencode.json
cp .freeze/v1/plugin/*.ts plugin/
```
| **harness-v3-phaseA** | working state + machine state + event bus + process supervisor | `.freeze/v3-phaseA/` | tagged after Phase A gate |
