"""page_build module for kts-mcp: rich OGS page kinds. Imported by kts-mcp.py.
Uses @@TOKENS@@ (no %-formatting). Every page carries the kts-mcp origin marker.
"""
import re

MARK = "<!-- KTS-native: generated ONLY via kts-mcp page_build. Semantic elements, OGS locked tokens. -->"

CSS = """:root{
  --bg:#05060F; --bg-deep:#02030A; --bg-top:#0B1030;
  --panel:rgba(10,13,24,.82); --hair:rgba(255,255,255,.09);
  --ink:#EEF2FF; --dim:#9AA3BB; --faint:#5C657F;
  --cyan:#00F0FF; --violet:#7B2FFF; --pink:#FF2BD6;
  --gold:#FFD964; --red:#FF2B2B; --r:20px;
}
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:Rajdhani,system-ui,sans-serif;color:var(--ink);min-height:100vh;
  background:linear-gradient(180deg,var(--bg-top),var(--bg) 46%,var(--bg-deep));}
body::before{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background:repeating-linear-gradient(0deg,rgba(0,240,255,.07) 0 1px,transparent 1px 80px),
  repeating-linear-gradient(90deg,rgba(0,240,255,.07) 0 1px,transparent 1px 80px);}
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:0;
  background:radial-gradient(ellipse at center,transparent 52%,rgba(2,3,10,.42) 100%);}
header,main,footer{position:relative;z-index:1;max-width:1100px;margin:0 auto;padding:2rem 1.25rem}
h1,h2{font-family:Orbitron,Rajdhani,system-ui,sans-serif}
h1{font-size:clamp(2.2rem,6vw,4rem);line-height:1.05}
h2{font-size:clamp(1.3rem,3vw,2rem);margin-bottom:.5rem}
p{line-height:1.6}
.lede{color:var(--dim);font-size:1.12rem;max-width:34rem;margin:.9rem 0 1.4rem}
.micro{font-size:.8rem;color:var(--faint)}
.topbar{display:flex;gap:1.25rem;align-items:center;flex-wrap:wrap;font-size:.8rem;letter-spacing:.22em;text-transform:uppercase;color:var(--dim)}
.topbar img{width:34px;height:34px;border-radius:10px;border:1px solid var(--hair)}
.topbar .spacer{flex:1}
.topbar a{color:var(--dim);text-decoration:none}
.topbar a[aria-current]{color:var(--ink)}
.reward{display:inline-flex;align-items:center;gap:.5rem;font-family:Orbitron,system-ui,sans-serif;font-size:.75rem;letter-spacing:.12em;color:var(--gold);border:1px dashed var(--gold);border-radius:999px;padding:.35rem .9rem;margin-bottom:1rem}
.cta-row{display:flex;gap:.8rem;flex-wrap:wrap}
.btn{display:inline-block;padding:.85rem 1.7rem;border-radius:var(--r);color:var(--bg);background:var(--ink);text-decoration:none;font-weight:700;font-size:.85rem}
.btn.ghost{background:transparent;color:var(--ink);border:1px solid var(--hair)}
.btn.pink{background:linear-gradient(135deg,var(--pink),var(--violet));color:var(--ink)}
.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:2rem;align-items:center;margin-top:1.5rem}
@media(max-width:860px){.hero{grid-template-columns:1fr}}
.hero-media video,.preview-media video{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:var(--r);border:1px solid var(--hair);background:var(--bg-deep);display:block}
.orb{width:74px;height:74px;margin:2.2rem auto;border-radius:50%;
  background:radial-gradient(circle at 50% 50%,var(--ink) 0%,var(--bg) 34%,var(--bg) 100%);
  border:1.6px solid var(--ink);box-shadow:0 0 18px var(--cyan),0 0 46px var(--violet);
  animation:breathe 1.96s ease-in-out infinite}
@keyframes breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:1rem;margin-top:1rem}
.card{background:var(--panel);border:1px solid var(--hair);border-radius:var(--r);padding:1.25rem;margin-top:1rem}
.card h3{font-size:1rem;margin-bottom:.4rem}
.card p{color:var(--dim);font-size:.95rem}
.tag{display:inline-block;font-size:.72rem;letter-spacing:.16em;text-transform:uppercase;color:var(--cyan);margin-bottom:.5rem}
.stars{color:var(--gold);font-size:.85rem}
.hazard{display:flex;gap:.6rem;align-items:center;color:var(--dim);font-size:.9rem;margin-top:1rem}
.hazard i{width:10px;height:10px;border-radius:50%;background:var(--red);box-shadow:0 0 10px var(--red);flex:none}
.swatches{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:1rem}
.swatches span{width:44px;height:44px;border-radius:12px;border:1px solid var(--hair)}
form.notify{display:grid;gap:.7rem;margin-top:1rem;max-width:26rem}
form.notify label{font-size:.82rem;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
form.notify input,form.notify select{background:var(--bg-deep);border:1px solid var(--hair);border-radius:12px;color:var(--ink);padding:.7rem .9rem;font-size:1rem;width:100%}
a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--cyan);outline-offset:3px}
footer small{color:var(--faint)}
@media(prefers-reduced-motion:reduce){.orb{animation:none}html{scroll-behavior:auto}}"""

