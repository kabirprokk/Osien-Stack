// Exploit regression test - proves the security fixes hold.
const http = require("http");
const path = require("path");
const fs = require("fs");

const PORT = 4599;
process.env.PORT = String(PORT);

// Sibling dir that shares the PUBLIC string prefix - defeats a naive
// fp.startsWith(PUBLIC) check.
const APP_ROOT = path.join(__dirname);
const SECRET_DIR = path.join(APP_ROOT, "public-secret");
fs.mkdirSync(SECRET_DIR, { recursive: true });
fs.writeFileSync(path.join(SECRET_DIR, "leak.txt"), "TOP_SECRET_CANARY");

process.env.ALLOWED_ORIGINS = "";
const server = require(path.join(APP_ROOT, "server.js"));

function req(pathname, opts = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PORT, path: pathname, method: opts.method || "GET", headers: opts.headers || {} }, res => {
      let b = "";
      res.on("data", c => (b += c));
      res.on("end", () => resolve({ status: res.statusCode, body: b, headers: res.headers }));
    });
    r.on("error", reject);
    if (opts.body) r.write(opts.body);
    r.end();
  });
}

const results = [];
function check(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log((pass ? "PASS  " : "FAIL  ") + name + (detail ? "  [" + detail + "]" : ""));
}

(async () => {
  await new Promise(r => setTimeout(r, 400));

  // 1. path traversal: parent escape
  let r = await req("/../../../../../../../../Windows/win.ini");
  check("traversal: parent escape blocked", r.status === 403 || r.status === 404, "status " + r.status);

  // 2. sibling-prefix bypass (the one that beat startsWith)
  r = await req("/../public-secret/leak.txt");
  check("traversal: sibling-prefix bypass blocked", r.body.indexOf("TOP_SECRET_CANARY") === -1, "status " + r.status);

  // 3. url-encoded traversal
  r = await req("/%2e%2e%2fpublic-secret%2fleak.txt");
  check("traversal: url-encoded blocked", r.body.indexOf("TOP_SECRET_CANARY") === -1, "status " + r.status);

  // 4. null byte
  r = await req("/index.html%00.txt");
  check("traversal: null byte blocked", r.body.indexOf("TOP_SECRET_CANARY") === -1, "status " + r.status);

  // 5. legit file still serves
  r = await req("/");
  check("static: index.html still serves", r.status === 200 && r.body.length > 0, "status " + r.status);

  // 6. CORS - hostile origin must be rejected
  r = await req("/api/agents", { headers: { Origin: "https://evil.example.com" } });
  check("cors: foreign origin rejected", r.status === 403, "status " + r.status);

  // 7. CORS - same origin allowed
  r = await req("/api/agents", { headers: { Origin: "http://localhost:" + PORT } });
  check("cors: same-origin allowed", r.status === 200, "status " + r.status);

  // 8. wildcard must NOT be echoed
  r = await req("/api/agents", { headers: { Origin: "https://evil.example.com" } });
  check("cors: no wildcard header", r.headers["access-control-allow-origin"] !== "*", String(r.headers["access-control-allow-origin"]));

  // 9. model validation blocks shell metacharacters
  const inj = JSON.stringify({ task: "hi", model: "x/../y & calc.exe" });
  r = await req("/api/run", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(inj) }, body: inj });
  check("injection: bad model id rejected", r.status === 400, "status " + r.status);

  // 10. body size limit
  const big = JSON.stringify({ task: "A".repeat(2 * 1024 * 1024) });
  r = await req("/api/run", { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(big) }, body: big });
  check("dos: oversized body rejected", r.status === 413, "status " + r.status);

  // cleanup
  try { fs.unlinkSync(path.join(SECRET_DIR, "leak.txt")); fs.rmdirSync(SECRET_DIR); } catch (e) {}

  const failed = results.filter(x => !x.pass);
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " security checks passed");
  server.close(() => process.exit(failed.length ? 1 : 0));
})();