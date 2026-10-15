"""Real-time human-style cursor: bezier easing, micro-jitter, micro-pauses.
For smooth, visible, non-janky automation on your OWN sites + QA testing.
Not an evasion system: it does not solve or defeat CAPTCHAs/bot checks."""
import math, random


def _bez(p0, p1, p2, p3, t):
    u = 1 - t
    return (u*u*u*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t*t*t*p3[0],
            u*u*u*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t*t*t*p3[1])


def glide(pg, x, y, steps=None, jitter=2.0, speed_ms=14):
    """Move the OS cursor along a bezier path in real time (16-40ms per frame)."""
    sx, sy = pg.evaluate("() => { return [1, 1]; }") and (0, 0)
    cur = pg.evaluate("""() => {
        return window.__osCur || [window.innerWidth/2, window.innerHeight/2]; }""")
    sx, sy = cur
    dx, dy = x - sx, y - sy
    dist = math.hypot(dx, dy)
    steps = steps or max(8, min(34, int(dist / 26) + 8))
    mx, my = sx + dx * 0.5 + random.uniform(-90, 90), sy + dy * 0.5 + random.uniform(-70, 70)
    c1 = (sx + dx * 0.25 + random.uniform(-40, 40), sy + dy * 0.25 + random.uniform(-30, 30))
    c2 = (sx + dx * 0.75 + random.uniform(-40, 40), sy + dy * 0.75 + random.uniform(-30, 30))
    for i in range(1, steps + 1):
        t = i / steps
        e = 3*t*t - 2*t*t*t  # easeInOutCubic
        px, py = _bez((sx, sy), c1, c2, (x, y), e)
        jx = random.uniform(-jitter, jitter) * (1 - t)
        jy = random.uniform(-jitter, jitter) * (1 - t)
        pg.mouse.move(px + jx, py + jy)
        pg.evaluate("([x,y]) => { window.__osCur = [x,y]; }", [px + jx, py + jy])
        pg.wait_for_timeout(speed_ms + random.randint(-4, 8))


def hover_click(pg, selector, pre_pause=True):
    """Glide to an element, settle (human dwell), then click."""
    if pre_pause:
        pg.wait_for_timeout(random.randint(60, 220))
    box = pg.query_selector(selector)
    if not box:
        return False
    b = box.bounding_box()
    if not b:
        return False
    glide(pg, b["x"] + b["width"] / 2, b["y"] + b["height"] / 2)
    pg.wait_for_timeout(random.randint(40, 140))
    pg.mouse.down()
    pg.wait_for_timeout(random.randint(28, 85))
    pg.mouse.up()
    return True
