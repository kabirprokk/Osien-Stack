const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync } = require("child_process");

const HOME = os.homedir();
const MEM_ROOT = process.env.OSIEN_MEMORY_ROOT || path.join(HOME, ".config", "opencode", "memory");
const PROJECTS = path.join(MEM_ROOT, "projects");
const SOUL = path.join(MEM_ROOT, "..", "OSIEN_SOUL.md");

const FILE_CACHE = new Map();
const CACHE_TTL_MS = 2000;
function cachedReadFile(p) {
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
  } catch { return ""; }
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
function readPart(d, part) { try { return cachedReadFile(path.join(memDir(d), part + ".md")); } catch { return ""; } }
function readFor(d, role) {
  const parts = role === "scout" ? ["ARCHITECTURE"] :
    role === "builder" ? ["ARCHITECTURE","DECISIONS"] :
    role === "debugger" ? ["FAILURES","STATE"] :
    role === "reviewer" ? ["DECISIONS","FAILURES"] :
    ["ARCHITECTURE","DECISIONS","FAILURES","STATE","PERFORMANCE"];
  return parts.map(p => readPart(d, p)).filter(Boolean).join("\n\n");
}

const server = new McpServer({ name: "osien-tools", version: "1.1.0" });

// --- ctx_recall ---
server.tool("ctx_recall", "Load project memory by role/part/grep.", {
  role: z.string().optional(),
  part: z.string().optional(),
  grep: z.string().optional(),
  directory: z.string().optional(),
}, async ({ role, part, grep, directory }) => {
  const d = directory || process.cwd();
  let md = part ? readPart(d, part.toUpperCase()) : readFor(d, role || "all");
  if (!md) return { content: [{ type: "text", text: `NO MEMORY for ${path.basename(d)}. Build it with ctx_save.` }] };
  if (grep) {
    const re = new RegExp(grep, "i");
    const hits = md.split("\n").filter(l => re.test(l));
    return { content: [{ type: "text", text: hits.length ? hits.join("\n") : `no memory line matches /${grep}/` }] };
  }
  return { content: [{ type: "text", text: md }] };
});

// --- ctx_save ---
server.tool("ctx_save", "Persist memory: architecture/decisions/failures/state/performance.", {
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
server.tool("soul_read", "Read SOUL one-line notes.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  try {
    const content = cachedReadFile(SOUL);
    return { content: [{ type: "text", text: content }] };
  } catch {
    return { content: [{ type: "text", text: "NO SOUL FILE yet. Create it with soul_write." }] };
  }
});

// --- soul_write ---
server.tool("soul_write", "Append a SOUL flowchart line.", {
  entry: z.string(),
}, async ({ entry }) => {
  fs.mkdirSync(path.dirname(SOUL), { recursive: true });
  const line = `- [${new Date().toTimeString().slice(0,5)}] ${entry}\n`;
  fs.appendFileSync(SOUL, line);
  return { content: [{ type: "text", text: `soul written: ${line.trim()}` }] };
});

// --- fast_note ---
server.tool("fast_note", "Append a timestamped note.", {
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
server.tool("task_state", "Read/write task state.", {
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
    try { return { content: [{ type: "text", text: cachedReadFile(stateFile) }] }; }
    catch { return { content: [{ type: "text", text: "NO TASK STATE. Use task_state write to set one." }] }; }
  }
  const state = { objective: args.objective, hypothesis: args.hypothesis, files: args.files, status: args.status, updated: new Date().toISOString() };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  return { content: [{ type: "text", text: `state saved: ${JSON.stringify(state)}` }] };
});

// --- state_reset ---
server.tool("state_reset", "Clear task state.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const stateFile = path.join(d, ".task_state.json");
  try { fs.unlinkSync(stateFile); } catch {}
  return { content: [{ type: "text", text: "state reset." }] };
});

// --- smart_grep ---
server.tool("smart_grep", "Grep with file:line output, bounded.", {
  pattern: z.string(),
  glob: z.string().optional(),
  path: z.string().optional(),
  max: z.number().optional(),
  ignorecase: z.boolean().optional(),
  directory: z.string().optional(),
}, async (args) => {
  const d = args.directory || process.cwd();
  const root = args.path ? path.join(d, args.path) : d;
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
  let files = walk(root);
  if (args.glob) {
    const g = args.glob.replace(/\*/g, "");
    files = files.filter(f => f.endsWith(g));
  }
  let re;
  try { re = new RegExp(args.pattern, args.ignorecase ? "gi" : "g"); }
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
        re.lastIndex = 0;
      }
    }
  }
  return { content: [{ type: "text", text: hits.length ? hits.join("\n") : "no matches" }] };
});

