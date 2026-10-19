/**
 * Pure navigation intents. Every host call is injected, so the resolution
 * order (tabs first, router as the documented fallback) is unit-testable
 * without a TUI.
 */

export interface OpenSessionDeps {
  readonly sessionID: string
  /** `ui.tabs.focus` — false when session tabs are disabled. */
  readonly focusTab: (sessionID: string) => boolean
  /** `ui.router.navigate` */
  readonly navigate: (destination: { type: "session"; sessionID: string }) => void
}

export type OpenSessionResult = "tab" | "route" | "rejected"

/**
 * Opens a session the way a user expects: prefer the session tab so the open
 * conversation is reused, and fall back to a full route change when tabs are
 * off. Rejects a blank id instead of navigating to a route the host cannot
 * resolve.
 */
export function openSession(deps: OpenSessionDeps): OpenSessionResult {
  const sessionID = deps.sessionID?.trim()
  if (!sessionID) return "rejected"
  try {
    if (deps.focusTab(sessionID)) return "tab"
    deps.navigate({ type: "session", sessionID })
    return "route"
  } catch {
    return "rejected"
  }
}

export type RouteLike =
  | { readonly type: "home" }
  | { readonly type: "session"; readonly sessionID: string }
  | { readonly type: "plugin"; readonly id: string; readonly name: string; readonly data?: Record<string, any> }

export interface BackDeps {
  /** The route remembered when the workspace was opened. */
  readonly previous: RouteLike | undefined
  /** `ui.router.current` — used to avoid returning to the workspace itself. */
  readonly current: RouteLike
  readonly navigate: (destination: RouteLike) => void
}

/**
 * Resolves where "back" should go. Landing on the workspace route itself would
 * trap the user, so that case (and a missing memory) falls back to home.
 */
export function planBack(deps: BackDeps): RouteLike {
  const previous = deps.previous
  const isSelf =
    previous?.type === "plugin" &&
    previous.name === (deps.current.type === "plugin" ? deps.current.name : "")
  if (previous && !isSelf) return previous
  return { type: "home" }
}

/** A route is safe to hand back to `ui.router.navigate` as a `Destination`. */
export function isNavigableDestination(route: RouteLike): boolean {
  switch (route.type) {
    case "home":
      return true
    case "session":
      return route.sessionID.length > 0
    case "plugin":
      return route.name.length > 0
  }
}