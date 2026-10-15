#!/usr/bin/env python3
"""OSIEN YouTube uploader scaffold: needs one 15-min Google OAuth setup, then cron-ready.
SETUP (once, supervised):
  1. console.cloud.google.com -> new project -> enable YouTube Data API v3
  2. OAuth consent (External, test users: your gmail) -> Desktop client -> download client_secrets.json
     to ~/.config/opencode/.vault/yt-client.json (chmod 600)
  3. Run: social-py yt_upload.py --auth   (opens browser, you click Allow)
  4. Token saved to .vault/yt-token.json -> cron reuses it forever.
Usage: social-py yt_upload.py VIDEO [--title T] [--desc D] [--tags a,b] [--short]
"""
import os, sys

HOME = os.path.expanduser("~")
VDIR = os.path.join(HOME, ".config/opencode/.vault")
CLIENT = os.path.join(VDIR, "yt-client.json")
TOKEN = os.path.join(VDIR, "yt-token.json")
sys.path.insert(0, os.path.join(HOME, ".config/opencode/.venvs/social/lib/python3.12/site-packages"))

SCOPES = ["https://www.googleapis.com/auth/youtube.upload"]

def creds():
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow
    c = None
    if os.path.exists(TOKEN):
        c = Credentials.from_authorized_user_file(TOKEN, SCOPES)
    if not c or not c.valid:
        if c and c.expired and c.refresh_token:
            c.refresh(Request())
        else:
            if not os.path.exists(CLIENT):
                print("NO_CLIENT: follow SETUP in this file header (yt-client.json missing)")
                sys.exit(2)
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT, SCOPES)
            c = flow.run_local_server(port=0)
        with open(TOKEN, "w") as f:
            f.write(c.to_json())
        os.chmod(TOKEN, 0o600)
    return c

def main():
    if "--auth" in sys.argv:
        creds()
        print("YT AUTH OK ✅ token saved (cron-ready)")
        return
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    video = next((a for a in sys.argv[1:] if not a.startswith("--")), None)
    if not video or not os.path.exists(video):
        print("usage: yt_upload.py VIDEO [--title T] [--desc D] [--tags a,b] [--short]")
        sys.exit(1)
    def arg(flag, default=""):
        return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv and sys.argv.index(flag) + 1 < len(sys.argv) else default
    title = arg("--title", os.path.splitext(os.path.basename(video))[0][:95] or "OSIEN ⚡")
    desc = arg("--desc", "posted via OSIEN ⚡")
    tags = [t for t in arg("--tags", "").split(",") if t]
    yt = build("youtube", "v3", credentials=creds())
    body = {"snippet": {"title": title, "description": desc, "tags": tags,
                        "categoryId": "22" if "--short" not in sys.argv else "24"},
            "status": {"privacyStatus": "public", "selfDeclaredMadeForKids": False}}
    req = yt.videos().insert(part="snippet,status", body=body,
                             media_body=MediaFileUpload(video, resumable=True))
    resp = None
    while resp is None:
        status, resp = req.next_chunk()
    print(f"YT POSTED ✅ id={resp['id']} https://youtu.be/{resp['id']}")

if __name__ == "__main__":
    main()
