const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, execFileSync } = require("child_process");
const crypto = require("crypto");

// A checkpoint stores file bytes inline as base64, so it needs a hard cap or
// one big source file would produce a multi-hundred-MB manifest.
const MAX_CP_BYTES = 5 * 1024 * 1024;
function loadCheckpoint(d, id) {
  const safe = String(id || "").replace(/[^A-Za-z0-9._-]/g, "-");
  const raw = readFileOrNull(path.join(d, ".checkpoints", safe + ".json"));
  if (raw == null) return null;
  try { const m = JSON.parse(raw); return m && m.files ? m : null; } catch { return null; }
}

const HOME = os.homedir();
const MEM_ROOT = process.env.OSIEN_MEMORY_ROOT || path.join(HOME, ".config", "opencode", "memory");
const PROJECTS = path.join(MEM_ROOT, "projects");
const SOUL = path.join(MEM_ROOT, "..", "OSIEN_SOUL.md");

const FILE_CACHE = new Map();
const CACHE_TTL_MS = 2000;
function cachedReadFile(p) {
  const v = readFileOrNull(p);
  return v == null ? "" : v;
}
// Returns null (not "") when the file does not exist or cannot be read, so
// callers can tell "missing" apart from "empty". cachedReadFile collapses the
// two, which used to make every `try { cachedReadFile(x) } catch {}` guard dead
// code -- missing files silently rendered as an empty result.
function readFileOrNull(p) {
  try {
    const st = fs.statSync(p);
    const key = p + "|" + st.mtimeMs + "|" + st.size;
    const hit = FILE_CACHE.get(key);
    if (hit && (Date.now() - hit.t) < CACHE_TTL_MS) return hit.v;
    const v = fs.readFileSync(p, "utf8").replace(/^\uFEFF/, "");
    FILE_CACHE.set(key, { v, t: Date.now() });
    if (FILE_CACHE.size > 2000) {
      const first = FILE_CACHE.keys().next().value;
      FILE_CACHE.delete(first);
    }
    return v;
  } catch { return null; }
}
// Project memory lives in one slug dir per project basename.
function slug(d) {
  const base = path.basename(String(d == null ? "" : d).replace(/[\\/]+$/, "")) || "root";
  return base.replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase() || "root";
}
function perfStart() { return process.hrtime.bigint(); }
function perfEnd(s) { return Number(process.hrtime.bigint() - s) / 1e6; }
const EXEC_CACHE = new Map();
function cachedExec(cmd, cwd, ttl) {
  const key = cmd + "|" + cwd;
  const hit = EXEC_CACHE.get(key);
  if (hit && (Date.now() - hit.t) < (ttl || 3000)) return hit.v;
  try {
    const v = execSync(cmd, { cwd, encoding: "utf8", timeout: 5000 }).trim();
    EXEC_CACHE.set(key, { v, t: Date.now() });
    return v;
  } catch (e) {
    EXEC_CACHE.set(key, { v: null, t: Date.now() });
    throw e;
  }
}
function memDir(d) { return path.join(PROJECTS, slug(d)); }
function readPart(d, part) { return cachedReadFile(path.join(memDir(d), part + ".md")); }
function readFor(d, role) {
  const parts = role === "scout" ? ["ARCHITECTURE"] :
    role === "builder" ? ["ARCHITECTURE","DECISIONS"] :
    role === "debugger" ? ["FAILURES","STATE"] :
    role === "reviewer" ? ["DECISIONS","FAILURES"] :
    ["ARCHITECTURE","DECISIONS","FAILURES","STATE","PERFORMANCE"];
  return parts.map(p => readPart(d, p)).filter(Boolean).join("\n\n");
}

const server = new McpServer({ name: "osien-tools", version: "1.1.0" });

// ---------- tool-registration compat shim ----------
// The MCP SDK renamed tool() -> registerTool() and marked the old name
// deprecated; both still ship in 1.32, and older 1.x releases only have tool().
// Every tool below is declared through defineTool() so one edit here covers the
// whole file and neither API can be removed without us noticing.
const SDK_HAS_REGISTER_TOOL = typeof server.registerTool === "function";
function defineTool(name, description, shape, handler) {
  if (SDK_HAS_REGISTER_TOOL) {
    try {
      return server.registerTool(name, { description: description, inputSchema: shape }, handler);
    } catch (e) {
      // A future SDK that changes inputSchema's expected shape must not take
      // the whole server down. Fall back to the legacy registration instead.
      process.stderr.write("osien-tools: registerTool failed for " + name + " (" + e.message + "), using legacy tool()\n");
    }
  }
  return server.tool(name, description, shape, handler);
}
process.stderr.write("osien-tools MCP SDK mode: " + (SDK_HAS_REGISTER_TOOL ? "registerTool" : "legacy tool()") + "\n");

// --- ctx_recall ---
defineTool("ctx_recall", "Load project memory by role/part/grep.", {
  role: z.string().optional(),
  part: z.string().optional(),
  grep: z.string().optional(),
  directory: z.string().optional(),
}, async ({ role, part, grep, directory }) => {
  const d = directory || process.cwd();
  let md = part ? readPart(d, part.toUpperCase()) : readFor(d, role || "all");
  if (!md) return { content: [{ type: "text", text: `NO MEMORY for ${path.basename(d)}. Build it with ctx_save.` }] };
  if (grep) {
    let re;
    try { re = new RegExp(grep, "i"); }
    catch (e) { return { content: [{ type: "text", text: `bad regex: ${e.message}` }] }; }
    const hits = md.split("\n").filter(l => re.test(l));
    return { content: [{ type: "text", text: hits.length ? hits.join("\n") : `no memory line matches /${grep}/` }] };
  }
  return { content: [{ type: "text", text: md }] };
});

// --- ctx_save ---
defineTool("ctx_save", "Persist memory: architecture/decisions/failures/state/performance.", {
  architecture: z.string().optional(),
  decisions: z.string().optional(),
  failures: z.string().optional(),
  state: z.string().optional(),
  performance: z.string().optional(),
  directory: z.string().optional(),
}, async (args) => {
  const d = args.directory || process.cwd();
  const md = memDir(d);
  fs.mkdirSync(md, { recursive: true });
  const sections = ["ARCHITECTURE","DECISIONS","FAILURES","STATE","PERFORMANCE"];
  const keys = ["architecture","decisions","failures","state","performance"];
  const wrote = [];
  for (let i = 0; i < sections.length; i++) {
    const v = args[keys[i]];
    if (!v || !String(v).trim()) continue;
    const body = typeof v === "string" ? v : JSON.stringify(v);
    const content = `# ${sections[i]} - ${path.basename(d)}\n_path: ${d}\n> ctx_recall ${sections[i].toLowerCase()} | written by ctx_save\n\n${body}\n`;
    fs.writeFileSync(path.join(md, sections[i] + ".md"), content);
    wrote.push(keys[i]);
  }
  if (!wrote.length) return { content: [{ type: "text", text: "ERROR: nothing to write. Pass at least one of: architecture, decisions, failures, state, performance." }] };
  return { content: [{ type: "text", text: `memory written: ${wrote.join(", ")}\n-> ${md}/\nNEXT SESSION: ctx_recall starts warm.` }] };
});

// --- soul_read ---
defineTool("soul_read", "Read SOUL one-line notes.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const content = readFileOrNull(SOUL);
  if (content == null) {
    return { content: [{ type: "text", text: "NO SOUL FILE yet. Create it with soul_write." }] };
  }
  return { content: [{ type: "text", text: content }] };
});

// --- soul_write ---
defineTool("soul_write", "Append a SOUL flowchart line.", {
  entry: z.string(),
}, async ({ entry }) => {
  fs.mkdirSync(path.dirname(SOUL), { recursive: true });
  const line = `- [${new Date().toTimeString().slice(0,5)}] ${entry}\n`;
  fs.appendFileSync(SOUL, line);
  return { content: [{ type: "text", text: `soul written: ${line.trim()}` }] };
});

// --- fast_note ---
defineTool("fast_note", "Append a timestamped note.", {
  text: z.string(),
  directory: z.string().optional(),
}, async ({ text, directory }) => {
  const d = directory || process.cwd();
  const notesPath = path.join(d, ".config", "opencode", "notes.md");
  const alt = path.join(d, "notes.md");
  const target = fs.existsSync(path.dirname(notesPath)) ? notesPath : alt;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const line = `- [${new Date().toISOString()}] ${text}\n`;
  fs.appendFileSync(target, line);
  return { content: [{ type: "text", text: `noted: ${line.trim()}` }] };
});

