import type { Context } from "@opencode/plugin/tui/context"

import { CMD } from "../core/constants.ts"
import { fit } from "../core/format.ts"
import { tokens } from "../ui/tokens.ts"

export interface HomeFooterProps {
  readonly ctx: Context
}

/**
 * Additive claim on `home.footer`: the discoverable entry point to the
 * workspace from the home screen. `append` keeps the host's own footer intact.
 */
export function HomeFooter(props: HomeFooterProps) {
  const palette = tokens(props.ctx.theme)
  const shortcut = props.ctx.keymap.shortcuts(CMD.openWorkspace).join(" ") || "unset"
  return (
    <text fg={palette.textFaint} wrapMode="none" truncate>
      {fit(`${shortcut} OSIEN workspace`, 60)}
    </text>
  )
}