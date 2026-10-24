const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Readable } = require('stream');

const VIDEO_TYPES = Object.freeze({
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/x-m4v',
  '.webm': 'video/webm', '.mpeg': 'video/mpeg', '.mpg': 'video/mpeg',
  '.3gp': 'video/3gpp', '.3g2': 'video/3gpp2', '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska', '.ogv': 'video/ogg',
});
const PLATFORMS = ['youtube', 'instagram', 'facebook', 'x'];
const PLATFORM_NAMES = { youtube: 'YouTube', instagram: 'Instagram', facebook: 'Facebook', x: 'X' };
const API_URL = normalizeApiUrl(process.env.DRIFTPOST_API_URL || 'https://driftpost-production.up.railway.app');
const AUTH_FILE = path.resolve(process.env.OSIEN_DRIFTPOST_AUTH_FILE || path.join(os.homedir(), '.config', 'osien-stack', 'driftpost-auth.json'));

function normalizeApiUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '::1'].includes(url.hostname)) {
    throw new Error('DRIFTPOST_API_URL must use HTTPS (HTTP is allowed only for localhost).');
  }
  return url.origin;
}

const asText = (text) => ({ content: [{ type: 'text', text: String(text) }] });
const asError = (text) => ({ isError: true, content: [{ type: 'text', text: String(text) }] });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readState() {
  try {
    const state = JSON.parse(await fsp.readFile(AUTH_FILE, 'utf8'));
    return state && typeof state === 'object' ? state : {};
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw new Error('Could not read Driftpost connection state. Check the Osien config directory.');
  }
}