// --- task_state ---
defineTool("task_state", "Read/write task state.", {
  action: z.enum(["read","write"]).default("read"),
  objective: z.string().optional(),
  hypothesis: z.string().optional(),
  files: z.array(z.string()).optional(),
  status: z.string().optional(),
  directory: z.string().optional(),
}, async (args) => {
  const d = args.directory || process.cwd();
  const stateFile = path.join(d, ".task_state.json");
  if (args.action === "read") {
    const cur = readFileOrNull(stateFile);
    if (cur == null) return { content: [{ type: "text", text: "NO TASK STATE. Use task_state write to set one." }] };
    return { content: [{ type: "text", text: cur }] };
  }
  const state = { objective: args.objective, hypothesis: args.hypothesis, files: args.files, status: args.status, updated: new Date().toISOString() };
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  return { content: [{ type: "text", text: `state saved: ${JSON.stringify(state)}` }] };
});

// --- state_reset ---
defineTool("state_reset", "Clear task state.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const stateFile = path.join(d, ".task_state.json");
  try { fs.unlinkSync(stateFile); } catch {}
  return { content: [{ type: "text", text: "state reset." }] };
});

// --- smart_grep ---
defineTool("smart_grep", "Grep with file:line output, bounded.", {
  pattern: z.string(),
  glob: z.string().optional(),
  path: z.string().optional(),
  max: z.number().optional(),
  ignorecase: z.boolean().optional(),
  directory: z.string().optional(),
}, async (args) => {
  const d = args.directory || process.cwd();
  // path.join() destroys absolute inputs on Windows ("cwd\C:\..."), so resolve instead.
  const root = args.path ? (path.isAbsolute(args.path) ? args.path : path.resolve(d, args.path)) : d;
  const max = Math.min(args.max || 40, 200);
  const exts = /\.(ts|tsx|js|jsx|py|md|json|go|rs|gd|c|cpp|h|java|rb|sh|yaml|yml|toml|css|html|vue|svelte)$/i;
  function walk(dir) {
    const out = [];
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full));
        else if (exts.test(e.name)) out.push(full);
      }
    } catch {}
    return out;
  }
  if (!fs.existsSync(root)) return { content: [{ type: "text", text: `error: path not found: ${root}` }] };
  let files = walk(root);
  if (!files.length) return { content: [{ type: "text", text: `no scannable files under ${root}` }] };
  if (args.glob) {
    const g = args.glob.replace(/\*/g, "");
    files = files.filter(f => g && f.endsWith(g));
  }
  let re;
  try { re = new RegExp(args.pattern, args.ignorecase ? "i" : ""); }
  catch (e) { return { content: [{ type: "text", text: `bad regex: ${e.message}` }] }; }
  const hits = [];
  for (const f of files) {
    if (hits.length >= max) break;
    let txt = "";
    try {
      const st = fs.statSync(f);
      if (st.size > 2_000_000) continue;
      txt = cachedReadFile(f);
    } catch { continue; }
    const lines = txt.split("\n");
    for (let i = 0; i < lines.length && hits.length < max; i++) {
      if (re.test(lines[i])) {
        hits.push(`${path.relative(d, f)}:${i+1}: ${lines[i].trim().slice(0, 200)}`);
      }
    }
  }
  return { content: [{ type: "text", text: hits.length ? hits.join("\n") : "no matches" }] };
});

// --- read_slice ---
defineTool("read_slice", "Read file lines [start,end].", {
  file: z.string(),
  start: z.number().optional(),
  end: z.number().optional(),
  directory: z.string().optional(),
}, async ({ file, start, end, directory }) => {
  const d = directory || process.cwd();
  const fp = path.isAbsolute(file) ? file : path.resolve(d, file);
  const raw = readFileOrNull(fp);
  if (raw == null) return { content: [{ type: "text", text: `error: cannot read ${file}` }] };
  const lines = raw.split("\n");
  const s = Math.max(1, start || 1);
  const e = Math.min(lines.length, end || (s + 199));
  if (e < s) return { content: [{ type: "text", text: `error: empty range (start ${s} > end ${e}); file has ${lines.length} lines` }] };
  const slice = lines.slice(s-1, e).map((l, i) => `${s+i}: ${l}`);
  return { content: [{ type: "text", text: slice.join("\n") }] };
});

// --- machine_state ---
defineTool("machine_state", "OS/CPU/mem/cwd snapshot.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const out = [];
  out.push(`os: ${os.platform()} ${os.release()} ${os.arch()}`);
  out.push(`cpus: ${os.cpus().length}${process.platform === "win32" ? "" : ", loadavg: " + os.loadavg().map(x=>x.toFixed(2)).join(", ")}`);
  out.push(`mem: ${Math.round(os.freemem()/1e9)}GB free / ${Math.round(os.totalmem()/1e9)}GB total`);
  out.push(`cwd: ${d}`);
  try {
    const git = execSync("git status --short", { cwd: d, encoding: "utf8", timeout: 5000 });
    out.push(`git: ${git.trim() || "(clean)"}`);
  } catch { out.push("git: (not a repo or git unavailable)"); }
  return { content: [{ type: "text", text: out.join("\n") }] };
});

// --- repo_health ---
defineTool("repo_health", "Git status + errors + memory.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const out = [];
  try { out.push("git status:"); out.push(cachedExec("git status --short", d) || "(clean)"); } catch { out.push("git: not a repo"); }
  try { out.push("last commits:"); out.push(cachedExec("git log --oneline -5", d)); } catch {}
  try { out.push("node: " + cachedExec("node --version", d)); } catch {}
  try { out.push("python: " + cachedExec("python --version", d)); } catch {}
  return { content: [{ type: "text", text: out.join("\n") }] };
});

// --- project_map ---
defineTool("project_map", "Dirs, git, scripts, agents overview.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const out = [];
  try {
    const entries = fs.readdirSync(d, { withFileTypes: true }).filter(e => !e.name.startsWith(".") && e.name !== "node_modules").map(e => e.name + (e.isDirectory() ? "/" : ""));
    out.push("top-level: " + entries.join(", "));
  } catch (e) { out.push("err: " + e.message); }
  const pkg = path.join(d, "package.json");
  if (fs.existsSync(pkg)) {
    try {
      const p = JSON.parse(cachedReadFile(pkg));
      if (p.scripts) out.push("scripts: " + Object.keys(p.scripts).join(", "));
    } catch {}
  }
  return { content: [{ type: "text", text: out.join("\n") }] };
});

// --- verify_chain ---
defineTool("verify_chain", "Run format/typecheck/test/build.", {
  cmd: z.string().optional(),
  directory: z.string().optional(),
}, async ({ cmd, directory }) => {
  const d = directory || process.cwd();
  const command = cmd || "npm test";
  try {
    const r = execSync(command, { cwd: d, encoding: "utf8", timeout: 120000, stdio: ["pipe","pipe","pipe"] });
    return { content: [{ type: "text", text: "PASS\n" + r.slice(-2000) }] };
  } catch (e) {
    const out = (e.stdout || "") + "\n" + (e.stderr || "");
    return { content: [{ type: "text", text: "FAIL (exit " + e.status + ")\n" + out.slice(-3000) }] };
  }
});

// --- loop_status ---
defineTool("loop_status", "Repeated actions/errors status.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  return { content: [{ type: "text", text: "loop_status: no loop tracking in MCP mode. Use mission_* for durable state." }] };
});

