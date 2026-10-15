---
name: ai-manager
description: Manages multi-agent AI orchestration, context rotation, and usage monitoring for the project
---

# AI Manager Skill

## Overview

This skill enables the AI Manager to coordinate 4 specialized agents and automatically manage context when usage limits are approached.

## When to Use

- When you need to delegate work to a specialist agent
- When you want to check project context or state
- When usage is high and you need a session rotation plan
- When you want to generate a context summary for a new session

## How It Works

### Agent Delegation

Use these keywords to trigger the right agent:
- "git", "commit", "push", "pull", "branch", "pr" → git-pusher
- "model", "3d", "mesh", "texture", "asset" → model-creator
- "physics", "collision", "simulation", "dynamics" → physics-engine
- "check", "monitor", "status", "progress" → monitor

### Context Rotation

When approaching usage limits:
1. Run `generate-context-summary` to capture current state
2. Save to `CONTEXT_SUMMARY.md`
3. Start new session with `/new`
4. New session reads `CONTEXT_SUMMARY.md` to continue

### Usage Monitoring

The plugin tracks:
- Message count and token usage
- Conversation depth
- Agent response times

At 80% usage: Plugin fires `usage-warning` event → Monitor agent creates summary

## Commands

- `/delegate <agent> <task>` - Assign work to a specific agent
- `/context` - Show current project context summary
- `/rotate` - Force context rotation (generate summary for new session)
- `/status` - Show all agent statuses and usage level
- `/ide` - Launch the AI Manager IDE with 4 terminal panels

## IDE Mode

Run `/ide` to launch the AI Manager IDE - a graphical interface with 4 terminal panels:
- Top Left: ai-manager (muse-spark-1.3-contributor-free) - Orchestrator
- Top Right: git-pusher (ling-3.0-flash-fin-free) - Git Specialist
- Bottom Left: model-creator (union-alpha) - 3D Model Creator
- Bottom Right: physics-engine (nemotron-3.5-lightning-free) - Physics Engine

Features: Auto-restart crashed agents, Monitor status, Context sharing, IDE-like interface

## Best Practices

1. Always keep `CONTEXT_SUMMARY.md` updated
2. Delegate tasks to specialists rather than doing everything yourself
3. Check `/status` regularly to know where you stand
4. When starting a new session, read `CONTEXT_SUMMARY.md` first
5. The Monitor agent should always have the latest status
