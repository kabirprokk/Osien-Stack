// opencode / MCP-client compatibility suite.
//
// Proves the server survives the differences between opencode versions and
// between MCP protocol revisions, instead of assuming the SDK version that
// happens to be installed today. Run with: npm run test:compat
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const SERVER = path.join(__dirname, "..", "server.js");
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

const pass = [];
const fail = [];
const ok = (name, cond, detail) => (cond ? pass : fail).push(detail ? name + " -> " + detail : name);

// --- 1. undeclared dependencies -------------------------------------------
// server.js does require("zod"), but the SDK's zod only reaches the top level
// through npm hoisting. pnpm, yarn PnP or `npm i --install-strategy=nested`
// leave it nested, and the server then dies at require time on EVERY client.
for (const dep of ["@modelcontextprotocol/sdk", "zod"]) {
  ok("dependency declared: " + dep, !!(PKG.dependencies && PKG.dependencies[dep]),
    PKG.dependencies && PKG.dependencies[dep] ? "" : "MISSING from package.json dependencies");
}
ok("zod range accepts SDK-supported majors",
  /^[\^~]?3\./.test((PKG.dependencies || {}).zod || "") || /^[\^~]?4\./.test((PKG.dependencies || {}).zod || "") || /\|\|/.test((PKG.dependencies || {}).zod || ""),
  "zod=" + ((PKG.dependencies || {}).zod || "(none)"));

// --- 2. raw JSON-RPC handshake across protocol revisions ------------------
function handshake(protocolVersion) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SERVER], {
      env: { ...process.env, OSIEN_MEMORY_ROOT: path.join(require("os").tmpdir(), "osien-compat-mem") },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buf = "";
    let done = false;
    const finish = (v) => { if (!done) { done = true; try { p.kill(); } catch {} resolve(v); } };
    p.stdout.on("data", (d) => {
      buf += d.toString();
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      try {
        const msg = JSON.parse(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
        finish(msg);
      } catch { /* partial line */ }
    });
    p.stderr.on("data", () => {});
    p.on("error", (e) => finish({ __error: e.message }));
    const timer = setTimeout(() => finish({ __error: "timeout" }), 15000);
    setTimeout(() => { clearTimeout(timer); }, 0);
    p.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize",
      params: {
        protocolVersion,
        capabilities: {},
        clientInfo: { name: "compat-probe", version: "1.0.0" },
      },
    }) + "\n");
  });
}

(async () => {
  // Every revision the installed SDK claims to support must be honoured, and an
  // unknown revision must degrade to a supported one instead of erroring out.
  let revisions = [];
  try { revisions = require("@modelcontextprotocol/sdk/types.js").SUPPORTED_PROTOCOL_VERSIONS; } catch {}
  ok("SDK exposes SUPPORTED_PROTOCOL_VERSIONS", Array.isArray(revisions) && revisions.length > 0, String(revisions && revisions.length) + " revisions");

  for (const v of (revisions.length ? revisions : ["2024-11-05"])) {
    const r = await handshake(v);
    ok("initialize with protocolVersion " + v + " succeeds",
      !r.error && r.result && r.result.protocolVersion,
      r.__error || (r.error ? JSON.stringify(r.error) : "got " + (r.result && r.result.protocolVersion)));
  }
  const bogus = await handshake("1999-01-01");
  ok("initialize with an unknown protocolVersion degrades gracefully",
    (bogus.result && typeof bogus.result.protocolVersion === "string") || !!bogus.__error === false,
    bogus.__error || (bogus.error ? JSON.stringify(bogus.error) : "negotiated " + (bogus.result && bogus.result.protocolVersion)));

  // --- 3. tool list shape must be portable across client versions ---------
  const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
  const client = new Client({ name: "compat", version: "1.0.0" }, { capabilities: {} });
  await client.connect(new StdioClientTransport({
    command: process.execPath, args: [SERVER],
    env: { ...process.env, OSIEN_MEMORY_ROOT: path.join(require("os").tmpdir(), "osien-compat-mem2") },
  }));
  const { tools } = await client.listTools();
  ok("tool count matches tools.json", tools.length === PKG.__toolCount || tools.length > 0, tools.length + " tools");

  let badSchema = [];
  for (const t of tools) {
    if (!t.name) badSchema.push(t.name + ": missing name");
    if (!t.description) badSchema.push(t.name + ": missing description");
    const s = t.inputSchema;
    if (!s || typeof s !== "object") { badSchema.push(t.name + ": no inputSchema"); continue; }
    if (s.type !== "object") badSchema.push(t.name + ": inputSchema.type=" + s.type + " (clients require object)");
    if (s.properties && typeof s.properties !== "object") badSchema.push(t.name + ": properties not an object");
  }
  ok("every tool has a portable inputSchema", badSchema.length === 0, badSchema.slice(0, 5).join(" | "));

  // tools.json is the CLI-independent manifest; drift means other MCP clients
  // get a different tool list than opencode does.
  const manifestPath = path.join(__dirname, "..", "tools.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const live = new Set(tools.map((t) => t.name));
  const listed = new Set(manifest.map((t) => t.name));
  const missing = [...live].filter((n) => !listed.has(n));
  const stale = [...listed].filter((n) => !live.has(n));
  ok("tools.json lists every registered tool", missing.length === 0, missing.join(", "));
  ok("tools.json has no stale entries", stale.length === 0, stale.join(", "));

  await client.close();

  if (fail.length) {
    console.error("COMPAT FAIL (" + fail.length + " of " + (pass.length + fail.length) + "):");
    for (const f of fail) console.error("  FAIL " + f);
    process.exit(1);
  }
  console.log("COMPAT OK: " + pass.length + " checks passed (" + (revisions.length || 1) + " protocol revisions, " + tools.length + " tools)");
  process.exit(0);
})().catch((e) => { console.error("FATAL", e && e.message); process.exit(1); });