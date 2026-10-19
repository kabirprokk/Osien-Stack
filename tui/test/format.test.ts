import assert from "node:assert/strict"
import { test } from "node:test"

import {
  breadcrumb,
  fit,
  formatCost,
  layoutTier,
  relativeAge,
  sessionTitle,
  statusGlyph,
  truncate,
} from "../src/core/format.ts"
import { WIDTH } from "../src/core/constants.ts"

const SECOND = 1_000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const YEAR = 365 * DAY
const NOW = 1_800_000_000_000

test("relativeAge steps through every bucket", () => {
  assert.equal(relativeAge(NOW, NOW), "now")
  assert.equal(relativeAge(NOW - 42 * SECOND, NOW), "42s")
  assert.equal(relativeAge(NOW - 7 * MINUTE, NOW), "7m")
  assert.equal(relativeAge(NOW - 3 * HOUR, NOW), "3h")
  assert.equal(relativeAge(NOW - 2 * DAY, NOW), "2d")
  assert.equal(relativeAge(NOW - 6 * WEEK, NOW), "6w")
  assert.equal(relativeAge(NOW - 2 * YEAR, NOW), "2y")
})

test("relativeAge treats a future timestamp as now and junk as a dash", () => {
  assert.equal(relativeAge(NOW + 5 * MINUTE, NOW), "now")
  assert.equal(relativeAge(Number.NaN, NOW), "-")
  assert.equal(relativeAge(NOW, Number.NaN), "-")
})

test("formatCost keeps sub-cent, small and large amounts readable", () => {
  assert.equal(formatCost(0), "$0")
  assert.equal(formatCost(Number.NaN), "$0")
  assert.equal(formatCost(0.004), "<$0.01")
  assert.equal(formatCost(0.01), "$0.01")
  assert.equal(formatCost(1.239), "$1.24")
  assert.equal(formatCost(999.99), "$999.99")
  assert.equal(formatCost(12_345), "$12.3k")
})

test("truncate never exceeds the requested width", () => {
  assert.equal(truncate("hello", 10), "hello")
  assert.equal(truncate("hello", 5), "hello")
  assert.equal(truncate("hello", 4), "hel~")
  assert.equal(truncate("hello", 1), "h")
  assert.equal(truncate("hello", 0), "")
  for (let width = 0; width <= 8; width += 1) {
    assert.ok(truncate("a-rather-long-session-title", width).length <= width)
  }
})

test("fit clamps negative widths instead of throwing", () => {
  assert.equal(fit("abc", -5), "")
  assert.equal(fit("abc", 2), "a~")
})

test("sessionTitle falls back to a stable id prefix", () => {
  assert.equal(sessionTitle("  Ship it  ", "ses_abc123def"), "Ship it")
  assert.equal(sessionTitle("", "ses_abc123def"), "untitled ses_abc1")
  assert.equal(sessionTitle(undefined, "ses_abc123def"), "untitled ses_abc1")
})

test("statusGlyph uses single ASCII cells", () => {
  assert.equal(statusGlyph(true).length, 1)
  assert.equal(statusGlyph(false).length, 1)
})

test("breadcrumb drops empty segments instead of leaving stray slashes", () => {
  assert.equal(breadcrumb(["workspace", "", "  ", "session"]), "workspace / session")
  assert.equal(breadcrumb([]), "")
  assert.equal(breadcrumb([undefined, "solo"]), "solo")
})

test("layoutTier matches the documented breakpoints", () => {
  assert.equal(layoutTier(20), "micro")
  assert.equal(layoutTier(WIDTH.micro - 1), "micro")
  assert.equal(layoutTier(WIDTH.micro), "narrow")
  assert.equal(layoutTier(WIDTH.narrow - 1), "narrow")
  assert.equal(layoutTier(WIDTH.narrow), "wide")
  assert.equal(layoutTier(300), "wide")
})