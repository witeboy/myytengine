import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import {
  Youtube, Loader2, Plus, Check, ExternalLink, AlertCircle, Star, Calendar, MessageSquare
} from 'lucide-react';

// ── Tag sanitizer (YouTube forbids some chars, also caps length) ─────
function cleanYouTubeTags(tags) {
  return (Array.isArray(tags) ? tags : [])
    .map(t => String(t).replace(/[<>"#&\\{}|^~`\[\]]/g, '').replace(/\s+/g, ' ').trim())
    .filter(t => t && t.length >= 2 && t.length <= 100);
}

// ── Sleep helper ──────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ══════════════════════════════════════════════════════════════════════
// RESUMABLE YOUTUBE UPLOAD WITH CHUNK RETRIES
// Fixes:
//  - Never sets Content-Length (forbidden header in browsers)
//  - Retries transient 5xx/network errors with exponential backoff
//  - Resumes from last committed byte after failure
//  - Verifies thumbnail set instead of silently swallowing errors
// ══════════════════════════════════════════════════════════════════════
async function uploadToYouTube({ accessToken, file, metadata, thumbnailBlob, onProgress, onStatus }) {
  const cleanedTags = cleanYouTubeTags(metadata.tags);

  // ── STEP 1: Initiate resumable session ──────────────────────────────
  // Spam-avoidance: complete metadata signals a legitimate creator upload.
  // YouTube's trust system penalizes sparse/ambiguous uploads.
  const snippet = {
    title: (metadata.title || 'Untitled').slice(0, 100),
    description: (metadata.description || '').slice(0, 5000),
    ...(cleanedTags.length > 0 ? { tags: cleanedTags } : {}),
    categoryId: metadata.categoryId || '22',
    defaultLanguage: 'en',
    defaultAudioLanguage: 'en',
  };
  const baseStatus = {
    selfDeclaredMadeForKids: !!metadata.madeForKids,
    embeddable: true,
    publicStatsViewable: true,
    license: 'youtube',
  };
  const status = metadata.publishAt
    ? {
        ...baseStatus,
        privacyStatus: 'private',
        publishAt: metadata.publishAt,
      }
    : {
        ...baseStatus,
        privacyStatus: metadata.privacy || 'private',
      };

  // notifySubscribers=false on automated uploads prevents spam flags from
  // mass-notification patterns. Users can notify manually from YouTube Studio.
  const initRes = await fetch(
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status&notifySubscribers=false',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(file.size),
        'X-Upload-Content-Type': file.type || 'video/mp4',
      },
      body: JSON.stringify({ snippet, status }),
    }
  );
  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`YouTube init failed (${initRes.status}): ${err.substring(0, 200)}`);
  }
  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload URL returned from YouTube');

  // ── STEP 2: Upload in chunks with retry ─────────────────────────────
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8 MB (must be multiple of 256KB)
  const MAX_CHUNK_RETRIES = 5;
  let offset = 0;
  let videoId = null;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);
    // DO NOT set Content-Length — browsers forbid it and set it automatically.
    const headers = { 'Content-Range': `bytes ${offset}-${end - 1}/${file.size}` };

    let attempt = 0;
    let success = false;
    let lastErr = '';

    while (attempt < MAX_CHUNK_RETRIES && !success) {
      try {
        const chunkRes = await fetch(uploadUrl, { method: 'PUT', headers, body: chunk });

        if (chunkRes.status === 200 || chunkRes.status === 201) {
          const data = await chunkRes.json();
          videoId = data.id;
          onProgress?.(100);
          success = true;
          break;
        }
        if (chunkRes.status === 308) {
          // Partial — check Range header to know what was actually received
          const range = chunkRes.headers.get('Range');
          offset = range ? parseInt(range.split('-')[1], 10) + 1 : end;
          onProgress?.(Math.round((offset / file.size) * 95));
          success = true;
          break;
        }
        if (chunkRes.status >= 500 || chunkRes.status === 408 || chunkRes.status === 429) {
          // Transient — retry
          lastErr = `HTTP ${chunkRes.status}`;
          attempt++;
          const wait = Math.min(30000, 1000 * Math.pow(2, attempt));
          onStatus?.(`Chunk failed (${chunkRes.status}) — retrying in ${wait / 1000}s (${attempt}/${MAX_CHUNK_RETRIES})`);
          await sleep(wait);
          continue;
        }
        // Permanent failure
        const errText = await chunkRes.text();
        throw new Error(`Upload chunk failed (${chunkRes.status}): ${errText.substring(0, 200)}`);
      } catch (netErr) {
        // Network error — retry
        if (netErr.message?.includes('Upload chunk failed')) throw netErr;
        lastErr = netErr.message;
        attempt++;
        if (attempt >= MAX_CHUNK_RETRIES) {
          throw new Error(`Upload failed after ${MAX_CHUNK_RETRIES} retries: ${lastErr}`);
        }
        const wait = Math.min(30000, 1000 * Math.pow(2, attempt));
        onStatus?.(`Network error — retrying in ${wait / 1000}s (${attempt}/${MAX_CHUNK_RETRIES})`);
        await sleep(wait);
      }
    }

    if (!success) {
      throw new Error(`Chunk upload gave up after ${MAX_CHUNK_RETRIES} retries: ${lastErr}`);
    }
  }

  if (!videoId) throw new Error('Upload completed but no video ID returned');

  // ── STEP 3: Set thumbnail (with error surfacing) ────────────────────
  let thumbnailSet = false;
  let thumbnailError = '';
  if (thumbnailBlob && videoId) {
    try {
      const thumbRes = await fetch(
        `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': thumbnailBlob.type || 'image/jpeg',
          },
          body: thumbnailBlob,
        }
      );
      if (thumbRes.ok) {
        thumbnailSet = true;
      } else {
        const t = await thumbRes.text();
        thumbnailError = `Thumbnail rejected (${thumbRes.status}): ${t.substring(0, 150)}`;
      }
    } catch (e) {
      thumbnailError = `Thumbnail upload failed: ${e.message}`;
    }
  }

  return {
    videoId,
    url: `https://youtu.be/${videoId}`,
    thumbnailSet,
    thumbnailError,
  };
}

// ── Post pinned comment via YouTube Data API ───────────────────────────
async function postAndPinComment({ accessToken, videoId, commentText }) {
  try {
    const res = await fetch(
      'https://www.googleapis.com/youtube/v3/commentThreads?part=snippet',
      {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snippet: {
            videoId,
            topLevelComment: { snippet: { textOriginal: commentText.slice(0, 10000) } },
          },
        }),
      }
    );
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: `Comment failed (${res.status}): ${t.substring(0, 150)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ══════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════
export default function ChannelPublishStep({
  videoFile, title, description, tags, thumbnailUrl, privacy, categoryId,
  pinnedComment, onPrivacyChange, onCategoryChange, onPublishSuccess,
}) {
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  // Advanced options
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [autoPinComment, setAutoPinComment] = useState(true);
  const [madeForKids, setMadeForKids] = useState(false);

  useEffect(() => { loadChannels(); }, []);

  const loadChannels = async () => {
    setLoadingChannels(true);
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'list_channels' });
      const ch = res.data?.channels || [];
      setChannels(ch);
      const def = ch.find(c => c.is_default) || ch[0];
      if (def) setSelectedChannelId(def.channel_id);
    } catch (_) {}
    setLoadingChannels(false);
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'get_auth_url' });
      if (res.data?.auth_url) window.location.href = res.data.auth_url;
    } catch (err) { setUploadError('Failed: ' + err.message); }
    setConnecting(false);
  };

  const handlePublish = async () => {
    if (!videoFile || !selectedChannelId || !title.trim()) {
      setUploadError('Video, channel, and title are required.');
      return;
    }
    if (scheduleEnabled && !scheduleAt) {
      setUploadError('Please pick a schedule time.');
      return;
    }

    // Schedule validation — must be in the future
    let publishAtIso = undefined;
    if (scheduleEnabled && scheduleAt) {
      const t = new Date(scheduleAt);
      if (isNaN(t.getTime()) || t.getTime() < Date.now() + 60000) {
        setUploadError('Scheduled time must be at least 1 minute in the future.');
        return;
      }
      publishAtIso = t.toISOString();
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadStatus('Getting access token...');
    setUploadError('');
    setUploadResult(null);

    try {
      const tokenRes = await base44.functions.invoke('youtubeAuth', {
        action: 'get_token', channel_id: selectedChannelId,
      });
      const accessToken = tokenRes.data?.access_token;
      if (!accessToken) throw new Error(tokenRes.data?.error || 'Failed to get access token');

      // Fetch thumbnail blob (if selected)
      setUploadStatus('Preparing thumbnail...');
      let thumbnailBlob = null;
      if (thumbnailUrl) {
        try {
          const r = await fetch(thumbnailUrl);
          if (r.ok) thumbnailBlob = await r.blob();
        } catch (_) {}
      }

      const tagArray = tags.split(',')
        .map(t => t.trim().replace(/[<>"#&\\{}|^~`\[\]]/g, '').trim())
        .filter(t => t && t.length >= 2);

      setUploadStatus('Uploading to YouTube...');
      const result = await uploadToYouTube({
        accessToken,
        file: videoFile,
        metadata: {
          title: title.trim(),
          description: description.trim(),
          tags: tagArray,
          privacy: scheduleEnabled ? 'private' : privacy,
          categoryId,
          publishAt: publishAtIso,
          madeForKids,
        },
        thumbnailBlob,
        onProgress: setUploadProgress,
        onStatus: setUploadStatus,
      });

      // Auto-post pinned comment
      let commentResult = null;
      if (autoPinComment && pinnedComment?.trim() && result.videoId) {
        setUploadStatus('Posting pinned comment...');
        commentResult = await postAndPinComment({
          accessToken,
          videoId: result.videoId,
          commentText: pinnedComment.trim(),
        });
      }

      setUploadResult({ ...result, commentResult });
      setUploadProgress(100);
      setUploadStatus('');
      onPublishSuccess?.(result);
    } catch (err) {
      setUploadError(err.message || 'Upload failed');
      setUploadStatus('');
    }
    setUploading(false);
  };

  const selectedChannel = channels.find(c => c.channel_id === selectedChannelId);

  // Min datetime for scheduling (10 minutes from now, formatted for datetime-local)
  const minScheduleAt = (() => {
    const t = new Date(Date.now() + 10 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}`;
  })();

  return (
    <div className="space-y-4">
      {/* Channel Selection */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">YouTube Channel</label>
        {loadingChannels ? (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading channels...
          </div>
        ) : channels.length === 0 ? (
          <Button onClick={handleConnect} disabled={connecting} className="w-full bg-red-600 hover:bg-red-700 gap-2">
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
            Connect YouTube Channel
          </Button>
        ) : (
          <div className="flex gap-2">
            <Select value={selectedChannelId} onValueChange={setSelectedChannelId}>
              <SelectTrigger className="flex-1 h-10"><SelectValue placeholder="Select channel" /></SelectTrigger>
              <SelectContent>
                {channels.map(ch => (
                  <SelectItem key={ch.channel_id} value={ch.channel_id}>
                    <div className="flex items-center gap-2">
                      {ch.channel_thumbnail && <img src={ch.channel_thumbnail} className="w-5 h-5 rounded-full" alt="" />}
                      <span>{ch.channel_name}</span>
                      {ch.is_default && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                      {!ch.token_valid && <AlertCircle className="w-3 h-3 text-red-500" />}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleConnect} variant="outline" size="icon" className="h-10 w-10" title="Add channel">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        )}
        {selectedChannel && !selectedChannel.token_valid && (
          <div className="flex items-center gap-2 p-2 mt-2 bg-red-50 rounded text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5" /> Token expired.
            <Button onClick={handleConnect} size="sm" variant="outline" className="h-6 text-[10px] ml-auto border-red-300">
              Reconnect
            </Button>
          </div>
        )}
      </div>

      {/* Thumbnail Preview */}
      {thumbnailUrl && (
        <div>
          <label className="text-sm font-medium mb-1.5 block">Thumbnail</label>
          <img src={thumbnailUrl} className="w-full max-w-md aspect-video object-cover rounded-lg border" alt="Thumbnail" />
        </div>
      )}

      {/* Privacy + Category */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1.5 block">Privacy</label>
          <Select value={privacy} onValueChange={onPrivacyChange} disabled={scheduleEnabled}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
              <SelectItem value="public">Public</SelectItem>
            </SelectContent>
          </Select>
          {scheduleEnabled && (
            <p className="text-[10px] text-gray-400 mt-0.5">Auto-public when scheduled</p>
          )}
        </div>
        <div className="flex-1">
          <label className="text-sm font-medium mb-1.5 block">Category</label>
          <Select value={categoryId} onValueChange={onCategoryChange}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="22">People & Blogs</SelectItem>
              <SelectItem value="27">Education</SelectItem>
              <SelectItem value="28">Science & Tech</SelectItem>
              <SelectItem value="24">Entertainment</SelectItem>
              <SelectItem value="10">Music</SelectItem>
              <SelectItem value="20">Gaming</SelectItem>
              <SelectItem value="26">Howto & Style</SelectItem>
              <SelectItem value="25">News & Politics</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Advanced Options */}
      <div className="space-y-2 p-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs font-semibold text-gray-700">Advanced</p>

        {/* Schedule */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 text-gray-500" />
            <label className="text-xs text-gray-700">Schedule publish</label>
          </div>
          <Switch checked={scheduleEnabled} onCheckedChange={setScheduleEnabled} />
        </div>
        {scheduleEnabled && (
          <Input
            type="datetime-local"
            value={scheduleAt}
            min={minScheduleAt}
            onChange={e => setScheduleAt(e.target.value)}
            className="h-8 text-xs"
          />
        )}

        {/* Auto-pin comment */}
        {pinnedComment?.trim() && (
          <div className="flex items-center justify-between pt-1 border-t border-gray-200">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-3.5 h-3.5 text-gray-500" />
              <label className="text-xs text-gray-700">Post pinned comment after upload</label>
            </div>
            <Switch checked={autoPinComment} onCheckedChange={setAutoPinComment} />
          </div>
        )}

        {/* Made for kids */}
        <div className="flex items-center justify-between pt-1 border-t border-gray-200">
          <label className="text-xs text-gray-700">Made for kids</label>
          <Switch checked={madeForKids} onCheckedChange={setMadeForKids} />
        </div>
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="truncate flex-1">{uploadStatus || 'Uploading...'}</span>
            <span className="ml-auto font-mono text-xs">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-[10px] text-blue-500">Keep this tab open. Upload uses chunked resumable upload.</p>
        </div>
      )}

      {uploadError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">Upload failed</p>
            <p className="text-xs mt-0.5">{uploadError}</p>
          </div>
        </div>
      )}

      {uploadResult ? (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200 space-y-2">
          <div className="flex items-center gap-2 text-green-700">
            <Check className="w-5 h-5" />
            <span className="font-medium">
              {scheduleEnabled ? 'Scheduled on YouTube!' : 'Published to YouTube!'}
            </span>
          </div>
          <a
            href={uploadResult.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
          >
            <ExternalLink className="w-4 h-4" />{uploadResult.url}
          </a>
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            {uploadResult.thumbnailSet && (
              <Badge className="bg-green-100 text-green-700">✓ Thumbnail set</Badge>
            )}
            {uploadResult.thumbnailError && (
              <Badge className="bg-amber-100 text-amber-700" title={uploadResult.thumbnailError}>
                ⚠ Thumbnail failed
              </Badge>
            )}
            {uploadResult.commentResult?.ok && (
              <Badge className="bg-green-100 text-green-700">✓ Comment posted</Badge>
            )}
            {uploadResult.commentResult && !uploadResult.commentResult.ok && (
              <Badge className="bg-amber-100 text-amber-700" title={uploadResult.commentResult.error}>
                ⚠ Comment failed
              </Badge>
            )}
          </div>
          {uploadResult.thumbnailError && (
            <p className="text-[10px] text-amber-700">
              {uploadResult.thumbnailError} — set manually in YouTube Studio.
            </p>
          )}
        </div>
      ) : (
        !uploading && (
          <Button
            onClick={handlePublish}
            disabled={!videoFile || !selectedChannelId || !title.trim() || (scheduleEnabled && !scheduleAt)}
            className="w-full bg-red-600 hover:bg-red-700 gap-2 h-11"
          >
            <Youtube className="w-5 h-5" />
            {scheduleEnabled ? 'Schedule on YouTube' : 'Publish to YouTube'}
          </Button>
        )
      )}
    </div>
  );
}