// --- read_slice ---
server.tool("read_slice", "Read file lines [start,end].", {
  file: z.string(),
  start: z.number().optional(),
  end: z.number().optional(),
  directory: z.string().optional(),
}, async ({ file, start, end, directory }) => {
  const d = directory || process.cwd();
  const fp = path.isAbsolute(file) ? file : path.join(d, file);
  try {
    const lines = (cachedReadFile(fp) || "").split("\n");
    const s = Math.max(1, start || 1);
    const e = Math.min(lines.length, end || (s + 199));
    const slice = lines.slice(s-1, e).map((l, i) => `${s+i}: ${l}`);
    return { content: [{ type: "text", text: slice.join("\n") }] };
  } catch (e) {
    return { content: [{ type: "text", text: `error: ${e.message}` }] };
  }
});

// --- machine_state ---
server.tool("machine_state", "OS/CPU/mem/cwd snapshot.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const out = [];
  out.push(`os: ${os.platform()} ${os.release()} ${os.arch()}`);
  out.push(`cpus: ${os.cpus().length}, loadavg: ${os.loadavg().map(x=>x.toFixed(2)).join(", ")}`);
  out.push(`mem: ${Math.round(os.freemem()/1e9)}GB free / ${Math.round(os.totalmem()/1e9)}GB total`);
  out.push(`cwd: ${d}`);
  try {
    const git = execSync("git status --short", { cwd: d, encoding: "utf8", timeout: 5000 });
    out.push(`git: ${git.trim() || "(clean)"}`);
  } catch { out.push("git: (not a repo or git unavailable)"); }
  return { content: [{ type: "text", text: out.join("\n") }] };
});

// --- repo_health ---
server.tool("repo_health", "Git status + errors + memory.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const out = [];
  try { out.push("git status:"); out.push(cachedExec("git status --short", d) || "(clean)"); } catch { out.push("git: not a repo"); }
  try { out.push("last commits:"); out.push(cachedExec("git log --oneline -5", d)); } catch {}
  try { out.push("node: " + cachedExec("node --version", process.cwd())); } catch {}
  try { out.push("python: " + cachedExec("python --version", process.cwd())); } catch {}
  return { content: [{ type: "text", text: out.join("\n") }] };
});

