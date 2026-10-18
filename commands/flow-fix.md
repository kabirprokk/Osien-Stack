---
description: Auto-fix compile/lint errors, verify with try_check, max 3 rounds
---
Same engine as /ralph but starting from Diagnostics: read LSP errors for changed files (review_pass first), smallest fix first, try_check after each, STOP at 3 rounds. soul_write(fix) on PASS.
