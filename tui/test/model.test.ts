import assert from "node:assert/strict"
import { test } from "node:test"

import {
  activeIndex,
  buildSessionModels,
  cycleIndex,
  rowText,
  windowFor,
  type RawSession,
} from "../src/core/model.ts"

const NOW = 1_800_000_000_000

function session(over: Partial<RawSession> & { id: string }): RawSession {
  return { updated: NOW, ...over }
}

const idle = () => "idle" as const
const noCost = () => 0

function build(sessions: readonly RawSession[], over: Partial<Parameters<typeof buildSessionModels>[1]> = {}) {
  return buildSessionModels(sessions, {
    status: idle,
    cost: noCost,
    limit: 40,
    maxDepth: 2,
    ...over,
  })
}

test("sessions are grouped: a child always follows its parent", () => {
  const { rows } = build([
    session({ id: "root-a", title: "A", updated: NOW - 3_000 }),
    session({ id: "root-b", title: "B", updated: NOW - 1_000 }),
    session({ id: "child-a1", parentID: "root-a", title: "A1", updated: NOW - 2_000 }),
  ])

  assert.deepEqual(
    rows.map((row) => [row.id, row.depth]),
    [
      ["root-b", 0],
      ["root-a", 0],
      ["child-a1", 1],
    ],
  )
})

test("an orphan is promoted to the top level rather than dropped", () => {
  const { rows, stats } = build([
    session({ id: "root", title: "Root", updated: NOW }),
    session({ id: "ghost", parentID: "missing", title: "Orphan", updated: NOW - 500 }),
  ])

  assert.deepEqual(
    rows.map((row) => row.id),
    ["root", "ghost"],
  )
  assert.equal(stats.total, 2)
})

test("a self-parented session cannot loop forever", () => {
  const { rows } = build([session({ id: "loop", parentID: "loop", title: "Loop" })])
  assert.deepEqual(
    rows.map((row) => [row.id, row.depth]),
    [["loop", 0]],
  )
})

test("maxDepth clamps the indent but never drops descendants", () => {
  const sessions = [
    session({ id: "r", title: "R", updated: NOW }),
    session({ id: "c", parentID: "r", title: "C", updated: NOW - 1 }),
    session({ id: "g", parentID: "c", title: "G", updated: NOW - 2 }),
    session({ id: "gg", parentID: "g", title: "GG", updated: NOW - 3 }),
    session({ id: "ggg", parentID: "gg", title: "GGG", updated: NOW - 4 }),
  ]

  // Every generation is listed at every setting. Only the indent is clamped.
  for (const maxDepth of [0, 1, 2, 5]) {
    const { rows } = build(sessions, { maxDepth })
    assert.deepEqual(
      rows.map((row) => row.id),
      ["r", "c", "g", "gg", "ggg"],
      `maxDepth ${maxDepth} dropped rows`,
    )
    for (const row of rows) {
      assert.ok(row.depth <= maxDepth, `depth ${row.depth} exceeds maxDepth ${maxDepth}`)
    }
  }

  const clamped = build(sessions, { maxDepth: 1 }).rows
  assert.deepEqual(
    clamped.map((row) => row.depth),
    [0, 1, 1, 1, 1],
  )
  const deep = build(sessions, { maxDepth: 9 }).rows
  assert.deepEqual(
    deep.map((row) => row.depth),
    [0, 1, 2, 3, 4],
  )
})

test("a five-deep branch is traversed in parent-before-child order", () => {
  const sessions = [
    session({ id: "lvl0", title: "L0", updated: NOW }),
    session({ id: "lvl1", parentID: "lvl0", title: "L1", updated: NOW - 1 }),
    session({ id: "lvl1b", parentID: "lvl0", title: "L1b", updated: NOW - 2 }),
    session({ id: "lvl2", parentID: "lvl1", title: "L2", updated: NOW - 3 }),
  ]
  const { rows } = build(sessions, { maxDepth: 0 })
  assert.deepEqual(
    rows.map((row) => row.id),
    ["lvl0", "lvl1", "lvl2", "lvl1b"],
    "subtree must be emitted contiguously, before the next sibling",
  )
})

test("a cyclic parent chain terminates and emits each node once", () => {
  const { rows } = build([
    session({ id: "a", parentID: "b", title: "A", updated: NOW }),
    session({ id: "b", parentID: "a", title: "B", updated: NOW - 1 }),
  ])
  const ids = rows.map((row) => row.id)
  assert.equal(ids.length, 2)
  assert.deepEqual([...new Set(ids)].sort(), ["a", "b"])
})

test("a self-parented node plus a child does not recurse forever", () => {
  const { rows } = build([
    session({ id: "a", parentID: "a", title: "A", updated: NOW }),
    session({ id: "b", parentID: "a", title: "B", updated: NOW - 1 }),
  ])
  assert.deepEqual(
    rows.map((row) => row.id),
    ["a", "b"],
  )
})

