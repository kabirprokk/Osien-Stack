import assert from "node:assert/strict"
import { test, type TestContext } from "node:test"

import { RGBA } from "@opentui/core"
import type { TestRendererSetup } from "@opentui/core/testing"
import { createSignal } from "solid-js"

import { buildSessionModels, type RawSession } from "../../src/core/model.ts"
import { SessionList } from "../../src/ui/session-list.tsx"
import type { Context } from "@opencode/plugin/tui/context"
import type { ResolvedTheme } from "@opencode/theme/tui"

const NOW = 1_800_000_000_000

/**
 * Render fixture.
 *
 * The host resolves the real theme before calling a plugin, and that resolver
 * needs a full built-in theme document which cannot be reconstructed here
 * without guessing its schema. Only the tokens this plugin reads are stubbed,
 * with real `RGBA` values. No host API surface is invented.
 */
function fixtureTheme(): ResolvedTheme {
  const rgb = (r: number, g: number, b: number) => RGBA.fromInts(r, g, b, 255)
  const stateful = (base: RGBA) =>
    ({ base, $disabled: base, $pressed: base, $focused: base, $selected: base, $hovered: base }) as never
  const text = {
    base: rgb(226, 232, 240),
    muted: rgb(148, 163, 184),
    faint: rgb(100, 116, 139),
    action: {
      primary: stateful(rgb(34, 211, 238)),
      secondary: stateful(rgb(148, 163, 184)),
      destructive: stateful(rgb(248, 113, 113)),
    },
    formfield: stateful(rgb(148, 163, 184)),
    feedback: {
      error: { base: rgb(248, 113, 113), muted: rgb(248, 113, 113) },
      warning: { base: rgb(251, 191, 36), muted: rgb(251, 191, 36) },
      success: { base: rgb(74, 222, 128), muted: rgb(74, 222, 128) },
      info: { base: rgb(96, 165, 250), muted: rgb(96, 165, 250) },
    },
  }
  return {
    text,
    background: {
      base: rgb(11, 15, 20),
      raised: { base: rgb(17, 24, 39), high: rgb(31, 41, 55), max: rgb(55, 65, 81) },
      action: {
        primary: stateful(rgb(34, 211, 238)),
        secondary: stateful(rgb(148, 163, 184)),
        destructive: stateful(rgb(248, 113, 113)),
      },
      formfield: stateful(rgb(148, 163, 184)),
      feedback: {
        error: { base: rgb(248, 113, 113) },
        warning: { base: rgb(251, 191, 36) },
        success: { base: rgb(74, 222, 128) },
        info: { base: rgb(96, 165, 250) },
      },
    },
    border: { base: rgb(31, 41, 55) },
  } as unknown as ResolvedTheme
}

const theme = fixtureTheme()

/** Only `theme` is read by SessionList, so the rest of Context is unused. */
const ctx = { theme } as unknown as Context

function model(sessions: readonly RawSession[], over: Partial<Parameters<typeof buildSessionModels>[1]> = {}) {
  return buildSessionModels(sessions, {
    status: () => "idle",
    cost: () => 0,
    limit: 40,
    maxDepth: 2,
    ...over,
  })
}

const sample = model([
  { id: "ses_a", title: "Redesign the sidebar", updated: NOW - 60_000 },
  { id: "ses_b", parentID: "ses_a", title: "Child task", updated: NOW - 120_000 },
  { id: "ses_c", title: "Investigate flaky test", updated: NOW - 7_200_000 },
])

/**
 * The one and only skip condition.
 *
 * OpenTUI's native FFI layer is unavailable on runtimes below its declared
 * `engines` range (bun >= 1.3.0, node >= 26.4.0). That is an unsupported
 * platform, and it is the ONLY thing allowed to skip. Every other failure -
 * a bad import, a compile error, a component that throws, an assertion - is a
 * real error and must fail the suite.
 */
const FFI_UNAVAILABLE = /OpenTUI native FFI is not available for this runtime/i

function isUnsupportedRuntime(error: unknown): boolean {
  return FFI_UNAVAILABLE.test(error instanceof Error ? error.message : String(error))
}

async function startRenderer(
  t: TestContext,
  node: () => unknown,
  config: { width: number; height: number },
): Promise<TestRendererSetup | null> {
  const { testRender } = await import("@opentui/solid")
  try {
    return await testRender(node as never, config)
  } catch (error) {
    if (isUnsupportedRuntime(error)) {
      t.skip(`OpenTUI native FFI is unavailable on this runtime: ${(error as Error).message}`)
      return null
    }
    throw error
  }
}