AMBIENT_JS = """<script>
(function(){var v=document.querySelector('video[data-ambient]');
if(!v)return;
if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches){v.pause();return;}
v.muted=true;v.play().catch(function(){});})();</script>"""

SHELL = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>@@TITLE@@</title>
<meta name="description" content="@@DESC@@">
<meta name="theme-color" content="#0B1030">
@@MARK@@
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Rajdhani:wght@500;600&display=swap" rel="stylesheet">
<style>
@@CSS@@
</style>
</head>
<body>
<header><nav class="topbar" aria-label="Primary">
@@NAV@@
</nav></header>
@@MAIN@@
<footer><small>@@FOOT@@</small></footer>
@@JS@@
</body>
</html>
"""

KINDS = ("hero", "games", "studio", "download", "about")


def _video(video, poster, controls):
    if controls:
        attrs = 'preload="metadata" controls aria-label="Video"'
    else:
        attrs = ('data-ambient src="' + video + '" poster="' + poster + '" muted loop playsinline autoplay '
                 'preload="metadata" aria-label="Silent ambience"')
        if not video:
            return ""
        attrs = attrs.replace('src="" ', "")
    src = f'\n  <source src="{video}" type="video/mp4">' if video else ""
    return f"<video {attrs}>{src}\n</video>"


def build(kind, title, desc, nav, logo, video="", poster=""):
    if kind == "hero":
        main = ("""<main>
<section class="hero">
<div>
<h1>@@H1@@</h1>
<p class="lede">@@LEDE@@</p>
<div class="cta-row"><a class="btn" href="./games.html">Play now</a><a class="btn ghost" href="./studio.html">Studio</a></div>
</div>
<div class="hero-media">
@@VID@@
<p class="micro">Silent ambience · loops · pauses offscreen</p>
</div>
</section>
<div class="orb" aria-hidden="true"></div>
</main>""".replace("@@H1@@", title).replace("@@LEDE@@", desc)
            .replace("@@VID@@", _video(video, poster, False)))
        js = AMBIENT_JS if video else ""
    elif kind == "games":
        main = ("""<main>
<span class="reward">Par stars persist</span>
<h1>@@H1@@</h1>
<p class="lede">@@LEDE@@</p>
<div class="preview-media">@@VID@@</div>
<section class="grid2">
<div class="card"><span class="tag">Game one</span><h3>Lead title</h3><p>Hook line. Edit me.</p></div>
<div class="card"><span class="tag">Game two</span><h3>Lead title</h3><p>Hook line. Edit me.</p></div>
</section>
</main>""".replace("@@H1@@", title).replace("@@LEDE@@", desc).replace("@@VID@@", _video(video, poster, False)))
        js = AMBIENT_JS if video else ""
    elif kind == "studio":
        main = ("""<main>
<h1>@@H1@@</h1>
<p class="lede">@@LEDE@@</p>
<div class="card"><span class="tag">Palette</span><h3>Locked tokens</h3>
<div class="swatches"><span style="background:#05060F"></span><span style="background:#0B1030"></span><span style="background:#EEF2FF"></span><span style="background:#00F0FF"></span><span style="background:#7B2FFF"></span><span style="background:#FF2BD6"></span><span style="background:#FFD964"></span><span style="background:#FF2B2B"></span></div>
</div>
<div class="card"><span class="tag">Craft</span><h3>Rules</h3><p>Restraint plus glow. Gold earned, red hazards.</p></div>
</main>""".replace("@@H1@@", title).replace("@@LEDE@@", desc))
        js = ""
    elif kind == "download":
        main = ("""<main>
<h1>@@H1@@</h1>
<p class="lede">@@LEDE@@</p>
<div class="preview-media">@@VID@@</div>
<div class="card"><span class="tag">Notify</span><h3>Get it at launch</h3>
<form class="notify" action="#" method="get"><label for="em">Email</label><input id="em" name="email" type="email" placeholder="you@example.com"><div class="cta-row"><button class="btn" type="submit">Notify me</button></div></form></div>
</main>""".replace("@@H1@@", title).replace("@@LEDE@@", desc).replace("@@VID@@", _video(video, poster, True)))
        js = ""
    else:  # about
        main = ("""<main>
<h1>@@H1@@</h1>
<p class="lede">@@LEDE@@</p>
<div class="card"><span class="tag">Voice</span><h3>Identity</h3><p>Edit me: what this is.</p></div>
<div class="cta-row" style="margin-top:1.2rem"><a class="btn" href="./index.html">Home</a></div>
</main>""".replace("@@H1@@", title).replace("@@LEDE@@", desc))
        js = ""
    nav_html = f'\n  <img src="{logo}" alt="mark" style="width:34px;height:34px;border-radius:10px">\n  ' + nav if logo else nav
    return (SHELL.replace("@@TITLE@@", title).replace("@@DESC@@", desc).replace("@@MARK@@", MARK)
            .replace("@@CSS@@", CSS).replace("@@NAV@@", nav_html).replace("@@MAIN@@", main)
            .replace("@@FOOT@@", title).replace("@@JS@@", js))