test("duplicate ids are emitted once, not once per edge", () => {
  const { rows } = build([
    session({ id: "dup", title: "First", updated: NOW }),
    session({ id: "dup", title: "Second", updated: NOW - 1 }),
    session({ id: "child", parentID: "dup", title: "Child", updated: NOW - 2 }),
  ])
  assert.deepEqual(
    rows.map((row) => row.id),
    ["dup", "child"],
  )
})

test("archived sessions are hidden by default but still counted", () => {
  const sessions = [
    session({ id: "live", title: "Live" }),
    session({ id: "old", title: "Old", archived: true }),
  ]

  const hidden = build(sessions)
  assert.deepEqual(
    hidden.rows.map((row) => row.id),
    ["live"],
  )
  assert.equal(hidden.stats.total, 1)
  assert.equal(hidden.stats.archived, 0)

  const shown = build(sessions, { includeArchived: true })
  assert.deepEqual(
    shown.rows.map((row) => row.id),
    ["live", "old"],
  )
  assert.equal(shown.stats.archived, 1)
})

test("running status and cost come from the injected host accessors", () => {
  const { rows, stats } = build([session({ id: "busy", title: "Busy" })], {
    status: (id) => (id === "busy" ? "running" : "idle"),
    cost: (id) => (id === "busy" ? 1.5 : 0),
  })

  assert.equal(rows[0]?.running, true)
  assert.equal(rows[0]?.cost, 1.5)
  assert.equal(stats.running, 1)
})

test("limit caps rows without distorting ordering", () => {
  const sessions = Array.from({ length: 10 }, (_, i) =>
    session({ id: `s${i}`, title: `S${i}`, updated: NOW - i * 1_000 }),
  )
  const { rows, stats } = build(sessions, { limit: 3 })
  assert.deepEqual(
    rows.map((row) => row.id),
    ["s0", "s1", "s2"],
  )
  assert.equal(stats.total, 10)
  assert.equal(stats.visible, 3)
})

test("childCount reflects the pool, not just the visible rows", () => {
  const sessions = [
    session({ id: "r", title: "R" }),
    session({ id: "c1", parentID: "r", title: "C1", updated: NOW - 1 }),
    session({ id: "c2", parentID: "r", title: "C2", updated: NOW - 2 }),
  ]
  const { rows } = build(sessions, { limit: 2 })
  assert.equal(rows[0]?.childCount, 2)
})

test("empty input yields empty rows and a zeroed stat block", () => {
  const { rows, stats } = build([])
  assert.deepEqual(rows, [])
  assert.deepEqual(stats, { total: 0, visible: 0, running: 0, archived: 0 })
})

test("activeIndex finds the open session and reports -1 otherwise", () => {
  const { rows } = build([session({ id: "a" }), session({ id: "b", updated: NOW - 1 })])
  assert.equal(activeIndex(rows, "b"), 1)
  assert.equal(activeIndex(rows, "nope"), -1)
  assert.equal(activeIndex(rows, undefined), -1)
})

test("cycleIndex wraps both directions and refuses an empty list", () => {
  assert.equal(cycleIndex(0, 1, 3), 1)
  assert.equal(cycleIndex(2, 1, 3), 0)
  assert.equal(cycleIndex(0, -1, 3), 2)
  assert.equal(cycleIndex(-1, 1, 3), 0)
  assert.equal(cycleIndex(-1, -1, 3), 2)
  assert.equal(cycleIndex(0, 1, 0), -1)
  assert.equal(cycleIndex(0, -1, 1), 0)
})

test("rowText always fits its column budget at every terminal width", () => {
  const { rows } = build([
    session({ id: "a", title: "A very long session title that will not fit", updated: NOW - 3 * 3_600_000 }),
    session({ id: "b", parentID: "a", title: "Child", updated: NOW }),
  ])

  for (let columns = 1; columns <= 160; columns += 1) {
    for (const row of rows) {
      const line = rowText(row, { columns, now: NOW, hint: "ctrl+g" })
      assert.ok(
        line.length <= columns,
        `row ${row.id} overflowed at ${columns}: ${JSON.stringify(line)}`,
      )
    }
  }
})

test("rowText re-measures the title against the columns it actually kept", () => {
  const { rows } = build([session({ id: "a", title: "Readable title", updated: NOW - 60_000 })], {
    cost: () => 2.5,
  })
  const row = rows[0]!

  // Wide: age + cost kept.
  assert.match(rowText(row, { columns: 80, now: NOW }), /Readable title 1m \$2\.50$/)

  // At 60 columns everything still fits, hint included.
  assert.match(rowText(row, { columns: 60, now: NOW, hint: "ctrl+r refresh" }), /^ Readable title 1m \$2\.50 ctrl\+r refresh$/)

  // Narrower: the hint pushes past the 26-column threshold, so cost is dropped
  // - and the title must then be given back the width that dropping freed up.
  const degraded = rowText(row, { columns: 44, now: NOW, hint: "ctrl+r refresh" })
  assert.equal(degraded.includes("$2.50"), false, `cost should be dropped at 44 columns: ${JSON.stringify(degraded)}`)
  assert.ok(degraded.includes("Readable title"), `title squeezed at 44 columns: ${JSON.stringify(degraded)}`)

  // A 40-column pane still gets real title room rather than columns that were
  // already discarded.
  const narrow = rowText(row, { columns: 40, now: NOW, hint: "ctrl+r refresh" })
  assert.ok(narrow.includes("Readable title"), `title squeezed at 40 columns: ${JSON.stringify(narrow)}`)

  // Below the 16-column floor everything but the title goes.
  assert.equal(rowText(row, { columns: 14, now: NOW, hint: "ctrl+r refresh" }), " Readable tit~")
})

