#!/usr/bin/env node
/**
 * Runs a command with the Bun runtime this repo pins.
 *
 * `@opentui/core@0.5.17` declares `engines: { bun: ">=1.3.0", node: ">=26.4.0" }`
 * and its native FFI layer is unavailable on anything older, so the renderer
 * tests cannot run under a stock Node 24. Bun is resolved in this order:
 *
 *   1. OSIEN_BUN - an explicit path, used by CI
 *   2. .tooling/bun/**  - the verified portable build unpacked by `bun:install`
 *   3. bun on PATH
 *
 * Nothing is installed globally.
 */
import { existsSync, readdirSync, statSync } from "node:fs"
import { spawn } from "node:child_process"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

export const PACKAGE_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))

/** Finds bun.exe inside the unpacked portable build, if it is present. */
function findPortableBun(root) {
  const base = join(root, ".tooling", "bun")
  if (!existsSync(base)) return undefined
  const stack = [base]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of readdirSync(current)) {
      const full = join(current, entry)
      if (statSync(full).isDirectory()) {
        stack.push(full)
      } else if (entry === "bun.exe" || entry === "bun") {
        return full
      }
    }
  }
  return undefined
}

export function resolveBun(env = process.env) {
  const explicit = env.OSIEN_BUN
  if (explicit && existsSync(explicit)) return explicit
  const portable = findPortableBun(PACKAGE_ROOT)
  if (portable) return portable
  return undefined
}

const main = () => {
  const bun = resolveBun()
  if (!bun) {
    console.error(
      "Bun was not found.\n" +
        "  The OpenTUI renderer needs Bun >= 1.3.0 (or Node >= 26.4.0); this repo\n" +
        "  does not install a global runtime.\n\n" +
        "  Fix: run `npm run bun:install` to fetch a verified portable build into\n" +
        "  .tooling/, or set OSIEN_BUN to an existing Bun executable.",
    )
    process.exitCode = 1
    return
  }
  const child = spawn(bun, process.argv.slice(2), { stdio: "inherit", cwd: PACKAGE_ROOT })
  child.on("exit", (code, signal) => {
    process.exitCode = typeof code === "number" ? code : signal ? 1 : 0
  })
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}