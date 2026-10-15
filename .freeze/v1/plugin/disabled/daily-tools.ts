import type { Plugin } from "@opencode-ai/plugin"

// DAILY-TOOLS: ultra-usable tools for EVERY person, zero API keys, offline-first.
// Contacts, wifi cards, units, countdowns, colors, readability, bills, names,
// plus real PDF + screenshots via the local headless browser. All run on
// free opencode models; if you own a provider key, opencode uses it automatically.
export default (async () => {
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");
  const { spawn, execSync } = await import("child_process");
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  function findBrowser(): string {
    const cands: string[] = [];
    try {
      const found = execSync(`find "${os.homedir()}/.cache/ms-playwright" \\( -name chrome-headless-shell -o -name headless_shell \\) -type f 2>/dev/null | head -n 3`, { encoding: "utf-8" }).trim().split("\n").filter(Boolean);
      cands.push(...found);
    } catch {}
    cands.push("/usr/bin/brave-browser", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome");
    return cands.find((c) => { try { return fs.existsSync(c); } catch { return false; } }) || "";
  }

  function hexRgb(h: string): [number, number, number] {
    h = h.replace("#", "");
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbHex(r: number, g: number, b: number): string {
    return "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  }
  function rgbHsl(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let h = 0, s = 0; const l = (mx + mn) / 2;
    if (mx !== mn) {
      const d = mx - mn;
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (mx === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  function hslRgb(h: number, s: number, l: number): [number, number, number] {
    h = ((h % 360) + 360) % 360 / 360; s /= 100; l /= 100;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t: number) => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
  }
  function lum(hex: string): number {
    const [r, g, b] = hexRgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  return {
    tool: {
      vcard: {
        description: "Contact file anyone can save: writes a .vcf (works on every phone) from name/phone/email. Use for business cards, sharing contacts.",
        args: { type: "object", properties: { name: { type: "string" }, phone: { type: "string" }, email: { type: "string" }, org: { type: "string" }, dir: { type: "string" } }, required: ["name"] },
        async execute(args: { name: string; phone?: string; email?: string; org?: string; dir?: string }) {
          const v = ["BEGIN:VCARD", "VERSION:3.0", `FN:${args.name}`, args.org ? `ORG:${args.org}` : "", args.phone ? `TEL;TYPE=CELL:${args.phone}` : "", args.email ? `EMAIL:${args.email}` : "", "END:VCARD"].filter(Boolean).join("\n");
          const f = path.join(args.dir || process.cwd(), args.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + ".vcf");
          fs.writeFileSync(f, v);
          return `saved ${f} — send it to any phone, tap to save contact.`;
        }
      },
      wifi_share: {
        description: "Printable WiFi-share card: writes HTML with network name, password, the WIFI: code phones scan, and guest instructions. For cafes, shops, homes, events.",
        args: { type: "object", properties: { ssid: { type: "string" }, password: { type: "string" }, security: { type: "string", description: "WPA|WEP|nopass" }, dir: { type: "string" }, name: { type: "string" } }, required: ["ssid"] },
        async execute(args: { ssid: string; password?: string; security?: string; dir?: string; name?: string }) {
          const sec = args.security || (args.password ? "WPA" : "nopass");
          const code = `WIFI:T:${sec};S:${args.ssid};P:${args.password || ""};;`;
          const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Free WiFi</title></head><body style="font-family:system-ui;text-align:center;max-width:480px;margin:40px auto"><h1>📶 Free WiFi</h1><p style="font-size:1.4rem"><b>${args.ssid}</b></p>${args.password ? `<p>Password: <b style="font-size:1.4rem">${args.password}</b></p>` : `<p>No password — just connect!</p>`}<p style="color:#555">iPhone camera or Android WiFi → scan QR apps read this code:</p><code style="display:block;background:#f1f1f1;padding:12px;border-radius:8px;word-break:break-all">${code}</code><p style="color:#555">Tip: paste the code above into any free QR site once, print it big.</p></body></html>`;
          const f = path.join(args.dir || process.cwd(), (args.name || "wifi") + ".html");
          fs.writeFileSync(f, html);
          return `saved ${f} — open, print, stick on the wall.`;
        }
      },
      unit_convert: {
        description: "Everyday converter: length, weight, temperature, volume, time. Exact, offline. Use for recipes, travel, school, shopping.",
        args: { type: "object", properties: { value: { type: "number" }, from: { type: "string" }, to: { type: "string" } }, required: ["value", "from", "to"] },
        async execute(args: { value: number; from: string; to: string }) {
          const L: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: 0.3048, yd: 0.9144, mi: 1609.344 };
          const W: Record<string, number> = { g: 1, kg: 1000, oz: 28.3495, lb: 453.592 };
          const V: Record<string, number> = { ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588 };
          const T: Record<string, number> = { s: 1, min: 60, hr: 3600, day: 86400 };
          const f = args.from.toLowerCase(), t = args.to.toLowerCase();
          const conv = (tab: Record<string, number>) => (tab[f] !== undefined && tab[t] !== undefined ? args.value * tab[f] / tab[t] : null);
          let r: number | null = conv(L) ?? conv(W) ?? conv(V) ?? conv(T);
          if (r === null) {
            const tmp = (v: number, a: string, b: string) => {
              const c = (x: number) => x;
              const toC = a === "c" ? c(v) : a === "f" ? (v - 32) * 5 / 9 : v - 273.15;
              return b === "c" ? toC : b === "f" ? toC * 9 / 5 + 32 : toC + 273.15;
            };
            if ("cfk".includes(f[0]) && "cfk".includes(t[0]) && f.length <= 2 && t.length <= 2) r = tmp(args.value, f[0], t[0]);
          }
          if (r === null) throw new Error("units must match: mm/cm/m/km/in/ft/yd/mi, g/kg/oz/lb, C/F/K, ml/l/tsp/tbsp/cup, s/min/hr/day");
          const pretty = Math.abs(r) >= 1000 ? r.toFixed(0) : +r.toFixed(4);
          return `${args.value} ${args.from} = ${pretty} ${args.to}`;
        }
      },
      countdown: {
        description: "Days-until any date (birthday, wedding, exam, trip): days left + weekday + fun line. Everyone understands it.",
        args: { type: "object", properties: { date: { type: "string", description: "YYYY-MM-DD" }, label: { type: "string" } }, required: ["date"] },
        async execute(args: { date: string; label?: string }) {
          const target = new Date(args.date + "T00:00:00");
          if (isNaN(+target)) throw new Error("date must be YYYY-MM-DD");
          const days = Math.ceil((+target - Date.now()) / 864e5);
          const name = args.label || "the big day";
          const wd = target.toLocaleDateString("en-GB", { weekday: "long" });
          if (days > 1) return `${days} days until ${name} (${wd}) — plenty of time to prepare.`;
          if (days === 1) return `TOMORROW is ${name} (${wd})! Final preparations today.`;
          if (days === 0) return `TODAY is ${name}! Enjoy every minute. 🎉`;
          return `${name} was ${-days} day(s) ago (${wd}).`;
        }
      },
      color_palette: {
        description: "Designer palette from ONE color: complementary, analogous, triadic + 3 shades. Hex in, brand kit out. For logos, sites, menus, slides.",
        args: { type: "object", properties: { hex: { type: "string" }, } , required: ["hex"] },
        async execute(args: { hex: string }) {
          if (!/^#?[0-9a-fA-F]{3,6}$/.test(args.hex)) throw new Error("hex like #2dd4bf");
          const hex = args.hex.startsWith("#") ? args.hex : "#" + args.hex;
          const [r, g, b] = hexRgb(hex);
          const [h, s, l] = rgbHsl(r, g, b);
          const at = (hh: number, ss = s, ll = l) => rgbHex(...hslRgb(hh, ss, ll));
          return JSON.stringify({
            base: hex,
            complementary: at(h + 180),
            analogous: [at(h - 30), at(h + 30)],
            triadic: [at(h + 120), at(h + 240)],
            shades: [at(h, s, Math.max(8, l - 25)), at(h, s, l), at(h, Math.max(10, s - 30), Math.min(94, l + 25))],
            text_on_base: lum(hex) > 0.35 ? "#111111 (use dark text)" : "#ffffff (use white text)"
          }, null, 2);
        }
      },
      color_contrast: {
        description: "WCAG contrast check for two colors: ratio + AA/AAA pass for text. Agencies need this for every client site.",
        args: { type: "object", properties: { fg: { type: "string" }, bg: { type: "string" } }, required: ["fg", "bg"] },
        async execute(args: { fg: string; bg: string }) {
          const l1 = lum(args.fg), l2 = lum(args.bg);
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const r = +ratio.toFixed(2);
          return `${args.fg} on ${args.bg}: ${r}:1 — normal text ${r >= 4.5 ? "PASS AA ✓" : "FAIL AA ✗"}${r >= 7 ? ", PASS AAA ✓" : ""} · large text ${r >= 3 ? "PASS ✓" : "FAIL ✗"}`;
        }
      },
      readability: {
        description: "Blog readability score (Flesch): grade level + verdict + fix tips. For bloggers, agencies, students.",
        args: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
        async execute(args: { text: string }) {
          const t = args.text.slice(0, 20000);
          const words = t.split(/\s+/).filter(Boolean);
          const sents = t.split(/[.!?]+/).filter((s) => s.trim().split(/\s+/).length > 1);
          const syll = (w: string) => Math.max(1, (w.toLowerCase().replace(/[^a-z]/g, "").match(/[aeiouy]+/g) || []).length - (/e$/.test(w.toLowerCase()) ? 1 : 0));
          const nsyl = words.reduce((a, w) => a + syll(w), 0);
          const wps = words.length / Math.max(1, sents.length), spw = nsyl / Math.max(1, words.length);
          const ease = Math.max(0, Math.min(100, 206.835 - 1.015 * wps - 84.6 * spw));
          const grade = Math.max(1, Math.round(0.39 * wps + 11.8 * spw - 15.59));
          const verdict = ease >= 60 ? "Easy — most readers glide through ✓" : ease >= 30 ? "Okay — shorten sentences, swap long words" : "Hard — split sentences in half, use everyday words";
          return `${Math.round(ease)}/100 (grade ~${grade}): ${verdict} [${words.length} words, ${sents.length} sentences]`;
        }
      },
      split_bill: {
        description: "Split any bill: total + people + tip = who pays what. Restaurants, roommates, trips.",
        args: { type: "object", properties: { total: { type: "number" }, people: { type: "number" }, tip_pct: { type: "number" } }, required: ["total", "people"] },
        async execute(args: { total: number; people: number; tip_pct?: number }) {
          const n = Math.max(1, Math.floor(args.people));
          const tip = args.total * ((args.tip_pct || 0) / 100);
          const each = (args.total + tip) / n;
          return `Bill ${args.total} + ${args.tip_pct || 0}% tip (${tip.toFixed(0)}) = ${(args.total + tip).toFixed(0)} ÷ ${n} = ${each.toFixed(0)} each.`;
        }
      },
      business_name: {
        description: "Business name ideas from keywords: 12 names + URL slugs. For shops, startups, side-hustles.",
        args: { type: "object", properties: { keywords: { type: "string" }, vibe: { type: "string", description: "modern|cozy|luxury|fun" } }, required: ["keywords"] },
        async execute(args: { keywords: string; vibe?: string }) {
          const words = args.keywords.split(/[^a-zA-Z]+/).filter((w) => w.length > 2).map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase());
          if (!words.length) throw new Error("give 1-3 keywords, e.g. 'honey bakery'");
          const A = words[0];
          const tails: Record<string, string[]> = {
            modern: ["ly", "Hub", "Labs", "Co", "& Co", "Studio"], cozy: ["House", "Corner", "Kitchen", "Nest", "Nook", "Table"],
            luxury: ["Maison", "Atelier", "Royale", " Prestige".trim(), "Elite", "Signature"], fun: ["Pop", "Wagon", "Joy", "Boom", "Club", "Shack"]
          };
          const vibe = (args.vibe || "modern").toLowerCase();
          const tail = tails[vibe] || tails.modern;
          const names = [...new Set([...tail.map((t) => `${A} ${t}`), `${A} ${words[1] || "Works"}`, `The ${A} ${words[1] || "Spot"}`, `${words.join("")}`, `${A} Daily`, `Mama ${A}`])].slice(0, 12);
          return names.map((n) => `${n}  →  ${n.toLowerCase().replace(/[^a-z0-9]+/g, "")}.com (check!)`).join("\n");
        }
      },
      page_pdf: {
        description: "Any HTML file → real PDF (A4, backgrounds on) via local headless browser. Invoices, resumes, proposals to PDF with zero clicks.",
        args: { type: "object", properties: { file: { type: "string" }, out: { type: "string" } }, required: ["file"] },
        async execute(args: { file: string; out?: string }) {
          const shell = findBrowser();
          if (!shell) throw new Error("no browser. Run: npx playwright install chromium --only-shell");
          const dbg = 19531;
          const chrome = spawn(shell, ["--headless", "--no-sandbox", "--disable-gpu", `--remote-debugging-port=${dbg}`, "about:blank"], { stdio: "ignore" });
          try {
            await sleep(1500);
            const list: any[] = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
            const page = list.find((t: any) => t.type === "page") || list[0];
            const ws: any = new (globalThis as any).WebSocket(page.webSocketDebuggerUrl);
            await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error("CDP timeout")), 8000); });
            let id = 0; const pending = new Map<number, (v: any) => void>();
            ws.onmessage = (ev: any) => { const m = JSON.parse(String(ev.data)); if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } };
            const send = (method: string, params: any = {}) => new Promise<any>((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ timeout: true }); } }, 10000); });
            await send("Page.enable");
            await send("Page.navigate", { url: "file://" + path.resolve(args.file) });
            await sleep(2000);
            const pdf = await send("Page.printToPDF", { format: "A4", printBackground: true, preferCSSPageSize: true });
            try { ws.close(); } catch {}
            if (!pdf?.result?.data) throw new Error("PDF failed (is the file valid HTML?)");
            const out = args.out || args.file.replace(/\.html?$/i, "") + ".pdf";
            fs.writeFileSync(out, Buffer.from(pdf.result.data, "base64"));
            const kb = Math.round(fs.statSync(out).size / 1024);
            return `PDF saved: ${out} (${kb}KB, A4).`;
          } finally {
            try { chrome.kill("SIGKILL"); } catch {}
          }
        }
      },
      screenshot: {
        description: "Screenshot any local file or URL (1280px) via local headless browser. Before/after proofs, portfolio shots, bug reports.",
        args: { type: "object", properties: { target: { type: "string", description: "file path or https URL" }, out: { type: "string" } }, required: ["target"] },
        async execute(args: { target: string; out?: string }) {
          const shell = findBrowser();
          if (!shell) throw new Error("no browser. Run: npx playwright install chromium --only-shell");
          const url = /^(https?|file):/.test(args.target) ? args.target : "file://" + path.resolve(args.target);
          const dbg = 19532;
          const chrome = spawn(shell, ["--headless", "--no-sandbox", "--disable-gpu", "--window-size=1280,800", `--remote-debugging-port=${dbg}`, "about:blank"], { stdio: "ignore" });
          try {
            await sleep(1500);
            const list: any[] = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
            const page = list.find((t: any) => t.type === "page") || list[0];
            const ws: any = new (globalThis as any).WebSocket(page.webSocketDebuggerUrl);
            await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error("CDP timeout")), 8000); });
            let id = 0; const pending = new Map<number, (v: any) => void>();
            ws.onmessage = (ev: any) => { const m = JSON.parse(String(ev.data)); if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); } };
            const send = (method: string, params: any = {}) => new Promise<any>((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ timeout: true }); } }, 10000); });
            await send("Page.enable");
            await send("Page.navigate", { url });
            await sleep(2500);
            const shot = await send("Page.captureScreenshot", { format: "png" });
            try { ws.close(); } catch {}
            if (!shot?.result?.data) throw new Error("screenshot failed");
            const out = args.out || path.join(process.cwd(), "shot.png");
            fs.writeFileSync(out, Buffer.from(shot.result.data, "base64"));
            return `saved ${out} (${Math.round(fs.statSync(out).size / 1024)}KB).`;
          } finally {
            try { chrome.kill("SIGKILL"); } catch {}
          }
        }
      }
    }
  };
}) satisfies Plugin
