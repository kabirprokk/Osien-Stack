import type { Context } from "@opencode/plugin/tui/context"

import { CMD } from "../core/constants.ts"
import { fit, formatCost, relativeAge } from "../core/format.ts"
import { createMeasuredBox, safeColumns } from "../ui/measure.ts"
import { tokens } from "../ui/tokens.ts"
import type { BoxRenderable } from "@opentui/core"

export interface SidebarProps {
  readonly ctx: Context
  readonly sessionID: string
}

/**
 * Replacement for `sidebar.content`.
 *
 * Scope note: this slot is the session list *inside the sidebar*. The native
 * conversation transcript and the native composer live outside this boundary
 * and are therefore untouched - only navigation chrome is replaced.
 */
export function SidebarContent(props: SidebarProps) {
  const ctx = props.ctx
  const palette = tokens(ctx.theme)
  const measured = createMeasuredBox()
  let surface: BoxRenderable | undefined

  const columns = () => safeColumns(measured.columns, 32)
  const session = () => ctx.data.session.get(props.sessionID)
  const running = () => ctx.data.session.status(props.sessionID) === "running"

  /** Single source of truth, so the loaded and not-loaded states cannot drift. */
  const summary = () => {
    const info = session()
    if (!info) return "session not loaded"
    const age = relativeAge(info.time.updated, Date.now())
    const cost = formatCost(ctx.data.session.cost(props.sessionID))
    return `${running() ? "running" : "idle"} - ${age} - ${cost}`
  }
  const summaryColor = () => {
    if (!session()) return palette.warning
    return running() ? palette.success : palette.textMuted
  }

  const shortcut = (id: string) => ctx.keymap.shortcuts(id).join(" ") || "unset"

  return (
    <box
      ref={(element) => {
        surface = element
        measured.report(element)
      }}
      onSizeChange={() => measured.report(surface)}
      flexDirection="column"
      width="100%"
      backgroundColor={palette.surface}
    >
      <text fg={summaryColor()} wrapMode="none" truncate>
        {fit(summary(), columns())}
      </text>

      <text fg={palette.textFaint} wrapMode="none" truncate>
        {fit(`${shortcut(CMD.openSession)} sessions`, columns())}
      </text>
      <text fg={palette.textFaint} wrapMode="none" truncate>
        {fit(`${shortcut(CMD.openWorkspace)} workspace`, columns())}
      </text>
    </box>
  )
}