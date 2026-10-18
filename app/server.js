const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const os = require("os");

const PORT = process.env.PORT || 4096;
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");

const AGENTS = {
  "mayor": { name: "The Mayor", emoji: "🏛️", personality: "Calm, decisive, budget-conscious", color: "#4a90d9" },
  "builder": { name: "The Hammer", emoji: "🔨", personality: "Direct, action-oriented, ships fast", color: "#e8833a" },
  "debugger": { name: "The Detective", emoji: "🔍", personality: "Methodical, skeptical, finds root causes", color: "#9b59b6" },
  "reviewer": { name: "The Critic", emoji: "👁️", personality: "Sharp, detail-oriented, never satisfied", color: "#e74c3c" },
  "planner": { name: "The Architect", emoji: "📐", personality: "Big-picture, cautious, thorough", color: "#2ecc71" },
  "scout": { name: "The Explorer", emoji: "🧭", personality: "Curious, fast, finds things", color: "#f39c12" },
  "researcher": { name: "The Scholar", emoji: "📚", personality: "Evidence-based, cites sources", color: "#1abc9c" },
  "devops": { name: "The Engineer", emoji: "⚙️", personality: "Practical, reliability-obsessed", color: "#34495e" },
  "data-wrangler": { name: "The Librarian", emoji: "📊", personality: "Organized, precise with data", color: "#8e44ad" },
  "game-builder": { name: "The Artist", emoji: "🎨", personality: "Creative, playful, ships fast", color: "#e91e63" },
  "physics-engine": { name: "The Physicist", emoji: "⚛️", personality: "Precise, mathematical", color: "#00bcd4" },
  "model-creator": { name: "The Sculptor", emoji: "🗿", personality: "Visual, perfectionist", color: "#795548" },
  "git-pusher": { name: "The Courier", emoji: "📦", personality: "Reliable, careful", color: "#607d8b" },
  "monitor": { name: "The Watcher", emoji: "👁️", personality: "Observant, vigilant", color: "#ff9800" },
};

