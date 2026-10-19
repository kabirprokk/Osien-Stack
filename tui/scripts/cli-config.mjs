/**
 * Pure helpers for editing `cli.json` safely.
 *
 * Kept free of side effects so the "preserves every unrelated setting" promise
 * is covered by tests rather than asserted in a README.
 */
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

/** `~/.config/opencode/cli.json`, or `$XDG_CONFIG_HOME/opencode/cli.json`. */
export function configPath(env = process.env) {
  const xdg = env.XDG_CONFIG_HOME
  return join(xdg && xdg.trim() ? xdg : join(homedir(), ".config"), "opencode", "cli.json")
}

/** The value written into `plugins[].package`. */
export function packageEntry(root, fileUrl = false) {
  return fileUrl ? pathToFileURL(root).href : resolve(root)
}

/** Collapses package name, local path and file URL to one comparable form. */
export function normalisePath(value) {
  if (typeof value !== "string" || value.trim() === "") return ""
  const raw = value.trim()
  if (raw.startsWith("file://")) {
    try {
      // URL.pathname keeps forward slashes on Windows, so it must go through
      // resolve() as well or the same directory would not compare equal.
      const path = decodeURIComponent(new URL(raw).pathname)
      if (path === "" || path === "/") return ""
      return resolve(path.replace(/^\/([A-Za-z]:)/, "$1"))
    } catch {
      return ""
    }
  }
  return resolve(raw)
}

const entryPackage = (entry) => (typeof entry === "string" ? entry : entry?.package)

export function alreadyInstalled(plugins, root) {
  if (!Array.isArray(plugins)) return false
  const target = normalisePath(root).toLowerCase()
  if (!target) return false
  return plugins.some((entry) => normalisePath(entryPackage(entry)).toLowerCase() === target)
}

/**
 * Appends the entry, preserving every existing plugin and every other key.
 *
 * Throws when `plugins` exists but is not an array. Silently replacing a
 * malformed value would delete whatever the user actually had configured.
 */
export function mergePlugin(config, root, fileUrl = false) {
  if (config.plugins !== undefined && !Array.isArray(config.plugins)) {
    throw new Error(
      `Refusing to modify cli.json: "plugins" is present but is not an array ` +
        `(${describe(config.plugins)}).\nFix it by hand, then re-run. Nothing was written.`,
    )
  }
  const plugins = Array.isArray(config.plugins) ? [...config.plugins] : []
  if (alreadyInstalled(plugins, root)) return { config, changed: false }
  plugins.push({ package: packageEntry(root, fileUrl), options: {} })
  return { config: { ...config, plugins }, changed: true }
}

function describe(value) {
  if (value === null) return "null"
  return typeof value
}

/** Removes only entries pointing at this package; nothing else is touched. */
export function removePlugin(config, root) {
  if (config.plugins === undefined) return { config, removed: 0 }
  if (!Array.isArray(config.plugins)) {
    throw new Error(
      `Refusing to modify cli.json: "plugins" is present but is not an array ` +
        `(${describe(config.plugins)}).\nFix it by hand. Nothing was written.`,
    )
  }
  const target = normalisePath(root).toLowerCase()
  const kept = config.plugins.filter(
    (entry) => normalisePath(entryPackage(entry)).toLowerCase() !== target,
  )
  return { config: { ...config, plugins: kept }, removed: config.plugins.length - kept.length }
}

/** Reads and parses, or throws with a message that promises no file was written. */
export async function readConfig(path) {
  if (!existsSync(path)) return { config: {}, created: true }
  const raw = (await readFile(path, "utf8")).replace(/^\uFEFF/, "")
  if (raw.trim() === "") return { config: {}, created: false }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(
      `Refusing to modify ${path}: it is not valid JSON (${error instanceof Error ? error.message : String(error)}).\n` +
        `Nothing was written and no backup was created.`,
    )
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Refusing to modify ${path}: it must contain a JSON object.\nNothing was written.`)
  }
  return { config: parsed, created: false }
}

export function serialise(config) {
  return `${JSON.stringify(config, null, 2)}\n`
}

/** True when this module was started directly, not imported by a test. */
export function isEntryPoint(metaUrl, argv1 = process.argv[1]) {
  if (!argv1) return false
  try {
    return metaUrl === pathToFileURL(resolve(argv1)).href
  } catch {
    return false
  }
}