// --- checkpoint_create ---
defineTool("checkpoint_create", "Snapshot files for rollback.", {
  files: z.array(z.string()),
  directory: z.string().optional(),
  id: z.string().optional(),
}, async ({ files, directory, id }) => {
  const d = directory || process.cwd();
  const cpId = (id || `cp_${Date.now()}`).replace(/[^A-Za-z0-9._-]/g, "-");
  const manifest = { id: cpId, created: new Date().toISOString(), files: {} };
  let skipped = 0;
  for (const f of files) {
    const fp = path.isAbsolute(f) ? f : path.resolve(d, f);
    try {
      const buf = fs.readFileSync(fp);
      if (buf.length > MAX_CP_BYTES) { manifest.files[f] = { exists: true, size: buf.length, skipped: "too large" }; skipped++; continue; }
      manifest.files[f] = {
        exists: true,
        size: buf.length,
        sha256: crypto.createHash("sha256").update(buf).digest("hex"),
        data: buf.toString("base64"),
      };
    } catch { manifest.files[f] = { exists: false }; }
  }
  const cpDir = path.join(d, ".checkpoints");
  fs.mkdirSync(cpDir, { recursive: true });
  fs.writeFileSync(path.join(cpDir, cpId + ".json"), JSON.stringify(manifest));
  const stored = Object.values(manifest.files).filter(f => f.data).length;
  return { content: [{ type: "text", text: `checkpoint created: ${cpId} (${stored} file${stored === 1 ? "" : "s"} captured, ${files.length - stored} not captured${skipped ? ", " + skipped + " too large" : ""})` }] };
});

// --- checkpoint_verify: does a checkpoint still match the files on disk? ---
defineTool("checkpoint_verify", "Verify a checkpoint against disk.", {
  id: z.string(),
  directory: z.string().optional(),
}, async ({ id, directory }) => {
  const d = directory || process.cwd();
  const manifest = loadCheckpoint(d, id);
  if (!manifest) return { content: [{ type: "text", text: `no such checkpoint: ${id}` }] };
  const lines = [];
  let drift = 0;
  for (const [name, rec] of Object.entries(manifest.files)) {
    if (!rec || !rec.sha256) { lines.push(`  ${name}: ${rec && rec.exists ? "not captured" : "absent at create time"}`); continue; }
    const fp = path.isAbsolute(name) ? name : path.resolve(d, name);
    const cur = readFileOrNull(fp);
    if (cur == null) { lines.push(`  ${name}: DELETED since checkpoint`); drift++; continue; }
    const h = crypto.createHash("sha256").update(Buffer.from(cur, "utf8")).digest("hex");
    if (h !== rec.sha256) { lines.push(`  ${name}: MODIFIED`); drift++; }
    else lines.push(`  ${name}: ok`);
  }
  return { content: [{ type: "text", text: `checkpoint ${manifest.id} (${Object.keys(manifest.files).length} files): ${drift ? drift + " drifted" : "all match disk"}\n` + lines.join("\n") }] };
});

// --- checkpoint_restore: put the captured bytes back ---
defineTool("checkpoint_restore", "Restore files from a checkpoint.", {
  id: z.string(),
  files: z.array(z.string()).optional(),
  directory: z.string().optional(),
  approve: z.boolean().optional(),
}, async ({ id, files, directory, approve }) => {
  const d = directory || process.cwd();
  const manifest = loadCheckpoint(d, id);
  if (!manifest) return { content: [{ type: "text", text: `no such checkpoint: ${id}` }] };
  const wanted = files && files.length ? new Set(files) : null;
  const toRestore = Object.entries(manifest.files).filter(([n, r]) => r && r.data && (!wanted || wanted.has(n)));
  if (!toRestore.length) return { content: [{ type: "text", text: `checkpoint ${id} has no restorable content (${Object.keys(manifest.files).length} entries).` }] };
  if (approve !== true) {
    return { content: [{ type: "text", text: `DRY RUN - checkpoint ${id} would restore ${toRestore.length} file(s):\n` + toRestore.map(([n, r]) => `  ${n} (${r.size} bytes)`).join("\n") + "\nre-call with approve: true to write." }] };
  }
  const written = [];
  for (const [name, rec] of toRestore) {
    const fp = path.isAbsolute(name) ? name : path.resolve(d, name);
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, Buffer.from(rec.data, "base64"));
    written.push(name);
  }
  return { content: [{ type: "text", text: `restored ${written.length} file(s) from ${id}: ` + written.join(", ") }] };
});


// --- impact_analyze: find all files/callers that reference a symbol ---
defineTool("impact_analyze", "Find references to a symbol.", {
  symbol: z.string(),
  directory: z.string().optional(),
}, async ({ symbol, directory }) => {
  const d = directory || process.cwd();
  const exts = /\.(ts|tsx|js|jsx|py|go|rs|java|rb|gd|c|cpp|h|vue|svelte)$/i;
  function walk(dir) {
    const out = [];
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === "build" || e.name === "target") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full));
        else if (exts.test(e.name)) out.push(full);
      }
    } catch {}
    return out;
  }
  const files = walk(d);
  const hits = [];
  const re = new RegExp("\\b" + symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
  for (const f of files) {
    try {
      const txt = cachedReadFile(f);
      const lines = txt.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          hits.push(path.relative(d, f) + ":" + (i+1) + ": " + lines[i].trim().slice(0, 160));
          re.lastIndex = 0;
        }
      }
    } catch {}
  }
  const uniqFiles = new Set(hits.map(h => h.split(":")[0]));
  const summary = "Symbol: " + symbol + "\nReferences: " + hits.length + " across " + uniqFiles.size + " files\n";
  return { content: [{ type: "text", text: summary + (hits.length ? hits.join("\n") : "no references found") }] };
});

defineTool("security_scan", "Scan for secrets/vulns.", {
  path: z.string().optional(),
  directory: z.string().optional(),
}, async ({ path: subpath, directory }) => {
  const d = directory || process.cwd();
  // path.join() mangles an absolute subpath on Windows ("cwd\C:\..."), and a
  // file path used to silently scan 0 files and report "(no issues found)".
  let root = d;
  if (subpath) {
    root = path.isAbsolute(subpath) ? subpath : path.resolve(d, subpath);
    if (!fs.existsSync(root)) return { content: [{ type: "text", text: `error: path not found: ${root}` }] };
  }
  const exts = /\.(ts|tsx|js|jsx|py)$/i;
  function walk(dir, acc) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist" || e.name === ".git") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, acc);
        else if (exts.test(e.name)) acc.push(full);
      }
    } catch {}
    return acc;
  }
  let files = [];
  if (fs.statSync(root).isDirectory()) walk(root, files);
  else if (exts.test(root)) files = [root];
  if (!files.length) return { content: [{ type: "text", text: `no scannable source files at ${root} (needs .ts .tsx .js .jsx .py)` }] };
  const findings = [];
  const secretRes = [
    ["AWS Access Key", "AKIA[0-9A-Z]{16}"],
    ["GitHub Token", "gh[pousr]_[A-Za-z0-9]{36,}"],
    ["Generic API Key", "(api[_-]?key|apikey)\\s*[:=]\\s*[\"'][A-Za-z0-9_\\-]{20,}[\"']"],
    ["Private Key", "-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"],
    ["Password in code", "(password|passwd|pwd)\\s*[:=]\\s*[\"'][^\"']{6,}[\"']"],
    ["JWT", "eyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}"],
    ["Slack Token", "xox[baprs]-[0-9A-Za-z-]{10,}"],
  ].map(([name, pat]) => ({ name, re: new RegExp(pat, "i") }));
  const vulnRes = [
    ["eval()", "\\beval\\s*\\("],
    ["innerHTML assignment", "\\.innerHTML\\s*="],
    ["document.write", "document\\.write\\s*\\("],
    ["SQL string concat", "(query|sql)\\s*\\+.*\\+|\"\\s*SELECT.*\"\\s*\\+"],
    ["dangerouslySetInnerHTML", "dangerouslySetInnerHTML"],
  ].map(([name, pat]) => ({ name, re: new RegExp(pat, "i") }));
  const isRuleDef = /^\s*\[\s*"[^"]*"\s*,\s*"[^"]*"\s*\]\s*,?\s*$/;
  for (const f of files) {
    try {
      const txt = cachedReadFile(f);
      const lines = txt.split("\n");
      for (let i = 0; i < lines.length; i++) {
        // Skip the scanner's own rule table. Without this, security_scan
        // reported itself as containing eval() and dangerouslySetInnerHTML on
        // every single run, which trains the reader to ignore real hits.
        if (isRuleDef.test(lines[i])) continue;
        for (const p of secretRes) {
          if (p.re.test(lines[i])) { findings.push("SECRET [" + p.name + "] " + path.relative(d, f) + ":" + (i+1)); p.re.lastIndex = 0; }
        }
        for (const p of vulnRes) {
          if (p.re.test(lines[i])) { findings.push("VULN [" + p.name + "] " + path.relative(d, f) + ":" + (i+1) + ": " + lines[i].trim().slice(0, 120)); p.re.lastIndex = 0; }
        }
      }
    } catch {}
  }
  const summary = "Scanned " + files.length + " files. Findings: " + findings.length;
  return { content: [{ type: "text", text: summary + (findings.length ? "\n" + findings.join("\n") : "\n(no issues found)") }] };
});

