#!/usr/bin/env node
/**
 * Fetches a verified portable Bun into ./.tooling for the renderer tests.
 *
 * Nothing is installed globally. The binary is downloaded from the official
 * oven-sh/bun GitHub release and checked against the SHA-256 that the same
 * release publishes in SHASUMS256.txt, so authenticity is anchored to the
 * release itself rather than to this script.
 *
 * @opentui/core@0.5.17 declares `engines: { bun: ">=1.3.0", node: ">=26.4.0" }`
 * and its native FFI layer refuses to start on anything older.
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))
const TOOLING = join(ROOT, ".tooling")
const PINNED_VERSION = "1.4.3"
const RELEASE = `https://github.com/oven-sh/bun/releases/download/bun-v${PINNED_VERSION}`

const ASSET = {
  "win32-x64": "bun-windows-x64.zip",
  "darwin-arm64": "bun-darwin-aarch64.zip",
  "darwin-x64": "bun-darwin-x64.zip",
  "linux-x64": "bun-linux-x64.zip",
  "linux-arm64": "bun-linux-aarch64.zip",
}[`${process.platform}-${process.arch}`]

function findBun(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      const nested = findBun(full)
      if (nested) return nested
    } else if (entry === "bun.exe" || entry === "bun") {
      return full
    }
  }
  return undefined
}

function extract(zipPath, target) {
  const attempts = [
    ["tar", ["-xf", zipPath, "-C", target]],
    ["powershell", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${target}' -Force`]],
    ["unzip", ["-q", zipPath, "-d", target]],
  ]
  for (const [command, args] of attempts) {
    const run = spawnSync(command, args, { stdio: "ignore", shell: process.platform === "win32" && command === "powershell" })
    if (run.status === 0) return true
  }
  return false
}

const main = async () => {
  if (!ASSET) {
    console.error(`Unsupported platform: ${process.platform}-${process.arch}`)
    process.exitCode = 1
    return
  }

  mkdirSync(TOOLING, { recursive: true })
  const zipPath = join(TOOLING, ASSET)
  const target = join(TOOLING, "bun")

  console.log(`Downloading Bun v${PINNED_VERSION} (${ASSET}) from the official release...`)
  const [asset, sums] = await Promise.all([
    fetch(`${RELEASE}/${ASSET}`).then((r) => {
      if (!r.ok) throw new Error(`asset download failed: HTTP ${r.status}`)
      return r.arrayBuffer()
    }),
    fetch(`${RELEASE}/SHASUMS256.txt`).then((r) => {
      if (!r.ok) throw new Error(`SHASUMS256.txt download failed: HTTP ${r.status}`)
      return r.text()
    }),
  ])
  writeFileSync(zipPath, Buffer.from(asset))

  const expected = sums
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find(([, name]) => name === ASSET)?.[0]
  if (!expected) throw new Error(`No checksum published for ${ASSET}`)

  const actual = createHash("sha256").update(readFileSync(zipPath)).digest("hex")
  if (actual !== expected) {
    rmSync(zipPath, { force: true })
    throw new Error(`Checksum mismatch for ${ASSET}\n  expected ${expected}\n  actual   ${actual}`)
  }
  console.log(`Checksum verified against the release SHASUMS256.txt: ${actual}`)

  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  if (!extract(zipPath, target)) throw new Error(`Could not extract ${zipPath}; install unzip or tar`)
  rmSync(zipPath, { force: true })

  const binary = findBun(target)
  if (!binary) throw new Error(`No bun executable found under ${target}`)
  const version = spawnSync(binary, ["--version"], { encoding: "utf8" }).stdout?.trim()
  console.log(`Bun ready: ${binary} (v${version})`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})