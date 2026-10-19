import type { Context } from "@opencode/plugin/tui/context"

import { planBack, type RouteLike } from "../core/navigation.ts"
import { WORKSPACE_ROUTE } from "../core/constants.ts"

interface NavState {
  /** Route the workspace was opened from, or null when unknown. */
  previous: RouteLike | null
  /** Sidebar/dashboard cursor, preserved across navigation. */
  cursor: number
}

/**
 * Cross-reload navigation memory for the workspace.
 *
 * `storage.memory` is used (not `storage.store`) on purpose: a remembered
 * route must not survive a TUI restart, only a plugin hot reload.
 */
export function createNavMemory(ctx: Context) {
  const [state, setState] = ctx.storage.memory<NavState>("navigation", {
    initial: { previous: null, cursor: 0 },
  })

  return {
    get previous() {
      return state.previous
    },
    get cursor() {
      return state.cursor
    },
    setCursor(cursor: number) {
      setState((draft) => {
        draft.cursor = Math.max(0, cursor)
      })
    },
    /** Remembers where the user came from, ignoring a self-referential route. */
    remember(route: RouteLike) {
      if (route.type === "plugin" && route.name === WORKSPACE_ROUTE) return
      setState((draft) => {
        draft.previous = route
      })
    },
    /** Destination for the back command. Never the workspace itself. */
    back(): RouteLike {
      const current = ctx.ui.router.current()
      return planBack({
        previous: state.previous ?? undefined,
        current: current as RouteLike,
        navigate: () => {},
      })
    },
  }
}