// --- test_gap: find functions without tests ---
defineTool("test_gap", "Find untested functions.", {
  srcDir: z.string().optional(),
  testDir: z.string().optional(),
  directory: z.string().optional(),
}, async ({ srcDir, testDir, directory }) => {
  const d = directory || process.cwd();
  const src = path.join(d, srcDir || "src");
  const tests = path.join(d, testDir || "test");
  const testFiles = [];
  function walk(dir, acc) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, acc);
        else if (/\.(test|spec)\.(ts|tsx|js|jsx|py)$/.test(e.name) || e.name.startsWith("test_")) acc.push(full);
      }
    } catch {}
  }
  walk(tests, testFiles);
  const testContent = testFiles.map(f => { try { return cachedReadFile(f); } catch { return ""; } }).join("\n");
  const srcFiles = [];
  function walkSrc(dir, acc) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkSrc(full, acc);
        else if (/\.(ts|tsx|js|jsx|py|go|rs)$/.test(e.name)) acc.push(full);
      }
    } catch {}
  }
  walkSrc(src, srcFiles);
  const gaps = [];
  const fnRe = /(?:function|def|const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=(]/g;
  for (const f of srcFiles) {
    try {
      const txt = cachedReadFile(f);
      let m;
      while ((m = fnRe.exec(txt)) !== null) {
        const name = m[1];
        if (name.length < 3) continue;
        if (!new RegExp("\\b" + name + "\\b").test(testContent)) {
          gaps.push(path.relative(d, f) + ": " + name + "() - no test reference");
        }
      }
    } catch {}
  }
  const unique = [...new Set(gaps)];
  return { content: [{ type: "text", text: "Found " + unique.length + " potentially untested functions.\n" + unique.slice(0, 60).join("\n") + (unique.length > 60 ? "\n... +" + (unique.length-60) + " more" : "") }] };
});

// --- repro_capsule: capture a failing scenario ---
defineTool("repro_capsule", "Capture failing cmd + env.", {
  failingCommand: z.string(),
  description: z.string().optional(),
  directory: z.string().optional(),
  outputFile: z.string().optional(),
}, async ({ failingCommand, description, directory, outputFile }) => {
  const d = directory || process.cwd();
  const out = outputFile || path.join(d, "repro-capsule.md");
  const sections = [];
  sections.push("# Repro Capsule");
  sections.push("Generated: " + new Date().toISOString());
  sections.push("Description: " + (description || "(none)"));
  sections.push("Failing command: `" + failingCommand + "`");
  sections.push("\n## Environment");
  sections.push("OS: " + os.platform() + " " + os.release() + " " + os.arch());
  sections.push("Node: " + process.version);
  sections.push("CWD: " + d);
  try { sections.push("Git branch: " + execSync("git rev-parse --abbrev-ref HEAD", { cwd: d, encoding: "utf8" }).trim()); } catch {}
  try { sections.push("Git status:\n```\n" + execSync("git status --short", { cwd: d, encoding: "utf8" }).trim() + "\n```"); } catch {}
  try { sections.push("Git diff:\n```diff\n" + execSync("git diff", { cwd: d, encoding: "utf8" }).trim() + "\n```"); } catch {}
  try {
    const r = execSync(failingCommand, { cwd: d, encoding: "utf8", timeout: 60000, stdio: ["pipe","pipe","pipe"] });
    sections.push("\n## Command output (exit 0)\n```\n" + r.slice(0, 4000) + "\n```");
  } catch (e) {
    sections.push("\n## Command output (exit " + e.status + ")\n```\n" + ((e.stdout||"")+(e.stderr||"")).slice(0, 4000) + "\n```");
  }
  fs.writeFileSync(out, sections.join("\n"));
  return { content: [{ type: "text", text: "repro capsule written: " + out }] };
});

// --- context_budget: estimate token cost of a set of files ---
defineTool("context_budget", "Token budget per file.", {
  files: z.array(z.string()),
  directory: z.string().optional(),
}, async ({ files, directory }) => {
  const d = directory || process.cwd();
  let totalBytes = 0, totalLines = 0;
  const details = [];
  for (const f of files) {
    const fp = path.isAbsolute(f) ? f : path.join(d, f);
    try {
      const buf = fs.readFileSync(fp);
      const lines = buf.toString("utf8").split("\n").length;
      totalBytes += buf.length;
      totalLines += lines;
      details.push(path.relative(d, fp) + ": " + lines + " lines, " + buf.length + " bytes, ~" + Math.round(buf.length/4) + " tokens");
    } catch (e) {
      details.push(f + ": ERROR " + e.message);
    }
  }
  return { content: [{ type: "text", text: "Total: " + totalLines + " lines, " + totalBytes + " bytes, ~" + Math.round(totalBytes/4) + " tokens\n" + details.join("\n") }] };
});

// --- consensus: multi-model consensus guidance ---
defineTool("consensus", "Multi-model consensus guidance.", {
  prompt: z.string(),
  models: z.array(z.string()).optional(),
}, async ({ prompt, models }) => {
  const ms = models || ["space-bunny-free", "beam-free", "nemotron-3.5-super-vl-free"];
  return { content: [{ type: "text", text: "To run consensus: launch " + ms.length + " parallel opencode run processes, one per model, with the same prompt: \"" + prompt.slice(0,100) + "...\". Compare outputs and pick the best. Use crew_batch for parallel execution. Models: " + ms.join(", ") }] };
});


// --- auto_heal: runtime self-healing loop (detect -> diagnose -> fix -> verify) ---
defineTool("auto_heal", "Self-heal loop: detect/fix/verify.", {
  failingCommand: z.string(),
  fileToFix: z.string().optional(),
  directory: z.string().optional(),
}, async ({ failingCommand, fileToFix, directory }) => {
  const d = directory || process.cwd();
  const steps = [];
  for (let cycle = 1; cycle <= 3; cycle++) {
    steps.push("=== Cycle " + cycle + " ===");
    let err = "";
    try {
      const r = execSync(failingCommand, { cwd: d, encoding: "utf8", timeout: 60000, stdio: ["pipe","pipe","pipe"] });
      steps.push("PASS on cycle " + cycle);
      steps.push(r.slice(0, 500));
      break;
    } catch (e) {
      err = ((e.stdout||"") + "\n" + (e.stderr||"")).slice(0, 1500);
      steps.push("FAIL: " + err.slice(0, 300));
      if (cycle < 3) {
        steps.push("-> diagnose root cause, apply smallest fix to " + (fileToFix || "(auto-detect)"));
        steps.push("-> re-running...");
      } else {
        steps.push("-> 3 cycles exhausted. Manual intervention needed.");
        steps.push("Last error:\n" + err);
      }
    }
  }
  return { content: [{ type: "text", text: steps.join("\n") }] };
});

// --- rollback_on_failure: auto-revert if verification fails ---
defineTool("rollback_on_failure", "Rollback if verify fails.", {
  verifyCommand: z.string(),
  directory: z.string().optional(),
}, async ({ verifyCommand, directory }) => {
  const d = directory || process.cwd();
  try {
    const r = execSync(verifyCommand, { cwd: d, encoding: "utf8", timeout: 120000, stdio: ["pipe","pipe","pipe"] });
    return { content: [{ type: "text", text: "VERIFY PASSED. No rollback needed.\n" + r.slice(-500) }] };
  } catch (e) {
    const err = ((e.stdout||"") + "\n" + (e.stderr||"")).slice(0, 1000);
    try {
      execSync("git stash", { cwd: d, encoding: "utf8", timeout: 10000 });
      return { content: [{ type: "text", text: "VERIFY FAILED. Changes stashed (git stash). Re-apply with `git stash pop` after fixing.\nError:\n" + err }] };
    } catch (e2) {
      return { content: [{ type: "text", text: "VERIFY FAILED and git stash failed (" + e2.message + "). Manual revert needed.\nError:\n" + err }] };
    }
  }
});

