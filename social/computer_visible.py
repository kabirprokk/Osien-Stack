#!/usr/bin/env python3
"""Small, visible-only, approval-gated browser worker for the Phase F tools."""
import ctypes, ctypes.util, json, os, re, sys, time
from urllib.parse import urlparse

sys.path.insert(0, os.path.join(os.path.expanduser('~'), '.config/opencode/.venvs/social/lib/python3.12/site-packages'))
from playwright.sync_api import sync_playwright

BRAVE = '/usr/bin/brave-browser'
PROFILE = os.path.expanduser('~/.config/opencode/machines/visible-computer/profile')
SHOT = os.path.expanduser('~/.config/opencode/.v3/visible')
TRACK = os.path.expanduser('~/.config/opencode/.v3/visible/cursor-tracks.jsonl')
SAFE_KEYS = {'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab','Escape','Backspace','Delete','Home','End','PageUp','PageDown','Enter','Space'}
SECRET = re.compile(r'(api[_ -]?key|token|password|secret|private[_ -]?key|bearer|cookie|credential)', re.I)

pw = browser = page = None
_x11 = _xtst = None
try:
    _x11 = ctypes.CDLL(ctypes.util.find_library('X11'))
    _xtst = ctypes.CDLL(ctypes.util.find_library('Xtst'))
    _x11.XOpenDisplay.restype = ctypes.c_void_p
    _xtst.XTestFakeMotionEvent.argtypes = [ctypes.c_void_p, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_ulong]
    _x11.XFlush.argtypes = [ctypes.c_void_p]
except Exception:
    _x11 = _xtst = None

def move_os_cursor(x, y):
    """Move the real X11 cursor when available; Playwright remains page-scoped."""
    if not (_x11 and _xtst): return
    display = _x11.XOpenDisplay(None)
    if display:
        _xtst.XTestFakeMotionEvent(display, -1, int(x), int(y), 0)
        _x11.XFlush(display)
        _x11.XCloseDisplay(display)

def approved(value):
    return value is True or (isinstance(value, str) and value.strip().lower() in ('true','yes','1')) or value == 1

def safe_url(url, approved=False):
    p = urlparse(url)
    if p.scheme not in ('http','https') or not p.netloc:
        return False, 'only http(s) URLs are allowed'
    host = (p.hostname or '').lower()
    local = host in ('localhost','127.0.0.1','::1') or host.endswith('.localhost')
    if not local and not approved:
        return False, 'external navigation requires approve=true'
    return True, ''

def tree():
    return page.evaluate("""() => ({
      title: document.title, url: location.href,
      elements: [...document.querySelectorAll('button,a,input,textarea,select,[role=button]')].slice(0,80).map((e,i)=>({
        i, tag:e.tagName.toLowerCase(), text:(e.innerText||e.placeholder||e.getAttribute('aria-label')||'').trim().slice(0,80),
        type:e.type||'', disabled:!!e.disabled
      }))
    })""")

def reply(ok, **data):
    print(json.dumps({'ok': ok, **data}, separators=(',',':')), flush=True)

