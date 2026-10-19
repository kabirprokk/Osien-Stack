import { Plugin } from "@opencode/plugin"

import { PLUGIN_ID } from "./core/constants.ts"

/**
 * Server-side entry point.
 *
 * OSIEN is a terminal-only plugin: it registers a TUI route, slot claims and a
 * keymap layer, and owns no tools, hooks or server state. This entry exists so
 * the package keeps the documented `index` + `tui` layout and stays loadable
 * from either `opencode.json` or `cli.json`.
 */
export default Plugin.define({
  id: PLUGIN_ID,
  setup() {},
})