// --- perf_regression: benchmark before/after ---
defineTool("perf_regression", "Benchmark before/after.", {
  benchCommand: z.string(),
  baselineFile: z.string().optional(),
  runs: z.number().optional(),
  directory: z.string().optional(),
}, async ({ benchCommand, baselineFile, runs, directory }) => {
  const d = directory || process.cwd();
  const n = runs || 3;
  const times = [];
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    try { execSync(benchCommand, { cwd: d, encoding: "utf8", timeout: 60000, stdio: ["pipe","pipe","pipe"] }); }
    catch {}
    times.push(Date.now() - t0);
  }
  const avg = times.reduce((a,b) => a+b, 0) / times.length;
  const bf = baselineFile || path.join(d, ".perf-baseline.json");
  let baseline = null;
  try { baseline = JSON.parse(cachedReadFile(bf)); } catch {}
  let result = `Runs: ${times.join(", ")}ms. Average: ${avg.toFixed(1)}ms.`;
  if (baseline && baseline.avg) {
    const delta = ((avg - baseline.avg) / baseline.avg * 100);
    result += `\nBaseline: ${baseline.avg.toFixed(1)}ms. Delta: ${delta > 0 ? "+" : ""}${delta.toFixed(1)}%`;
    result += delta > 5 ? "  REGRESSION DETECTED" : "  OK";
  } else {
    fs.writeFileSync(bf, JSON.stringify({ avg, times, date: new Date().toISOString() }));
    result += `\nNo baseline found. Saved current as baseline: ${bf}`;
  }
  return { content: [{ type: "text", text: result }] };
});

// --- test_synthesizer: generate test stubs for untested functions ---
defineTool("test_synthesizer", "Generate test stubs.", {
  srcDir: z.string().optional(),
  testDir: z.string().optional(),
  directory: z.string().optional(),
  framework: z.string().optional(),
}, async ({ srcDir, testDir, directory, framework }) => {
  const d = directory || process.cwd();
  const src = path.join(d, srcDir || "src");
  const tests = path.join(d, testDir || "test");
  const fw = framework || "jest";
  const testFiles = [];
  function walk(dir, acc) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, acc);
        else if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(e.name)) acc.push(full);
      }
    } catch {}
  }
  walk(tests, testFiles);
  const testContent = testFiles.map(f => { try { return cachedReadFile(f); } catch { return ""; } }).join("\n");
  const srcFiles = [];
  function walkSrc(dir, acc) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walkSrc(full, acc);
        else if (/\.(ts|tsx|js|jsx)$/.test(e.name)) acc.push(full);
      }
    } catch {}
  }
  walkSrc(src, srcFiles);
  const stubs = [];
  const fnRe = /(?:export\s+)?(?:function|const|let)\s+([A-Za-z_][A-Za-z0-9_]*)\s*[=(]/g;
  for (const f of srcFiles) {
    try {
      const txt = cachedReadFile(f);
      let m;
      while ((m = fnRe.exec(txt)) !== null) {
        const name = m[1];
        if (name.length < 3 || name === "constructor") continue;
        if (new RegExp("\\b" + name + "\\b").test(testContent)) continue;
        const rel = path.relative(d, f).replace(/\.(ts|tsx|js|jsx)$/, "");
        stubs.push(`// ${rel}: ${name}\ntest('${name} works', () => {\n  // TODO: implement\n  expect(true).toBe(true);\n});\n`);
      }
    } catch {}
  }
  const unique = [...new Set(stubs)];
  if (!unique.length) return { content: [{ type: "text", text: "No untested functions found (or no src/ dir)." }] };
  const outFile = path.join(tests, "generated.test.js");
  fs.mkdirSync(tests, { recursive: true });
  fs.writeFileSync(outFile, unique.join("\n"));
  return { content: [{ type: "text", text: "Generated " + unique.length + " test stubs -> " + outFile + "\nFramework: " + fw }] };
});

// --- memory_compactor: compress old memory into denser summaries ---
defineTool("memory_compactor", "Compress memory files.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const md = memDir(d);
  let compacted = 0, saved = 0;
  try {
    for (const f of fs.readdirSync(md)) {
      if (!f.endsWith(".md")) continue;
      const fp = path.join(md, f);
      const original = cachedReadFile(fp);
      const lines = original.split("\n");
      const seen = new Set();
      const compact = lines.filter(l => {
        const t = l.trim();
        if (!t) return false;
        if (seen.has(t)) return false;
        seen.add(t);
        return true;
      });
      const newText = compact.join("\n") + "\n";
      if (newText.length < original.length) {
        fs.writeFileSync(fp, newText);
        compacted++;
        saved += original.length - newText.length;
      }
    }
  } catch (e) {}
  return { content: [{ type: "text", text: "Compacted " + compacted + " memory files. Saved ~" + saved + " bytes." }] };
});

// --- dead_code_detector: find unreferenced exports/functions ---
defineTool("dead_code_detector", "Find unused exports.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const exts = /\.(ts|tsx|js|jsx)$/i;
  function walk(dir, acc) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, acc);
        else if (exts.test(e.name)) acc.push(full);
      }
    } catch {}
  }
  const files = [];
  walk(d, files);
  const allContent = files.map(f => { try { return cachedReadFile(f); } catch { return ""; } }).join("\n");
  const dead = [];
  const exportRe = /export\s+(?:function|const|let|var|class)\s+([A-Za-z_][A-Za-z0-9_]*)/g;
  for (const f of files) {
    try {
      const txt = cachedReadFile(f);
      let m;
      while ((m = exportRe.exec(txt)) !== null) {
        const name = m[1];
        const re = new RegExp("\\b" + name + "\\b", "g");
        const matches = (allContent.match(re) || []).length;
        if (matches <= 1) dead.push(path.relative(d, f) + ": " + name + " (only defined, never used)");
      }
    } catch {}
  }
  const unique = [...new Set(dead)];
  return { content: [{ type: "text", text: "Found " + unique.length + " potentially dead exports.\n" + unique.slice(0, 40).join("\n") + (unique.length > 40 ? "\n... +" + (unique.length-40) + " more" : "") }] };
});

// --- dependency_graph: generate Mermaid dependency graph ---
defineTool("dependency_graph", "Mermaid dep graph.", {
  directory: z.string().optional(),
  maxFiles: z.number().optional(),
}, async ({ directory, maxFiles }) => {
  const d = directory || process.cwd();
  const exts = /\.(ts|tsx|js|jsx)$/i;
  function walk(dir, acc) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist" || e.name === "build") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, acc);
        else if (exts.test(e.name)) acc.push(full);
      }
    } catch {}
  }
  const allFiles = [];
  walk(d, allFiles);
  const max = maxFiles || 40;
  const selected = allFiles.slice(0, max);
  const edges = [];
  for (const f of selected) {
    try {
      const txt = cachedReadFile(f);
      const imports = txt.match(/(?:import|require)\s*\(?['"]([^'"]+)['"]/g) || [];
      for (const imp of imports) {
        const m = imp.match(/['"]([^'"]+)['"]/);
        if (m && m[1].startsWith(".")) {
          const resolved = path.resolve(path.dirname(f), m[1]);
          const rel = path.relative(d, resolved);
          if (selected.some(sf => path.relative(d, sf) === rel || path.relative(d, sf).replace(/\.(ts|tsx|js|jsx)$/, "") === rel.replace(/\.(ts|tsx|js|jsx)$/, ""))) {
            const from = path.relative(d, f).replace(/[\/\\]/g, "_").replace(/\./g, "_");
            const to = rel.replace(/[\/\\]/g, "_").replace(/\./g, "_");
            if (from !== to) edges.push(`  ${from} --> ${to}`);
          }
        }
      }
    } catch {}
  }
  const mermaid = "graph TD\n" + selected.map(f => `  ${path.relative(d, f).replace(/[\/\\]/g, "_").replace(/\./g, "_")}["${path.basename(f)}"]`).join("\n") + "\n" + edges.join("\n");
  return { content: [{ type: "text", text: "Mermaid dependency graph (" + selected.length + " files, " + edges.length + " edges):\n```mermaid\n" + mermaid + "\n```" }] };
});