test("rowText never exceeds the column budget after tail degradation", () => {
  const { rows } = build(
    [
      session({ id: "a", title: "A very long session title that will not fit", updated: NOW - 3_600_000 }),
      session({ id: "b", parentID: "a", title: "B", updated: NOW }),
      session({ id: "c", parentID: "b", title: "C", updated: NOW }),
    ],
    { maxDepth: 3, cost: (id) => (id === "a" ? 12_345 : 0) },
  )

  for (let columns = 1; columns <= 120; columns += 1) {
    for (const hint of [undefined, "ctrl+shift+r refresh", "r"]) {
      for (const row of rows) {
        const line = rowText(row, { columns, now: NOW, hint })
        assert.ok(
          line.length <= columns,
          `overflow at ${columns} with hint ${String(hint)}: ${JSON.stringify(line)}`,
        )
      }
    }
  }
})

test("windowFor follows the selected row and never hides it", () => {
  const length = 40
  for (let cursor = 0; cursor < length; cursor += 1) {
    for (let offset = 0; offset < length; offset += 3) {
      const view = windowFor(length, cursor, 12, offset)
      assert.ok(view.start <= cursor && cursor < view.end, `cursor ${cursor} hidden at offset ${offset}`)
      assert.ok(view.end - view.start <= 12)
      assert.ok(view.start >= 0 && view.end <= length)
      assert.equal(view.above, view.start)
      assert.equal(view.below, length - view.end)
    }
  }
})

test("windowFor is stable while the cursor stays inside the window", () => {
  const first = windowFor(40, 10, 12, 0)
  assert.deepEqual([first.start, first.end], [0, 12])
  // Moving within the window must not scroll.
  for (let cursor = 1; cursor < 12; cursor += 1) {
    assert.equal(windowFor(40, cursor, 12, first.offset).start, 0)
  }
  // Stepping past the bottom scrolls by exactly one row.
  assert.equal(windowFor(40, 12, 12, first.offset).start, 1)
  // Jumping to the end clamps so the last row is the last visible row.
  const end = windowFor(40, 39, 12, 0)
  assert.deepEqual([end.start, end.end], [28, 40])
})

test("windowFor handles degenerate sizes and an out-of-range cursor", () => {
  assert.deepEqual(windowFor(0, 0, 10, 0), { start: 0, end: 0, offset: 0, above: 0, below: 0 })
  assert.deepEqual(windowFor(5, 0, 0, 0), { start: 0, end: 0, offset: 0, above: 0, below: 0 })
  assert.deepEqual(windowFor(3, -5, 10, 0), { start: 0, end: 3, offset: 0, above: 0, below: 0 })
  assert.deepEqual(windowFor(3, 99, 10, 0), { start: 0, end: 3, offset: 0, above: 0, below: 0 })
  // A pane taller than the list shows everything.
  assert.deepEqual(windowFor(3, 0, 50, 0), { start: 0, end: 3, offset: 0, above: 0, below: 0 })
})

test("rowText marks running and archived rows with single cells", () => {
  const { rows } = build(
    [
      session({ id: "busy", title: "Busy", updated: NOW }),
      session({ id: "arch", title: "Arch", archived: true, updated: NOW - 1 }),
      session({ id: "quiet", title: "Quiet", updated: NOW - 2 }),
    ],
    { includeArchived: true, status: (id) => (id === "busy" ? "running" : "idle") },
  )

  const byID = new Map(rows.map((row) => [row.id, row]))
  const busy = byID.get("busy")!
  const arch = byID.get("arch")!
  const quiet = byID.get("quiet")!
  assert.equal(busy.running, true)
  assert.ok(rowText(busy, { columns: 40 }).startsWith("*"))
  assert.ok(rowText(arch, { columns: 40 }).startsWith("-"))
  assert.ok(rowText(quiet, { columns: 40 }).startsWith(" "))
})

test("child rows are indented under their parent", () => {
  const { rows } = build([
    session({ id: "r", title: "Parent" }),
    session({ id: "c", parentID: "r", title: "Child", updated: NOW - 1 }),
  ])
  assert.ok(rowText(rows[1]!, { columns: 40 }).startsWith("   Child"))
})