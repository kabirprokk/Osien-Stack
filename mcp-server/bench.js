// MORPH token-reduction benchmark.
// Answers: does using the osien MCP tools actually cut token usage vs reading whole files?
// Every scenario compares the SAME work done two ways, so the numbers are comparable.
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("path");
const fs = require("fs");

const SERVER = path.join(__dirname, "server.js");
const DIR = path.resolve(__dirname, "..");
const MEM = path.join(__dirname, ".bench-mem");
const transport = new StdioClientTransport({
  command: "node", args: [SERVER],
  env: { ...process.env, OSIEN_MEMORY_ROOT: MEM },
});
const client = new Client({ name: "bench", version: "1.0.0" }, { capabilities: {} });

const toks = chars => Math.round(chars / 4);
const text = r => (r.content || []).map(c => c.text || "").join("");
const call = (name, args) => client.callTool({ name, arguments: args }).then(text);

let naiveTotal = 0, morphTotal = 0;

function scenario(label, naiveChars, morphChars) {
  naiveTotal += naiveChars; morphTotal += morphChars;
  const cut = naiveChars ? Math.round((1 - morphChars / naiveChars) * 100) : 0;
  console.log(`  ${label}`);
  console.log(`    naive  ${String(naiveChars).padStart(7)} chars  ~${String(toks(naiveChars)).padStart(5)} tok`);
  console.log(`    morph  ${String(morphChars).padStart(7)} chars  ~${String(toks(morphChars)).padStart(5)} tok   -> ${cut}% less`);
}

(async () => {
  await client.connect(transport);
  console.log("=== MORPH TOKEN-REDUCTION BENCHMARK ===\n");

  const README = path.join(DIR, "README.md");
  const whole = await call("read_slice", { file: README, start: 1, end: 100000 });

  // --- S1: "read the file" vs "read the part you need"
  scenario(
    "S1  read_slice(1..100000) vs read_slice(1..20)",
    whole.length,
    (await call("read_slice", { file: README, start: 1, end: 20 })).length
  );

  // --- S2: "scan the file for a term" vs morph grep on the same file
  scenario(
    "S2  whole file vs smart_grep('MCP', glob README.md)",
    whole.length,
    (await call("smart_grep", { pattern: "MCP", directory: DIR, glob: "README.md" })).length
  );

  // --- S3: "where is this symbol used?" - 6 file reads vs one bounded grep
  const files = ["server.js", "package.json", "tools.json", "test/smoke.js"]
    .map(f => path.join(DIR, "mcp-server", f))
    .concat([path.join(DIR, "AGENTS.md"), path.join(DIR, "AI_INSTALL.md")]);
  let naiveRead = 0;
  for (const f of files) naiveRead += (await call("read_slice", { file: f, start: 1, end: 100000 })).length;
  scenario(
    "S3  read 6 files in full vs smart_grep('osien-tools', glob .js)",
    naiveRead,
    (await call("smart_grep", { pattern: "osien-tools", directory: DIR, glob: ".js" })).length
  );

  // --- S4: "how expensive is this file?" - context_budget answers without reading it
  scenario(
    "S4  whole file vs context_budget (cost report only)",
    whole.length,
    (await call("context_budget", { files: [README] })).length
  );

  const cut = naiveTotal ? Math.round((1 - morphTotal / naiveTotal) * 100) : 0;
  console.log(`\n  TOTAL  naive ${naiveTotal} chars ~${toks(naiveTotal)} tok  ->  morph ${morphTotal} chars ~${toks(morphTotal)} tok   (${cut}% less)\n`);

  await client.close();
  try { fs.rmSync(MEM, { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });