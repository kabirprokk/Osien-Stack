// __SITE_TITLE__ API - zero dependencies, stdlib node only.
// Run: node server.js [port]   Test: curl localhost:3000/api/health
const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = +(process.argv[2] || process.env.PORT || 3000);
const send = (res, code, obj) => {
  res.writeHead(code, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify(obj));
};
const routes = {
  "GET /api/health": () => ({ ok: true, service: "__SITE_TITLE__", time: new Date().toISOString() }),
  "GET /api/time": () => ({ epoch: Date.now(), iso: new Date().toISOString() }),
  "POST /api/echo": (body) => ({ you_sent: body }),
};
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => { body += c; if (body.length > 1e6) req.destroy(); });
  req.on("end", () => {
    const key = `${req.method} ${req.url.split("?")[0]}`;
    const fn = routes[key];
    if (fn) {
      try { send(res, 200, fn(body ? JSON.parse(body) : {})); }
      catch (e) { send(res, 400, { error: "bad json" }); }
      return;
    }
    if (req.url === "/" || req.url === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>__SITE_TITLE__ API</title></head><body style="font-family:system-ui;max-width:640px;margin:40px auto"><h1>__SITE_TITLE__ API</h1><p>Try <a href="/api/health">/api/health</a>, POST /api/echo, GET /api/time.</p></body></html>`);
      return;
    }
    send(res, 404, { error: "not found", try: Object.keys(routes) });
  });
});
server.listen(PORT, () => console.log(`__SITE_TITLE__ API on http://localhost:${PORT}/`));
