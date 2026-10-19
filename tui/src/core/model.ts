/** Pure session view-model derivation. No Solid, no OpenTUI, no host imports. */

import { fit, formatCost, relativeAge, sessionTitle } from "./format.ts"

/** The subset of `SessionInfo` this plugin reads. Field names are host-owned. */
export interface RawSession {
  readonly id: string
  readonly parentID?: string
  readonly title?: string
  readonly updated: number
  readonly archived?: boolean
}

export interface SessionModel {
  readonly id: string
  readonly title: string
  /** 0 for a root session, 1 for its direct child, 2 for a grandchild. */
  readonly depth: number
  readonly running: boolean
  readonly cost: number
  readonly updated: number
  readonly archived: boolean
  readonly childCount: number
}

export interface SessionStats {
  readonly total: number
  readonly visible: number
  readonly running: number
  readonly archived: number
}

export interface BuildOptions {
  /** `data.session.status` */
  readonly status: (id: string) => "idle" | "running"
  /** `data.session.cost` */
  readonly cost: (id: string) => number
  /** Caps how many sessions reach the UI. */
  readonly limit: number
  /**
   * Deepest *indent* a row may carry. Traversal is unaffected: descendants
   * below this level are still listed, just clamped to the same indent.
   */
  readonly maxDepth: number
  /** Include archived sessions. Off by default: archived work is noise here. */
  readonly includeArchived?: boolean
}

export interface SessionModelResult {
  readonly rows: readonly SessionModel[]
  readonly stats: SessionStats
  /** Set only when derivation failed; the UI shows it instead of an empty list. */
  readonly error?: string
}

function byUpdated(left: RawSession, right: RawSession): number {
  if (right.updated !== left.updated) return right.updated - left.updated
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

/**
 * Flattens the session forest into display rows.
 *
 * Roots and children are each sorted newest-first, but a child always stays
 * under its parent, so the list reads as grouped work rather than a flat log.
 * Orphans (a parent that is not in the list) are promoted to depth 0 instead of
 * being dropped.
 */
export function buildSessionModels(
  sessions: readonly RawSession[],
  options: BuildOptions,
): SessionModelResult {
  const includeArchived = options.includeArchived === true
  const pool = includeArchived ? sessions : sessions.filter((s) => s.archived !== true)

  const present = new Set(pool.map((s) => s.id))
  const childrenOf = new Map<string, RawSession[]>()
  const roots: RawSession[] = []

  for (const session of pool) {
    const parent = session.parentID
    if (parent && present.has(parent) && parent !== session.id) {
      const bucket = childrenOf.get(parent)
      if (bucket) bucket.push(session)
      else childrenOf.set(parent, [session])
      continue
    }
    roots.push(session)
  }

  roots.sort(byUpdated)
  for (const bucket of childrenOf.values()) bucket.sort(byUpdated)

  const modelOf = (session: RawSession, depth: number): SessionModel => ({
    id: session.id,
    title: sessionTitle(session.title, session.id),
    depth,
    running: options.status(session.id) === "running",
    cost: options.cost(session.id),
    updated: session.updated,
    archived: session.archived === true,
    childCount: childrenOf.get(session.id)?.length ?? 0,
  })

  const rows: SessionModel[] = []
  let running = 0
  let archived = 0

  for (const session of pool) {
    if (options.status(session.id) === "running") running += 1
    if (session.archived === true) archived += 1
  }

  const maxIndent = Math.max(0, options.maxDepth)
  // `visited` is the cycle guard: a parent chain that loops back on itself
  // (A -> B -> A) must not spin forever, and it also guarantees every row is
  // emitted at most once when the input has duplicate ids.
  const visited = new Set<string>()

  // Pre-order DFS: a node is emitted before its children, and each sibling
  // group keeps its newest-first order because the stack is filled in reverse.
  const runSeed = (seed: RawSession) => {
    if (rows.length >= options.limit || visited.has(seed.id)) return
    const stack: { session: RawSession; depth: number }[] = [{ session: seed, depth: 0 }]
    while (stack.length > 0 && rows.length < options.limit) {
      const entry = stack.pop()!
      if (visited.has(entry.session.id)) continue
      visited.add(entry.session.id)
      rows.push(modelOf(entry.session, Math.min(entry.depth, maxIndent)))
      const children = childrenOf.get(entry.session.id)
      if (!children) continue
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index]!
        if (!visited.has(child.id)) stack.push({ session: child, depth: entry.depth + 1 })
      }
    }
  }

  for (const root of roots) {
    if (rows.length >= options.limit) break
    runSeed(root)
  }
  // A set where every node has a parent inside the pool (a closed cycle, e.g.
  // A -> B -> A) has no root at all. Seeding those nodes afterwards is what
  // keeps them visible instead of silently emptying the list.
  for (const session of pool) {
    if (rows.length >= options.limit) break
    if (!visited.has(session.id)) runSeed(session)
  }

  return {
    rows,
    stats: { total: pool.length, visible: rows.length, running, archived },
  }
}

