#!/usr/bin/env python3
"""OSIEN post machine: ~/PostQueue -> Instagram Reel (live only with POST_LIVE=1).
One-time supervised login saves session.json (600) -> cron reuses it, no password needed.
Usage: social-py post_reel.py [--now FILE | --next] [--caption TEXT]
Queue rule: <video>.mp4 + <video>.txt (caption sidecar). Posted files move to posted/.
"""
import json, os, shutil, sys

HOME = os.path.expanduser("~")
Q = os.path.join(HOME, "PostQueue")
POSTED = os.path.join(Q, "posted")
SESS = os.path.join(HOME, ".config/opencode/.vault/ig-session.json")
LIVE = os.environ.get("POST_LIVE") == "1"

sys.path.insert(0, os.path.join(HOME, ".config/opencode/.venvs/social/lib/python3.12/site-packages"))

def client():
    from instagrapi import Client
    cl = Client()
    cl.delay_range = [2, 5]
    if os.path.exists(SESS):
        cl.load_settings(SESS)
        try:
            cl.get_timeline_feed()  # validates saved session
            return cl
        except Exception:
            pass  # session dead -> supervised re-login below
    # supervised first login: user/pass from vault (RAM-bridge), challenge solved in terminal
    import subprocess
    user = subprocess.run([f"{HOME}/.config/opencode/vault.sh", "get", "instagram", "user"],
                          capture_output=True, text=True).stdout.strip()
    pw = subprocess.run([f"{HOME}/.config/opencode/vault.sh", "get", "instagram", "pass"],
                        capture_output=True, text=True).stdout.strip()
    if not user or not pw:
        print("NO_CREDS: run vault.sh add instagram first (username + password/app-password)")
        sys.exit(2)
    cl.login(user, pw)
    cl.dump_settings(SESS)
    os.chmod(SESS, 0o600)
    return cl

def pick(args):
    if args and args[0] == "--now" and len(args) > 1:
        f = args[1]
        base = os.path.splitext(os.path.basename(f))[0]
        cap = os.path.join(Q, base + ".txt")
        return f, open(cap).read().strip() if os.path.exists(cap) else ""
    vids = sorted(v for v in os.listdir(Q) if v.lower().endswith((".mp4", ".mov")) and os.path.isfile(os.path.join(Q, v)))
    if not vids:
        print("QUEUE_EMPTY: drop video + caption.txt into ~/PostQueue/")
        sys.exit(3)
    base = os.path.splitext(vids[0])[0]
    cap = os.path.join(Q, base + ".txt")
    return os.path.join(Q, vids[0]), open(cap).read().strip() if os.path.exists(cap) else ""

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--caption")]
    cap_override = ""
    if "--caption" in sys.argv:
        cap_override = sys.argv[sys.argv.index("--caption") + 1]
    video, caption = pick(args)
    caption = cap_override or caption or "posted via OSIEN ⚡"
    if not LIVE:
        print(f"DRY_RUN: would post {os.path.basename(video)} ({os.path.getsize(video)//1024}KB)")
        print(f"DRY_RUN caption: {caption[:120]}")
        print("Go live: POST_LIVE=1 ... (start 1/day, human ratios, 2FA/app-password recommended)")
        return
    cl = client()
    media = cl.clip_upload(video, caption)
    dest = os.path.join(POSTED, os.path.basename(video))
    shutil.move(video, dest)
    sidecar = os.path.splitext(os.path.join(Q, os.path.basename(video)))[0] + ".txt"
    if os.path.exists(sidecar):
        shutil.move(sidecar, os.path.join(POSTED, os.path.basename(sidecar)))
    print(f"POSTED ✅ id={media.pk} -> {dest}")

if __name__ == "__main__":
    main()
