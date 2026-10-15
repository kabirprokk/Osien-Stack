import type { Plugin } from "@opencode-ai/plugin"
import fs from "fs"
import path from "path"
import crypto from "crypto"
import { HARNESS_ROOT, ensure, bus, unwrapArgs } from "../lib/v3core"

// V3 PHASE D — reversible actions.
// Checkpoints are explicit, selective, and verified after restore.

const cpRoot = () => ensure(path.join(HARNESS_ROOT, "checkpoints"))

function digest(file: string) {
  try { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex") } catch { return "MISSING" }
}

function normalizeFiles(dir: string, raw: any): string[] {
  const list = Array.isArray(raw) ? raw : String(raw || "").split(";")
  return list.map((f) => String(f).trim()).filter(Boolean).map((f) => path.resolve(dir, f)).filter((f) => f === dir || f.startsWith(dir + path.sep))
}

export default (async ({ directory }: any) => {
  const DIR = directory || process.cwd()
  return {
    tool: {
      risk_classify: {
        description: "Classify an operation before execution: LOW, MEDIUM, HIGH, or CRITICAL. Critical/system/destructive operations require explicit user approval outside this tool.",
        args: { type: "object", required: ["operation"], properties: { operation: { type: "string" } } },
        async execute(args: any) {
          const a = unwrapArgs(args)
          const op = String(a?.operation || "").toLowerCase()
          const risk = /sudo|systemctl|chmod|chown|rm -rf|disk|partition|credential|secret|firewall|kernel|root/.test(op) ? "CRITICAL" : /install|uninstall|dependency|lockfile|config|migration|rename.*many|multi-file/.test(op) ? "HIGH" : /refactor|patch|edit|write|build|test/.test(op) ? "MEDIUM" : "LOW"
          return JSON.stringify({ risk, operation: a?.operation, requires_approval: risk === "CRITICAL", checkpoint: risk === "HIGH" || risk === "CRITICAL" })
        },
      },
      checkpoint_create: {
        description: "Create a selective recovery point before a risky change. Provide files explicitly; no hidden whole-system snapshot is taken.",
        args: { type: "object", required: ["files"], properties: { files: { type: "string", description: "semicolon-separated project-relative files" }, label: { type: "string" }, risk: { type: "string" } } },
        async execute(args: any) {
          const a = unwrapArgs(args)
          const files = normalizeFiles(DIR, a?.files)
          if (!files.length) return "REFUSED: no approved project files supplied"
          const id = "cp_" + Date.now().toString(36)
          const base = ensure(path.join(cpRoot(), id))
          const entries: any[] = []
          for (const file of files) {
            if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) continue
            const rel = path.relative(DIR, file)
            const target = path.join(base, rel)
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.copyFileSync(file, target)
            entries.push({ rel, hash: digest(file), size: fs.statSync(file).size })
          }
          const manifest = { id, project: DIR, label: a?.label || "checkpoint", risk: a?.risk || "MEDIUM", created: new Date().toISOString(), entries }
          fs.writeFileSync(path.join(base, "manifest.json"), JSON.stringify(manifest, null, 1))
          bus.emitEvent("CHECKPOINT_CREATED", { id, files: entries.length, risk: manifest.risk })
          return JSON.stringify(manifest, null, 1)
        },
      },
      checkpoint_verify: {
        description: "Verify a checkpoint exists and every stored file hash matches the checkpoint manifest.",
        args: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
        async execute(args: any) {
          const a = unwrapArgs(args)
          const base = path.join(cpRoot(), String(a?.id || ""))
          try {
            const m = JSON.parse(fs.readFileSync(path.join(base, "manifest.json"), "utf8"))
            const results = m.entries.map((e: any) => ({ file: e.rel, present: fs.existsSync(path.join(base, e.rel)), hash: digest(path.join(base, e.rel)) === e.hash }))
            return JSON.stringify({ id: m.id, valid: results.every((x: any) => x.present), files: results }, null, 1)
          } catch { return "INVALID: checkpoint manifest missing or unreadable" }
        },
      },
      checkpoint_restore: {
        description: "Restore a checkpoint's files, then verify restored hashes. Refuses unknown IDs and never deletes files outside the checkpoint manifest.",
        args: { type: "object", required: ["id"], properties: { id: { type: "string" }, approve: { type: "boolean", description: "required for CRITICAL checkpoints" } } },
        async execute(args: any) {
          const a = unwrapArgs(args)
          const base = path.join(cpRoot(), String(a?.id || ""))
          let m: any
          try { m = JSON.parse(fs.readFileSync(path.join(base, "manifest.json"), "utf8")) } catch { return "REFUSED: unknown checkpoint" }
          if (m.risk === "CRITICAL" && a?.approve !== true) return "REFUSED: CRITICAL restore requires approve=true after user confirmation"
          const restored: any[] = []
          for (const e of m.entries) {
            const source = path.join(base, e.rel)
            const target = path.join(DIR, e.rel)
            if (!fs.existsSync(source) || !target.startsWith(DIR + path.sep)) continue
            fs.mkdirSync(path.dirname(target), { recursive: true })
            fs.copyFileSync(source, target)
            restored.push({ file: e.rel, verified: digest(source) === digest(target) })
          }
          const ok = restored.every((x) => x.verified)
          bus.emitEvent("ROLLBACK_COMPLETED", { id: m.id, ok, files: restored.length })
          return JSON.stringify({ id: m.id, state: ok ? "ROLLBACK VERIFIED" : "ROLLBACK FAILED", files: restored }, null, 1)
        },
      },
    },
  }
}) satisfies Plugin