/** Index of the active session inside `rows`, or -1. */
export function activeIndex(rows: readonly SessionModel[], activeID: string | undefined): number {
  if (!activeID) return -1
  return rows.findIndex((row) => row.id === activeID)
}

/**
 * Wraps an index around the ends of the list. Returns -1 for an empty list so
 * callers never navigate to a phantom row.
 */
export function cycleIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return -1
  const from = current < 0 ? (delta > 0 ? -1 : 0) : current
  return (((from + delta) % length) + length) % length
}

export interface RowTextOptions {
  readonly columns: number
  /** Resolved through `keymap.shortcuts` for the row currently in focus. */
  readonly hint?: string
  /** Passed in so callers control the clock; defaults to omitting the age. */
  readonly now?: number
}

/**
 * Renders one row as fixed-width text. Every column is derived from `columns`
 * so a narrow terminal loses trailing detail instead of wrapping a row.
 */
export function rowText(row: SessionModel, options: RowTextOptions): string {
  const { columns } = options
  if (columns <= 0) return ""

  const marker = row.running ? "*" : row.archived ? "-" : " "
  const age = options.now === undefined ? "" : relativeAge(row.updated, options.now)
  const cost = formatCost(row.cost)
  const indent = "  ".repeat(Math.max(0, row.depth))
  const prefix = marker + indent

  // The tail degrades in two steps, and the remaining width is re-measured
  // after every step. Measuring only against the original tail is what used to
  // leave the title squeezed by columns that had already been dropped.
  const hint = options.hint ? ` ${options.hint}` : ""
  const ageCell = age ? ` ${age}` : ""
  const costCell = cost ? ` ${cost}` : ""
  const room = (tail: string) => columns - prefix.length - tail.length

  let tail = `${ageCell}${costCell}${hint}`
  if (room(tail) < 26) tail = `${ageCell}${hint}`
  if (room(tail) < 16) tail = ""

  const available = columns - prefix.length - tail.length
  // Only reachable with an empty tail: a non-empty tail implies room >= 16.
  if (available <= 0) return fit(prefix, columns)
  return `${prefix}${fit(row.title, available)}${tail}`
}

export interface WindowResult {
  /** Index of the first row to draw. */
  readonly start: number
  /** Index after the last row to draw. */
  readonly end: number
  /** Scroll offset to remember for the next frame. */
  readonly offset: number
  /** Rows hidden above / below the window. */
  readonly above: number
  readonly below: number
}

/**
 * Scroll window that follows the selected row.
 *
 * A plain list of up to 40 rows will not fit a short terminal, so the view is
 * windowed against the measured pane height. The smallest change that keeps the
 * cursor visible wins, which stops the list from jumping on every key press.
 */
export function windowFor(
  length: number,
  cursor: number,
  height: number,
  offset: number,
): WindowResult {
  if (length <= 0 || height <= 0) return { start: 0, end: 0, offset: 0, above: 0, below: 0 }

  const rows = Math.max(1, Math.min(height, length))
  const maxStart = Math.max(0, length - rows)
  const selected = Math.max(0, Math.min(cursor, length - 1))

  let start = Math.max(0, Math.min(offset, maxStart))
  if (selected < start) start = selected
  if (selected >= start + rows) start = Math.min(selected - rows + 1, maxStart)
  start = Math.max(0, Math.min(start, maxStart))

  const end = Math.min(length, start + rows)
  return { start, end, offset: start, above: start, below: Math.max(0, length - end) }
}