def main(a):
    global pw, browser, page
    op = a.get('op','')
    if op == 'run':
        actions = a.get('actions') if isinstance(a.get('actions'), list) else a.get('steps') if isinstance(a.get('steps'), list) else []
        mode = str(a.get('mode','local_safe'))
        if not actions: return {'ok':False,'error':'actions must be a non-empty list'}
        if len(actions) > 12: return {'ok':False,'error':'action budget exceeded (maximum 12 steps)'}
        results = []
        for i, action in enumerate(actions):
            if not isinstance(action, dict): return {'ok':False,'error':f'action {i} is not an object'}
            step = dict(action); step_op = step.pop('op', step.pop('action', ''))
            if mode == 'local_safe':
                if step_op == 'open' and not urlparse(str(step.get('url',''))).hostname in ('localhost','127.0.0.1','::1'):
                    return {'ok':False,'stopped_at':i,'error':'local_safe mode only permits localhost navigation','results':results}
                step['approve'] = True
            elif mode != 'approved_external':
                return {'ok':False,'error':'mode must be local_safe or approved_external'}
            result = main({'op':step_op, **step})
            results.append({'step':i,'op':step_op,'ok':result.get('ok',False),'state':result.get('state'),'error':result.get('error')})
            if not result.get('ok'): return {'ok':False,'stopped_at':i,'results':results}
        return {'ok':True,'mode':mode,'steps':results}
    if op == 'stop':
        if browser: browser.close()
        if pw: pw.stop()
        browser = page = pw = None
        return {'ok': True, 'state': 'stopped'}
    if op == 'track_start':
        if page is None: return {'ok':False,'error':'no active visible session; call computer_open first'}
        interval = max(25, min(250, int(a.get('interval_ms',50))))
        page.evaluate("""(interval) => {
          if (window.__osienTrack?.active) return;
          const s={active:true,started:Date.now(),interval,last:0,points:[],max:120000};
          s.handler=e=>{const n=performance.now();if(n-s.last<s.interval)return;s.last=n;s.points.push({t:Date.now(),x:Math.round(e.clientX),y:Math.round(e.clientY)});if(s.points.length>s.max)s.points.shift()};
          document.addEventListener('pointermove',s.handler,{passive:true});window.__osienTrack=s;
        }""", interval)
        return {'ok':True,'state':'tracking','interval_ms':interval,'scope':'visible browser page only','captures':'coordinates and timestamps only'}
    if op == 'track_status':
        if page is None: return {'ok':False,'error':'no active visible session'}
        return page.evaluate("""() => { const s=window.__osienTrack; return s?.active ? {ok:true,active:true,started:s.started,samples:s.points.length,scope:'visible browser page only'} : {ok:true,active:false,samples:0}; }""")
    if op == 'track_stop':
        if page is None: return {'ok':False,'error':'no active visible session'}
        data = page.evaluate("""() => { const s=window.__osienTrack; if(!s?.active)return {active:false,points:[]}; document.removeEventListener('pointermove',s.handler);s.active=false;return {active:false,started:s.started,points:s.points}; }""")
        points = data.get('points',[])
        os.makedirs(os.path.dirname(TRACK), exist_ok=True)
        with open(TRACK,'a') as f:
            for point in points: f.write(json.dumps({'session':int(time.time()),**point})+'\n')
        return {'ok':True,'state':'stopped','samples_written':len(points),'file':TRACK,'scope':'visible browser page only'}
    if op == 'open':
        url = str(a.get('url','')).strip()
        ok, reason = safe_url(url, approved(a.get('approve')))
        if not ok: return {'ok':False,'error':reason}
        if browser is None:
            os.makedirs(PROFILE, exist_ok=True); os.makedirs(SHOT, exist_ok=True)
            pw = sync_playwright().start()
            browser = pw.chromium.launch_persistent_context(PROFILE, executable_path=BRAVE, headless=False, args=['--no-sandbox','--disable-dev-shm-usage','--disable-backgrounding-occluded-windows','--disable-features=CalculateNativeWinOcclusion','--ozone-platform=x11','--start-maximized','--window-size=1280,900'], viewport={'width':1280,'height':900})
            page = browser.pages[0] if browser.pages else browser.new_page()
        page.goto(url, wait_until='domcontentloaded', timeout=30000)
        page.bring_to_front()
        page.wait_for_timeout(500)
        return {'ok':True,'state':'open','url':page.url,'title':page.title()}
    if page is None: return {'ok':False,'error':'no active visible session; call computer_open first'}
    if op == 'observe':
        os.makedirs(SHOT, exist_ok=True)
        path = os.path.join(SHOT, 'latest.png'); page.screenshot(path=path)
        return {'ok':True,'state':'observed','tree':tree(),'screenshot':path}
    if op == 'move':
        if not approved(a.get('approve')): return {'ok':False,'error':'move requires approve=true'}
        if a.get('target') and not (a.get('x') is not None and a.get('y') is not None):
            target = str(a['target'])
            selector = target if target.startswith(('#','[','.')) else ('button' if 'button' in target.lower() else 'input' if 'input' in target.lower() else f'[aria-label*="{target}"]')
            box = page.locator(selector).first.bounding_box()
            if not box: return {'ok':False,'error':'target not found: '+target}
            a = {**a, 'x': box['x'] + box['width']/2, 'y': box['y'] + box['height']/2}
        if a.get('x') is None or a.get('y') is None: return {'ok':False,'error':'move needs x/y or target'}
        x, y = float(a['x']), float(a['y'])
        start = page.evaluate("() => window.__osCur || [window.innerWidth/2, window.innerHeight/2]")
        sx, sy = float(start[0]), float(start[1])
        for i in range(1, 25):
            t = i / 24
            px, py = sx + (x-sx)*t, sy + (y-sy)*t
            page.mouse.move(px, py)
            move_os_cursor(px, py)
            page.wait_for_timeout(22)
        # Keep the action visibly inspectable even when the OS compositor does
        # not draw Playwright's virtual pointer. This is a page-local cursor,
        # never an OS-wide input injector.
        page.evaluate("""([x,y]) => {
          let c = document.getElementById('__osien_visible_cursor');
          if (!c) { c=document.createElement('div'); c.id='__osien_visible_cursor';
            c.style.cssText='position:fixed;width:22px;height:22px;border:3px solid #ff3b81;border-radius:50%;background:#ff3b8166;box-shadow:0 0 0 5px #fff8;pointer-events:none;z-index:2147483647;transition:left .12s linear,top .12s linear;';
            document.body.appendChild(c); }
          c.style.left=(x-14)+'px'; c.style.top=(y-14)+'px';
        }""", [x,y])
        return {'ok':True,'state':'moved'}
    if op == 'click':
        if not approved(a.get('approve')): return {'ok':False,'error':'click requires approve=true'}
        selector = a.get('selector')
        if not selector and a.get('target'):
            target = str(a['target'])
            selector = target if target.startswith(('#','[','.')) else ('button' if 'button' in target.lower() else 'input' if 'input' in target.lower() else f'[aria-label*="{target}"]')
        if selector:
            page.locator(str(selector)).first.click(timeout=5000)
        else:
            page.mouse.click(float(a.get('x',0)), float(a.get('y',0)))
        return {'ok':True,'state':'clicked','url':page.url}
    if op == 'type':
        text = str(a.get('text',''))
        if not approved(a.get('approve')): return {'ok':False,'error':'typing requires approve=true'}
        if SECRET.search(text): return {'ok':False,'error':'secret-looking text refused; use the human for secrets'}
        sensitive = page.evaluate("() => { const e=document.activeElement; return !!e && (e.type==='password' || /pass|token|secret|key/i.test(e.name||'')); }")
        if sensitive: return {'ok':False,'error':'typing into sensitive fields is refused'}
        page.keyboard.type(text)
        return {'ok':True,'state':'typed','chars':len(text)}
    if op == 'key':
        key = str(a.get('key',''))
        if key not in SAFE_KEYS: return {'ok':False,'error':'key not allowlisted'}
        if not approved(a.get('approve')): return {'ok':False,'error':'key action requires approve=true'}
        page.keyboard.press(key)
        return {'ok':True,'state':'keyed','key':key}
    return {'ok':False,'error':'unknown computer operation'}

for line in sys.stdin:
    try:
        result = main(json.loads(line)); reply(**result)
    except Exception as e:
        reply(False, error=str(e)[:240])
