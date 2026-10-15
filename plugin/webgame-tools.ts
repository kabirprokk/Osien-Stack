import type { Plugin } from "@opencode-ai/plugin"

// WebGame Forge: ultra-fast website-game tools. Zero deps, instant, offline.
// Scaffold perfect games in 1 call, audit for perfection, publish as zip.
const TPL_DIR = `${process.env.HOME}/.config/opencode/game-templates`;
const WEB_TPL_DIR = `${process.env.HOME}/.config/opencode/web-templates`;

export default (async () => {
  const fs = await import("fs");
  const path = await import("path");
  const os = await import("os");

  function ensureDir(d: string) { fs.mkdirSync(d, { recursive: true }); }
  function copyDir(src: string, dst: string) {
    ensureDir(dst);
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, e.name), d = path.join(dst, e.name);
      if (e.isDirectory()) copyDir(s, d);
      else fs.copyFileSync(s, d);
    }
  }

  return {
    tool: {
      game_scaffold: {
        description: "ULTRA-FAST website game scaffold. Copies a perfect starter (vanilla/phaser/three) to target dir in 1 call. Use for ANY new web game.",
        args: {
          type: "object",
          properties: {
            engine: { type: "string", description: "vanilla | phaser | three" },
            name: { type: "string", description: "game folder name, e.g. my-runner" },
            dir: { type: "string", description: "parent dir, default cwd" },
            title: { type: "string", description: "page title" }
          },
          required: ["engine", "name"]
        },
        async execute(args: { engine: string; name: string; dir?: string; title?: string }) {
          const eng = (args.engine || "vanilla").toLowerCase();
          if (!["vanilla", "phaser", "three", "versus"].includes(eng)) throw new Error("engine must be vanilla|phaser|three|versus");
          const slug = String(args.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "web-game";
          const parent = args.dir || process.cwd();
          const dst = path.join(parent, slug);
          const src = path.join(TPL_DIR, eng);
          if (!fs.existsSync(src)) throw new Error(`template missing: ${src}. Restart opencode after update.`);
          if (fs.existsSync(dst)) throw new Error(`exists: ${dst}`);
          copyDir(src, dst);
          // patch title
          try {
            const idx = path.join(dst, "index.html");
            let html = fs.readFileSync(idx, "utf-8");
            html = html.replace(/__GAME_TITLE__/g, args.title || slug);
            fs.writeFileSync(idx, html);
          } catch {}
          return JSON.stringify({ engine: eng, path: dst, title: args.title || slug, next: ["open index.html", "use game_audit for perfection check", "use game_playtest instructions"] });
        }
      },
      game_audit: {
        description: "PERFECTION audit for website games: 60fps loop, resize, touch, sound, pause, no-errors, file-size. Returns PASS/FAIL per item + exact fixes.",
        args: {
          type: "object",
          properties: { dir: { type: "string", description: "game folder, default cwd" } }
        },
        async execute(args: { dir?: string }) {
          const dir = args.dir || process.cwd();
          const idx = path.join(dir, "index.html");
          const report: any = { dir, checks: [] };
          const need = (id: string, pass: boolean, fix: string) => report.checks.push({ id, pass, fix: pass ? "ok" : fix });
          if (!fs.existsSync(idx)) {
            need("has-index", false, "create index.html via game_scaffold");
            report.score = 0; return JSON.stringify(report, null, 2);
          }
          const html = fs.readFileSync(idx, "utf-8");
          need("has-index", true, "");
          need("viewport-meta", /viewport/.test(html), "add <meta name=viewport content='width=device-width,initial-scale=1'>");
          need("requestAnimationFrame", /requestAnimationFrame/.test(html), "use rAF loop with dt clamp (see vanilla template)");
          need("dt-clamp", /dt\s*=\s*Math\.min/.test(html), "clamp dt: dt=Math.min((t-last)/1000,0.05) for tab-switch safety");
          need("resize-handler", /resize/.test(html), "add resize: canvas.width=innerWidth*dpr + ctx.setTransform(dpr,0,0,dpr,0,0)");
          need("touch-controls", /touchstart|pointerdown/.test(html), "add touch/pointer controls (left/right/jump buttons) for mobile");
          need("keyboard", /keydown|keydown/.test(html), "add keyboard: arrows/WASD + space, preventDefault on game keys");
          need("pause", /pause|visibilitychange/.test(html), "add pause on blur + P/Esc + visibilitychange");
          need("webaudio-sound", /AudioContext/.test(html), "add tiny WebAudio beep synth (no assets needed)");
          need("score-ui", /score|Score/.test(html), "add score + best (localStorage) + game-over restart (R/click)");
          need("no-console-error", !/TODO|FIXME|XXX/.test(html), "remove TODOs; test with game_playtest");
          const bytes = fs.statSync(idx).size;
          need("single-file-small", bytes < 200 * 1024, `keep index.html <200KB single-file (now ${(bytes / 1024).toFixed(1)}KB) for instant load`);
          const passed = report.checks.filter((c: any) => c.pass).length;
          report.score = Math.round((passed / report.checks.length) * 100);
          report.perfect = report.score === 100;
          return JSON.stringify(report, null, 2);
        }
      },
      game_playtest: {
        description: "Instant playtest plan: serves folder + playwright screenshot + console-error check commands. Copy-paste ready.",
        args: {
          type: "object",
          properties: {
            dir: { type: "string" },
            port: { type: "number", description: "default 8901" }
          }
        },
        async execute(args: { dir?: string; port?: number }) {
          const dir = args.dir || process.cwd();
          const port = args.port || 8901;
          const cmds = [
            `python3 -m http.server ${port} --directory "${dir}" &`,
            `npx -y @playwright/mcp@latest --headless --isolated &  # or: npx playwright screenshot --viewport-size=1280,720 http://localhost:${port}/ shot.png`,
            `sleep 1 && python3 -c "import webbrowser; webbrowser.open('http://localhost:${port}/')"`,
            `# CHECK: loads <1s, 60fps, no console errors, resize works, touch buttons on mobile width, R restarts after game-over`,
            `# KILL server: pkill -f "http.server ${port}"`
          ];
          return JSON.stringify({ url: `http://localhost:${port}/`, dir, commands: cmds }, null, 2);
        }
      },
      game_publish: {
        description: "Publish prep: zips game folder, reports size + file list + itch.io upload checklist.",
        args: {
          type: "object",
          properties: { dir: { type: "string" }, out: { type: "string", description: "zip path, default <dir>.zip" } }
        },
        async execute(args: { dir?: string; out?: string }) {
          const { execSync } = await import("child_process");
          const dir = args.dir || process.cwd();
          const zip = args.out || `${dir}.zip`;
          const out = execSync(`zip -qr "${zip}" .`, { cwd: dir, encoding: "utf-8" });
          const st = fs.statSync(zip);
          const files = execSync(`unzip -l "${zip}" | tail -n 20`, { encoding: "utf-8" }).slice(0, 2000);
          return JSON.stringify({
            zip, kb: Math.round(st.size / 1024),
            files_preview: files,
            itch_checklist: ["zip contains index.html at root", "viewport 1280x720", "controls listed on page", "mobile touch tested", "no external keys needed"]
          }, null, 2) + `\n${out}`;
        }
      },
      game_add: {
        description: "Add a perfect mini-feature snippet to a vanilla game: player/enemy/particles/sound/mobile-buttons/pause/score/fps. Returns code to paste.",
        args: {
          type: "object",
          properties: { feature: { type: "string", description: "player|enemy|particles|sound|mobile|pause|score|fps" } },
          required: ["feature"]
        },
        async execute(args: { feature: string }) {
          const SNIPPETS: Record<string, string> = {
            player: `// PLAYER: AABB + coyote + jump buffer (paste in script)\nconst P={x:60,y:0,w:28,h:34,vy:0,ground:false,coyote:0,buf:0};\naddEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Space'].includes(e.code))e.preventDefault();keys[e.code]=true;if(e.code==='Space')P.buf=0.12;});\n// in update(dt): P.buf-=dt;P.coyote=P.ground?0.1:P.coyote-dt; if(P.buf>0&&P.coyote>0){P.vy=-520;P.buf=0;P.coyote=0;sfx(660);} P.vy+=1500*dt; P.x+= (keys.ArrowRight?1:0 - (keys.ArrowLeft?1:0))*260*dt; P.y+=P.vy*dt;`,
            enemy: `// ENEMY: pooled chasers with separation (paste)\nconst foes=[];function spawnFoe(x,y){let f=foes.find(f=>!f.on);if(!f){f={};foes.push(f);}Object.assign(f,{x,y,vx:0,vy:0,on:true});}\n// update: for(const f of foes){if(!f.on)continue;const dx=P.x-f.x,dy=P.y-f.y,d=Math.hypot(dx,dy)||1;f.vx+=(dx/d*900-f.vx)*Math.min(1,3*dt);f.x+=f.vx*dt;f.y+=f.vy*dt;if(d<26){gameOver();}}`,
            particles: `// PARTICLES: zero-alloc pool (paste)\nconst parts=[];for(let i=0;i<120;i++)parts.push({on:false});function burst(x,y,n=16,c='#ffd54a'){let k=0;for(const p of parts){if(p.on)continue;Object.assign(p,{on:true,x,y,vx:(Math.random()-0.5)*420,vy:-Math.random()*380,life:0.6,c});if(++k>=n)break;}}\n// update+draw each: p.life-=dt;p.vy+=900*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.life<=0)p.on=false;`,
            sound: `// SOUND: tiny WebAudio synth, no assets (paste)\nlet AC=null;function sfx(f=440,d=0.08,type='square',v=0.15){try{AC=AC||new (window.AudioContext||window.webkitAudioContext)();const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(AC.destination);o.start();g.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+d);o.stop(AC.currentTime+d);}catch{}}`,
            mobile: `<!-- MOBILE: touch buttons (paste in body) -->\n<div id=touch style="position:fixed;inset:auto 0 12px 0;display:flex;justify-content:space-between;padding:0 14px;touch-action:none">\n<button data-k=ArrowLeft style="font-size:28px;padding:14px 22px">◀</button>\n<button data-k=Space style="font-size:28px;padding:14px 22px">⤒</button>\n<button data-k=ArrowRight style="font-size:28px;padding:14px 22px">▶</button></div>\n<script>document.querySelectorAll('#touch button').forEach(b=>{const k=b.dataset.k;const on=e=>{e.preventDefault();keys[k]=true;if(k==='Space')P.buf=0.12;};const off=e=>{e.preventDefault();keys[k]=false;};b.addEventListener('pointerdown',on);b.addEventListener('pointerup',off);b.addEventListener('pointercancel',off);});</script>`,
            pause: `// PAUSE: P/Esc + auto on hidden tab (paste)\nlet paused=false;addEventListener('keydown',e=>{if(e.code==='KeyP'||e.code==='Escape')paused=!paused;});document.addEventListener('visibilitychange',()=>{if(document.hidden)paused=true;});\n// in loop: if(paused){drawPaused();requestAnimationFrame(loop);return;}`,
            score: `// SCORE + BEST (paste)\nlet score=0,best=+(localStorage.getItem('wgf-best')||0);function addScore(n){score+=n;if(score>best){best=score;localStorage.setItem('wgf-best',best);}}\n// draw: ctx.fillText('SCORE '+score+'  BEST '+best,12,20);`,
            fps: `// FPS METER: shows live fps + warns if <50 (paste)\nlet _ft=0,_fc=0,_fps=60;function fpsTick(t){_fc++;if(t-_ft>=500){_fps=Math.round(_fc*1000/(t-_ft));_ft=t;_fc=0;}}\n// in loop(t): fpsTick(t);\n// in draw: ctx.fillStyle=_fps>=50?'#4ade80':'#ff5a5a';ctx.font='bold 13px system-ui';ctx.fillText(_fps+' FPS',W-70,20);`
          };
          const s = SNIPPETS[args.feature];
          if (!s) throw new Error("feature must be player|enemy|particles|sound|mobile|pause|score|fps");
          return s;
        }
      },
      music_maker: {
        description: "Generate a chiptune music loop (WebAudio, zero assets): bass + lead + hats sequencer. Returns JS to paste. Mood: adventure|boss|chill|arcade.",
        args: {
          type: "object",
          properties: {
            mood: { type: "string", description: "adventure|boss|chill|arcade" },
            bpm: { type: "number", description: "80-180, default per mood" }
          }
        },
        async execute(args: { mood?: string; bpm?: number }) {
          const MOODS: Record<string, { bpm: number; bass: number[]; lead: number[]; wave: string }> = {
            adventure: { bpm: 132, bass: [110, 0, 130.8, 0, 98, 0, 146.8, 0], lead: [440, 523.3, 659.3, 523.3, 587.3, 659.3, 783.9, 659.3], wave: "square" },
            boss: { bpm: 150, bass: [82.4, 82.4, 98, 73.4, 82.4, 110, 98, 73.4], lead: [329.6, 311.1, 329.6, 246.9, 329.6, 392, 311.1, 246.9], wave: "sawtooth" },
            chill: { bpm: 92, bass: [130.8, 0, 0, 0, 98, 0, 0, 0], lead: [523.3, 0, 587.3, 659.3, 0, 587.3, 523.3, 0], wave: "sine" },
            arcade: { bpm: 140, bass: [146.8, 146.8, 0, 146.8, 0, 174.6, 0, 196], lead: [587.3, 783.9, 880, 783.9, 587.3, 659.3, 783.9, 1046.5], wave: "square" }
          };
          const m = MOODS[args.mood || "adventure"] || MOODS.adventure;
          const bpm = Math.min(Math.max(args.bpm || m.bpm, 80), 180);
          return `// MUSIC: ${args.mood || "adventure"} @${bpm}bpm, zero assets (paste once, call startMusic() on first input)\nlet _mu={on:false,step:0,timer:null};\nconst _BASS=[${m.bass.join(",")}],_LEAD=[${m.lead.join(",")}];\nfunction _note(f,t,d,type,v){try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();if(AC.state==='suspended')AC.resume();const o=AC.createOscillator(),g=AC.createGain();o.type=type;o.frequency.value=f;g.gain.value=v;o.connect(g);g.connect(AC.destination);o.start(t);g.gain.exponentialRampToValueAtTime(0.001,t+d);o.stop(t+d);}catch{}}\nfunction startMusic(){if(_mu.on)return;_mu.on=true;const spb=60/${bpm}/2;const tick=()=>{if(!_mu.on)return;const t=AC?AC.currentTime:0;const i=_mu.step%8;if(_BASS[i])_note(_BASS[i],t,spb*0.9,'triangle',0.20);if(_LEAD[i])_note(_LEAD[i],t,spb*0.45,'${m.wave}',0.08);if(_mu.step%2===0)_note(6000,t,0.03,'square',0.03);_mu.step++;_mu.timer=setTimeout(tick,spb*1000);};tick();}\nfunction stopMusic(){_mu.on=false;clearTimeout(_mu.timer);}\naddEventListener('pointerdown',()=>startMusic(),{once:true});addEventListener('keydown',()=>startMusic(),{once:true});`;
        }
      },
      sprite_maker: {
        description: "Generate a crisp SVG game sprite (player/enemy/coin/star/heart/ghost/ship) with custom colors. Writes file, returns path + <img> tag. Zero deps, tiny files.",
        args: {
          type: "object",
          properties: {
            kind: { type: "string", description: "player|enemy|coin|star|heart|ghost|ship" },
            color: { type: "string", description: "hex, e.g. #ffd54a" },
            color2: { type: "string", description: "secondary hex" },
            dir: { type: "string", description: "output dir, default cwd" },
            name: { type: "string", description: "filename without ext" }
          },
          required: ["kind"]
        },
        async execute(args: { kind: string; color?: string; color2?: string; dir?: string; name?: string }) {
          const c = args.color || "#ffd54a", c2 = args.color2 || "#0b1020";
          const SHAPES: Record<string, string> = {
            player: `<rect x="6" y="2" width="20" height="28" rx="6" fill="${c}"/><rect x="10" y="9" width="4" height="5" fill="${c2}"/><rect x="18" y="9" width="4" height="5" fill="${c2}"/><rect x="11" y="20" width="10" height="3" rx="1.5" fill="${c2}"/>`,
            enemy: `<circle cx="16" cy="16" r="13" fill="${c}"/><circle cx="11" cy="13" r="3" fill="${c2}"/><circle cx="21" cy="13" r="3" fill="${c2}"/><path d="M8 22 Q16 17 24 22" stroke="${c2}" stroke-width="2.5" fill="none"/>`,
            coin: `<ellipse cx="16" cy="16" rx="11" ry="13" fill="${c}"/><ellipse cx="16" cy="16" rx="6" ry="8" fill="none" stroke="${c2}" stroke-width="2.5"/>`,
            star: `<path d="M16 2 L20 12 L30 12 L22 18 L25 28 L16 22 L7 28 L10 18 L2 12 L12 12 Z" fill="${c}" stroke="${c2}" stroke-width="1.5"/>`,
            heart: `<path d="M16 28 C8 20 3 15 3 10 C3 5 7 3 11 3 C13.5 3 15.5 4.5 16 6 C16.5 4.5 18.5 3 21 3 C25 3 29 5 29 10 C29 15 24 20 16 28 Z" fill="${c}"/>`,
            ghost: `<path d="M6 28 L6 14 C6 7 10 3 16 3 C22 3 26 7 26 14 L26 28 L22 24 L19 28 L16 24 L13 28 L10 24 Z" fill="${c}"/><circle cx="12" cy="13" r="2.5" fill="${c2}"/><circle cx="20" cy="13" r="2.5" fill="${c2}"/>`,
            ship: `<path d="M16 2 L24 26 L16 21 L8 26 Z" fill="${c}"/><circle cx="16" cy="12" r="3" fill="${c2}"/><rect x="14.5" y="21" width="3" height="6" fill="${c2}"/>`
          };
          const body = SHAPES[args.kind];
          if (!body) throw new Error("kind must be player|enemy|coin|star|heart|ghost|ship");
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="64" height="64">${body}</svg>`;
          const dir = args.dir || process.cwd();
          const file = path.join(dir, (args.name || args.kind) + ".svg");
          fs.writeFileSync(file, svg);
          return JSON.stringify({ file, bytes: svg.length, img_tag: `<img src="${path.basename(file)}" width="64" height="64">`, canvas_use: `const img=new Image();img.src='${path.basename(file)}'; // draw: ctx.drawImage(img,x,y,32,32);` });
        }
      },
      db_query: {
        description: "Run SQLite queries via python3 stdlib (no MCP needed): SELECT/INSERT/CREATE on any .db file. Fast local data work.",
        args: {
          type: "object",
          properties: {
            db: { type: "string", description: "db path" },
            sql: { type: "string", description: "one statement" }
          },
          required: ["db", "sql"]
        },
        async execute(args: { db: string; sql: string }) {
          const { execFileSync } = await import("child_process");
          const py = `import sqlite3,json,sys;con=sqlite3.connect(sys.argv[1]);con.row_factory=sqlite3.Row;cur=con.cursor();cur.execute(sys.argv[2]);rows=[dict(r) for r in cur.fetchall()] if cur.description else [];con.commit();print(json.dumps({"rows":rows[:100],"count":len(rows)}));con.close()`;
          const out = execFileSync("python3", ["-c", py, args.db, args.sql], { encoding: "utf-8", timeout: 15000 });
          return out.slice(0, 8000);
        }
      },
      game_deploy: {
        description: "Deploy a finished game: GitHub Pages (gh-pages branch) or itch.io zip checklist. Returns exact commands.",
        args: {
          type: "object",
          properties: {
            dir: { type: "string" },
            target: { type: "string", description: "gh-pages|itch" }
          },
          required: ["target"]
        },
        async execute(args: { dir?: string; target?: string }) {
          const dir = args.dir || process.cwd();
          if (args.target === "gh-pages") {
            return JSON.stringify({ target: "gh-pages", dir, commands: [`cd "${dir}" && git init 2>/dev/null; git add -A && git commit -m "playable game" 2>/dev/null`, `git branch -D gh-pages 2>/dev/null; git checkout -b gh-pages`, `git push -u origin gh-pages --force`, `# Play at: https://<user>.github.io/<repo>/`] }, null, 2);
          }
          return JSON.stringify({ target: "itch", dir, commands: [`cd "${dir}" && zip -qr ../game.zip index.html *.svg *.png 2>/dev/null`, `# itch.io → New project → Kind: HTML → Upload game.zip → check "This file will be played in the browser" → viewport 960x540`] }, null, 2);
        }
      },
      game_bot: {
        description: "AUTO-PLAYTEST BOT: launches the game in headless Chromium, PLAYS it with real keyboard input (holds Right, taps Space, restarts on game-over), samples HUD score, captures console errors + screenshot, detects stuck. The bot actually plays - beyond screenshots.",
        args: {
          type: "object",
          properties: {
            dir: { type: "string" },
            seconds: { type: "number", description: "5-120, default 20" },
            port: { type: "number", description: "default 9331" }
          }
        },
        async execute(args: { dir?: string; seconds?: number; port?: number }) {
          const { spawn, execSync } = await import("child_process");
          const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
          const dir = args.dir || process.cwd();
          const seconds = Math.min(Math.max(args.seconds || 20, 5), 120);
          const port = args.port || 9331;
          const dbg = port + 10000;
          const srv = spawn("python3", ["-m", "http.server", String(port), "--directory", dir], { stdio: "ignore" });
          await sleep(1200);
          const cands: string[] = [];
          try {
            const found = execSync(`find "${os.homedir()}/.cache/ms-playwright" \\( -name chrome-headless-shell -o -name headless_shell \\) -type f 2>/dev/null | head -n 3`, { encoding: "utf-8" }).trim().split("\n").filter(Boolean);
            cands.push(...found);
          } catch {}
          cands.push("/usr/bin/brave-browser", "/usr/bin/chromium", "/usr/bin/chromium-browser");
          const shell = cands.find((c) => { try { return fs.existsSync(c); } catch { return false; } }) || "";
          if (!shell) { try { srv.kill(); } catch {} throw new Error("no browser found. Run: npx playwright install chromium --only-shell"); }
          const chrome = spawn(shell, ["--headless", "--no-sandbox", "--disable-gpu", "--window-size=1280,720", `--remote-debugging-port=${dbg}`, "about:blank"], { stdio: "ignore" });
          const killAll = () => { try { chrome.kill("SIGKILL"); } catch {} try { srv.kill("SIGKILL"); } catch {} };
          try {
            await sleep(1500);
            const list: any[] = await (await fetch(`http://127.0.0.1:${dbg}/json/list`)).json();
            const page = list.find((t: any) => t.type === "page") || list[0];
            const ws: any = new (globalThis as any).WebSocket(page.webSocketDebuggerUrl);
            await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; setTimeout(() => rej(new Error("CDP connect timeout")), 8000); });
            let id = 0; const pending = new Map<number, (v: any) => void>(); const events: any[] = [];
            ws.onmessage = (ev: any) => {
              const m = JSON.parse(String(ev.data));
              if (m.id && pending.has(m.id)) { pending.get(m.id)!(m); pending.delete(m.id); }
              else if (m.method) events.push(m);
            };
            const send = (method: string, params: any = {}) => new Promise<any>((res) => {
              const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params }));
              setTimeout(() => { if (pending.has(i)) { pending.delete(i); res({ timeout: true }); } }, 6000);
            });
            const VK: Record<string, number> = { ArrowLeft: 37, ArrowRight: 39, ArrowUp: 38, ArrowDown: 40, Space: 32, KeyR: 82, KeyP: 80, KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68 };
            const key = (type: string, code: string) => send("Input.dispatchKeyEvent", { type, code, key: code.startsWith("Arrow") ? code : code === "Space" ? " " : code, windowsVirtualKeyCode: VK[code] || 0 });
            await send("Page.enable"); await send("Runtime.enable"); await send("Log.enable");
            await send("Page.navigate", { url: `http://localhost:${port}/` });
            await sleep(3000);
            const hudSamples: string[] = []; let restarts = 0;
            const hud = async () => {
              const r = await send("Runtime.evaluate", { expression: `(document.getElementById('hud')?document.getElementById('hud').textContent:'')+' ||| '+(document.getElementById('msg')?document.getElementById('msg').style.display:'')`, returnByValue: true });
              return String(r?.result?.result?.value ?? "");
            };
            await key("keyDown", "ArrowRight");
            const t0 = Date.now(); let n = 0;
            while ((Date.now() - t0) / 1000 < seconds) {
              n++;
              if (n % 5 === 0) await key("keyDown", "Space"), await sleep(120), await key("keyUp", "Space");
              if (n % 7 === 0) { await key("keyUp", "ArrowRight"); await key("keyDown", "ArrowLeft"); await sleep(500); await key("keyUp", "ArrowLeft"); await key("keyDown", "ArrowRight"); }
              const h = await hud();
              if (n % 2 === 0) hudSamples.push(h);
              if (/GAME OVER|WINS/i.test(h)) { restarts++; await key("keyDown", "KeyR"); await sleep(150); await key("keyUp", "KeyR"); await sleep(800); }
              await sleep(400);
            }
            await key("keyUp", "ArrowRight");
            const errors: string[] = [];
            for (const e of events) {
              if (e.method === "Runtime.consoleAPICalled" && e.params?.type === "error") errors.push("console: " + JSON.stringify(e.params.args?.map((a: any) => a.value ?? a.description).slice(0, 3)).slice(0, 300));
              if (e.method === "Runtime.exceptionThrown") errors.push("exception: " + String(e.params?.exceptionDetails?.text || e.params?.exceptionDetails?.exception?.description || "?").slice(0, 300));
              if (e.method === "Log.entryAdded" && e.params?.entry?.level === "error") errors.push("log: " + String(e.params.entry.text).slice(0, 300));
            }
            const shot = await send("Page.captureScreenshot", { format: "png" });
            const shotFile = path.join(dir, "bot-shot.png");
            if (shot?.result?.data) fs.writeFileSync(shotFile, Buffer.from(shot.result.data, "base64"));
            try { ws.close(); } catch {}
            const uniq = new Set(hudSamples).size;
            const stuck = hudSamples.length > 3 && uniq <= 1;
            return JSON.stringify({
              url: `http://localhost:${port}/`, played_s: seconds, restarts,
              hud_first: hudSamples[0] || "", hud_last: hudSamples[hudSamples.length - 1] || "",
              hud_changes: uniq, stuck: stuck ? "POSSIBLE STUCK (HUD never changed)" : "MOVING (HUD updated)",
              errors: errors.slice(0, 10), error_count: errors.length,
              screenshot: shot?.result?.data ? shotFile : "capture failed",
              verdict: errors.length ? "FAIL: console errors - fix before shipping" : stuck ? "WARN: bot saw no progress - check controls/game-over flow" : restarts > 5 ? "HARD: bot died a lot - tune difficulty" : "PLAYABLE: bot played, scored, no errors"
            }, null, 2);
          } finally {
            killAll();
          }
        }
      },
      sfx_pack: {
        description: "Full retro SFX pack (jump/coin/hit/boom/laser/power/click/win/lose/step) as WebAudio code, zero assets. One paste, tiny size. Use with sfx() base or standalone.",
        args: { type: "object", properties: { prefix: { type: "string", description: "function prefix, default sfx" } } },
        async execute(args: { prefix?: string }) {
          const p = (args.prefix || "sfx").replace(/[^a-zA-Z_]/g, "") || "sfx";
          return `// SFX PACK (paste once, call ${p}_jump() etc. Needs AC global from sound snippet)\nconst ${p}_jump=()=>sfx(520,0.12,'square',0.14),${p}_coin=()=>{sfx(988,0.07,'square',0.12);setTimeout(()=>sfx(1319,0.12,'square',0.12),70);},${p}_hit=()=>sfx(160,0.2,'sawtooth',0.16),${p}_boom=()=>{sfx(90,0.4,'sawtooth',0.2);setTimeout(()=>sfx(60,0.5,'triangle',0.2),80);},${p}_laser=()=>{try{AC=AC||new(window.AudioContext||window.webkitAudioContext)();const o=AC.createOscillator(),g=AC.createGain();o.type='sawtooth';o.frequency.setValueAtTime(1200,AC.currentTime);o.frequency.exponentialRampToValueAtTime(200,AC.currentTime+0.15);g.gain.value=0.12;o.connect(g);g.connect(AC.destination);o.start();o.stop(AC.currentTime+0.16);}catch{}},${p}_power=()=>{[523,659,784,1047].forEach((f,i)=>setTimeout(()=>sfx(f,0.1,'square',0.12),i*80));},${p}_click=()=>sfx(800,0.04,'square',0.08),${p}_win=()=>{[523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>sfx(f,0.14,'triangle',0.14),i*110));},${p}_lose=()=>{[400,350,300,200].forEach((f,i)=>setTimeout(()=>sfx(f,0.18,'sawtooth',0.12),i*140));},${p}_step=()=>sfx(220+Math.random()*60,0.04,'triangle',0.05);`;
        }
      },
      game_stats: {
        description: "Zero-key game analytics snippet (plays, total time, best, per-day) in localStorage + report function. No PostHog key needed.",
        args: { type: "object", properties: {} },
        async execute() {
          return `// STATS: offline analytics (paste once)\nconst STATS=Object.assign({plays:0,secs:0,best:0,byDay:{}},JSON.parse(localStorage.getItem('wgf-stats')||'{}'));\nSTATS.plays++;const _day=new Date().toISOString().slice(0,10);STATS.byDay[_day]=(STATS.byDay[_day]||0)+1;\nconst _t0=Date.now();addEventListener('beforeunload',()=>{STATS.secs+=Math.round((Date.now()-_t0)/1000);STATS.best=Math.max(STATS.best,Math.floor(typeof score!=='undefined'?score:0));localStorage.setItem('wgf-stats',JSON.stringify(STATS));});\nfunction statsReport(){return 'plays '+STATS.plays+' · total '+STATS.secs+'s · best '+STATS.best+' · today '+STATS.byDay[_day];}`;
        }
      },
      web_scaffold: {
        description: "ULTRA-FAST website scaffold: perfect single-file starter (landing/blog/dashboard/portfolio) or zero-dep Node API. 1 call, SEO+responsive baked in.",
        args: {
          type: "object",
          properties: {
            kind: { type: "string", description: "landing|blog|dashboard|portfolio|api" },
            name: { type: "string" },
            dir: { type: "string" },
            title: { type: "string" }
          },
          required: ["kind", "name"]
        },
        async execute(args: { kind: string; name: string; dir?: string; title?: string }) {
          const k = (args.kind || "landing").toLowerCase();
          if (!["landing", "blog", "dashboard", "portfolio", "api", "resume", "menu", "invite", "links", "invoice", "proposal"].includes(k)) throw new Error("kind must be landing|blog|dashboard|portfolio|api|resume|menu|invite|links|invoice|proposal");
          const slug = String(args.name).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "web-site";
          const dst = path.join(args.dir || process.cwd(), slug);
          const src = path.join(WEB_TPL_DIR, k);
          if (!fs.existsSync(src)) throw new Error(`template missing: ${src}`);
          if (fs.existsSync(dst)) throw new Error(`exists: ${dst}`);
          const copyDir = (s: string, d: string) => {
            fs.mkdirSync(d, { recursive: true });
            for (const e of fs.readdirSync(s, { withFileTypes: true })) {
              const a = path.join(s, e.name), b = path.join(d, e.name);
              if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
            }
          };
          copyDir(src, dst);
          try {
            for (const f of ["index.html", "server.js"]) {
              const p = path.join(dst, f);
              if (fs.existsSync(p)) fs.writeFileSync(p, fs.readFileSync(p, "utf-8").replace(/__SITE_TITLE__/g, args.title || slug));
            }
          } catch {}
          return JSON.stringify({ kind: k, path: dst, next: ["open index.html", "web_audit for perfection", "game_deploy gh-pages for free URL"] });
        }
      },
      web_audit: {
        description: "PERFECTION audit for websites: SEO meta, semantics, a11y basics, responsive, size, no-errors. Score/100 + exact fixes.",
        args: { type: "object", properties: { dir: { type: "string" } } },
        async execute(args: { dir?: string }) {
          const dir = args.dir || process.cwd();
          const idx = path.join(dir, "index.html");
          const report: any = { dir, checks: [] };
          const need = (id: string, pass: boolean, fix: string) => report.checks.push({ id, pass, fix: pass ? "ok" : fix });
          if (!fs.existsSync(idx)) { need("has-index", false, "create index.html via web_scaffold"); report.score = 0; return JSON.stringify(report, null, 2); }
          const html = fs.readFileSync(idx, "utf-8");
          need("doctype", /^<!DOCTYPE html>/i.test(html.trim()), "start file with <!DOCTYPE html>");
          need("viewport-meta", /viewport/.test(html), "add viewport meta for mobile");
          need("title", /<title>[^<]{5,}<\/title>/.test(html), "add descriptive <title> (5+ chars, no placeholder)");
          need("meta-description", /meta name="description"/.test(html), 'add <meta name="description" content="..."> for SEO');
          need("h1", /<h1/.test(html), "exactly one <h1> per page");
          need("semantic", /<header|<main|<footer/.test(html), "use <header><main><footer> landmarks");
          need("img-alt", !/<img(?![^>]*alt=)/.test(html), "every <img> needs alt text");
          need("responsive", /media ?\(|clamp\(|max-width: ?100%/.test(html), "add fluid CSS: clamp() + @media + img{max-width:100%}");
          need("lang", /<html lang=/.test(html), 'add lang: <html lang="en">');
          const bytes = fs.statSync(idx).size;
          need("fast-load", bytes < 200 * 1024, `keep single-file <200KB (now ${(bytes / 1024).toFixed(1)}KB)`);
          need("no-todo", !/TODO|FIXME|lorem ipsum/i.test(html), "remove TODOs and lorem ipsum");
          const passed = report.checks.filter((c: any) => c.pass).length;
          report.score = Math.round((passed / report.checks.length) * 100);
          report.perfect = report.score === 100;
          return JSON.stringify(report, null, 2);
        }
      },
      brand_kit: {
        description: "Agency brand kit in 1 call: palette, fonts, CSS variables file + SVG logo. Writes brand.css + logo.svg. Styles: modern|playful|luxury|eco|retro.",
        args: {
          type: "object",
          properties: {
            name: { type: "string", description: "business name" },
            style: { type: "string", description: "modern|playful|luxury|eco|retro" },
            dir: { type: "string" }
          },
          required: ["name"]
        },
        async execute(args: { name: string; style?: string; dir?: string }) {
          const KITS: Record<string, { bg: string; card: string; acc: string; txt: string; mut: string; font: string; shape: string }> = {
            modern: { bg: "#0b1020", card: "#141b33", acc: "#2dd4bf", txt: "#ffffff", mut: "#9aa3c7", font: "system-ui", shape: "rounded" },
            playful: { bg: "#fff7ed", card: "#ffedd5", acc: "#f97316", txt: "#431407", mut: "#9a3412", font: "'Comic Sans MS', system-ui", shape: "blob" },
            luxury: { bg: "#0c0a09", card: "#1c1917", acc: "#d4af37", txt: "#fafaf9", mut: "#a8a29e", font: "Georgia, serif", shape: "diamond" },
            eco: { bg: "#f0fdf4", card: "#dcfce7", acc: "#16a34a", txt: "#052e16", mut: "#4d7c0f", font: "system-ui", shape: "leaf" },
            retro: { bg: "#1a0b2e", card: "#2d1b4e", acc: "#ff6ad5", txt: "#fff7ed", mut: "#c4b5fd", font: "'Courier New', monospace", shape: "badge" }
          };
          const s = (args.style || "modern").toLowerCase();
          const kit = KITS[s] || KITS.modern;
          const initial = args.name.trim().charAt(0).toUpperCase();
          const logos: Record<string, string> = {
            rounded: `<rect x="4" y="4" width="56" height="56" rx="16" fill="${kit.acc}"/><text x="32" y="44" font-size="32" font-family="${kit.font}" font-weight="800" text-anchor="middle" fill="${kit.bg}">${initial}</text>`,
            blob: `<path d="M32 4 C48 4 60 16 60 32 C60 48 48 60 32 60 C16 60 4 48 4 32 C4 16 16 4 32 4 Z" fill="${kit.acc}"/><text x="32" y="43" font-size="30" font-family="${kit.font}" font-weight="800" text-anchor="middle" fill="${kit.bg}">${initial}</text>`,
            diamond: `<rect x="12" y="12" width="40" height="40" transform="rotate(45 32 32)" fill="none" stroke="${kit.acc}" stroke-width="4"/><text x="32" y="42" font-size="26" font-family="${kit.font}" text-anchor="middle" fill="${kit.acc}">${initial}</text>`,
            leaf: `<path d="M32 4 C50 14 56 32 32 60 C8 32 14 14 32 4 Z" fill="${kit.acc}"/><text x="32" y="40" font-size="24" font-family="${kit.font}" font-weight="800" text-anchor="middle" fill="${kit.bg}">${initial}</text>`,
            badge: `<circle cx="32" cy="32" r="26" fill="none" stroke="${kit.acc}" stroke-width="4"/><circle cx="32" cy="32" r="18" fill="${kit.acc}"/><text x="32" y="40" font-size="22" font-family="${kit.font}" font-weight="800" text-anchor="middle" fill="${kit.bg}">${initial}</text>`
          };
          const dir = args.dir || process.cwd();
          const css = `:root{\n  --bg:${kit.bg}; --card:${kit.card}; --acc:${kit.acc};\n  --txt:${kit.txt}; --mut:${kit.mut}; --font:${kit.font};\n}\n/* usage: body{background:var(--bg);color:var(--txt);font-family:var(--font)} */\n`;
          const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="128" height="128">${logos[kit.shape]}</svg>`;
          fs.writeFileSync(path.join(dir, "brand.css"), css);
          fs.writeFileSync(path.join(dir, "logo.svg"), svg);
          return JSON.stringify({ style: s, files: ["brand.css", "logo.svg"], palette: { bg: kit.bg, card: kit.card, accent: kit.acc, text: kit.txt, muted: kit.mut }, font: kit.font, usage: `<link rel="stylesheet" href="brand.css"> + <img src="logo.svg" width="64">` });
        }
      }
    }
  };
}) satisfies Plugin
