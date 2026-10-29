---
description: Fully automated AUTO-PERFECT runner — fresh process per iteration, tokens reset to ~0, no manual /new
agent: ai-manager
---
AUTO-PERFECT FULLY AUTOMATED RUNNER (no manual /new needed):
Run from PowerShell:
  cd "C:\Users\Sultan Sayed"
  .\auto-perfect.ps1 -Task "your task here" [-Model opencode/space-bunny-free] [-Max 5]
Each iteration = a FRESH opencode process => tokens reset to ~0. The AI updates CONTEXT_SUMMARY.md each cycle and emits AUTO_PERFECT_STATUS: CONTINUE/DONE. Script stops on DONE or after Max cycles.
Model routing per step is decided by the AI (vision->super-vl, reasoning->beam, fast->space-bunny). Human approval gate before destructive ops. Overseer proposes, user approves.
