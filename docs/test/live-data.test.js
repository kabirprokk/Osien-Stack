const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadLiveData(fetchImpl) {
  const context = { window: {}, fetch: fetchImpl, AbortController, setTimeout, clearTimeout };
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "..", "live-data.js"), "utf8"),
    context,
  );
  return context.window.OsienLiveData;
}

test("loads and validates the current Osien version and tool catalog", async () => {
  const sources = {
    "https://raw.githubusercontent.com/kabirprokk/Osien-Stack/main/mcp-server/package.json": {
      name: "osien-tools",
      version: "2.0.0",
    },
    "https://raw.githubusercontent.com/kabirprokk/Osien-Stack/main/mcp-server/tools.json": [
      { name: "ctx_recall", desc: "Read project memory." },
      { name: "driftpost_publish", desc: "Publish a video." },
    ],
    "https://api.github.com/repos/kabirprokk/Osien-Stack/commits?per_page=1": [
      { commit: { committer: { date: "2026-10-24T10:00:00Z" } } },
    ],
  };
  const liveData = loadLiveData(async (url) => ({
    ok: true,
    json: async () => sources[url],
  }));

  const result = await liveData.fetchSources();
  assert.equal(result.version, "2.0.0");
  assert.equal(result.tools.length, 2);
  assert.equal(result.tools[1].name, "driftpost_publish");
  assert.equal(result.updatedAt, "2026-10-24T10:00:00Z");
});

test("rejects malformed catalog data instead of replacing the fallback", async () => {
  const liveData = loadLiveData(async (url) => ({
    ok: true,
    json: async () => url.endsWith("package.json")
      ? { name: "osien-tools", version: "2.0.0" }
      : { tools: [] },
  }));
  await assert.rejects(liveData.fetchSources(), /catalog/i);
});

test("rejects empty and malformed tool entries", async () => {
  const liveData = loadLiveData(async (url) => ({
    ok: true,
    json: async () => url.endsWith("package.json")
      ? { name: "osien-tools", version: "2.0.0" }
      : [{ name: "", desc: "bad" }],
  }));
  await assert.rejects(liveData.fetchSources(), /catalog/i);
});
