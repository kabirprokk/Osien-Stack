#!/usr/bin/env python3
"""Layout atlas generator: 10 real-world archetypes, self-contained, varied layouts."""
import os

BASE = os.path.expanduser("~/Sites/layout-atlas")
CSS = ("*{box-sizing:border-box;margin:0}body{font-family:system-ui;background:#101014;color:#e8e6e1}"
       "header,main,footer{max-width:1000px;margin:0 auto;padding:1rem}nav{display:flex;gap:1rem}"
       "nav a{color:#8f8f9a}.btn{background:#d4af7a;color:#111;padding:.6rem 1.2rem;border-radius:10px;border:0}"
       ".grid{display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}"
       ".card{background:#16161d;border:1px solid #2e2e3c;border-radius:12px;padding:1rem}")

PAGES = {
    "01-landing": ("Landing", "<header><nav><strong>Acme</strong><a href='#'>Features</a><a href='#'>Pricing</a><button>Sign up</button></nav></header><main><h1>Ship faster today</h1><p>One line value prop.</p><button class='btn'>Start free</button><div class='grid'><div class='card'><h3>Fast</h3></div><div class='card'><h3>Safe</h3></div><div class='card'><h3>Cheap</h3></div></div></main><footer><small>© Acme</small></footer>"),
    "02-blog": ("Blog", "<header><nav><strong>Notes</strong><a href='#'>Archive</a><a href='#'>About</a></nav></header><main><article><h1>Post title</h1><p>Paragraph one.</p><p>Paragraph two.</p></article><article><h1>Older post</h1><p>Excerpt.</p><a href='#'>Read more</a></article></main><footer><form><input placeholder='Search posts'><button>Go</button></form></footer>"),
    "03-dashboard": ("Dashboard", "<header><nav><strong>Dash</strong><a href='#'>Overview</a><a href='#'>Reports</a><button>Export</button></nav></header><main><div class='grid'><div class='card'><h3>Revenue</h3><b>$12k</b></div><div class='card'><h3>Users</h3><b>8k</b></div></div><table><tr><th>Name</th><th>Status</th></tr><tr><td>A</td><td>Active</td></tr></table></main>"),
    "04-portfolio": ("Portfolio", "<header><nav><strong>Jane</strong><a href='#'>Work</a><a href='#'>Contact</a></nav></header><main><h1>Jane makes things</h1><div class='grid'><div class='card'><img alt='Piece one'><h3>Piece one</h3></div><div class='card'><img alt='Piece two'><h3>Piece two</h3></div></div><a href='#'>Hire me</a></main>"),
    "05-shop": ("Shop", "<header><nav><strong>Store</strong><form><input placeholder='Search products'><button>Go</button></form><a href='#'>Cart (2)</a></nav></header><main><div class='grid'><div class='card'><h3>Shoes</h3><b>$59</b><button>Add</button></div><div class='card'><h3>Hat</h3><b>$19</b><button>Add</button></div></div></main>"),
    "06-docs": ("Docs", "<header><nav><strong>Docs</strong><form><input placeholder='Search docs'><button>Go</button></form></nav></header><main><aside><a href='#'>Install</a><a href='#'>Guide</a><a href='#'>API</a></aside><article><h1>Install</h1><pre>npm i x</pre><p>Steps here.</p></article></main>"),
    "07-login": ("Login", "<main><h1>Welcome back</h1><form><label>Email</label><input type='email' placeholder='you@x.com'><label>Password</label><input type='password'><button>Log in</button></form><a href='#'>Forgot?</a></main>"),
    "08-checkout": ("Checkout", "<main><h1>Checkout</h1><form><label>Name</label><input><label>Card</label><input><label><input type='checkbox'> Save</label><button>Pay $78</button></form></main>"),
    "09-social": ("Feed", "<header><nav><strong>Loop</strong><a href='#'>Home</a><a href='#'>Alerts</a><a href='#'>Me</a></nav></header><main><article><h3>Ada</h3><p>Post text.</p><button>Like</button><button>Reply</button></article><article><h3>Bob</h3><p>Other post.</p><button>Like</button><button>Reply</button></article></main>"),
    "10-settings": ("Settings", "<header><nav><strong>App</strong><a href='#'>Back</a></nav></header><main><h1>Settings</h1><form><label><input type='checkbox'> Notify me</label><label>Theme</label><select><option>Dark</option><option>Light</option></select><button>Save</button></form></main>"),
}

os.makedirs(BASE, exist_ok=True)
index = ["<h1>Layout Atlas — 10 archetypes</h1><ul>"]
for slug, (title, body) in PAGES.items():
    html = ("<!DOCTYPE html><html lang='en'><head><meta charset='UTF-8'>"
            f"<meta name='viewport' content='width=device-width,initial-scale=1'><title>{title}</title>"
            f"<style>{CSS}</style></head><body>{body}</body></html>")
    open(os.path.join(BASE, slug + ".html"), "w").write(html)
    index.append(f"<li><a href='./{slug}.html'>{title}</a></li>")
index.append("</ul>")
open(os.path.join(BASE, "index.html"), "w").write(
    "<!DOCTYPE html><html><head><title>Atlas</title>"
    f"<style>{CSS}</style></head><body>{''.join(index)}</body></html>")
print(f"atlas: {len(PAGES)} archetypes -> {BASE}")
