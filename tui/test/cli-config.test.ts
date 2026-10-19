import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { test } from "node:test"

import {
  alreadyInstalled,
  configPath,
  mergePlugin,
  normalisePath,
  packageEntry,
  removePlugin,
  serialise,
} from "../scripts/cli-config.mjs"

const ROOT = "C:\\Users\\Kabir\\osien-stack\\tui"
const OTHER = "C:\\Users\\Kabir\\osien-stack\\other"

/** A realistic cli.json: plugin list, keybinds, theme and terminal settings. */
function existingConfig() {
  return {
    theme: "opencode",
    keybinds: { leader: "ctrl+x", "osien.workspace.open": "ctrl+g" },
    plugins: ["opencode.notifications", { package: "./plugins/status", options: { compact: true } }, "-team.*"],
    scrollback: 5000,
    tui: { theme: { dark: "opencode" } },
  }
}

test("configPath honours XDG_CONFIG_HOME and falls back to the home config dir", () => {
  assert.equal(configPath({ XDG_CONFIG_HOME: "/xdg" }), join("/xdg", "opencode", "cli.json"))
  assert.equal(
    configPath({}).endsWith(join(".config", "opencode", "cli.json")),
    true,
  )
  assert.equal(
    configPath({ XDG_CONFIG_HOME: "   " }).endsWith(join(".config", "opencode", "cli.json")),
    true,
  )
})

test("normalisePath collapses paths and file URLs to one comparable form", () => {
  const url = new URL(`file:///${ROOT.replace(/\\/g, "/")}`)
  assert.equal(normalisePath(`${ROOT}/`), normalisePath(ROOT))
  assert.equal(normalisePath(url.href), normalisePath(ROOT))
  assert.equal(normalisePath(""), "")
  assert.equal(normalisePath("   "), "")
  assert.equal(normalisePath(undefined), "")
  assert.equal(normalisePath(42), "")
  assert.equal(normalisePath("file://"), "")
})

test("packageEntry writes an absolute path by default and a file URL on request", () => {
  assert.equal(packageEntry(ROOT), ROOT)
  assert.equal(packageEntry(ROOT, true), `file:///${ROOT.replace(/\\/g, "/")}`)
})

test("merge preserves every unrelated key and every existing plugin entry", () => {
  const before = existingConfig()
  const { config: after, changed } = mergePlugin(before, ROOT)

  assert.equal(changed, true)
  assert.equal(after.theme, before.theme)
  assert.equal(after.scrollback, before.scrollback)
  assert.deepEqual(after.keybinds, before.keybinds)
  assert.deepEqual(after.tui, before.tui)
  assert.deepEqual(after.plugins.slice(0, 3), before.plugins)
  assert.deepEqual(after.plugins[3], { package: ROOT, options: {} })
  // The input object is never mutated.
  assert.equal(before.plugins.length, 3)
})

test("merge is idempotent and does not duplicate the entry", () => {
  const once = mergePlugin(existingConfig(), ROOT).config
  const twice = mergePlugin(once, ROOT)
  assert.equal(twice.changed, false)
  assert.equal(twice.config.plugins.length, 4)
  assert.equal(alreadyInstalled(twice.config.plugins, ROOT), true)
})

test("alreadyInstalled matches the same directory written three different ways", () => {
  const plugins = [
    ROOT,
    { package: `${ROOT}/` },
    { package: new URL(`file:///${ROOT.replace(/\\/g, "/")}`).href },
  ]
  assert.equal(alreadyInstalled(plugins, ROOT), true)
  assert.equal(alreadyInstalled([{ package: OTHER }], ROOT), false)
  assert.equal(alreadyInstalled(undefined, ROOT), false)
  assert.equal(alreadyInstalled([{ package: "" }], ROOT), false)
})

test("remove takes out only the OSIEN entry and nothing else", () => {
  const before = existingConfig()
  const installed = mergePlugin(before, ROOT).config
  const { config: after, removed } = removePlugin(installed, ROOT)

  assert.equal(removed, 1)
  assert.deepEqual(after.plugins, before.plugins)
  assert.deepEqual(after.keybinds, before.keybinds)
  assert.equal(after.theme, before.theme)
  assert.equal(after.scrollback, before.scrollback)
})

test("remove is safe on a config that has no plugins key", () => {
  const { config, removed } = removePlugin({ theme: "opencode" }, ROOT)
  assert.equal(removed, 0)
  assert.deepEqual(config, { theme: "opencode" })
})

test("enable then disable round-trips to the original file content", () => {
  const original = existingConfig()
  const installed = mergePlugin(original, ROOT).config
  const restored = removePlugin(installed, ROOT).config
  assert.equal(serialise(restored), serialise(original))
})

test("merge on a config without a plugins key creates the list", () => {
  const { config, changed } = mergePlugin({ theme: "opencode" }, ROOT)
  assert.equal(changed, true)
  assert.deepEqual(config.plugins, [{ package: ROOT, options: {} }])
  assert.equal(config.theme, "opencode")
})

test("merge refuses a non-array plugins value instead of replacing it", () => {
  for (const bad of [{ theme: "x" }, "nope", 42, true]) {
    assert.throws(
      () => mergePlugin({ plugins: bad }, ROOT),
      /not an array/,
      `plugins: ${JSON.stringify(bad)} should have been rejected`,
    )
  }
})

test("remove refuses a non-array plugins value too", () => {
  assert.throws(() => removePlugin({ plugins: "nope" }, ROOT), /not an array/)
  // Absent is fine: there is simply nothing to remove.
  assert.deepEqual(removePlugin({ theme: "opencode" }, ROOT), {
    config: { theme: "opencode" },
    removed: 0,
  })
})

test("merge rejects before it can silently discard a malformed plugin list", () => {
  const bad = { plugins: { "opencode.notifications": true }, theme: "opencode" }
  assert.throws(() => mergePlugin(bad, ROOT), /not an array/)
  // The caller's object must be left exactly as it was.
  assert.deepEqual(bad.plugins, { "opencode.notifications": true })
})

test("PACKAGE_ROOT is a usable absolute path, not a percent-encoded URL", async () => {
  const { PACKAGE_ROOT } = await import("../scripts/enable-cli.mjs")
  assert.ok(!PACKAGE_ROOT.includes("%"), `PACKAGE_ROOT is still URL-encoded: ${PACKAGE_ROOT}`)
  assert.ok(isAbsolute(PACKAGE_ROOT), `PACKAGE_ROOT is not absolute: ${PACKAGE_ROOT}`)
  assert.ok(existsSync(PACKAGE_ROOT), `PACKAGE_ROOT is not a real directory: ${PACKAGE_ROOT}`)
  // The value written to cli.json must survive the round trip through
  // normalisePath, which is what the disable path matches on.
  assert.equal(normalisePath(packageEntry(PACKAGE_ROOT)), PACKAGE_ROOT)
  assert.equal(alreadyInstalled([{ package: PACKAGE_ROOT }], PACKAGE_ROOT), true)
})