async function writeState(state) {
  const directory = path.dirname(AUTH_FILE);
  await fsp.mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = path.join(directory, `.driftpost-${crypto.randomUUID()}.tmp`);
  await fsp.writeFile(temp, JSON.stringify(state, null, 2), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
  try { await fsp.chmod(temp, 0o600); } catch {}
  await fsp.rename(temp, AUTH_FILE);
  try { await fsp.chmod(AUTH_FILE, 0o600); } catch {}
}

async function removeState() {
  await fsp.unlink(AUTH_FILE).catch((error) => { if (error.code !== 'ENOENT') throw error; });
}

function tokenFor(state) {
  const auth = state.auth;
  if (!auth?.access_token || auth.api_url !== API_URL) {
    throw new Error('Driftpost is not connected. Run driftpost_connect and approve the browser prompt first.');
  }
  if (Date.parse(auth.expires_at) <= Date.now()) {
    throw new Error('Driftpost access expired. Run driftpost_connect to reconnect.');
  }
  return auth.access_token;
}

async function api(pathname, { token, method = 'GET', body, headers = {}, signal, duplex } = {}) {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  const isStream = body && typeof body.getReader === 'function';
  const response = await fetch(new URL(pathname, API_URL), {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !isForm && !isStream ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body == null ? undefined : isForm || isStream ? body : JSON.stringify(body),
    signal,
    ...(duplex ? { duplex } : {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Driftpost request failed (${response.status}).`);
    error.status = response.status;
    error.retryAfter = Number(response.headers.get('retry-after') || 0);
    throw error;
  }
  return data;
}

function openBrowser(urlString) {
  let url;
  try { url = new URL(urlString); } catch { return false; }
  if (url.protocol !== 'https:' || !url.hash.startsWith('#/mcp-connect?')) return false;
  const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url.href] : [url.href];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', () => {});
    child.unref();
    return true;
  } catch { return false; }
}

async function authenticatedToken() {
  const state = await readState();
  return { state, token: tokenFor(state) };
}

function platformBody(platform, { connectionId, caption, title, privacy, media }) {
  const body = {
    platform,
    connection_id: connectionId,
    text: caption,
    title: title || '',
    yt_title: title || '',
    yt_description: caption,
    yt_privacy: privacy || 'public',
    fb_message: caption,
    ig_caption: caption,
    x_text: caption,
    skip_crosspost: '1',
    hasPreuploadedMedia: '1',
    mediaPath0: media.path,
    mediaType0: media.mimetype,
    mediaName0: media.name,
    mediaSize0: String(media.size),
  };
  return body;
}

async function chooseAccounts(token, platforms, accountIds = {}) {
  const { connections = [] } = await api('/api/connections', { token });
  const chosen = [];
  for (const platform of platforms) {
    const candidates = connections.filter((c) => c.platform === platform);
    const requestedId = accountIds[platform];
    if (requestedId) {
      const match = candidates.find((c) => c.id === requestedId);
      if (!match) throw new Error(`The selected ${PLATFORM_NAMES[platform]} account is not connected to this Driftpost login. Call driftpost_accounts to refresh the list.`);
      chosen.push(match);
    } else if (candidates.length === 1) {
      chosen.push(candidates[0]);
    } else if (!candidates.length) {
      throw new Error(`No ${PLATFORM_NAMES[platform]} account is connected. Call driftpost_connect_account for ${platform} first.`);
    } else {
      const options = candidates.map((c) => `${c.account_name} (account_id: ${c.id})`).join('; ');
      throw new Error(`Choose which ${PLATFORM_NAMES[platform]} account to use: ${options}`);
    }
  }
  return chosen;
}

async function uploadVideo(token, filePath) {
  const absolute = path.resolve(String(filePath || ''));
  const stat = await fsp.stat(absolute).catch(() => null);
  if (!stat?.isFile()) throw new Error('video_path must point to a readable video file on this device.');
  if (stat.size < 1 || stat.size > 400 * 1024 * 1024) throw new Error('Driftpost accepts videos up to 400 MB.');
  const extension = path.extname(absolute).toLowerCase();
  const mimetype = VIDEO_TYPES[extension];
  if (!mimetype) throw new Error('Use a supported video extension: mp4, mov, m4v, webm, mpeg, mpg, 3gp, 3g2, avi, mkv, or ogv.');
  const stream = Readable.toWeb(fs.createReadStream(absolute));
  return api('/api/mcp/media', {
    token,
    method: 'PUT',
    headers: {
      'Content-Type': mimetype,
      'Content-Length': String(stat.size),
      'X-File-Name': encodeURIComponent(path.basename(absolute)),
    },
    body: stream,
    // Node's fetch requires duplex for a streaming request body.
    duplex: 'half',
  });
}

async function submitTarget(token, target, media, args) {
  const body = platformBody(target.platform, {
    connectionId: target.id, caption: args.caption || '', title: args.title || '',
    privacy: args.youtube_privacy, media,
  });
  if (args.scheduled_at) {
    body.scheduled_at = args.scheduled_at;
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) form.append(key, String(value));
    const { schedule } = await api('/api/schedule', { token, method: 'POST', body: form });
    return { platform: target.platform, account: target.account_name, scheduled: true, schedule_id: schedule.id, scheduled_at: schedule.scheduled_at, status: schedule.status };
  }
  const form = new FormData();
  for (const [key, value] of Object.entries(body)) form.append(key, String(value));
  const { job } = await api('/api/publish', { token, method: 'POST', body: form });
  return { platform: target.platform, account: target.account_name, scheduled: false, job_id: job.id, state: job.state, message: job.message };
}

async function waitForJob(token, item, waitSeconds) {
  if (!item.job_id || waitSeconds <= 0) return item;
  const deadline = Date.now() + waitSeconds * 1000;
  while (Date.now() < deadline) {
    await wait(Math.min(2000, deadline - Date.now()));
    try {
      const { job } = await api(`/api/jobs/${encodeURIComponent(item.job_id)}`, { token });
      item.state = job.state;
      item.progress = job.progress;
      item.message = job.message;
      item.url = job.url || null;
      item.warning = job.warning || null;
      if (job.state === 'completed' || job.state === 'failed') return item;
    } catch (error) {
      item.message = error.message;
      return item;
    }
  }
  item.message = item.state === 'completed' ? item.message : 'Still processing. Use driftpost_publish_status with this job_id to check again.';
  return item;
}

function registerDriftpostTools(server, defineTool) {
  const { z } = require('zod');
  defineTool('driftpost_connect', 'Connect Osien Stack to your Driftpost account. Opens Driftpost in your browser for one-time sign-in and approval. No client ID, client secret, API key, or social password is entered into the MCP.', {}, async () => {
    try {
      const state = await readState();
      if (state.auth?.api_url === API_URL && Date.parse(state.auth.expires_at) > Date.now()) {
        return asText(`Already connected to Driftpost until ${state.auth.expires_at}. Use driftpost_accounts to see linked profiles.`);
      }
      const device = await api('/api/mcp/device/start', { method: 'POST', body: {} });
      await writeState({ ...state, pending: { api_url: API_URL, device_code: device.device_code, user_code: device.user_code, verification_uri: device.verification_uri, expires_at: new Date(Date.now() + device.expires_in * 1000).toISOString() } });
      const opened = openBrowser(device.verification_uri);
      return asText([
        opened ? 'Driftpost opened in your browser.' : 'Open this Driftpost approval link in your browser:',
        device.verification_uri,
        `Enter code ${device.user_code} and approve Osien Stack. Then call driftpost_finish_connect.`,
        'The authorization expires in 10 minutes.',
      ].join('\n'));
    } catch (error) { return asError(error.message); }
  });

  defineTool('driftpost_finish_connect', 'Finish the one-time browser authorization after you approve Osien Stack in Driftpost. Waits briefly for approval and stores the resulting scoped token in the local Osien config directory.', {
    wait_seconds: z.number().int().min(1).max(90).optional(),
  }, async ({ wait_seconds }) => {
    try {
      const state = await readState();
      const pending = state.pending;
      if (!pending?.device_code || pending.api_url !== API_URL) return asError('No pending Driftpost connection. Call driftpost_connect first.');
      if (Date.parse(pending.expires_at) <= Date.now()) {
        delete state.pending; await writeState(state);
        return asError('Driftpost approval expired. Call driftpost_connect to start again.');
      }
      const deadline = Date.now() + (wait_seconds || 45) * 1000;
      while (true) {
        try {
          const result = await api('/api/mcp/device/token', { method: 'POST', body: { device_code: pending.device_code } });
          const expiresAt = result.expires_at;
          delete state.pending;
          state.auth = { api_url: API_URL, access_token: result.access_token, expires_at: expiresAt, scopes: result.scopes };
          await writeState(state);
          return asText(`Connected to Driftpost. Authorization expires ${expiresAt}. Use driftpost_connect_account to link YouTube, Instagram, Facebook, or X.`);
        } catch (error) {
          if (error.status === 428 && Date.now() < deadline) {
            await wait(Math.min(3000, deadline - Date.now()));
            continue;
          }
          if (error.status === 428) return asText(`Still waiting for approval. Open ${pending.verification_uri}, enter ${pending.user_code}, approve Osien Stack, then call driftpost_finish_connect again.`);
          if (error.status === 410) { delete state.pending; await writeState(state); }
          throw error;
        }
      }
    } catch (error) { return asError(error.message); }
  });

  defineTool('driftpost_connect_account', 'Connect a YouTube, Instagram, Facebook Page, or X account to the signed-in Driftpost user. Opens the official provider OAuth flow; provider app credentials are owned by Driftpost and are never requested from the user.', {
    platform: z.enum(PLATFORMS),
  }, async ({ platform }) => {
    try {
      const { token } = await authenticatedToken();
      const { url } = await api(`/api/oauth/${platform}/start`, { token, method: 'POST', body: {} });
      const opened = openProviderUrl(url);
      return asText(`${opened ? 'Provider sign-in opened in your browser.' : 'Open this provider sign-in link:'}\n${url}\nFinish the official OAuth steps, then call driftpost_accounts to confirm the account is connected.`);
    } catch (error) { return asError(error.message); }
  });

  defineTool('driftpost_accounts', 'List the signed-in user’s connected social accounts and their stable account IDs. Use this before publishing when a platform has more than one account.', {}, async () => {
    try {
      const { token } = await authenticatedToken();
      const { connections = [] } = await api('/api/connections', { token });
      if (!connections.length) return asText('No social accounts are connected yet. Use driftpost_connect_account to connect one.');
      return asText(JSON.stringify(connections.map(({ id, platform, account_name, avatar_url }) => ({ id, platform, account_name, avatar_url })), null, 2));
    } catch (error) { return asError(error.message); }
  });

  defineTool('driftpost_disconnect_account', 'Disconnect one social account from Driftpost. This removes its stored platform token and stops future publishing from that account.', {
    connection_id: z.string().min(1),
  }, async ({ connection_id }) => {
    try {
      const { token } = await authenticatedToken();
      await api(`/api/connections/${encodeURIComponent(connection_id)}`, { token, method: 'DELETE' });
      return asText('Social account disconnected from Driftpost.');
    } catch (error) { return asError(error.message); }
  });

  defineTool('driftpost_publish_video', 'Upload one local video to Driftpost and publish it now or schedule it across selected connected accounts. Use only when the user explicitly asks to publish or schedule. Draft a caption from the user’s brief; select a specific account when multiple accounts exist on a platform.', {
    video_path: z.string().min(1),
    platforms: z.array(z.enum(PLATFORMS)).min(1).max(4),
    caption: z.string().optional(),
    title: z.string().max(100).optional(),
    youtube_privacy: z.enum(['public', 'unlisted', 'private']).optional(),
    scheduled_at: z.string().optional(),
    wait_seconds: z.number().int().min(0).max(120).optional(),
    account_ids: z.object({ youtube: z.string().optional(), instagram: z.string().optional(), facebook: z.string().optional(), x: z.string().optional() }).optional(),
  }, async (args) => {
    try {
      const { token } = await authenticatedToken();
      const platforms = [...new Set(args.platforms)];
      if (platforms.length !== args.platforms.length) return asError('Each platform can appear only once in a publish request.');
      if (platforms.some((p) => ['instagram', 'x'].includes(p)) && !String(args.caption || '').trim()) {
        return asError('Instagram and X need a caption. Draft one from the user’s brief, then call driftpost_publish_video.');
      }
      if (platforms.includes('youtube') && !String(args.title || '').trim()) {
        return asError('YouTube needs a title. Draft one from the user’s brief, then call driftpost_publish_video.');
      }
      if (args.scheduled_at && (!Number.isFinite(Date.parse(args.scheduled_at)) || Date.parse(args.scheduled_at) < Date.now() + 60_000)) {
        return asError('Choose a schedule time at least one minute from now.');
      }
      const targets = await chooseAccounts(token, platforms, args.account_ids || {});
      const media = await uploadVideo(token, args.video_path);
      const results = await Promise.all(targets.map((target) => submitTarget(token, target, media, args)));
      if (args.scheduled_at) return asText(JSON.stringify({ scheduled: results }, null, 2));
      const waitSeconds = args.wait_seconds === undefined ? 25 : args.wait_seconds;
      const completed = await Promise.all(results.map((result) => waitForJob(token, result, waitSeconds)));
      return asText(JSON.stringify({ published: completed }, null, 2));
    } catch (error) { return asError(error.message); }
  });

  defineTool('driftpost_publish_status', 'Check a Driftpost publish job by the job_id returned from driftpost_publish_video.', {
    job_id: z.string().min(1),
  }, async ({ job_id }) => {
    try {
      const { token } = await authenticatedToken();
      const { job } = await api(`/api/jobs/${encodeURIComponent(job_id)}`, { token });
      return asText(JSON.stringify(job, null, 2));
    } catch (error) { return asError(error.message); }
  });

  defineTool('driftpost_list_schedules', 'List scheduled and recently completed Driftpost posts. Optionally limit the results by ISO date range.', {
    from: z.string().optional(),
    to: z.string().optional(),
    history: z.boolean().optional(),
  }, async ({ from, to, history }) => {
    try {
      const { token } = await authenticatedToken();
      const query = new URLSearchParams();
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      if (history) query.set('history', '1');
      const suffix = query.toString() ? `?${query}` : '';
      return asText(JSON.stringify(await api(`/api/schedules${suffix}`, { token }), null, 2));
    } catch (error) { return asError(error.message); }
  });

  defineTool('driftpost_cancel_schedule', 'Cancel a Driftpost scheduled post that has not started publishing.', {
    schedule_id: z.string().min(1),
  }, async ({ schedule_id }) => {
    try {
      const { token } = await authenticatedToken();
      await api(`/api/schedules/${encodeURIComponent(schedule_id)}`, { token, method: 'DELETE' });
      return asText('Scheduled post cancelled.');
    } catch (error) { return asError(error.message); }
  });

  defineTool('driftpost_disconnect', 'Disconnect Osien Stack from Driftpost and revoke this MCP session. Social accounts stay connected to the Driftpost web app.', {}, async () => {
    try {
      const { state, token } = await authenticatedToken();
      await api('/api/mcp/token', { token, method: 'DELETE' });
      await removeState();
      return asText('Osien Stack has been disconnected from Driftpost and its MCP session revoked.');
    } catch (error) { return asError(error.message); }
  });
}

function openProviderUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (url.protocol !== 'https:' || !['accounts.google.com', 'www.facebook.com', 'x.com', 'twitter.com'].includes(url.hostname)) return false;
    const command = process.platform === 'win32' ? 'rundll32.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const args = process.platform === 'win32' ? ['url.dll,FileProtocolHandler', url.href] : [url.href];
    const child = spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: false });
    child.once('error', () => {});
    child.unref();
    return true;
  } catch { return false; }
}

module.exports = { registerDriftpostTools };