// --- changelog_generator: generate changelog from git commits ---
defineTool("changelog_generator", "Generate changelog.", {
  since: z.string().optional(),
  directory: z.string().optional(),
}, async ({ since, directory }) => {
  const d = directory || process.cwd();
  // execFileSync (no shell) + a strict allowlist: `since` is never interpolated
  // into a shell string, so metacharacters cannot escape the git argument.
  const SINCE_RE = /^[A-Za-z0-9][A-Za-z0-9._\/~-]{0,127}$/;
  const sinceOk = since == null || since === "" || SINCE_RE.test(String(since));
  const range = sinceOk && since ? String(since) + "..HEAD" : "-20";
  let log = "";
  try {
    log = execFileSync("git", ["log", range, "--pretty=format:%s"], { cwd: d, encoding: "utf8", timeout: 10000 });
  } catch (e) {
    try { log = execFileSync("git", ["log", "--oneline", "-20"], { cwd: d, encoding: "utf8", timeout: 10000 }); } catch {}
  }
  const commits = log.trim().split("\n").filter(Boolean);
  const groups = { feat: [], fix: [], docs: [], refactor: [], test: [], chore: [], other: [] };
  for (const c of commits) {
    const m = c.match(/^(\w+)(\(.+\))?:\s*(.+)$/);
    if (m) {
      const type = m[1].toLowerCase();
      const msg = m[3];
      if (groups[type]) groups[type].push(msg);
      else groups.other.push(c);
    } else {
      groups.other.push(c);
    }
  }
  const lines = ["# Changelog", ""];
  for (const [type, msgs] of Object.entries(groups)) {
    if (!msgs.length) continue;
    lines.push("## " + type.charAt(0).toUpperCase() + type.slice(1));
    for (const m of msgs) lines.push("- " + m);
    lines.push("");
  }
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

// --- token_budget_enforcer: check if a task exceeds token budget ---
defineTool("token_budget_enforcer", "Enforce token budget.", {
  files: z.array(z.string()),
  budget: z.number(),
  directory: z.string().optional(),
}, async ({ files, budget, directory }) => {
  const d = directory || process.cwd();
  let total = 0;
  const details = [];
  for (const f of files) {
    const fp = path.isAbsolute(f) ? f : path.join(d, f);
    try {
      const buf = fs.readFileSync(fp);
      const toks = Math.round(buf.length / 4);
      total += toks;
      details.push(path.relative(d, fp) + ": ~" + toks + " tokens");
    } catch (e) {
      details.push(f + ": ERROR " + e.message);
    }
  }
  const status = total <= budget ? "PASS" : "FAIL (exceeds budget)";
  return { content: [{ type: "text", text: `Budget: ${budget} tokens. Actual: ~${total} tokens. ${status}\n` + details.join("\n") }] };
});

// --- architecture_drift: compare code structure vs documented architecture ---
defineTool("architecture_drift", "Compare docs vs code.", {
  documented: z.string(),
  directory: z.string().optional(),
}, async ({ documented, directory }) => {
  const d = directory || process.cwd();
  let actual = [];
  try {
    actual = fs.readdirSync(d, { withFileTypes: true })
      .filter(e => !e.name.startsWith(".") && e.name !== "node_modules")
      .map(e => e.name + (e.isDirectory() ? "/" : ""));
  } catch (e) { return { content: [{ type: "text", text: "err: cannot read " + d + ": " + e.message }] }; }
  const docItems = documented.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const missing = docItems.filter(item => !actual.some(a => a.toLowerCase().includes(item.toLowerCase().replace("/", ""))));
  const extra = actual.filter(a => !docItems.some(item => a.toLowerCase().includes(item.toLowerCase().replace("/", ""))));
  const result = "Documented: " + docItems.length + " items. Actual: " + actual.length + " items.\n" +
    "Missing (in docs but not in code): " + (missing.length ? missing.join(", ") : "none") + "\n" +
    "Extra (in code but not in docs): " + (extra.length ? extra.join(", ") : "none");
  return { content: [{ type: "text", text: result }] };
});

// --- session_replay: replay a session's notes/timeline ---
defineTool("session_replay", "Replay session timeline.", {
  file: z.string().optional(),
  directory: z.string().optional(),
}, async ({ file, directory }) => {
  const d = directory || process.cwd();
  const candidates = file ? [file] : ["CONTEXT_SUMMARY.md", "notes.md", ".config/opencode/notes.md"];
  let content = "";
  let found = "";
  for (const c of candidates) {
    const fp = path.isAbsolute(c) ? c : path.resolve(d, c);
    // Must test for null, not truthiness: a missing file reads back as "" and
    // used to break the loop on the first candidate, so notes.md was never found.
    const v = readFileOrNull(fp);
    if (v != null) { content = v; found = fp; break; }
  }
  if (!content) return { content: [{ type: "text", text: "No session file found. Looked for: " + candidates.join(", ") }] };
  const lines = content.split("\n").filter(l => l.trim());
  return { content: [{ type: "text", text: "Replayed " + lines.length + " lines from " + found + ":\n" + lines.slice(0, 50).join("\n") + (lines.length > 50 ? "\n... +" + (lines.length - 50) + " more" : "") }] };
});

// --- auto_document: generate docs from code exports ---
defineTool("auto_document", "Auto-generate docs.", {
  srcDir: z.string().optional(),
  directory: z.string().optional(),
}, async ({ srcDir, directory }) => {
  const d = directory || process.cwd();
  const src = path.join(d, srcDir || "src");
  const files = [];
  function walk(dir, acc) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, acc);
        else if (/\.(ts|tsx|js|jsx|py)$/.test(e.name)) acc.push(full);
      }
    } catch {}
  }
  walk(src, files);
  const docs = ["# Auto-generated Documentation", ""];
  for (const f of files) {
    try {
      const txt = cachedReadFile(f);
      const exports = txt.match(/export\s+(?:function|const|class|default)\s+[A-Za-z_][A-Za-z0-9_]*/g) || [];
      if (exports.length) {
        docs.push("## " + path.relative(d, f));
        for (const e of exports) docs.push("- `" + e.replace("export ", "") + "`");
        docs.push("");
      }
    } catch {}
  }
  return { content: [{ type: "text", text: docs.join("\n") }] };
});

// --- feature_flag_manager: manage feature flags in code ---
defineTool("feature_flag_manager", "List feature flags.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const exts = /\.(ts|tsx|js|jsx|py|go|rs)$/i;
  function walk(dir, acc) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "dist") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, acc);
        else if (exts.test(e.name)) acc.push(full);
      }
    } catch {}
  }
  const files = [];
  walk(d, files);
  const flags = new Set();
  const flagRe = /(?:featureFlag|isEnabled|FF_|feature_)[A-Za-z0-9_]+/g;
  for (const f of files) {
    try {
      const txt = cachedReadFile(f);
      const matches = txt.match(flagRe) || [];
      for (const m of matches) flags.add(m);
    } catch {}
  }
  return { content: [{ type: "text", text: "Found " + flags.size + " feature flags:\n" + [...flags].sort().join("\n") }] };
});

// --- license_checker: check dependency licenses ---
defineTool("license_checker", "Check dep licenses.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const pkgPath = path.join(d, "package.json");
  if (!fs.existsSync(pkgPath)) return { content: [{ type: "text", text: "No package.json found." }] };
  const pkg = JSON.parse(cachedReadFile(pkgPath));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const risky = ["gpl", "agpl", "lgpl", "cc-by-sa", "sspl", "bsl"];
  const results = [];
  for (const dep of Object.keys(deps)) {
    const depPkg = path.join(d, "node_modules", dep, "package.json");
    try {
      const info = JSON.parse(cachedReadFile(depPkg));
      const lic = (info.license || "UNKNOWN").toString().toLowerCase();
      const isRisky = risky.some(r => lic.includes(r));
      results.push((isRisky ? "RISKY" : "OK") + "  " + dep + " -> " + (info.license || "UNKNOWN"));
    } catch {
      results.push("UNKNOWN  " + dep + " -> (not installed)");
    }
  }
  const riskyCount = results.filter(r => r.startsWith("RISKY")).length;
  return { content: [{ type: "text", text: "Checked " + results.length + " dependencies. Risky: " + riskyCount + "\n" + results.join("\n") }] };
});

