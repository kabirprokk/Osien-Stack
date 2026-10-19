# OSIEN TUI

A redesigned OpenCode V2 terminal experience: a full-screen **OSIEN workspace
dashboard**, redesigned sidebar session navigation, a compact session status
strip, and a home footer entry point.

Built entirely on the official OpenCode CLI plugin APIs
(`@opencode/plugin/tui`) and the OpenTUI Solid binding the host already
provides. **No web server, no website, no chat clone.**

---

## What is native and what OSIEN replaces

This is the most important section. Read it before enabling the plugin.

| Surface | Placement | Effect |
| --- | --- | --- |
| Native conversation transcript | — | **Preserved, untouched.** Never claimed. |
| Native composer / prompt (input, attachments, submit) | — | **Preserved, untouched.** Never claimed, never wrapped. |
| `sidebar.content` | `replace` | Replaced with the OSIEN status + navigation block. |
| `session.composer.top` | `append` | One status line is **added above** the native composer. |
| `home.footer` | `append` | One dashboard entry line is **added below** the home footer. |
| `app` | *not claimed* | Deliberately left alone. See "API limits". |
| Plugin route `osien-workspace` | `register` | New full-screen page, owned entirely by OSIEN. |

The transcript and composer are **not** inside the `sidebar.content` boundary,
so replacing that slot cannot remove them. The composer strip is an `append`,
not a `replace`, so the native input widget is never suppressed.

### API limits on whole-layout changes

The published slot surface is coarse and deliberately so
(`Context.SlotMap` in `@opencode/plugin/tui/context` has **nine** paths):

```
app                 home.footer             home.footer.status
prompt.footer       prompt.footer.status    prompt.footer.file
session.composer.top                        session.panel
sidebar.content     sidebar.footer
```

Consequences that shape this design:

1. **There is no slot for the conversation area or the composer itself.** A
   plugin cannot restyle, wrap or re-render the transcript. Any "redesigned
   chat" would have to be a hand-built clone, which is explicitly out of scope
   here and would lose host behaviour (streaming, diffs, attachments, undo).
2. **`app` is the only slot that spans the whole UI.** Replacing it suppresses
   the entire native application — including the transcript and composer. This
   package therefore **does not claim `app` at all**. The documented safe use of
   `append: "app"` (returning `null` purely to host a keymap layer) is available
   but unnecessary, because `context.keymap.layer(...)` can be called directly
   from `setup()` — which is what this plugin does.
3. **Theme is inherited, not replaced.** `context.theme` is the host's resolved
   `ResolvedTheme`; every colour here is a semantic token
   (`text.base`, `text.muted`, `text.faint`, `text.action.primary`,
   `text.feedback.*`, `background.raised.*`, `border.base`). No literal colours,
   so dark/light switching is automatic.
4. **Keymap layers are scoped by lifecycle.** A layer created in `setup()` is
   removed when the plugin is disabled, reloaded or fails setup. A layer created
   inside a route or slot component is removed when that component unmounts.
   OSIEN uses both: one `mode: "global"` layer in `setup()` for the two always-on
   commands, and a route-scoped layer inside the dashboard for arrows / `j` / `k`
   / `enter` / `escape` — those bindings are never live in the chat view.
5. **No host command IDs are invented.** Every id is declared in
   `src/core/constants.ts` under the `osien.` namespace and bound only through
   `keymap.layer`. Nothing here depends on an undocumented host command.
6. **`escape` inside the dashboard** is a route-scoped binding; it returns to
   the route remembered when the workspace was opened, and falls back to `home`
   so it can never trap the user on the workspace page.

---

## Install (opt-in, reversible, config-preserving)

Nothing is installed into your live config by this repository. Enabling is a
separate, explicit step.

```sh
cd osien-stack/tui
npm install          # dev dependencies only; no bundling, no host changes

# dry run - prints what would change, writes nothing
node scripts/enable-cli.mjs --dry-run

# enable
node scripts/enable-cli.mjs
```

`enable-cli.mjs`:

* reads `$XDG_CONFIG_HOME/opencode/cli.json`, falling back to
  `~/.config/opencode/cli.json`;
* copies the current file to `cli.json.osien.bak` before touching it;
* **appends** one entry to `plugins` and copies every other key through
  unchanged — `theme`, `keybinds`, `scrollback`, `tui`, and every other plugin
  entry survive with identical values and ordering;
* is idempotent: running it twice does not duplicate the entry;
* refuses to write anything if the file is not valid JSON (a leading BOM is
  tolerated) or if `plugins` is present but is not an array — replacing a
  malformed plugin list would silently discard what the user had configured;
* creates the config directory if it does not exist;
* never touches `opencode.json`, never restarts a server or process.

The only change to the file's *formatting* is that it is re-serialised with
two-space indentation. Values are preserved exactly.

To undo:

```sh
node scripts/disable-cli.mjs     # removes only the OSIEN entry
```

