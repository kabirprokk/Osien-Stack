#!/usr/bin/env python3
"""OSIEN browser poster: YOUR Brave (persistent profile, stays logged in) -> Instagram Reel.
No client id/secret/backend. First run: headed, YOU log in once -> profile persists -> cron-able.
Usage: post_browser.py VIDEO CAPTION [--headed] [--dry]  (dry = stop before Share)
"""
import os, sys, time

HOME = os.path.expanduser("~")
sys.path.insert(0, os.path.join(HOME, ".config/opencode/.venvs/social/lib/python3.12/site-packages"))
PROFILE = os.path.join(HOME, ".config/opencode/machines/social/profile-brave")
os.makedirs(PROFILE, exist_ok=True)

def shot(pg, name):
    pg.screenshot(path=f"/tmp/vtest/pb-{name}.png")

def main():
    if "--login" in sys.argv:
        headed = "--headed" in sys.argv
        from playwright.sync_api import sync_playwright as _pw
        with _pw() as p:
            ctx = p.chromium.launch_persistent_context(
                PROFILE, executable_path="/usr/bin/brave-browser", headless=not headed,
                viewport={"width": 1280, "height": 900},
                args=["--no-sandbox", "--disable-dev-shm-usage"])
            pg = ctx.pages[0] if ctx.pages else ctx.new_page()
            pg.goto("https://www.instagram.com/", timeout=45000)
            print("🟢 BROWSER OPEN — log in (or sign up) in the Brave window, then CLOSE it. Profile saves automatically.")
            try:
                while True:
                    pg.wait_for_timeout(3000)
                    try:
                        pg.url  # dies when window closed
                    except Exception:
                        break
            except Exception:
                pass
            print("PROFILE SAVED ✅ now say: post it")
            return
    video, caption = sys.argv[1], open(sys.argv[2]).read().strip() if sys.argv[2].endswith(".txt") else sys.argv[2]
    headed = "--headed" in sys.argv
    dry = "--dry" in sys.argv
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            PROFILE, executable_path="/usr/bin/brave-browser", headless=not headed,
            viewport={"width": 1280, "height": 900},
            args=["--no-sandbox", "--disable-dev-shm-usage"])
        pg = ctx.pages[0] if ctx.pages else ctx.new_page()
        pg.goto("https://www.instagram.com/", timeout=45000)
        pg.wait_for_timeout(5000)
        shot(pg, "01-home")
        try:
            visible = (pg.inner_text("body") or "")[:2000].lower()
        except Exception:
            visible = ""
        detected = ("get started on instagram" in visible or "log in to continue" in visible
                or pg.query_selector('input[name="username"]') is not None)
        if "/accounts/login" in pg.url or detected:
            print("LOGIN_NEEDED: a Brave window is opening - log in (or sign up), then CLOSE it. Profile persists.")
            print("ONE-CMD headed: social-py post_browser.py VIDEO CAPTION --headed --dry")
            ctx.close()
            sys.exit(2)
        print("session: logged in ✅")
        # Create
        for sel in ['a[href="#"] >> nth=0', 'text=Create', '[aria-label="New post"]']:
            try:
                pg.click(sel, timeout=4000)
                break
            except Exception:
                continue
        pg.wait_for_timeout(2500)
        shot(pg, "02-create")
        # file picker
        try:
            with pg.expect_file_chooser(timeout=15000) as fc:
                btn = pg.query_selector('button:has-text("Select from computer")') or pg.query_selector('input[type="file"]')
                (btn or pg.locator("body")).click(timeout=5000)
            fc.value.set_files(video)
            print("video attached ✅")
        except Exception as e:
            print(f"PICKER_FAIL: {str(e)[:120]} (screenshot pb-02-create.png)")
            ctx.close()
            sys.exit(3)
        pg.wait_for_timeout(6000)
        shot(pg, "03-attached")
        # Next x2 (crop->edit->caption screens vary; click Next while present)
        for i in range(3):
            try:
                pg.click('button:has-text("Next")', timeout=5000)
                pg.wait_for_timeout(2500)
            except Exception:
                break
        # caption
        try:
            box = pg.query_selector('[aria-label*="caption" i], [aria-label*="Write a caption" i], ' +
                                    'div[role="textbox"]')
            if box:
                box.click()
                pg.keyboard.press("ControlOrMeta+a")
                pg.keyboard.type(caption[:2100], delay=5)
                print("caption pasted ✅")
        except Exception as e:
            print(f"CAPTION_SKIP: {str(e)[:100]}")
        shot(pg, "04-caption")
        if dry:
            print("DRY_RUN ✅ stopping before Share (evidence: pb-*.png)")
            ctx.close()
            return
        pg.click('button:has-text("Share")', timeout=8000)
        pg.wait_for_timeout(8000)
        shot(pg, "05-shared")
        print("SHARED ✅ (verify in app)")
        ctx.close()

if __name__ == "__main__":
    main()