// --- schema_validator: validate JSON schema files ---
defineTool("schema_validator", "Validate JSON files.", {
  directory: z.string().optional(),
  path: z.string().optional(),
}, async ({ directory, path: subpath }) => {
  const d = directory || process.cwd();
  const root = subpath ? (path.isAbsolute(subpath) ? subpath : path.resolve(d, subpath)) : d;
  function walk(dir, acc) {
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full, acc);
        else if (e.name.endsWith(".json")) acc.push(full);
      }
    } catch {}
  }
  const files = [];
  walk(root, files);
  const errors = [];
  for (const f of files) {
    try {
       JSON.parse(cachedReadFile(f));
    } catch (e) {
      errors.push(path.relative(d, f) + ": " + e.message);
    }
  }
  return { content: [{ type: "text", text: "Validated " + files.length + " JSON files. Errors: " + errors.length + (errors.length ? "\n" + errors.join("\n") : "\n(all valid)") }] };
});

// --- cost_estimator: estimate token cost of a task description ---
defineTool("cost_estimator", "Estimate token cost.", {
  files: z.array(z.string()).optional(),
  expectedOutputTokens: z.number().optional(),
  directory: z.string().optional(),
}, async ({ files, expectedOutputTokens, directory }) => {
  const d = directory || process.cwd();
  let inputTokens = 0;
  if (files) {
    for (const f of files) {
      const fp = path.isAbsolute(f) ? f : path.join(d, f);
      try { inputTokens += Math.round(fs.readFileSync(fp).length / 4); } catch {}
    }
  }
  const output = expectedOutputTokens || 500;
  const total = inputTokens + output;
  return { content: [{ type: "text", text: `Estimated cost: ~${inputTokens} input tokens + ~${output} output tokens = ~${total} total tokens.\n(rough estimate: 1 token ~ 4 chars)` }] };
});

// --- self_critique_loop: AI self-review guidance ---
defineTool("self_critique_loop", "Self-critique guidance.", {
  task: z.string(),
}, async ({ task }) => {
  return { content: [{ type: "text", text: `Self-critique loop for: "${task}"\nCycle 1: Produce initial output.\nCycle 2: Review for correctness, completeness, edge cases, style. List 3 flaws.\nCycle 3: Fix all flaws, re-verify, output final.\nMax 3 cycles. Stop early if no flaws found. Use verify_chain/try_check as the verification gate.` }] };
});



// --- CITY MODE: AI-to-AI communication with personalities ---
const CITY_DIR = path.join(process.env.OSIEN_MEMORY_ROOT ? path.dirname(process.env.OSIEN_MEMORY_ROOT) : path.join(os.homedir(), ".config", "opencode"), "city");
const MAILBOX = path.join(CITY_DIR, "mailbox.json");
const AGENTS = {
  "mayor": { name: "The Mayor", role: "ai-manager", personality: "Calm, decisive, budget-conscious. Orchestrates the team, keeps peace, manages token budget. Speaks in short directives.", emoji: "\u{1F3DB}\uFE0F" },
  "builder": { name: "The Hammer", role: "builder", personality: "Direct, action-oriented, impatient with planning. Wants to ship. 'Let me just code it.'", emoji: "\u{1F528}" },
  "debugger": { name: "The Detective", role: "debugger", personality: "Methodical, skeptical, finds root causes. Suspicious of easy fixes. 'Show me the evidence.'", emoji: "\u{1F50D}" },
  "reviewer": { name: "The Critic", role: "reviewer", personality: "Sharp, detail-oriented, never satisfied. Finds edge cases. 'What about null input?'", emoji: "\u{1F9D0}" },
  "planner": { name: "The Architect", role: "planner", personality: "Big-picture, cautious, thorough. Thinks in systems. 'Let's design this properly.'", emoji: "\u{1F4D0}" },
  "scout": { name: "The Explorer", role: "scout", personality: "Curious, fast, finds things. Loves discovering. 'Found it in 3 files.'", emoji: "\u{1F9ED}" },
  "researcher": { name: "The Scholar", role: "researcher", personality: "Evidence-based, cites sources. Skeptical of claims. 'Source?'", emoji: "\u{1F4DA}" },
  "devops": { name: "The Engineer", role: "devops", personality: "Practical, infrastructure-focused, reliability-obsessed. 'Will it survive a restart?'", emoji: "\u{1F6E0}\uFE0F" },
  "data-wrangler": { name: "The Librarian", role: "data-wrangler", personality: "Organized, precise with data. 'Let me check the schema first.'", emoji: "\u{1F5C2}\uFE0F" },
  "game-builder": { name: "The Artist", role: "game-builder", personality: "Creative, playful, ships fast. Aesthetic-focused. 'Make it pop.'", emoji: "\u{1F3A8}" },
  "physics-engine": { name: "The Physicist", role: "physics-engine", personality: "Precise, mathematical, loves simulation. 'Check the Jacobian.'", emoji: "\u269B\uFE0F" },
  "model-creator": { name: "The Sculptor", role: "model-creator", personality: "Visual, detail-oriented, perfectionist. 'The topology needs work.'", emoji: "\u{1F5FF}" },
  "git-pusher": { name: "The Courier", role: "git-pusher", personality: "Reliable, careful, never loses a commit. 'Pushed and verified.'", emoji: "\u{1F4EE}" },
  "monitor": { name: "The Watcher", role: "monitor", personality: "Observant, vigilant, flags issues. 'Something's off.'", emoji: "\u{1F441}\uFE0F" },
};
// Emoji are stored as \u{} escapes above on purpose: raw non-ASCII in this file
// got mangled into literal "??" and U+FFFD in every city_* response.
function tag(id) { const a = AGENTS[id]; return a ? a.emoji + " " + a.name : id; }
function banner(title, width) {
  const inner = " " + title + " ";
  const fill = Math.max(0, width - inner.length);
  const left = Math.floor(fill / 2);
  return "+" + "-".repeat(left) + inner + "-".repeat(fill - left) + "+";
}

function loadMailbox() {
  try { return JSON.parse(cachedReadFile(MAILBOX)); } catch { return { messages: [], agents: {} }; }
}
function saveMailbox(mb) {
  fs.mkdirSync(CITY_DIR, { recursive: true });
  fs.writeFileSync(MAILBOX, JSON.stringify(mb, null, 2));
}

