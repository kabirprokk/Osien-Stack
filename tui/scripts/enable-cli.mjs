#!/usr/bin/env node
/**
 * Opt-in installer for OSIEN TUI.
 *
 * Adds this package to the CLI-only plugin list in `cli.json`, so the terminal
 * keeps the plugin even when it is connected to a remote server. It never
 * touches `opencode.json`, never restarts anything, and never rewrites a key it
 * does not own.
 *
 * Usage:
 *   node scripts/enable-cli.mjs              # add with an absolute local path
 *   node scripts/enable-cli.mjs --file-url   # add as a file:// URL instead
 *   node scripts/enable-cli.mjs --dry-run    # print the result, write nothing
 *
 * Revert with:  node scripts/disable-cli.mjs
 */
import { copyFile, mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import {
  configPath,
  isEntryPoint,
  mergePlugin,
  readConfig,
  serialise,
} from "./cli-config.mjs"

/**
 * `fileURLToPath`, not `url.pathname`: the latter leaves percent-encoding in
 * place, which corrupts any path containing a space.
 */
export const PACKAGE_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))

export const main = async ({ dryRun = false, fileUrl = false } = {}) => {
  const path = configPath()
  const { config, created } = await readConfig(path)
  const { config: next, changed } = mergePlugin(config, PACKAGE_ROOT, fileUrl)
  const entry = next.plugins.at(-1)?.package

  if (!changed) {
    console.log(`Already enabled in ${path}\n  ${entry}`)
    return
  }
  if (dryRun) {
    console.log(`DRY RUN - would write ${path}\n${serialise(next)}`)
    return
  }

  if (created) console.log(`${path} did not exist; it will be created.`)
  else {
    const backup = `${path}.osien.bak`
    await copyFile(path, backup)
    console.log(`Backup written: ${backup}`)
  }
  // A fresh XDG_CONFIG_HOME can have no opencode/ directory at all.
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, serialise(next), "utf8")
  console.log(`Enabled in ${path}\n  ${entry}`)
  console.log(`\nRestart the TUI to load it. Revert with: node scripts/disable-cli.mjs`)
}

if (isEntryPoint(import.meta.url)) {
  const flags = new Set(process.argv.slice(2))
  main({ dryRun: flags.has("--dry-run"), fileUrl: flags.has("--file-url") }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}