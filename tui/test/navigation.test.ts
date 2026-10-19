import assert from "node:assert/strict"
import { test } from "node:test"

import { isNavigableDestination, openSession, planBack } from "../src/core/navigation.ts"
import { WORKSPACE_ROUTE } from "../src/core/constants.ts"

test("openSession prefers the session tab when tabs are enabled", () => {
  const calls: string[] = []
  const result = openSession({
    sessionID: "ses_1",
    focusTab: (id) => {
      calls.push(`focus:${id}`)
      return true
    },
    navigate: () => calls.push("navigate"),
  })

  assert.equal(result, "tab")
  assert.deepEqual(calls, ["focus:ses_1"])
})

test("openSession falls back to the router when focus returns false", () => {
  const seen: unknown[] = []
  const result = openSession({
    sessionID: "ses_1",
    focusTab: () => false,
    navigate: (destination) => seen.push(destination),
  })

  assert.equal(result, "route")
  assert.deepEqual(seen, [{ type: "session", sessionID: "ses_1" }])
})

test("openSession rejects a blank id without touching the host", () => {
  let touched = false
  for (const sessionID of ["", "   ", undefined as unknown as string]) {
    const result = openSession({
      sessionID,
      focusTab: () => {
        touched = true
        return true
      },
      navigate: () => {
        touched = true
      },
    })
    assert.equal(result, "rejected")
  }
  assert.equal(touched, false)
})

test("openSession reports rejection instead of throwing when the host throws", () => {
  const result = openSession({
    sessionID: "ses_1",
    focusTab: () => {
      throw new Error("tabs unavailable")
    },
    navigate: () => {},
  })
  assert.equal(result, "rejected")
})

test("planBack returns the remembered route", () => {
  const previous = { type: "session", sessionID: "ses_9" } as const
  assert.deepEqual(
    planBack({ previous, current: { type: "plugin", id: "osien", name: WORKSPACE_ROUTE }, navigate: () => {} }),
    previous,
  )
})

test("planBack falls back to home instead of trapping the user on the workspace", () => {
  const current = { type: "plugin", id: "osien", name: WORKSPACE_ROUTE } as const
  assert.deepEqual(planBack({ previous: current, current, navigate: () => {} }), { type: "home" })
  assert.deepEqual(planBack({ previous: undefined, current, navigate: () => {} }), { type: "home" })
})

test("planBack keeps a different plugin route as the destination", () => {
  const previous = { type: "plugin", id: "other", name: "other-page" } as const
  const current = { type: "plugin", id: "osien", name: WORKSPACE_ROUTE } as const
  assert.equal(planBack({ previous, current, navigate: () => {} }), previous)
})

test("isNavigableDestination rejects half-built routes", () => {
  assert.equal(isNavigableDestination({ type: "home" }), true)
  assert.equal(isNavigableDestination({ type: "session", sessionID: "ses_1" }), true)
  assert.equal(isNavigableDestination({ type: "session", sessionID: "" }), false)
  assert.equal(isNavigableDestination({ type: "plugin", id: "a", name: "b" }), true)
  assert.equal(isNavigableDestination({ type: "plugin", id: "a", name: "" }), false)
})