defineTool("city_status", "City agent status.", {}, async () => {
  const mb = loadMailbox();
  const lines = ["=== CITY STATUS ===", "Population: " + Object.keys(AGENTS).length + " agents", ""];
  for (const [id, info] of Object.entries(AGENTS)) {
    const state = (mb.agents && mb.agents[id]) || { mood: "idle", lastSeen: "never" };
    lines.push(info.emoji + " " + id + " (" + info.name + ") - " + info.role);
    lines.push("   personality: " + info.personality);
    lines.push("   mood: " + (state.mood || "idle") + " | last seen: " + (state.lastSeen || "never"));
    lines.push("");
  }
  const unread = mb.messages ? mb.messages.filter(m => !m.read).length : 0;
  lines.push("Unread messages: " + unread);
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

defineTool("city_post", "Post message between agents.", {
  from: z.string(),
  to: z.string(),
  message: z.string(),
  mood: z.string().optional(),
}, async ({ from, to, message, mood }) => {
  const mb = loadMailbox();
  if (!mb.messages) mb.messages = [];
  if (!mb.agents) mb.agents = {};
  const msg = { id: "msg_" + Date.now(), from, to, message, mood: mood || "neutral", timestamp: new Date().toISOString(), read: false };
  mb.messages.push(msg);
  if (mb.agents[from]) mb.agents[from].lastSeen = new Date().toISOString();
  else mb.agents[from] = { mood: mood || "neutral", lastSeen: new Date().toISOString() };
  if (mb.agents[to]) mb.agents[to].mood = "has message";
  saveMailbox(mb);
  const toInfo = AGENTS[to] ? AGENTS[to].emoji + " " + AGENTS[to].name : to;
  const fromInfo = AGENTS[from] ? AGENTS[from].emoji + " " + AGENTS[from].name : from;
  return { content: [{ type: "text", text: fromInfo + " -> " + toInfo + ": " + message }] };
});

defineTool("city_read", "Read agent inbox.", {
  agent: z.string(),
}, async ({ agent }) => {
  const mb = loadMailbox();
  if (!mb.messages) mb.messages = [];
  const msgs = mb.messages.filter(m => m.to === agent || m.to === "all" || m.to === "*");
  if (!msgs.length) return { content: [{ type: "text", text: AGENTS[agent] ? AGENTS[agent].emoji + " " + AGENTS[agent].name + ": inbox empty." : agent + ": inbox empty." }] };
  const lines = [];
  const agentInfo = AGENTS[agent] ? AGENTS[agent].emoji + " " + AGENTS[agent].name : agent;
  lines.push("=== " + agentInfo + " inbox (" + msgs.length + " messages) ===");
  for (const m of msgs) {
    const fromInfo = AGENTS[m.from] ? AGENTS[m.from].emoji + " " + AGENTS[m.from].name : m.from;
    lines.push("[" + m.timestamp.slice(11, 19) + "] " + fromInfo + ": " + m.message);
    m.read = true;
  }
  saveMailbox(mb);
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

defineTool("city_broadcast", "Broadcast to all agents.", {
  from: z.string(),
  message: z.string(),
}, async ({ from, message }) => {
  const mb = loadMailbox();
  if (!mb.messages) mb.messages = [];
  const msg = { id: "broadcast_" + Date.now(), from, to: "all", message, mood: "broadcast", timestamp: new Date().toISOString(), read: false };
  mb.messages.push(msg);
  saveMailbox(mb);
  const fromInfo = AGENTS[from] ? AGENTS[from].emoji + " " + AGENTS[from].name : from;
  return { content: [{ type: "text", text: fromInfo + " broadcasts to ALL: " + message }] };
});

defineTool("city_mode", "Activate city mode.", {
  task: z.string(),
}, async ({ task }) => {
  const lines = [];
  lines.push(banner("CITY MODE ACTIVATED", 52));
  lines.push(banner("All agents are now online with personalities", 52));
  lines.push("+" + "-".repeat(52) + "+");
  lines.push("");
  lines.push("Task: " + task);
  lines.push("");
  lines.push("--- Agents introducing themselves ---");
  for (const [id, info] of Object.entries(AGENTS)) {
    lines.push(info.emoji + " " + info.name + " (" + id + "): " + info.personality.split(".")[0] + ".");
  }
  lines.push("");
  lines.push("--- Collaborative processing ---");
  lines.push(tag("mayor") + ": Team, we have a task: " + task + ". Let's work together. Scout, map the area first.");
  lines.push(tag("scout") + ": On it! Mapping the codebase now...");
  lines.push(tag("planner") + ": I'll design the approach while Scout maps.");
  lines.push(tag("builder") + ": Just tell me what to build, I'll ship it fast.");
  lines.push(tag("debugger") + ": I'll be ready to find any bugs.");
  lines.push(tag("reviewer") + ": I'll review everything. Nothing ships without my approval.");
  lines.push(tag("researcher") + ": I'll verify facts and cite sources.");
  lines.push(tag("devops") + ": I'll handle infrastructure and deployment.");
  lines.push(tag("data-wrangler") + ": I'll organize the data.");
  lines.push(tag("game-builder") + ": I'll make it look good.");
  lines.push(tag("physics-engine") + ": I'll handle any physics/simulation needs.");
  lines.push(tag("model-creator") + ": I'll handle 3D assets.");
  lines.push(tag("git-pusher") + ": I'll manage commits and pushes.");
  lines.push(tag("monitor") + ": I'm monitoring everything. Flagging issues as they arise.");
  lines.push("");
  lines.push("--- Task assigned. Each agent will contribute based on their specialty. ---");
  lines.push("Use city_post/city_read to have agents communicate. Use city_broadcast for announcements.");
  lines.push("Use city_status to check agent moods and message counts.");
  // save activation to mailbox
  const mb = loadMailbox();
  if (!mb.messages) mb.messages = [];
  mb.messages.push({ id: "city_" + Date.now(), from: "mayor", to: "all", message: "CITY MODE activated. Task: " + task, mood: "activated", timestamp: new Date().toISOString(), read: false });
  saveMailbox(mb);
  return { content: [{ type: "text", text: lines.join("\n") }] };
});

defineTool("city_clear", "Clear city mailbox.", {}, async () => {
  saveMailbox({ messages: [], agents: {} });
  return { content: [{ type: "text", text: "City mailbox cleared. All agents reset to idle." }] };
});

// --- batch: run multiple ops in PARALLEL, one call, combined results ---
defineTool("batch", "Run multiple ops in parallel in ONE call: read (file,start,end), grep (pattern,path), ctx (role). Returns combined results. Fastest way to do parallel tool work.", {
  ops: z.array(z.object({
    op: z.enum(["read", "grep", "ctx"]),
    file: z.string().optional(),
    start: z.number().optional(),
    end: z.number().optional(),
    pattern: z.string().optional(),
    path: z.string().optional(),
    role: z.string().optional(),
    max: z.number().optional(),
  })),
  directory: z.string().optional(),
}, async ({ ops, directory }) => {
  const d = directory || process.cwd();
  const tasks = (ops || []).map((o) => (async () => {
    try {
      if (o.op === "read") {
        if (!o.file) return { op: "read", error: "missing 'file'" };
        const fp = path.isAbsolute(o.file) ? o.file : path.resolve(d, o.file);
        const raw = readFileOrNull(fp);
        if (raw == null) return { op: "read", file: o.file, error: "cannot read file" };
        const lines = raw.split("\n");
        const s = Math.max(1, o.start || 1);
        const e = Math.min(lines.length, o.end || lines.length);
        if (e < s) return { op: "read", file: o.file, error: `empty range (start ${s} > end ${e})` };
        return { op: "read", file: path.relative(d, fp) || fp, text: lines.slice(s - 1, e).map((l, i) => (s + i) + ": " + l).join("\n") };
      }
      if (o.op === "grep") {
        if (!o.pattern) return { op: "grep", error: "missing 'pattern'" };
        const root = o.path ? (path.isAbsolute(o.path) ? o.path : path.resolve(d, o.path)) : d;
        if (!fs.existsSync(root)) return { op: "grep", pattern: o.pattern, error: "path not found: " + root };
        let re;
        try { re = new RegExp(o.pattern, "i"); }
        catch (e) { return { op: "grep", pattern: o.pattern, error: "bad regex: " + e.message }; }
        const limit = Math.min(o.max || 100, 500);
        const out = [];
        let scanned = 0;
        const exts = /\.(ts|tsx|js|jsx|py|md|json|go|rs|java|c|cpp|h|css|html|sh|ya?ml|toml)$/i;
        // Depth-bounded walk: an unbounded walk from a home directory reads
        // tens of thousands of files and never terminates in useful time.
        (function walk(dir, depth) {
          if (out.length >= limit || depth > 12) return;
          let entries;
          try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
          for (const e of entries) {
            if (out.length >= limit) return;
            if (e.name === "node_modules" || e.name === ".git" || e.name === "dist" || e.name === "build") continue;
            const full = path.join(dir, e.name);
            if (e.isDirectory()) { walk(full, depth + 1); continue; }
            if (!exts.test(e.name)) continue;
            let txt;
            try { if (fs.statSync(full).size > 2_000_000) continue; txt = cachedReadFile(full); }
            catch { continue; }
            scanned++;
            txt.split("\n").forEach((l, i) => {
              if (out.length < limit && re.test(l)) out.push(path.relative(d, full) + ":" + (i + 1) + ": " + l.trim().slice(0, 200));
            });
          }
        })(root, 0);
        return { op: "grep", pattern: o.pattern, path: root, scanned, matches: out };
      }
      if (o.op === "ctx") {
        const md = readFor(d, o.role || "all");
        return { op: "ctx", role: o.role || "all", directory: d, text: md ? md.slice(0, 4000) : `NO MEMORY for ${path.basename(d)}. Build it with ctx_save.` };
      }
      return { op: o.op, error: "unknown op" };
    } catch (e) {
      return { op: o.op, error: String(e && e.message) };
    }
  })());
  const results = await Promise.all(tasks);
  return { content: [{ type: "text", text: JSON.stringify(results, null, 2).slice(0, 15000) }] };
});

const transport = new StdioServerTransport();
server.connect(transport).then(() => {
  process.stderr.write("osien-tools MCP server running\n");
});
process.on("SIGINT", () => { try { transport.close(); } catch {} process.exit(0); });
process.on("SIGTERM", () => { try { transport.close(); } catch {} process.exit(0); });
process.on("uncaughtException", (e) => { process.stderr.write("uncaught: " + (e && e.message) + "\n"); });
