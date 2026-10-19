// Smoke + regression suite for the osien-tools MCP server.
// Every case here corresponds to a bug that shipped and was fixed:
// run `npm test` to prove they stay fixed.
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("path");
const fs = require("fs");
const os = require("os");

const HERE = __dirname;
const SERVER = path.join(HERE, "..", "server.js");
const MEM = path.join(HERE, "..", ".smoke-mem");
const SANDBOX = path.join(os.tmpdir(), "osien-smoke-" + process.pid);

fs.rmSync(MEM, { recursive: true, force: true });
fs.rmSync(SANDBOX, { recursive: true, force: true });
fs.mkdirSync(SANDBOX, { recursive: true });
fs.writeFileSync(path.join(SANDBOX, "notes.md"), "# notes\n- alpha line\n- beta line\n");

const transport = new StdioClientTransport({
  command: "node",
  args: [SERVER],
  env: { ...process.env, OSIEN_MEMORY_ROOT: MEM },
});
const client = new Client({ name: "smoke", version: "1.0.0" }, { capabilities: {} });

const text = (r) => (r.content || []).map((c) => c.text || "").join("\n");
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args || {} });
  if (r.isError) throw new Error(name + " returned isError: " + text(r));
  return text(r);
};

let pass = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; return; }
  fails.push(name + (detail ? "  ->  " + detail : ""));
}

