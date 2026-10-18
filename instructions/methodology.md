# osien-stack Methodology (portable)

## PERFECT LOOP (auto-armed)
Every task runs: build -> review -> test -> fix -> rotate until green, max 3-5 cycles.
- Agents: scout (map) -> builder (patch) -> reviewer (diff-only) -> debugger (one root cause) -> fix -> repeat.
- Quality gates: verify_chain/try_check + errors_now before done; patch_apply not whole-file rewrites.
- Context rotation: write CONTEXT_SUMMARY.md (iteration, files, errors, next step) -> fresh process -> tokens reset -> ctx_recall + soul_read reload memory.

## AUTO-PERFECT (human-in-the-loop)
AI runs tools to produce the best result, presents preview+metrics, asks approve/reject, iterates on feedback. Human approval gate before destructive ops. Overseer proposes, user approves.

## Model routing
- Vision -> nemotron-3.5-super-vl (or llama-3.2-11b-vision)
- Reasoning -> beam-free (or gpt-oss for speed)
- Fast code -> space-bunny-free (or gpt-oss)
- Spread load across multiple free models (round-robin).

## LOGIC rules
1. Never kill own terminal/process; wait & poll.
2. Think before acting; plan first.
3. Parallel by default: independent tool calls in ONE message.
4. Don't interrupt running work.
5. Verify before done.
6. Context discipline: state_reset, ctx_save, soul_write, rotate at ~40%.

## Parallelism (hard rule)
Independent tool calls MUST be issued in a single message (parallel), never one-by-one. Sequential only when true dependency.

## Context rotation protocol
At ~40-50% context (or task done): write CONTEXT_SUMMARY.md, start fresh process, tokens reset to ~0. Memory (ctx_save/soul) carries state.

## 3D pipeline (PERFECT 3D)
AI base (forge/Meshy/Tripo/MakeHuman) -> human sculpt (ZBrush/Blender) -> retopo -> UV -> bake -> texture (AI+hand) -> rig (Auto-Rig Pro/Rigify/Mixamo) -> animate (Mixamo/Cascadeur/DeepMotion/Rokoko) -> verify -> export. Human checkpoints after sculpt/UV/texture/animation. AI never claims perfect without human sign-off.

## State persistence
ctx_save at end of every task (architecture/decisions/failures/state/performance). soul_write one line per task. fast_note for quick notes. Memory makes next session start warm.

## CITY MODE (AI-to-AI communication)
Activate with city_mode(task). All 14 agents come online with unique personalities:
- The Mayor (ai-manager), The Hammer (builder), The Detective (debugger), The Critic (reviewer)
- The Architect (planner), The Explorer (scout), The Scholar (researcher), The Engineer (devops)
- The Librarian (data-wrangler), The Artist (game-builder), The Physicist (physics-engine)
- The Sculptor (model-creator), The Courier (git-pusher), The Watcher (monitor)

Tools: city_status, city_post (agent->agent), city_read (inbox), city_broadcast (to all), city_mode (activate), city_clear (reset).
Agents post messages, read inboxes, respond. The Mayor orchestrates. Use for collaborative problem-solving, debates, and multi-perspective review.
