---
name: sight
description: Text-native eyes for web/canvas/UI work. Use BEFORE claiming any render, layout, styling, animation or visual fix works. Replaces reading code and guessing with an observed LEDGER, ANOMALY report and ASCII view of the real rendered pixels.
---

# SIGHT — see the render as text

## The rule

**Never state what a render looks like unless you ran SIGHT.** Reasoning from code is
a hypothesis. SIGHT output is evidence. Same law as "registered ≠ proven".

## Run it

```bash
node C:\Users\Sultan Sayed\.opencode\bin\sight.mjs --url "http://localhost:5173" --view all --cols 110
```

Zero installs. Pure Node stdlib over the Chrome DevTools Protocol. One warm Chrome is
reused across runs (`chrome=warm`) — only the first call pays startup.

| flag | default | meaning |
|---|---|---|
| `--url` | about:blank | page to open |
| `--w` / `--h` | 1440 / 900 | viewport |
| `--dpr` | 1 | device scale |
| `--view` | `lum` | `lum` \| `hue` \| `wire` \| `all` |
| `--cols` | 120 | character columns (~13px/cell at 1440) |
| `--at "sel"` | – | zoom to one element, full detail |
| `--waitfor "sel"` | – | **gate**: block until that element is visible. Use for delayed/timed UIs, else you capture a half-built page and lie to yourself |
| `--out file` | – | write the report to a file |
| `--json` | – | machine digest only, no ASCII |
| `--wait/--idle/--cap` | 150/350/2500 | adaptive settle, ms |

## Reading the output

- **ANOMALIES** — `ZERO_BOX` `OCCLUDED` `OFFSCREEN` `CLIP_X` `CLIP_Y` `INVISIBLE` `HAIRLINE`.
  `OCCLUDED` names the exact coverer. These are the "it's behind something" answers.
- **CONSOLE / NETWORK** — 404s and runtime exceptions that look like visual bugs.
- **CANVAS** — `distinctColors=1` means a WebGL/2D canvas painted nothing.
- **LEDGER** — every significant node with exact box, position, z-index, background, font, text.
  This is where "exactly" lives.
- **TEXT** — every text node with its true measured position and font.
- **VIEW lum** — real rendered pixels → 10 brightness levels `@%#*+=-:. `
- **VIEW hue** — colour class letters `R O Y G C B M K W`, lowercase = dark
- **VIEW wire** — DOM boxes with the real text drawn in place

## Workflow

1. Fix the code.
2. `sight` it. Read ANOMALIES + LEDGER + VIEW.
3. Still wrong? `--at "#theElement"` to zoom, `--cols 160` for detail.
4. Re-run after every change. Compare the ANOMALY count — it must go down.
5. Only if pixels cannot answer (feel, smoothness, taste) ask the human ONE closed question.

## Speed

~500ms warm, ~2s cold. Do not screenshot for this — it costs ~1 vision token per 14x14
pixel patch and forces Chrome to restart. SIGHT is ~1 char per 2 pixels and reuses the browser.
Use a real screenshot (`shot.ps1`) only when a human must look at the art.