import type { RGBA } from "@opentui/core"
import type { ResolvedTheme } from "@opencode/theme/tui"

/**
 * The exact set of semantic theme tokens this plugin uses.
 *
 * Nothing here is a literal colour: every entry is a resolved token from the
 * host theme, so the plugin follows the user's dark/light theme automatically.
 */
export interface Tokens {
  readonly textBase: RGBA
  readonly textMuted: RGBA
  readonly textFaint: RGBA
  readonly accent: RGBA
  readonly destructive: RGBA
  readonly success: RGBA
  readonly warning: RGBA
  readonly info: RGBA
  readonly surface: RGBA
  readonly surfaceRaised: RGBA
  readonly border: RGBA
}

export function tokens(theme: ResolvedTheme): Tokens {
  return {
    textBase: theme.text.base,
    textMuted: theme.text.muted,
    textFaint: theme.text.faint,
    accent: theme.text.action.primary.base,
    destructive: theme.text.action.destructive.base,
    success: theme.text.feedback.success.base,
    warning: theme.text.feedback.warning.base,
    info: theme.text.feedback.info.base,
    surface: theme.background.base,
    surfaceRaised: theme.background.raised.base,
    border: theme.border.base,
  }
}

/** Foreground for a session's activity state, from the feedback palette. */
export function statusColor(theme: ResolvedTheme, running: boolean, archived = false): RGBA {
  if (archived) return theme.text.faint
  return running ? theme.text.feedback.success.base : theme.text.muted
}