test("the Solid transform is the reactive client runtime, not the server build", async (t) => {
  // `solid-js` resolves to `dist/server.js` under the `node` export condition,
  // which has no fine-grained updates. `@opentui/solid/bun-plugin` rewrites it
  // to `dist/solid.js`. If that rewrite stops happening, this test fails loudly
  // instead of the whole suite quietly proving nothing about reactivity.
  const [label, setLabel] = createSignal("ALPHA")

  const setup = await startRenderer(
    t,
    () => (
      <box width={40} height={3}>
        <text fg={theme.text.base} wrapMode="none">
          {label()}
        </text>
      </box>
    ),
    { width: 40, height: 3 },
  )
  if (!setup) return

  try {
    await setup.flush()
    const before = setup.captureCharFrame()
    assert.ok(before.includes("ALPHA"), `initial frame did not render: ${JSON.stringify(before)}`)

    setLabel("BETA")
    await setup.flush()
    const after = setup.captureCharFrame()

    assert.ok(
      after.includes("BETA") && !after.includes("ALPHA"),
      `signal update did not re-render (server runtime?): ${JSON.stringify(after)}`,
    )
  } finally {
    await setup.renderer.destroy()
  }
})

test("the session list renders real rows and never exceeds the terminal width", async (t) => {
  for (const width of [120, 72, 40]) {
    const setup = await startRenderer(
      t,
      () => (
        <box width={width} height={20}>
          <SessionList
            ctx={ctx}
            result={sample}
            columns={width}
            activeID="ses_a"
            cursor={0}
            hint="ctrl+shift+r refresh"
            now={NOW}
          />
        </box>
      ),
      { width, height: 20 },
    )
    if (!setup) return

    try {
      await setup.flush()
      const frame = setup.captureCharFrame()
      assert.ok(frame.includes("Redesign the sidebar"), `title missing at ${width}:\n${frame}`)
      assert.ok(frame.includes("Investigate flaky"), `last row missing at ${width}:\n${frame}`)
      assert.ok(frame.includes("Child task"), `nested row missing at ${width}:\n${frame}`)
      for (const line of frame.split("\n")) {
        assert.ok(line.length <= width, `line overflowed ${width} columns: ${JSON.stringify(line)}`)
      }
    } finally {
      await setup.renderer.destroy()
    }
  }
})

test("a long list is windowed to the measured pane height and follows the cursor", async (t) => {
  const many = model(
    Array.from({ length: 40 }, (_, i) => ({
      id: `ses_${String(i).padStart(2, "0")}`,
      title: `Session number ${i}`,
      updated: NOW - i * 60_000,
    })),
  )

  const renderAt = async (cursor: number) => {
    const setup = await startRenderer(
      t,
      () => (
        <box width={60} height={12}>
          <SessionList
            ctx={ctx}
            result={many}
            columns={58}
            viewport={10}
            activeID={undefined}
            cursor={cursor}
            now={NOW}
          />
        </box>
      ),
      { width: 60, height: 12 },
    )
    if (!setup) return null
    try {
      await setup.flush()
      return setup.captureCharFrame()
    } finally {
      await setup.renderer.destroy()
    }
  }

  const top = await renderAt(0)
  if (top === null) return
  assert.ok(top.includes("Session number 0"), `first row missing:\n${top}`)
  assert.equal(top.includes("Session number 10"), false, `viewport leaked past 10 rows:\n${top}`)

  const scrolled = await renderAt(25)
  if (scrolled === null) return
  assert.ok(scrolled.includes("Session number 25"), `cursor row not visible after scroll:\n${scrolled}`)
  assert.equal(
    scrolled.includes("Session number 0"),
    false,
    `window did not follow the cursor:\n${scrolled}`,
  )
  // Exactly ten data rows are drawn inside the pane.
  const drawn = scrolled
    .split("\n")
    .filter((line) => line.includes("Session number"))
  assert.equal(drawn.length, 10, `expected 10 visible rows, got ${drawn.length}`)
})

test("the empty state and the error state both render visible text", async (t) => {
  const cases: { result: ReturnType<typeof model>; expected: string }[] = [
    {
      result: { rows: [], stats: { total: 0, visible: 0, running: 0, archived: 0 } },
      expected: "no sessions yet",
    },
    {
      result: {
        rows: [],
        stats: { total: 0, visible: 0, running: 0, archived: 0 },
        error: "boom",
      },
      expected: "session list unavailable",
    },
  ]

  for (const { result, expected } of cases) {
    const setup = await startRenderer(
      t,
      () => (
        <box width={60} height={8}>
          <SessionList ctx={ctx} result={result} columns={58} activeID={undefined} emptyHint="no sessions yet" />
        </box>
      ),
      { width: 60, height: 8 },
    )
    if (!setup) return
    try {
      await setup.flush()
      const frame = setup.captureCharFrame()
      assert.ok(frame.includes(expected), `expected ${JSON.stringify(expected)} in:\n${frame}`)
    } finally {
      await setup.renderer.destroy()
    }
  }
})
