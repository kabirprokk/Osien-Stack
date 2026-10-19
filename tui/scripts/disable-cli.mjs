#!/usr/bin/env node
/**
 * Removes the OSIEN TUI entry from `cli.json`.
 *
 * Only the entry pointing at this package directory is removed; every other
 * plugin, keybind and preference is left exactly as it was, and nothing is
 * deleted from disk. A backup written by `enable-cli.mjs` is reported if one
 * exists, so the change can also be undone by hand.
 *
 * Usage:
 *   node scripts/disable-cli.mjs
 *   node scripts/disable-cli.mjs --dry-run
 */
import { existsSync } from "node:fs"
import { writeFile } from "node:fs/promises"

import { configPath, isEntryPoint, readConfig, removePlugin, serialise } from "./cli-config.mjs"
import { PACKAGE_ROOT } from "./enable-cli.mjs"

export const main = async ({ dryRun = false } = {}) => {
  const path = configPath()
  if (!existsSync(path)) {
    console.log(`${path} does not exist. Nothing to disable.`)
    return
  }
  // readConfig throws without writing anything when the file is not valid JSON.
  const { config } = await readConfig(path)
  const { config: next, removed } = removePlugin(config, PACKAGE_ROOT)

  if (removed === 0) {
    console.log(`No OSIEN entry found in ${path}. Nothing changed.`)
    return
  }
  if (dryRun) {
    console.log(`DRY RUN - would write ${path}\n${serialise(next)}`)
    return
  }

  await writeFile(path, serialise(next), "utf8")
  console.log(`Removed ${removed} OSIEN entr${removed === 1 ? "y" : "ies"} from ${path}`)
  const backup = `${path}.osien.bak`
  if (existsSync(backup)) console.log(`The pre-install file is still available at: ${backup}`)
  console.log(`Restart the TUI to unload it.`)
}

if (isEntryPoint(import.meta.url)) {
  main({ dryRun: new Set(process.argv.slice(2)).has("--dry-run") }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}