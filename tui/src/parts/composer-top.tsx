import { Show } from "solid-js"
import type { BoxRenderable } from "@opentui/core"
import type { Context } from "@opencode/plugin/tui/context"

import { CMD } from "../core/constants.ts"
import { fit, formatCost, relativeAge } from "../core/format.ts"
import { createMeasuredBox, safeColumns } from "../ui/measure.ts"
import { tokens } from "../ui/tokens.ts"

export interface ComposerTopProps {
  readonly ctx: Context
  readonly sessionID: string
}

/**
 * Additive claim on `session.composer.top`.
 *
 * The native composer itself is not replaced or wrapped - only a one-line
 * status strip is inserted above it, so input handling, attachments and
 * submission stay exactly as the host ships them.
 */
export function ComposerTop(props: ComposerTopProps) {
  const ctx = props.ctx
  const palette = tokens(ctx.theme)
  const measured = createMeasuredBox()
  let surface: BoxRenderable | undefined

  const columns = () => safeColumns(measured.columns, 40)
  const running = () => ctx.data.session.status(props.sessionID) === "running"
  const session = () => ctx.data.session.get(props.sessionID)
  const age = () => {
    const info = session()
    return info ? relativeAge(info.time.updated, Date.now()) : "-"
  }
  const title = () => session()?.title?.trim() ?? ""
  const status = () => `${running() ? "running" : "idle"} ${age()} ${formatCost(ctx.data.session.cost(props.sessionID))}`
  const workspaceHint = () => `${ctx.keymap.shortcuts(CMD.openWorkspace).join(" ") || "unset"} workspace`

  return (
    <box
      ref={(element) => {
        surface = element
        measured.report(element)
      }}
      onSizeChange={() => measured.report(surface)}
      flexDirection="row"
      width="100%"
    >
      <text fg={running() ? palette.success : palette.textFaint} wrapMode="none" truncate>
        {fit(status(), Math.max(12, Math.floor(columns() / 2)))}
      </text>
      <Show when={title()}>
        <text fg={palette.textFaint} wrapMode="none" truncate>
          {fit(title(), Math.max(6, Math.floor(columns() / 3)))}
        </text>
      </Show>
      <Show when={columns() >= 60}>
        <text fg={palette.textFaint} wrapMode="none" truncate>
          {fit(
            workspaceHint(),
            Math.max(10, columns() - Math.floor(columns() / 2) - Math.floor(columns() / 3)),
          )}
        </text>
      </Show>
    </box>
  )
}