/** Pure formatting helpers. No Solid, no OpenTUI, no host imports. */

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const YEAR = 365 * DAY

/** Compact age of a timestamp: `now`, `42s`, `7m`, `3h`, `2d`, `6w`, `2y`. */
export function relativeAge(timestamp: number, now: number): string {
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return "-"
  const delta = now - timestamp
  if (delta < 0) return "now"
  if (delta < SECOND) return "now"
  if (delta < MINUTE) return `${Math.floor(delta / SECOND)}s`
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m`
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h`
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d`
  if (delta < YEAR) return `${Math.floor(delta / WEEK)}w`
  return `${Math.floor(delta / YEAR)}y`
}

/**
 * USD cost from `data.session.cost` (a plain number). Sub-cent precision is
 * noise in a list row, so this never prints more than 2 decimals.
 */
export function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "$0"
  if (cost < 0.01) return "<$0.01"
  if (cost < 1000) return `$${cost.toFixed(2)}`
  return `$${(cost / 1000).toFixed(1)}k`
}

/** Single-cell status glyphs. ASCII-safe: OpenTUI renderables are not always UTF-8. */
export const GLYPH = {
  running: "*",
  idle: ".",
  archived: "-",
  untitled: "untitled",
  error: "!",
} as const

export function statusGlyph(running: boolean): string {
  return running ? GLYPH.running : GLYPH.idle
}

/** Shortens `value` to `width` cells, ending with an ellipsis when cut. */
export function truncate(value: string, width: number): string {
  if (width <= 0) return ""
  if (value.length <= width) return value
  if (width === 1) return value.slice(0, 1)
  return value.slice(0, width - 1) + "~"
}

/** Fits `value` into `width`, truncating only when it does not already fit. */
export function fit(value: string, width: number): string {
  return truncate(value, Math.max(0, width))
}

/** A session title, with a stable fallback when the host has none yet. */
export function sessionTitle(title: string | undefined, id: string): string {
  const trimmed = title?.trim()
  if (trimmed) return trimmed
  return `${GLYPH.untitled} ${id.slice(0, 8)}`
}

/** One-line breadcrumb used in the dashboard header and the composer strip. */
export function breadcrumb(parts: readonly (string | undefined)[]): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .join(" / ")
}

/**
 * Picks a layout tier from a column count. Narrow terminals drop columns rather
 * than wrapping, so the reading order stays stable.
 */
export function layoutTier(width: number): "micro" | "narrow" | "wide" {
  if (width < 48) return "micro"
  if (width < 72) return "narrow"
  return "wide"
}