(async () => {
  await client.connect(transport);
  const { tools } = await client.listTools();
  ok("tool count >= 45", tools.length >= 45, "got " + tools.length);

  // --- 1. core tools answer at all ---
  for (const [name, args] of [
    ["ctx_recall", {}],
    ["machine_state", {}],
    ["verify_chain", { cmd: 'node -e "console.log(\'ok\')"' }],
    ["city_status", {}],
  ]) {
    const r = await call(name, args);
    ok(name + " responds", r.length > 0);
  }

  // --- 2. ctx_save/ctx_recall round trip (was ReferenceError: slug is not defined) ---
  const saved = await call("ctx_save", { architecture: "ARCH_MARKER_42", decisions: "DEC_MARKER_7" });
  ok("ctx_save writes", /memory written/.test(saved), saved.slice(0, 120));
  const recalled = await call("ctx_recall", { part: "architecture" });
  ok("ctx_recall returns saved memory", recalled.includes("ARCH_MARKER_42"), recalled.slice(0, 120));
  const all = await call("ctx_recall", { role: "all" });
  ok("ctx_recall role=all merges parts", all.includes("ARCH_MARKER_42") && all.includes("DEC_MARKER_7"));
  const scout = await call("ctx_recall", { role: "scout" });
  ok("ctx_recall role=scout reads architecture only", scout.includes("ARCH_MARKER_42") && !scout.includes("DEC_MARKER_7"));
  const grepped = await call("ctx_recall", { grep: "ARCH_MARKER" });
  ok("ctx_recall grep filters", grepped.includes("ARCH_MARKER_42") && !grepped.includes("DEC_MARKER_7"));
  const badRe = await call("ctx_recall", { grep: "[" });
  ok("ctx_recall bad regex is a message, not a throw", /^bad regex:/.test(badRe), badRe.slice(0, 80));

  // --- 3. missing-file tools must not silently answer "" (cachedReadFile bug) ---
  const soul = await call("soul_read", {});
  ok("soul_read explains a missing SOUL", /NO SOUL FILE/.test(soul), JSON.stringify(soul.slice(0, 60)));
  const noState = await call("task_state", { action: "read", directory: SANDBOX });
  ok("task_state read explains missing state", /NO TASK STATE/.test(noState), JSON.stringify(noState.slice(0, 60)));
  await call("task_state", { action: "write", objective: "OBJ_MARKER", directory: SANDBOX, status: "open" });
  const state = await call("task_state", { action: "read", directory: SANDBOX });
  ok("task_state round trip", state.includes("OBJ_MARKER"));

  const ghost = await call("read_slice", { file: "no_such_file_here.md", directory: SANDBOX });
  ok("read_slice reports a missing file", /^error: cannot read/.test(ghost), ghost.slice(0, 80));
  const inverted = await call("read_slice", { file: "notes.md", start: 50, end: 5, directory: SANDBOX });
  ok("read_slice rejects start>end", /^error: empty range/.test(inverted), inverted.slice(0, 80));

  // --- 4. session_replay must fall through to notes.md ---
  const replay = await call("session_replay", { directory: SANDBOX });
  ok("session_replay falls back to notes.md", replay.includes("alpha line"), replay.slice(0, 120));

  // --- 5. path handling: absolute + non-existent paths must not lie ---
  const secAbs = await call("security_scan", { path: SERVER });
  ok("security_scan accepts an absolute file path", !/Scanned 0 files/.test(secAbs), secAbs.slice(0, 100));
  ok("security_scan does not flag its own rule table", !/server\.js:5\d\d: \["eval/.test(secAbs), secAbs.slice(0, 200));
  const grepMissing = await call("smart_grep", { pattern: "x", path: "no/such/dir", directory: SANDBOX });
  ok("smart_grep reports a missing root", /error: path not found/.test(grepMissing), grepMissing.slice(0, 80));
  const drift = await call("architecture_drift", { documented: "x", directory: "no/such/dir" });
  ok("architecture_drift does not throw ENOENT", /^err:/.test(drift), drift.slice(0, 80));

  // --- 6. batch: ctx op used to return "" because it ignored the directory ---
  const batched = await call("batch", { ops: [{ op: "ctx", role: "all" }], directory: SANDBOX });
  ok("batch ctx op honours directory", batched.includes("ARCH_MARKER_42") || batched.includes("NO MEMORY"), batched.slice(0, 150));
  const badBatch = await call("batch", { ops: [{ op: "grep", pattern: "[" }], directory: SANDBOX });
  ok("batch grep bad regex is a message", badBatch.includes("bad regex"), badBatch.slice(0, 150));

  // --- 7. checkpoint must actually be able to roll back ---
  const target = path.join(SANDBOX, "rollback.txt");
  fs.writeFileSync(target, "ORIGINAL");
  const cp = await call("checkpoint_create", { files: ["rollback.txt"], directory: SANDBOX, id: "regress" });
  ok("checkpoint_create captures content", /1 file captured/.test(cp), cp.slice(0, 120));
  fs.writeFileSync(target, "TAMPERED");
  const verified = await call("checkpoint_verify", { id: "regress", directory: SANDBOX });
  ok("checkpoint_verify detects drift", /MODIFIED/.test(verified), verified.slice(0, 150));
  const dry = await call("checkpoint_restore", { id: "regress", directory: SANDBOX });
  ok("checkpoint_restore dry-runs by default", /DRY RUN/.test(dry), dry.slice(0, 120));
  ok("checkpoint_restore dry run wrote nothing", fs.readFileSync(target, "utf8") === "TAMPERED");
  await call("checkpoint_restore", { id: "regress", directory: SANDBOX, approve: true });
  ok("checkpoint_restore rolls the file back", fs.readFileSync(target, "utf8") === "ORIGINAL", fs.readFileSync(target, "utf8"));
  const gone = await call("checkpoint_restore", { id: "nope", directory: SANDBOX });
  ok("checkpoint_restore rejects an unknown id", /no such checkpoint/.test(gone));

  // --- 8. city output must not contain mangled emoji ---
  const city = await call("city_mode", { task: "regression run" });
  ok("city_mode has no U+FFFD", !city.includes("\uFFFD"));
  ok("city_mode has no ?? emoji placeholders", !/\?\?\s+(The|City)/.test(city), city.split("\n").slice(0, 4).join(" | "));

  await client.close();
  fs.rmSync(MEM, { recursive: true, force: true });
  fs.rmSync(SANDBOX, { recursive: true, force: true });

  if (fails.length) {
    console.error("SMOKE FAIL (" + fails.length + " of " + (pass + fails.length) + "):");
    for (const f of fails) console.error("  FAIL " + f);
    process.exit(1);
  }
  console.log("SMOKE OK: " + tools.length + " tools, " + pass + " checks passed");
  process.exit(0);
})().catch((e) => {
  console.error("FATAL", e && e.message, e && e.stack);
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch {}
  process.exit(1);
});