`disable-cli.mjs` removes just the entry whose `package` resolves to this
folder, leaves every other plugin and setting untouched, deletes nothing, and
tells you where the backup is.

Restart the OpenCode TUI to load or unload the plugin.

### Options

The plugin reads `context.options`. Anything passed as `options` in the
`plugins` entry reaches it. Defaults: none required.

### Overriding the keys

The bindings are declared in `src/core/constants.ts` and are ordinary keymap
ids, so they can be changed in `cli.json` under `keybinds` without editing
code:

| Command id | Default | What it does |
| --- | --- | --- |
| `osien.workspace.open` | `ctrl+g` | Toggle the workspace dashboard. Also in the command palette and as the `/osien` slash command. |
| `osien.session.open` | `ctrl+o` | Filter and open a session through the native select dialog. Also in the palette. |
| `osien.data.refresh` | `ctrl+shift+r` *(route-scoped)* | Re-derive the dashboard's session model. |
| `osien.workspace.back` | `escape` *(route-scoped)* | Leave the dashboard for the route you came from. |

Inside the dashboard: `j` / `down` and `k` / `up` move the cursor, `enter`
opens the highlighted session, `home` / `end` jump to the ends.

`ctrl+r` and `ctrl+p` are deliberately not used: a stock OpenCode `cli.json`
binds `session.rename` and `session.list` to those keys.

---

## Commands

```sh
npm install          # dev dependencies only; no bundling, no host changes

npm run bun:install  # one-off: fetch a checksum-verified portable Bun into .tooling/

npm run typecheck    # tsc --noEmit against the installed @opencode/plugin 2.0.32 types
npm run build:test   # compile src + test to .build-test/
npm test             # logic suite on Node (node:test)
npm run test:render  # renderer suite on Bun (headless OpenTUI)
npm run check        # typecheck + both suites

npm run enable       # opt-in: add to cli.json (with a backup)
npm run disable      # opt-in: remove from cli.json
```

### Why the renderer suite runs on Bun

`@opentui/core@0.5.17` declares `engines: { bun: ">=1.3.0", node: ">=26.4.0" }`
and its native FFI layer refuses to start below that. This machine has Node
24.19.0, so `testRender` throws
`OpenTUI native FFI is not available for this runtime yet`.

Running the renderer under Bun is not just a workaround - it is required for
the tests to mean anything. `solid-js` resolves to **`dist/server.js`** under the
`node` export condition, and that build has no fine-grained reactivity. A render
test run on plain Node would compile the JSX but prove nothing about how the
host's components actually update.

`test/preload.ts` loads `@opentui/solid/bun-plugin`, which is the official
transform OpenTUI ships:

* runs `babel-preset-solid` with `generate: "universal"` and
  `moduleName: "@opentui/solid"` over `.ts`/`.tsx` outside `node_modules`;
* rewrites `solid-js/dist/server.js` to `dist/solid.js` on load, which is the
  client reactive runtime.

The first test in `test/render/render.test.tsx` asserts exactly this: it renders
a signal-backed component, updates the signal, flushes, and fails if the frame
did not change. If the transform ever stops applying, that test fails rather
than the suite going quietly green.

`bun` is resolved in this order and never installed globally:
`OSIEN_BUN` then `.tooling/bun/**` then `bun` on `PATH`.
`npm run bun:install` downloads the pinned release from the official
`oven-sh/bun` GitHub release and verifies the SHA-256 against the
`SHASUMS256.txt` published by that same release before unpacking it.

### Why there is no bundler

The plugin ships raw TypeScript/TSX (`"exports": { "./tui": "./src/tui.tsx" }`),
which is the form the official CLI-plugin guide documents. OpenCode resolves
`@opencode/plugin/tui`, `@opentui/core`, `@opentui/solid` and `solid-js` from its
own runtime at load time.

`@opentui/core`, `@opentui/solid` and `solid-js` are therefore **peer
dependencies marked optional** and are never bundled. They appear only as
devDependencies, so type-checking and tests work against the same versions the
host uses (`@opentui/* 0.5.17`, `solid-js 1.9.12`, `@opencode/* 2.0.32`).

---

## Layout

