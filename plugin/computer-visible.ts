import type { Plugin } from "@opencode-ai/plugin"
import { spawn, ChildProcessWithoutNullStreams } from "child_process"
import readline from "readline"
import { unwrapArgs } from "../lib/v3core"

const PY = `${process.env.HOME}/.config/opencode/.venvs/social/bin/python`
const CORE = `${process.env.HOME}/.config/opencode/social/computer_visible.py`

export default (async () => {
  let worker: ChildProcessWithoutNullStreams | null = null
  let pending: ((v: string) => void)[] = []
  function ensure() {
    if (worker) return
    worker = spawn(PY, [CORE], { stdio: ["pipe", "pipe", "pipe"] })
    readline.createInterface({ input: worker.stdout }).on("line", line => pending.shift()?.(line))
    worker.on("exit", () => { worker = null; pending.splice(0).forEach(r => r('{"ok":false,"error":"visible worker exited"}')) })
  }
  function call(op: string, args: any = {}): Promise<string> {
    ensure()
    return new Promise(resolve => { pending.push(resolve); worker!.stdin.write(JSON.stringify({ op, ...unwrapArgs(args) }) + "\n") })
  }
  const run = (op: string, args: any) => call(op, args).then(x => x.slice(0, 5000))
  return { tool: {
      computer_open: {
      description: "Open a visible browser page. Localhost is allowed; external navigation requires approve=true.",
      args: { type:"object", required:["url"], properties:{url:{type:"string"},approve:{type:"boolean"}} },
      async execute(a:any){ return run("open", a) },
    },
      computer_observe: {
      description: "Observe the active visible browser: URL, title, interactive elements, and screenshot path.",
      args:{type:"object",properties:{}},
      async execute(a:any){ return run("observe", a) },
    },
      computer_move: {
      description: "Move the visible browser cursor. Requires approve=true.",
      args:{type:"object",required:["x","y"],properties:{x:{type:"number"},y:{type:"number"},approve:{type:"boolean"}}},
      async execute(a:any){ return run("move", a) },
    },
      computer_click: {
      description: "Click a selector or coordinate in the visible browser. Requires approve=true.",
      args:{type:"object",properties:{selector:{type:"string"},x:{type:"number"},y:{type:"number"},approve:{type:"boolean"}}},
      async execute(a:any){ return run("click", a) },
    },
      computer_type: {
      description: "Type non-sensitive text into the visible browser. Requires approve=true; secrets and sensitive fields are refused.",
      args:{type:"object",required:["text"],properties:{text:{type:"string"},approve:{type:"boolean"}}},
      async execute(a:any){ return run("type", a) },
    },
      computer_key: {
      description: "Press an allowlisted browser key. Requires approve=true.",
      args:{type:"object",required:["key"],properties:{key:{type:"string"},approve:{type:"boolean"}}},
      async execute(a:any){ return run("key", a) },
    },
      computer_stop: {
      description: "Stop the visible browser session immediately.",
      args:{type:"object",properties:{}},
      async execute(){ return run("stop", {}) },
    },
      computer_run: {
      description: "Run a bounded visible-browser action plan. local_safe permits up to 12 localhost-only open/move/click/type/key steps while still refusing secrets and sensitive fields; approved_external requires explicit approval.",
      args:{type:"object",required:["actions"],properties:{mode:{type:"string",enum:["local_safe","approved_external"]},actions:{type:"array",items:{type:"object"}}}},
      async execute(a:any){ return run("run", a) },
    },
      computer_track_start: {
      description: "Start lightweight opt-in pointer tracking inside the visible browser page only. Stores coordinates/timestamps locally; never captures screenshots, keys, or page text.",
      args:{type:"object",properties:{interval_ms:{type:"number"}}},
      async execute(a:any){ return run("track_start", a) },
    },
      computer_track_status: {
      description: "Show whether visible-page pointer tracking is active and its sample count.",
      args:{type:"object",properties:{}},
      async execute(a:any){ return run("track_status", a) },
    },
      computer_track_stop: {
      description: "Stop pointer tracking and append coordinate/timestamp samples to the local training trace.",
      args:{type:"object",properties:{}},
      async execute(a:any){ return run("track_stop", a) },
    },
  }}
}) satisfies Plugin