const MIME = { ".html": "text/html", ".css": "text/css", ".js": "application/javascript", ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml" };

// Windows: `opencode` on PATH is opencode.cmd/.ps1 and Node cannot exec those
// without a shell. Resolve the real binary so stdio can stay redirected to a file.
function resolveOpencode() {
  const cands = [];
  if (process.env.OPENCODE_BIN) cands.push(process.env.OPENCODE_BIN);
  const appData = process.env.APPDATA;
  if (appData) cands.push(path.join(appData, "npm", "node_modules", "opencode-ai", "bin", "opencode.exe"));
  cands.push(path.join(os.homedir(), ".opencode", "bin", "opencode.exe"));
  cands.push(path.join(os.homedir(), ".opencode", "bin", "opencode"));
  cands.push("/usr/local/bin/opencode");
  cands.push("/opt/homebrew/bin/opencode");
  for (const c of cands) { try { if (fs.existsSync(c)) return c; } catch (e) {} }
  return null;
}
const OPENCODE_BIN = resolveOpencode();

function serveStatic(req, res) {
  let url = req.url.split("?")[0];
  if (url === "/") url = "/index.html";
  const fp = path.join(PUBLIC, url);
  if (!fp.startsWith(PUBLIC)) { res.writeHead(403); res.end("forbidden"); return; }
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(fp)] || "text/plain" });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  if (req.url === "/api/agents" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(AGENTS));
    return;
  }

  if (req.url === "/api/run" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      let task = "", model = "opencode/space-bunny-free";
      try { const j = JSON.parse(body); task = j.task || ""; model = j.model || model; } catch {}
      if (!task) { res.writeHead(400); res.end(JSON.stringify({ error: "no task" })); return; }
res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
      res.write("data: " + JSON.stringify({ type: "start", model, bin: OPENCODE_BIN || "opencode@PATH" }) + "\n\n");
      // opencode.exe block-buffers stdout when it is a PIPE (0 bytes, never exits).
      // Redirect stdio to a real FILE, tail it, relay deltas over SSE.
      const outFile = path.join(os.tmpdir(), "oc_run_" + Date.now() + ".txt");
      const RUN_TIMEOUT_MS = Number(process.env.RUN_TIMEOUT_MS || 120000);
      let fd = null, sent = 0, closed = false, hasOutput = false;
      function push() {
        let txt = "";
        try { txt = fs.readFileSync(outFile, "utf8"); } catch (e) { return; }
        if (txt.length <= sent) return;
        res.write("data: " + JSON.stringify({ type: "out", text: txt.slice(sent) }) + "\n\n");
        sent = txt.length;
        hasOutput = true;
      }
      function finish(code) {
        if (closed) return;
        closed = true;
        try { if (fd !== null) fs.closeSync(fd); } catch (e) {}
        try { fs.unlinkSync(outFile); } catch (e) {}
        res.write("data: " + JSON.stringify({ type: "done", code, hasOutput }) + "\n\n");
        res.end();
      }
      try {
        fd = fs.openSync(outFile, "w");
        const runArgs = ["run", "-m", model, task];
        const proc = OPENCODE_BIN
          ? spawn(OPENCODE_BIN, runArgs, { cwd: os.homedir(), stdio: ["ignore", fd, fd] })
          : spawn("opencode", runArgs, { cwd: os.homedir(), stdio: ["ignore", fd, fd], shell: true });
        const ticker = setInterval(push, 300);
        const killer = setTimeout(() => { try { proc.kill(); } catch (e) {} }, RUN_TIMEOUT_MS);
        proc.on("error", e => { clearInterval(ticker); clearTimeout(killer); res.write("data: " + JSON.stringify({ type: "err", text: e.message }) + "\n\n"); finish(1); });
        proc.on("close", code => { clearInterval(ticker); clearTimeout(killer); push(); finish(code); });
      } catch (e) {
        res.write("data: " + JSON.stringify({ type: "err", text: "Spawn failed: " + e.message }) + "\n\n");
        finish(1);
      }
    });
    return;
  }

  if (req.url === "/api/city" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      let task = "general collaboration";
      try { task = JSON.parse(body).task || task; } catch {}
      const lines = [];
      lines.push("╔══════════════════════════════════════════════════╗");
      lines.push("║           CITY MODE ACTIVATED                      ║");
      lines.push("╚══════════════════════════════════════════════════╝");
      lines.push("");
      lines.push("Task: " + task);
      lines.push("");
      for (const [id, a] of Object.entries(AGENTS)) {
        lines.push(a.emoji + " " + a.name + ": " + a.personality);
      }
      lines.push("");
      lines.push("🏛️ The Mayor: Team, we have a task: " + task + ". Let's collaborate!");
      lines.push("🧭 The Explorer: On it! Mapping the area...");
      lines.push("📐 The Architect: I'll design the approach.");
      lines.push("🔨 The Hammer: Tell me what to build, I'll ship it.");
      lines.push("🔍 The Detective: Ready to find bugs.");
      lines.push("👁️ The Critic: Nothing ships without my approval.");
      lines.push("📚 The Scholar: I'll verify facts.");
      lines.push("⚙️ The Engineer: Infrastructure ready.");
      lines.push("📊 The Librarian: Data organized.");
      lines.push("🎨 The Artist: Making it beautiful.");
      lines.push("⚛️ The Physicist: Physics ready.");
      lines.push("🗿 The Sculptor: 3D assets ready.");
      lines.push("📦 The Courier: Commits ready.");
      lines.push("👁️ The Watcher: Monitoring everything.");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ narrative: lines.join("\n"), agents: AGENTS }));
    });
    return;
  }

  if (req.url === "/api/memory" && req.method === "GET") {
    const memFile = path.join(os.homedir(), ".config", "opencode", "memory", "projects");
    let content = "No memory yet.";
    try {
      const dirs = fs.readdirSync(memFile);
      if (dirs.length) {
        const files = fs.readdirSync(path.join(memFile, dirs[0]));
        content = files.map(f => "=== " + f + " ===\n" + fs.readFileSync(path.join(memFile, dirs[0], f), "utf8").slice(0, 500)).join("\n\n");
      }
    } catch {}
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ memory: content }));
    return;
  }

  serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log("osien-app running at http://localhost:" + PORT);
  console.log("Open this URL in your browser. No terminal needed.");
});
