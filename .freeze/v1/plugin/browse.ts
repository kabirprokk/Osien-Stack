import type { Plugin } from "@opencode-ai/plugin"

// BROWSE: the reflex loop as opencode tools. Heuristic brain (fast, no LLM in the
// hot path), learns site fingerprints from outcomes, misses drive self-upgrades.
const CORE = `${process.env.HOME}/.config/opencode/social/webcore.py`;

export default (async () => {
  const { execFile } = await import("child_process");
  const VENV = `${process.env.HOME}/.config/opencode/.venvs/social/bin/python`;

  function run(args: string[], timeout = 60000): Promise<string> {
    return new Promise((resolve) => {
      execFile(VENV, [CORE, ...args], { timeout, maxBuffer: 4_000_000 }, (err, out, errb) =>
        resolve(String(out || errb || (err ? "ERR: " + err.message : "")))
      );
    });
  }

  return {
    tool: {
      web_act: {
        description: "Reflex browse+act on a real page: analyzer tree → brain → click/type (no LLM in the loop, ~1s). Self-learns site patterns; misses logged for upgrade.",
        args: {
          type: "object",
          properties: {
            url: { type: "string", description: "page URL" },
            goal: { type: "string", description: "natural goal: 'click the sign up button', 'type search'..." },
          },
          required: ["url", "goal"],
        },
        async execute(args: any) {
          const url = String(args?.url ?? args?.[0] ?? "").trim();
          const goal = String(args?.goal ?? args?.[1] ?? "").trim();
          if (!url) return "web_act needs a url (args: {url, goal}). Run web_tree(url) first if unsure.";
          if (!goal) return "web_act needs a goal (args: {url, goal}), e.g. 'click the sign up button'.";
          return (await run(["act", url, goal], 90000)).trim().slice(0, 1200);
        },
      },
      web_tree: {
        description: "Map a page to its interactive tree (what/where/how-to-hit). 5-20ms, no screenshot.",
        args: { type: "object", properties: { url: { type: "string" } }, required: ["url"] },
        async execute(args: any) {
          const url = String(args?.url ?? args?.[0] ?? "").trim();
          if (!url) return "web_tree needs a url (args: {url}).";
          return (await run(["tree", url], 45000)).trim().slice(0, 2000);
        },
      },
      web_research: {
        description: "VISIBLE research: opens each source in a real browser tab and harvests text. User watches the automation work. Use whenever asked to research or look something up.",
        args: {
          type: "object",
          properties: {
            question: { type: "string", description: "what is being researched" },
            urls: { type: "string", description: "space-separated URLs" },
          },
          required: ["question"],
        },
        async execute(args: any) {
          const q = String(args?.question ?? "").trim();
          const urls = String(args?.urls ?? "").split(/\s+/).filter(Boolean);
          if (!q) return "web_research needs a question.";
          return new Promise((resolve) => {
            execFile(VENV, [CORE, "research", q, ...(urls.length ? urls : [])], {
              env: { ...(process.env as any), OSIEN_VISIBLE: "1" },
              timeout: 180000, maxBuffer: 8_000_000,
            }, (err, out) => resolve(String(out || ("ERR " + (err?.message || ""))).slice(0, 6000)));
          });
        },
      },
      web_search: {
        description: "VISIBLE web search in the REAL browser (user watches the query run). Use for ANY internet lookup: facts, current info, verifying, search-for-X, what-is-X, latest-on-X. Returns titles+urls+snippets; follow with web_research to read pages.",
        args: {
          type: "object",
          properties: { query: { type: "string", description: "the search query" } },
          required: ["query"],
        },
        async execute(args: any) {
          const q = String(args?.query ?? "").trim();
          if (!q) return "web_search needs a query.";
          return new Promise((resolve) => {
            execFile(VENV, [CORE, "search", q], {
              env: { ...(process.env as any), OSIEN_VISIBLE: "1" },
              timeout: 120000, maxBuffer: 4000000,
            }, (err, out) => resolve(String(out || ("ERR " + (err?.message || ""))).slice(0, 4000)));
          });
        },
      },
      web_learn: {
        description: "Reflex brain learning report: hits, misses, learned patterns per site. Use to find what to upgrade.",
        args: { type: "object", properties: {} },
        async execute() {
          return (await run(["learn"], 20000)).trim().slice(0, 2000);
        },
      },
    },
  };
}) satisfies Plugin;