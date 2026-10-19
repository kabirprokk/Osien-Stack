import { createMemo, createSignal, For, Show } from "solid-js"
import type { BoxRenderable } from "@opentui/core"
import type { Context } from "@opencode/plugin/tui/context"

import { BIND, CMD } from "../core/constants.ts"
import { breadcrumb, fit, formatCost, layoutTier } from "../core/format.ts"
import { cycleIndex } from "../core/model.ts"
import { openSession } from "../core/navigation.ts"
import { createMeasuredBox, safeColumns, safeRows } from "../ui/measure.ts"
import { createNavMemory } from "../ui/nav-memory.ts"
import { SessionList } from "../ui/session-list.tsx"
import { tokens, type Tokens } from "../ui/tokens.ts"
import { createSessionFeed } from "../ui/use-sessions.ts"

export interface WorkspaceProps {
  readonly ctx: Context
}

type Tone = "textBase" | "textMuted" | "success" | "info"

/**
 * The OSIEN workspace dashboard.
 *
 * This is a plugin *route*: the host owns the chrome and this page renders the
 * body only. Sessions sit on the left, live activity on the right, and the
 * layout collapses to one column on a narrow terminal.
 */
export function Workspace(props: WorkspaceProps) {
  const ctx = props.ctx
  const palette: Tokens = tokens(ctx.theme)
  const feed = createSessionFeed(ctx)
  const memory = createNavMemory(ctx)
  const measured = createMeasuredBox()
  const pane = createMeasuredBox()
  const [cursor, setCursor] = createSignal(memory.cursor)

  let surface: BoxRenderable | undefined
  let paneSurface: BoxRenderable | undefined

  const columns = () => safeColumns(measured.columns)
  const tier = () => layoutTier(columns())
  // The session pane is measured on its own so the viewport reflects the space
  // the list actually has, not the height of the whole route.
  const paneColumns = () => safeColumns(pane.columns, Math.floor(columns() / 2))
  const paneRows = () => Math.max(1, safeRows(pane.rows) - 1)
  const models = feed.models
  // Sampled once per render pass: rows only re-derive when `models()` changes.
  const now = Date.now()

  const activeID = createMemo(() => {
    const route = ctx.ui.router.current()
    return route.type === "session" ? route.sessionID : undefined
  })

  const totalCost = createMemo(() => models().rows.reduce((sum, row) => sum + row.cost, 0))

  const openAt = (index: number) => {
    const row = models().rows[index]
    if (!row) return
    const result = openSession({
      sessionID: row.id,
      focusTab: (id) => ctx.ui.tabs.focus(id),
      navigate: (destination) => ctx.ui.router.navigate(destination),
    })
    if (result === "rejected") {
      ctx.ui.toast.show({ message: "could not open that session", variant: "error" })
    }
  }

  const setIndex = (index: number) => {
    const length = models().rows.length
    if (length === 0) return
    const next = Math.max(0, Math.min(index, length - 1))
    setCursor(next)
    memory.setCursor(next)
  }

  const move = (delta: number) => {
    const next = cycleIndex(cursor(), delta, models().rows.length)
    if (next < 0) return
    setIndex(next)
  }

  // Route-scoped keyboard layer: the host disposes it when this component
  // unmounts, so these bindings never leak into the chat view.
  ctx.keymap.layer(() => ({
    priority: 5,
    commands: [
      { id: CMD.back, title: "OSIEN: back", bind: BIND.back, run: () => ctx.ui.router.navigate(memory.back()) },
      { bind: "up", run: () => move(-1) },
      { bind: "k", run: () => move(-1) },
      { bind: "down", run: () => move(1) },
      { bind: "j", run: () => move(1) },
      { bind: "enter", run: () => openAt(cursor()) },
      // Home/End jump to the ends directly. Cycling by +/- length would be a
      // no-op on a one-row list and wraps through modulo otherwise.
      { bind: "home", run: () => setIndex(0) },
      { bind: "end", run: () => setIndex(models().rows.length - 1) },
      { id: CMD.refresh, title: "OSIEN: refresh", bind: BIND.refresh, run: () => feed.refresh() },
    ],
  }))

  const shortcut = (id: string) => ctx.keymap.shortcuts(id).join(" ") || "unset"

  const activity = createMemo(() => {
    const running = models().rows.filter((row) => row.running)
    const route = ctx.ui.router.current()
    const tabs = ctx.ui.tabs.enabled() ? ctx.ui.tabs.list() : []
    const model = ctx.ui.model.current()
    const rows: { label: string; value: string; tone: Tone }[] = [
      {
        label: "running",
        value: running.length ? `${running.length} active` : "idle",
        tone: running.length ? "success" : "textMuted",
      },
      { label: "cost", value: formatCost(totalCost()), tone: "textMuted" },
    ]
    if (tabs.length) rows.push({ label: "tabs", value: `${tabs.length} open`, tone: "textMuted" })
    if (model) rows.push({ label: "model", value: `${model.providerID}/${model.modelID}`, tone: "info" })
    rows.push({ label: "route", value: route.type, tone: "textMuted" })
    return rows
  })

  return (
    <box
      ref={(element) => {
        surface = element
        measured.report(element)
      }}
      onSizeChange={() => measured.report(surface)}
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={palette.surface}
    >
      <box flexDirection="row" width="100%" paddingX={1}>
        <text fg={palette.accent} wrapMode="none">
          OSIEN
        </text>
        <text fg={palette.textMuted} wrapMode="none" truncate>
          {fit(
            ` ${breadcrumb([ctx.ui.format.path(ctx.location?.directory ?? ""), `v${ctx.app.version}`])}`,
            Math.max(0, columns() - 6),
          )}
        </text>
      </box>

      <box flexDirection="row" flexGrow={1} width="100%" paddingX={1}>
        <box
          ref={(element) => {
            paneSurface = element
            pane.report(element)
          }}
          onSizeChange={() => pane.report(paneSurface)}
          flexDirection="column"
          flexGrow={1}
          flexShrink={1}
          minWidth={0}
          height="100%"
        >
          <text fg={palette.textFaint} wrapMode="none" truncate>
            {fit(
              `SESSIONS ${models().stats.visible}/${models().stats.total}` +
                (models().stats.archived ? ` (+${models().stats.archived} archived)` : ""),
              paneColumns(),
            )}
          </text>
          <SessionList
            ctx={ctx}
            result={models()}
            columns={paneColumns()}
            viewport={paneRows()}
            activeID={activeID()}
            cursor={cursor()}
            hint={`${shortcut(CMD.refresh)} refresh`}
            now={now}
            emptyHint="no sessions yet"
          />
        </box>

        <Show when={tier() !== "micro"}>
          <box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0}>
            <text fg={palette.textFaint} wrapMode="none" truncate>
              ACTIVITY
            </text>
            <For each={activity()}>
              {(item) => (
                <text fg={palette[item.tone]} wrapMode="none" truncate>
                  {fit(`${item.label} ${item.value}`, Math.floor(columns() / 2))}
                </text>
              )}
            </For>
          </box>
        </Show>
      </box>

      <box flexDirection="row" width="100%" paddingX={1} borderStyle="single" border={["top"]}>
        <text fg={palette.textFaint} wrapMode="none" truncate>
          {fit(
            tier() === "micro"
              ? `${shortcut(CMD.back)} back - j/k - enter`
              : `${shortcut(CMD.back)} back - j/k or arrows move - enter open - ${shortcut(CMD.refresh)} refresh - ${shortcut(CMD.openWorkspace)} toggle`,
            columns(),
          )}
        </text>
      </box>
    </box>
  )
}