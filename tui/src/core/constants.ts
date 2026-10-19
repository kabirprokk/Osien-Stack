/**
 * Stable identifiers owned by this plugin.
 *
 * Every id below is namespaced under `osien.` and is declared here, not in the
 * host. Host command ids are never invented: this plugin only ever *binds* its
 * own ids through `context.keymap.layer`.
 */
export const PLUGIN_ID = "osien.tui"

/** `ui.router.register` name. Also the `navigate({ type: "plugin" })` target. */
export const WORKSPACE_ROUTE = "osien-workspace"

/** `ui.panel.open` selection name (reserved; panels are not used yet). */
export const WORKSPACE_PANEL = "osien.workspace"

export const CMD = {
  openWorkspace: "osien.workspace.open",
  back: "osien.workspace.back",
  refresh: "osien.data.refresh",
  openSession: "osien.session.open",
} as const

export const SLASH = {
  workspace: "osien",
} as const

/**
 * Default keyboard bindings.
 *
 * `ctrl+r` and `ctrl+p` are deliberately NOT used: a stock OpenCode `cli.json`
 * binds `session.rename` and `session.list` to them. `ctrl+shift+r` keeps
 * refresh clear of that set. All ids remain overridable in `cli.json` keybinds.
 */
export const BIND = {
  openWorkspace: "ctrl+g",
  openSession: "ctrl+o",
  back: "escape",
  refresh: "ctrl+shift+r",
} as const

/** Layout breakpoints, in columns. */
export const WIDTH = {
  /** Below this the UI drops secondary columns instead of wrapping. */
  narrow: 72,
  /** Below this even the labels go. */
  micro: 48,
} as const

/** How many sessions the sidebar and dashboard list by default. */
export const LIST_LIMIT = 40