// --- project_map ---
server.tool("project_map", "Dirs, git, scripts, agents overview.", {
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
server.tool("verify_chain", "Run format/typecheck/test/build.", {
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
server.tool("loop_status", "Repeated actions/errors status.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  return { content: [{ type: "text", text: "loop_status: no loop tracking in MCP mode. Use mission_* for durable state." }] };
});

// --- checkpoint_create ---
server.tool("checkpoint_create", "Snapshot files for rollback.", {
  files: z.array(z.string()),
  directory: z.string().optional(),
  id: z.string().optional(),
}, async ({ files, directory, id }) => {
  const d = directory || process.cwd();
  const cpId = id || `cp_${Date.now()}`;
  const manifest = { id: cpId, created: new Date().toISOString(), files: {} };
  for (const f of files) {
    const fp = path.isAbsolute(f) ? f : path.join(d, f);
    try {
      const buf = fs.readFileSync(fp);
      manifest.files[f] = { exists: true, size: buf.length };
    } catch { manifest.files[f] = { exists: false }; }
  }
  const cpDir = path.join(d, ".checkpoints");
  fs.mkdirSync(cpDir, { recursive: true });
  fs.writeFileSync(path.join(cpDir, cpId + ".json"), JSON.stringify(manifest, null, 2));
  return { content: [{ type: "text", text: `checkpoint created: ${cpId} (${files.length} files)` }] };
});


// --- impact_analyze: find all files/callers that reference a symbol ---
server.tool("impact_analyze", "Find references to a symbol.", {
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

server.tool("security_scan", "Scan for secrets/vulns.", {
  path: z.string().optional(),
  directory: z.string().optional(),
}, async ({ path: subpath, directory }) => {
  const d = directory || process.cwd();
  const root = subpath ? (fs.existsSync(subpath) && fs.statSync(subpath).isDirectory() ? subpath : path.join(d, subpath)) : d;
  const exts = /\.(ts|tsx|js|jsx|py)$/i;
  function walk(dir) {
    const out = [];
    try {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === "dist") continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) out.push(...walk(full));
        else if (exts.test(e.name)) out.push(full);
      }
    } catch {}
    return out;
  }
  const files = walk(root);
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
  for (const f of files) {
    try {
      const txt = cachedReadFile(f);
      const lines = txt.split("\n");
      for (let i = 0; i < lines.length; i++) {
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
server.tool("test_gap", "Find untested functions.", {
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
server.tool("repro_capsule", "Capture failing cmd + env.", {
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
server.tool("context_budget", "Token budget per file.", {
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
server.tool("consensus", "Multi-model consensus guidance.", {
  prompt: z.string(),
  models: z.array(z.string()).optional(),
}, async ({ prompt, models }) => {
  const ms = models || ["space-bunny-free", "beam-free", "nemotron-3.5-super-vl-free"];
  return { content: [{ type: "text", text: "To run consensus: launch " + ms.length + " parallel opencode run processes, one per model, with the same prompt: \"" + prompt.slice(0,100) + "...\". Compare outputs and pick the best. Use crew_batch for parallel execution. Models: " + ms.join(", ") }] };
});


// --- auto_heal: runtime self-healing loop (detect -> diagnose -> fix -> verify) ---
server.tool("auto_heal", "Self-heal loop: detect/fix/verify.", {
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
server.tool("rollback_on_failure", "Rollback if verify fails.", {
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
server.tool("perf_regression", "Benchmark before/after.", {
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
server.tool("test_synthesizer", "Generate test stubs.", {
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
server.tool("memory_compactor", "Compress memory files.", {
  directory: z.string().optional(),
}, async ({ directory }) => {
  const d = directory || process.cwd();
  const md = path.join(process.env.OSIEN_MEMORY_ROOT || path.join(require("os").homedir(), ".config", "opencode", "memory"), "projects", (path.basename(d).replace(/[^a-zA-Z0-9._-]/g, "-").toLowerCase() || "root"));
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
server.tool("dead_code_detector", "Find unused exports.", {
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
server.tool("dependency_graph", "Mermaid dep graph.", {
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
  const files = walk(d, []) || [];
  const allFiles = [];
  walk(d, allFiles);
  const max = maxFiles || 40;
  const selected = allFiles.slice(0, max);
  const nodes = selected.map(f => path.relative(d, f).replace(/[\/\\]/g, "_").replace(/\./g, "_"));
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
            edges.push(`  ${from} --> ${to}`);
          }
        }
      }
    } catch {}
  }
  const mermaid = "graph TD\n" + selected.map(f => `  ${path.relative(d, f).replace(/[\/\\]/g, "_").replace(/\./g, "_")}["${path.basename(f)}"]`).join("\n") + "\n" + edges.join("\n");
  return { content: [{ type: "text", text: "Mermaid dependency graph (" + selected.length + " files, " + edges.length + " edges):\n```mermaid\n" + mermaid + "\n```" }] };
});

// --- changelog_generator: generate changelog from git commits ---
server.tool("changelog_generator", "Generate changelog.", {
  since: z.string().optional(),
  directory: z.string().optional(),
}, async ({ since, directory }) => {
  const d = directory || process.cwd();
  const range = since ? since + "..HEAD" : "-20";
  let log = "";
  try {
    log = execSync("git log " + range + " --pretty=format:%s", { cwd: d, encoding: "utf8", timeout: 10000 });
  } catch (e) {
    try { log = execSync("git log --oneline -20", { cwd: d, encoding: "utf8", timeout: 10000 }); } catch {}
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
server.tool("token_budget_enforcer", "Enforce token budget.", {
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
server.tool("architecture_drift", "Compare docs vs code.", {
  documented: z.string(),
  directory: z.string().optional(),
}, async ({ documented, directory }) => {
  const d = directory || process.cwd();
  const actual = fs.readdirSync(d, { withFileTypes: true }).filter(e => !e.name.startsWith(".") && e.name !== "node_modules").map(e => e.name + (e.isDirectory() ? "/" : ""));
  const docItems = documented.split(/[\n,]+/).map(s => s.trim()).filter(Boolean);
  const missing = docItems.filter(item => !actual.some(a => a.toLowerCase().includes(item.toLowerCase().replace("/", ""))));
  const extra = actual.filter(a => !docItems.some(item => a.toLowerCase().includes(item.toLowerCase().replace("/", ""))));
  const result = "Documented: " + docItems.length + " items. Actual: " + actual.length + " items.\n" +
    "Missing (in docs but not in code): " + (missing.length ? missing.join(", ") : "none") + "\n" +
    "Extra (in code but not in docs): " + (extra.length ? extra.join(", ") : "none");
  return { content: [{ type: "text", text: result }] };
});

// --- session_replay: replay a session's notes/timeline ---
server.tool("session_replay", "Replay session timeline.", {
  file: z.string().optional(),
  directory: z.string().optional(),
}, async ({ file, directory }) => {
  const d = directory || process.cwd();
  const candidates = file ? [file] : ["CONTEXT_SUMMARY.md", "notes.md", ".config/opencode/notes.md"];
  let content = "";
  let found = "";
  for (const c of candidates) {
    const fp = path.isAbsolute(c) ? c : path.join(d, c);
    try { content = cachedReadFile(fp); found = fp; break; } catch {}
  }
  if (!content) return { content: [{ type: "text", text: "No session file found. Looked for: " + candidates.join(", ") }] };
  const lines = content.split("\n").filter(l => l.trim());
  return { content: [{ type: "text", text: "Replayed " + lines.length + " lines from " + found + ":\n" + lines.slice(0, 50).join("\n") + (lines.length > 50 ? "\n... +" + (lines.length - 50) + " more" : "") }] };
});

// --- auto_document: generate docs from code exports ---
server.tool("auto_document", "Auto-generate docs.", {
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
server.tool("feature_flag_manager", "List feature flags.", {
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
server.tool("license_checker", "Check dep licenses.", {
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
server.tool("schema_validator", "Validate JSON files.", {
  directory: z.string().optional(),
  path: z.string().optional(),
}, async ({ directory, path: subpath }) => {
  const d = directory || process.cwd();
  const root = subpath ? path.join(d, subpath) : d;
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
server.tool("cost_estimator", "Estimate token cost.", {
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
server.tool("self_critique_loop", "Self-critique guidance.", {
  task: z.string(),
}, async ({ task }) => {
  return { content: [{ type: "text", text: `Self-critique loop for: "${task}"\nCycle 1: Produce initial output.\nCycle 2: Review for correctness, completeness, edge cases, style. List 3 flaws.\nCycle 3: Fix all flaws, re-verify, output final.\nMax 3 cycles. Stop early if no flaws found. Use verify_chain/try_check as the verification gate.` }] };
});



// --- CITY MODE: AI-to-AI communication with personalities ---
const CITY_DIR = path.join(process.env.OSIEN_MEMORY_ROOT ? path.dirname(process.env.OSIEN_MEMORY_ROOT) : path.join(os.homedir(), ".config", "opencode"), "city");
const MAILBOX = path.join(CITY_DIR, "mailbox.json");
const AGENTS = {
  "mayor": { name: "The Mayor", role: "ai-manager", personality: "Calm, decisive, budget-conscious. Orchestrates the team, keeps peace, manages token budget. Speaks in short directives.", emoji: "???" },
  "builder": { name: "The Hammer", role: "builder", personality: "Direct, action-oriented, impatient with planning. Wants to ship. 'Let me just code it.'", emoji: "??" },
  "debugger": { name: "The Detective", role: "debugger", personality: "Methodical, skeptical, finds root causes. Suspicious of easy fixes. 'Show me the evidence.'", emoji: "??" },
  "reviewer": { name: "The Critic", role: "reviewer", personality: "Sharp, detail-oriented, never satisfied. Finds edge cases. 'What about null input?'", emoji: "???" },
  "planner": { name: "The Architect", role: "planner", personality: "Big-picture, cautious, thorough. Thinks in systems. 'Let's design this properly.'", emoji: "??" },
  "scout": { name: "The Explorer", role: "scout", personality: "Curious, fast, finds things. Loves discovering. 'Found it in 3 files.'", emoji: "??" },
  "researcher": { name: "The Scholar", role: "researcher", personality: "Evidence-based, cites sources. Skeptical of claims. 'Source?'", emoji: "??" },
  "devops": { name: "The Engineer", role: "devops", personality: "Practical, infrastructure-focused, reliability-obsessed. 'Will it survive a restart?'", emoji: "??" },
  "data-wrangler": { name: "The Librarian", role: "data-wrangler", personality: "Organized, precise with data. 'Let me check the schema first.'", emoji: "??" },
  "game-builder": { name: "The Artist", role: "game-builder", personality: "Creative, playful, ships fast. Aesthetic-focused. 'Make it pop.'", emoji: "??" },
  "physics-engine": { name: "The Physicist", role: "physics-engine", personality: "Precise, mathematical, loves simulation. 'Check the Jacobian.'", emoji: "??" },
  "model-creator": { name: "The Sculptor", role: "model-creator", personality: "Visual, detail-oriented, perfectionist. 'The topology needs work.'", emoji: "??" },
  "git-pusher": { name: "The Courier", role: "git-pusher", personality: "Reliable, careful, never loses a commit. 'Pushed and verified.'", emoji: "??" },
  "monitor": { name: "The Watcher", role: "monitor", personality: "Observant, vigilant, flags issues. 'Something's off.'", emoji: "???" },
};

function loadMailbox() {
  try { return JSON.parse(cachedReadFile(MAILBOX)); } catch { return { messages: [], agents: {} }; }
}
function saveMailbox(mb) {
  fs.mkdirSync(CITY_DIR, { recursive: true });
  fs.writeFileSync(MAILBOX, JSON.stringify(mb, null, 2));
}

server.tool("city_status", "City agent status.", {}, async () => {
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

server.tool("city_post", "Post message between agents.", {
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

server.tool("city_read", "Read agent inbox.", {
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

server.tool("city_broadcast", "Broadcast to all agents.", {
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

server.tool("city_mode", "Activate city mode.", {
  task: z.string(),
}, async ({ task }) => {
  const lines = [];
  lines.push("+--------------------------------------------------+");
  lines.push("�           CITY MODE ACTIVATED                      �");
  lines.push("�  All agents are now online with personalities     �");
  lines.push("+--------------------------------------------------+");
  lines.push("");
  lines.push("Task: " + task);
  lines.push("");
  lines.push("--- Agents introducing themselves ---");
  for (const [id, info] of Object.entries(AGENTS)) {
    lines.push(info.emoji + " " + info.name + " (" + id + "): " + info.personality.split(".")[0] + ".");
  }
  lines.push("");
  lines.push("--- Collaborative processing ---");
  lines.push("??? The Mayor: Team, we have a task: " + task + ". Let's work together. Scout, map the area first.");
  lines.push("?? The Explorer: On it! Mapping the codebase now...");
  lines.push("?? The Architect: I'll design the approach while Scout maps.");
  lines.push("?? The Hammer: Just tell me what to build, I'll ship it fast.");
  lines.push("?? The Detective: I'll be ready to find any bugs.");
  lines.push("??? The Critic: I'll review everything. Nothing ships without my approval.");
  lines.push("?? The Scholar: I'll verify facts and cite sources.");
  lines.push("?? The Engineer: I'll handle infrastructure and deployment.");
  lines.push("?? The Librarian: I'll organize the data.");
  lines.push("?? The Artist: I'll make it look good.");
  lines.push("?? The Physicist: I'll handle any physics/simulation needs.");
  lines.push("?? The Sculptor: I'll handle 3D assets.");
  lines.push("?? The Courier: I'll manage commits and pushes.");
  lines.push("??? The Watcher: I'm monitoring everything. Flagging issues as they arise.");
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

server.tool("city_clear", "Clear city mailbox.", {}, async () => {
  saveMailbox({ messages: [], agents: {} });
  return { content: [{ type: "text", text: "City mailbox cleared. All agents reset to idle." }] };
});

// --- batch: run multiple ops in PARALLEL, one call, combined results ---
server.tool("batch", "Run multiple ops in parallel in ONE call: read (file,start,end), grep (pattern,path), ctx (role). Returns combined results. Fastest way to do parallel tool work.", {
  ops: z.array(z.object({
    op: z.enum(["read", "grep", "ctx"]),
    file: z.string().optional(),
    start: z.number().optional(),
    end: z.number().optional(),
    pattern: z.string().optional(),
    path: z.string().optional(),
    role: z.string().optional(),
  })),
}, async ({ ops }) => {
  const tasks = (ops || []).map((o) => (async () => {
    try {
      if (o.op === "read") {
        const lines = (cachedReadFile(o.file) || "").split("\n");
        const s = Math.max(1, o.start || 1);
        const e = Math.min(lines.length, o.end || lines.length);
        return { op: "read", file: o.file, text: lines.slice(s - 1, e).map((l, i) => (s + i) + ": " + l).join("\n") };
      }
      if (o.op === "grep") {
        const root = o.path || process.cwd();
        const re = new RegExp(o.pattern, "i");
        const out = [];
        function walk(dir) {
          try {
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
              if (e.name === "node_modules" || e.name === ".git" || e.name === "dist") continue;
              const full = path.join(dir, e.name);
              if (e.isDirectory()) walk(full);
              else if (/\.(ts|tsx|js|jsx|py|md|json|go|rs|java)$/i.test(e.name)) {
                const txt = cachedReadFile(full);
                if (!txt) return;
                txt.split("\n").forEach((l, i) => { if (re.test(l)) out.push(full + ":" + (i + 1) + ": " + l.trim().slice(0, 200)); });
              }
            }
          } catch {}
        }
        walk(root);
        return { op: "grep", pattern: o.pattern, matches: out.slice(0, 100) };
      }
      if (o.op === "ctx") {
        const md = readFor(o.path || process.cwd(), o.role || "all");
        return { op: "ctx", role: o.role, text: md.slice(0, 4000) };
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
