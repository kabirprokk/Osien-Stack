const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const path = require("path");
const SERVER = path.join(__dirname, "..", "server.js");
const transport = new StdioClientTransport({ command: "node", args: [SERVER], env: { ...process.env, OSIEN_MEMORY_ROOT: path.join(__dirname, "..", ".smoke-mem") } });
const client = new Client({ name: "smoke", version: "1.0.0" }, { capabilities: {} });
(async () => {
  await client.connect(transport);
  const { tools } = await client.listTools();
  if (tools.length < 40) { console.error("FAIL: only " + tools.length + " tools"); process.exit(1); }
  // call a few core tools
  const checks = [
    ["ctx_recall", {}],
    ["machine_state", {}],
    ["verify_chain", { cmd: "node -e \"console.log('ok')\"" }],
    ["city_status", {}],
  ];
  for (const [name, args] of checks) {
    const r = await client.callTool({ name, arguments: args });
    if (r.isError) { console.error("FAIL: " + name, r.content); process.exit(1); }
  }
  console.log("SMOKE OK: " + tools.length + " tools, core calls pass");
  await client.close();
  // cleanup smoke mem
  const fs = require("fs");
  try { fs.rmSync(path.join(__dirname, "..", ".smoke-mem"), { recursive: true, force: true }); } catch {}
  process.exit(0);
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
