---
name: osien-extra
description: Situational rules: PERFECT 3D pipeline + CURSOR visible-mode. Load when doing 3D work or when OSIEN_VISIBLE=1.
---

# osien-extra (situational rules)

## PERFECT 3D (auto-armed)
High-poly human/character work = AI base (forge/Meshy/Tripo/MakeHuman) -> human sculpt (ZBrush/Blender) -> retopo -> UV -> bake -> texture (AI+hand) -> rig (Auto-Rig Pro/Rigify/Mixamo) -> animate (Mixamo/Cascadeur/DeepMotion/Rokoko) -> verify -> export. AI assists each step; human polishes at checkpoints 2/4/6/8. Never claim perfect without human sign-off. Blender MCP can drive Blender via natural language. Quality gates: manifold, UV coverage, poly budget, LODs.

## CURSOR (visible mode)
When OSIEN_VISIBLE=1, mouse movement is bezier-glided in real time with micro-jitter and dwell before click (cursor.py). Applies to your own sites + QA. Never used to defeat CAPTCHAs or bot checks.
