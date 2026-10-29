---
name: rotate
template: "Force a context rotation. Gather all current state from each agent. Generate CONTEXT_SUMMARY.md with: current code state, model progress, physics state, known issues, next steps, what each agent accomplished. Output the summary so it can be pasted into a new session. Say 'Run /new in a fresh session and paste the context summary to continue'."
description: Force context rotation - generate summary for new session
agent: ai-manager
---

# Rotate

Force a context rotation. This generates a full context summary and prepares for a new session:

1. Gather all current state from each agent
2. Generate CONTEXT_SUMMARY.md with:
   - Current code state
   - Model progress
   - Physics state
   - Known issues
   - Next steps
   - What each agent accomplished
3. Output the summary so it can be pasted into a new session
4. Say "Run /new in a fresh session and paste the context summary to continue"
