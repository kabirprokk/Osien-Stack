import { createMemo, createSignal, For, Show } from "solid-js"
import type { Context } from "@opencode/plugin/tui/context"

import { fit, layoutTier } from "../core/format.ts"
import { rowText, windowFor, type SessionModel, type SessionModelResult } from "../core/model.ts"
import { statusColor, tokens } from "./tokens.ts"

export interface SessionListProps {
  readonly ctx: Context
  readonly result: SessionModelResult
  readonly columns: number
  /**
   * Rows the pane can draw. Defaults to the full list; the dashboard passes the
   * measured pane height so a 40-row list cannot spill off a short terminal.
   */
  readonly viewport?: number
  /** Session currently open in the host, highlighted in place. */
  readonly activeID: string | undefined
  /** Row under the dashboard cursor, highlighted when `cursor >= 0`. */
  readonly cursor?: number
  /** Shortcut hint rendered on the focused row only. */
  readonly hint?: string
  readonly now?: number
  readonly emptyHint?: string
}

/**
 * The session list used by both `sidebar.content` and the workspace dashboard.
 *
 * Rows are pre-composed by `rowText` so a row can never wrap, and the visible
 * slice is windowed against the measured pane height with the scroll offset
 * following the selected row.
 */
export function SessionList(props: SessionListProps) {
  const palette = tokens(props.ctx.theme)
  const [offset, setOffset] = createSignal(0)
  const cursorRow = () => (props.cursor === undefined ? -1 : props.cursor)

  const view = createMemo(() => {
    const length = props.result.rows.length
    const height = props.viewport === undefined ? length : props.viewport
    const next = windowFor(length, cursorRow(), height, offset())
    // Remember the scroll position so the next frame does not jump back.
    if (next.offset !== offset()) setOffset(next.offset)
    return next
  })

  const visible = createMemo(() => props.result.rows.slice(view().start, view().end))
  const tier = () => layoutTier(props.columns)

  const fgFor = (row: SessionModel, index: number) => {
    const absolute = view().start + index
    if (absolute === cursorRow()) return palette.accent
    if (row.id === props.activeID) return palette.textBase
    return statusColor(props.ctx.theme, row.running, row.archived)
  }

  const counter = () => {
    const { above, below } = view()
    if (above === 0 && below === 0) return ""
    return `${above + 1}-${above + visible().length}/${props.result.stats.visible}`
  }

  return (
    <box flexDirection="column" width="100%" height="100%">
      <Show
        when={!props.result.error}
        fallback={
          <text fg={palette.destructive} wrapMode="none" truncate>
            {`! session list unavailable: ${props.result.error}`}
          </text>
        }
      >
        <Show
          when={props.result.rows.length > 0}
          fallback={<text fg={palette.textFaint} wrapMode="none">{props.emptyHint ?? "no sessions yet"}</text>}
        >
          <For each={visible()}>
            {(row, index) => (
              <text fg={fgFor(row, index())} wrapMode="none" truncate>
                {rowText(row, {
                  columns: props.columns,
                  hint: view().start + index() === cursorRow() ? props.hint : undefined,
                  now: props.now,
                })}
              </text>
            )}
          </For>
          <Show when={tier() === "micro" || counter()}>
            <text fg={palette.textFaint} wrapMode="none" truncate>
              {fit(
                counter() || `${props.result.stats.visible}/${props.result.stats.total} sessions`,
                props.columns,
              )}
            </text>
          </Show>
        </Show>
      </Show>
    </box>
  )
}