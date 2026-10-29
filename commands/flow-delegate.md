---
name: delegate
template: "Delegate this task to the appropriate AI agent. Parse the arguments to determine which agent to use (git-pusher, model-creator, physics-engine, monitor) and what task to assign. Output the agent name, task description, priority level, and required context."
description: Delegate work to a specific AI agent
agent: ai-manager
---

# Delegate

$ARGUMENTS

This command delegates work to the appropriate AI agent. Parse the arguments to determine:
1. Which agent to use (git-pusher, model-creator, physics-engine, monitor)
2. What task to assign

Output format:
- Agent name
- Task description
- Priority level
- Required context
