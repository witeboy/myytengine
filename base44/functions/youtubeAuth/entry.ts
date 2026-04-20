import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ══════════════════════════════════════════════════════════════════
// YOUTUBE AUTH — OAuth 2.0 for multiple channels
//
// Stores channels in UploadMetadata with project_id: "__youtube_channels__"
// Field: youtube_channels = JSON array of channel objects
//
// Actions:
//   get_auth_url   → returns Google OAuth URL
//   exchange_code  → exchanges code for tokens, fetches channel, saves
//   list_channels  → returns all connected channels
//   set_default    → mark a channel as default
//   disconnect     → remove a channel
//   get_token      → return fresh access token (auto-refreshes if expired)
// ══════════════════════════════════════════════════════════════════

const CHANNELS_PROJECT_ID = '__youtube_channels__';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube',
].join(' ');

async function getChannelRecord(base44) {
  const records = await base44.asServiceRole.entities.UploadMetadata.filter({ project_id: CHANNELS_PROJECT_ID });
  return records[0] || null;
}

async function getChannels(base44, userEmail) {
  const record = await getChannelRecord(base44);
  if (!record?.youtube_channels) return [];
  try {
    const all = JSON.parse(record.youtube_channels);
    return all.filter(c => c.user_id === userEmail);
  } catch (_) { return []; }
}