```
src/
  index.ts               server entry (no-op; keeps the documented index+tui layout)
  tui.tsx                CLI plugin: setup, keymap layer, route, slot claims, cleanup
  core/                  pure, host-free logic (all of it unit tested)
    constants.ts         plugin/command/route ids and default bindings
    format.ts            relative age, cost, truncation, layout tiers
    model.ts             session forest -> display rows, rowText width budget,
                         scroll window that follows the selected row
    navigation.ts        open-session intent (tabs -> router fallback), back plan
  ui/
    tokens.ts            semantic theme tokens
    measure.ts           width/height tracking through the documented onSizeChange hook
    nav-memory.ts        storage.memory-backed previous route + cursor
    use-sessions.ts      reactive session feed driven by data.listen
    session-list.tsx     the shared, windowed session list renderer
  parts/
    sidebar.tsx          sidebar.content replacement
    composer-top.tsx     session.composer.top append
    home-footer.tsx      home.footer append
  routes/
    workspace.tsx        the workspace dashboard route
scripts/
  cli-config.mjs         pure cli.json merge/remove helpers
  enable-cli.mjs         opt-in installer
  disable-cli.mjs        opt-in uninstaller
  with-bun.mjs           locates the pinned Bun for the renderer suite
  install-bun.mjs        verified portable Bun download
test/
  preload.ts             @opentui/solid/bun-plugin preload (Solid transform)
  format.test.ts         formatting and layout tiers
  model.test.ts          session forest, row fitting, scroll window
  navigation.test.ts     open/back intents
  cli-config.test.ts     cli.json merge/remove safety
  render/render.test.tsx headless OpenTUI renderer (runs on Bun)
```

### Session list

The list is windowed, not dumped. `buildSessionModels` walks the whole session
forest depth-first - a child always follows its parent, every descendant is
listed however deep, and `maxDepth` only clamps the *indent* - with a cycle
guard so a self-referential or closed `A -> B -> A` parent chain terminates
instead of hanging or silently emptying the list.

`rowText` composes each row to a fixed column budget: the hint, cost and age
columns are dropped in that order, and the remaining width is **re-measured
after each drop** so the title gets the columns that were actually freed.

`windowFor` keeps the selected row inside the measured pane height with the
smallest scroll that achieves it, so a 40-row list stays usable on a short
terminal and the view does not jump while moving within the window.

### Data flow

`data.session.list/get/status/cost` supply the rows. The host keeps that cache
live, so OSIEN does not poll: it re-derives in a `createMemo` and bumps a
signal from `data.listen` whenever an event whose type starts with `session.`
arrives. Matching events by prefix means no event id has to be guessed.

Opening a session prefers `ui.tabs.focus(sessionID)` so an open conversation is
reused, and falls back to `ui.router.navigate({ type: "session" })` when
session tabs are disabled — the documented fallback, verified in
`navigation.test.ts`.

---

## Verified

* `npm run typecheck` — clean against the installed `@opencode/plugin@2.0.32`
  and `@opencode/theme@2.0.32` type definitions.
* `npm test` — **54 tests, 54 pass, 0 fail, 0 skipped** (Node).
* `npm run test:render` — **4 tests, 4 pass, 0 fail** (Bun 1.4.3, headless
  OpenTUI). These render real frames: row text, the scroll window, the empty
  state and the error state are all asserted against captured character frames.
  The reactivity test was negative-controlled — inverting one assertion made the
  suite fail and print the captured frame — so the assertions are not vacuous.
* `npm run check` — exit 0.
* `npm run bun:install` — downloads Bun v1.4.3 and verifies it against the
  release's own `SHASUMS256.txt`
  (`0bf84e808552beea67bf1202a287a35c6c825d837b287b3f8e9dd513dba35d3d`).
* `node scripts/enable-cli.mjs` then `disable-cli.mjs` against a throwaway
  `XDG_CONFIG_HOME`: the entry is added with the correct absolute path (spaces
  preserved), a backup is written, and after disabling the plugin list, `theme`,
  `keybinds` and `scrollback` are identical to the original.
* Enabling into a `XDG_CONFIG_HOME` with no `opencode/` directory creates it.
* A `cli.json` whose `plugins` value is not an array is refused with exit code
  1, the file left byte-identical, and no backup written.

## Not verified — read this

1. **The plugin has never been loaded into a live OpenCode TUI.** Enabling it is
   an explicit, separate step and has not been performed. The API surface was
   taken from the installed type definitions and the official V2 CLI-plugin
   guide, but first-run behaviour inside a real TUI is unconfirmed.
2. **`escape` collides with a host binding.** The existing
   `~/.config/opencode/cli.json` on this machine binds `escape` to
   `session.interrupt`. `osien.workspace.back` also binds `escape`, scoped to the
   dashboard route at layer `priority: 5`. Which one wins is a host-side
   priority decision that could not be tested without running a live TUI. If
   `escape` turns out to interrupt instead of navigating back, rebind it in
   `cli.json`:
   ```jsonc
   { "keybinds": { "osien.workspace.back": "q" } }
   ```
   The command palette and `/osien` remain reachable regardless of bindings.
3. **`ctx.ui.dialog.select` and `ctx.ui.toast.show` are not covered by an
   automated test.** They are host-driven and need a live TUI, so the session
   picker behind `osien.session.open` is unexercised.
4. **`relativeAge` uses the wall clock at render time**, so ages in a long-lived
   dashboard do not tick on their own; they refresh on the next session event or
   a dashboard remount.
5. **The scroll window follows the selected row; there is no mouse scrolling.**
   `windowFor` is driven by the cursor and the measured pane size. Scroll-wheel
   input is not implemented.