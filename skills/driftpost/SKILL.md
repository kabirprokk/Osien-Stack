---
name: driftpost
description: Connect Driftpost and publish or schedule videos to YouTube, Instagram, Facebook, and X through Osien Stack MCP tools.
---

# Driftpost publishing

Use the `driftpost_*` MCP tools when the user asks to connect or manage Driftpost social publishing.

## First connection

1. Call `driftpost_connect`. It opens a Driftpost approval page and returns a short code and expiry.
2. Tell the user to sign in to Driftpost and approve **Osien Stack** in the opened browser.
3. Call `driftpost_finish_connect`, waiting briefly for approval if needed. The tool stores its scoped token locally; never ask the user for client IDs, client secrets, API keys, social passwords, or OTPs.
4. To link social profiles, call `driftpost_connect_account` for each platform and let the user finish the official provider sign-in in the browser. Then call `driftpost_accounts` to confirm.

## Publish a video

When the user says to publish or schedule a video:

1. Identify the local video file. If no file is available, ask the user to provide one.
2. Check `driftpost_accounts` for connected profiles. If there are multiple profiles on a requested platform, ask which one; pass its ID in `account_ids`. Never guess between brands or accounts.
3. Prepare a suitable caption from the user's brief. Ask only for details required by the target platform: YouTube needs a title; Instagram and X need a caption. Do not invent claims or disclose private information.
4. Call `driftpost_publish_video` with the file path, selected platforms and account IDs, and caption/title. Set `scheduled_at` only when the user asks to schedule and has supplied or confirmed a time. Otherwise publish now.
5. Report the returned job IDs and platform results. If a job is processing, use `driftpost_publish_status` to check it.

The tool streams the file to Driftpost and supports publishing or scheduling across multiple selected platforms. Report platform failures plainly; do not claim success until the job reports it.

## Account and schedule management

- Use `driftpost_list_schedules` to review scheduled posts and `driftpost_cancel_schedule` only when the user asks to cancel a specific post.
- Use `driftpost_disconnect_account` only for the specific profile the user asks to disconnect.
- `driftpost_disconnect` revokes the Osien connection while leaving social profiles connected to Driftpost.

Publishing is an external action. Only publish, schedule, cancel, or disconnect when the user explicitly requests that action.