async function saveChannels(base44, userEmail, channels) {
  const record = await getChannelRecord(base44);

  // Get all channels (including other users), replace this user's channels
  let allChannels = [];
  if (record?.youtube_channels) {
    try { allChannels = JSON.parse(record.youtube_channels); } catch (_) {}
  }

  // Remove this user's channels, add updated ones
  allChannels = allChannels.filter(c => c.user_id !== userEmail);
  allChannels.push(...channels);

  const json = JSON.stringify(allChannels);

  if (record) {
    await base44.asServiceRole.entities.UploadMetadata.update(record.id, { youtube_channels: json });
  } else {
    await base44.asServiceRole.entities.UploadMetadata.create({
      project_id: CHANNELS_PROJECT_ID,
      youtube_channels: json,
    });
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
    const REDIRECT_URI = Deno.env.get('GOOGLE_REDIRECT_URI');

    if (!CLIENT_ID || !CLIENT_SECRET || !REDIRECT_URI) {
      return Response.json({ error: 'Google OAuth not configured' }, { status: 500 });
    }

    const { action, code, channel_id } = await req.json();
    const userEmail = user.email || 'unknown';

    // ════════════════════════════════════════════════════════════
    // GET AUTH URL
    // ════════════════════════════════════════════════════════════
    if (action === 'get_auth_url') {
      const params = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline',
        prompt: 'consent',
        state: userEmail,
      });
      return Response.json({ success: true, auth_url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
    }

    // ════════════════════════════════════════════════════════════
    // EXCHANGE CODE — get tokens, fetch channel info, save
    // ════════════════════════════════════════════════════════════
    if (action === 'exchange_code') {
      if (!code) return Response.json({ error: 'Missing authorization code' }, { status: 400 });

      // Exchange code for tokens
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      const tokenData = await tokenRes.json();
      if (tokenData.error) {
        return Response.json({ error: `Google auth failed: ${tokenData.error_description || tokenData.error}` }, { status: 400 });
      }

      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const tokenExpiry = Date.now() + ((tokenData.expires_in || 3600) * 1000);

      if (!accessToken) return Response.json({ error: 'No access token received' }, { status: 400 });

      // Fetch channel info
      const channelRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      const channelData = await channelRes.json();

      if (!channelData.items?.length) {
        return Response.json({ error: 'No YouTube channel found for this Google account' }, { status: 400 });
      }

      const ch = channelData.items[0];
      const channelId = ch.id;
      const channelName = ch.snippet?.title || 'Unknown';
      const channelThumbnail = ch.snippet?.thumbnails?.default?.url || '';
      const subscriberCount = ch.statistics?.subscriberCount || '0';

      console.log(`📺 Connected: ${channelName} (${channelId}) — ${subscriberCount} subs`);

      // Load existing channels and update or add
      const channels = await getChannels(base44, userEmail);
      const existingIdx = channels.findIndex(c => c.channel_id === channelId);

      // Preserve existing refresh_token if Google didn't return a new one (happens
      // when user re-consents a scope they already granted). Only overwrite when
      // we actually received a fresh refresh_token.
      const preservedRefresh = existingIdx >= 0 ? channels[existingIdx].refresh_token : '';
      const channelObj = {
        user_id: userEmail,
        channel_id: channelId,
        channel_name: channelName,
        channel_thumbnail: channelThumbnail,
        access_token: accessToken,
        refresh_token: refreshToken || preservedRefresh,
        token_expiry: tokenExpiry,
        is_default: existingIdx >= 0 ? channels[existingIdx].is_default : channels.length === 0,
        refresh_invalid: false,
        connected_at: existingIdx >= 0 ? channels[existingIdx].connected_at : Date.now(),
        last_reconnected_at: Date.now(),
      };

      if (existingIdx >= 0) {
        channels[existingIdx] = channelObj;
      } else {
        channels.push(channelObj);
      }

      await saveChannels(base44, userEmail, channels);

      return Response.json({
        success: true,
        channel: { channel_id: channelId, channel_name: channelName, channel_thumbnail: channelThumbnail, subscriber_count: subscriberCount },
      });
    }

    // ════════════════════════════════════════════════════════════
    // LIST CHANNELS
    // ════════════════════════════════════════════════════════════
    if (action === 'list_channels') {
      const channels = await getChannels(base44, userEmail);
      return Response.json({
        success: true,
        channels: channels.map(c => ({
          channel_id: c.channel_id,
          channel_name: c.channel_name,
          channel_thumbnail: c.channel_thumbnail,
          is_default: c.is_default,
          // Channel is "connected" as long as we hold a refresh_token.
          // Access token expiry is irrelevant — we auto-refresh on demand.
          token_valid: !!c.refresh_token,
          needs_reconnect: !!c.refresh_invalid,
        })),
      });
    }

    // ════════════════════════════════════════════════════════════
    // SET DEFAULT
    // ════════════════════════════════════════════════════════════
    if (action === 'set_default') {
      if (!channel_id) return Response.json({ error: 'Missing channel_id' }, { status: 400 });
      const channels = await getChannels(base44, userEmail);
      for (const c of channels) c.is_default = (c.channel_id === channel_id);
      await saveChannels(base44, userEmail, channels);
      return Response.json({ success: true });
    }

    // ════════════════════════════════════════════════════════════
    // DISCONNECT
    // ════════════════════════════════════════════════════════════
    if (action === 'disconnect') {
      if (!channel_id) return Response.json({ error: 'Missing channel_id' }, { status: 400 });
      let channels = await getChannels(base44, userEmail);
      const removed = channels.find(c => c.channel_id === channel_id);
      channels = channels.filter(c => c.channel_id !== channel_id);
      if (removed?.is_default && channels.length > 0) channels[0].is_default = true;
      await saveChannels(base44, userEmail, channels);
      console.log(`📺 Disconnected: ${removed?.channel_name || channel_id}`);
      return Response.json({ success: true });
    }

    // ════════════════════════════════════════════════════════════
    // GET TOKEN — fresh access token for browser-side YouTube upload
    // ════════════════════════════════════════════════════════════
    if (action === 'get_token') {
      if (!channel_id) return Response.json({ error: 'Missing channel_id' }, { status: 400 });

      const channels = await getChannels(base44, userEmail);
      const ch = channels.find(c => c.channel_id === channel_id);
      if (!ch) return Response.json({ error: 'Channel not found' }, { status: 404 });

      // Refresh if expired or within 5 min of expiry
      if (ch.token_expiry < Date.now() + 300000) {
        if (!ch.refresh_token) {
          return Response.json({
            error: 'No refresh token — please reconnect this channel',
            needs_reconnect: true,
          }, { status: 401 });
        }

        const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            refresh_token: ch.refresh_token,
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            grant_type: 'refresh_token',
          }),
        });

        const refreshData = await refreshRes.json();
        if (refreshData.error) {
          // invalid_grant = refresh token permanently revoked (7-day test expiry,
          // password change, user revoked access, or >6 months inactive).
          // Only mark as needing reconnect for hard failures — not transient errors.
          const hardFail = refreshData.error === 'invalid_grant';
          if (hardFail) {
            ch.refresh_invalid = true;
            await saveChannels(base44, userEmail, channels);
          }
          console.error(`❌ Refresh failed for ${ch.channel_name}: ${refreshData.error} — ${refreshData.error_description || ''}`);
          return Response.json({
            error: `Token refresh failed: ${refreshData.error_description || refreshData.error}. Please reconnect this channel.`,
            needs_reconnect: hardFail,
            google_error: refreshData.error,
          }, { status: 401 });
        }

        ch.access_token = refreshData.access_token;
        ch.token_expiry = Date.now() + ((refreshData.expires_in || 3600) * 1000);
        // Google sometimes rotates the refresh token — keep the new one if provided
        if (refreshData.refresh_token) {
          ch.refresh_token = refreshData.refresh_token;
        }
        ch.refresh_invalid = false;
        await saveChannels(base44, userEmail, channels);

        console.log(`🔄 Token refreshed for ${ch.channel_name}`);
      }

      return Response.json({
        success: true,
        access_token: ch.access_token,
        expires_at: ch.token_expiry,
      });
    }

    return Response.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error(`❌ youtubeAuth: ${error.message}`);
    return Response.json({ error: error.message }, { status: 500 });
  }
});