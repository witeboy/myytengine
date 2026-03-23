import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Youtube, Loader2, Plus, Check, ExternalLink, AlertCircle, Star
} from 'lucide-react';

async function uploadToYouTube({ accessToken, file, metadata, thumbnailBlob, onProgress }) {
  const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': file.size,
      'X-Upload-Content-Type': file.type || 'video/mp4',
    },
    body: JSON.stringify({
      snippet: { title: metadata.title, description: metadata.description, tags: metadata.tags, categoryId: metadata.categoryId || '22', defaultLanguage: 'en' },
      status: { privacyStatus: metadata.privacy || 'private', selfDeclaredMadeForKids: false },
    }),
  });
  if (!initRes.ok) { const err = await initRes.text(); throw new Error(`YouTube init failed (${initRes.status}): ${err}`); }
  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload URL returned');

  const CHUNK_SIZE = 5 * 1024 * 1024;
  let offset = 0;
  let videoId = null;
  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);
    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Length': chunk.size, 'Content-Range': `bytes ${offset}-${end - 1}/${file.size}` },
      body: chunk,
    });
    if (chunkRes.status === 200 || chunkRes.status === 201) {
      const data = await chunkRes.json(); videoId = data.id; onProgress?.(100); break;
    } else if (chunkRes.status === 308) {
      const range = chunkRes.headers.get('Range');
      offset = range ? parseInt(range.split('-')[1]) + 1 : end;
      onProgress?.(Math.round((offset / file.size) * 95));
    } else { const err = await chunkRes.text(); throw new Error(`Upload chunk failed (${chunkRes.status}): ${err}`); }
  }
  if (!videoId) throw new Error('Upload completed but no video ID');

  if (thumbnailBlob && videoId) {
    try { await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, { method: 'POST', headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': thumbnailBlob.type || 'image/jpeg' }, body: thumbnailBlob }); } catch (_) {}
  }
  return { videoId, url: `https://youtu.be/${videoId}` };
}

export default function ChannelPublishStep({ videoFile, title, description, tags, thumbnailUrl, privacy, categoryId, onPrivacyChange, onCategoryChange }) {
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

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
    if (!videoFile || !selectedChannelId || !title.trim()) { setUploadError('Video, channel, and title required'); return; }
    setUploading(true); setUploadProgress(0); setUploadError(''); setUploadResult(null);
    try {
      const tokenRes = await base44.functions.invoke('youtubeAuth', { action: 'get_token', channel_id: selectedChannelId });
      if (!tokenRes.data?.access_token) throw new Error(tokenRes.data?.error || 'Failed to get token');

      let thumbnailBlob = null;
      if (thumbnailUrl) { try { const r = await fetch(thumbnailUrl); if (r.ok) thumbnailBlob = await r.blob(); } catch (_) {} }

      const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean);
      const result = await uploadToYouTube({
        accessToken: tokenRes.data.access_token,
        file: videoFile,
        metadata: { title: title.trim(), description: description.trim(), tags: tagArray, privacy, categoryId },
        thumbnailBlob,
        onProgress: setUploadProgress,
      });
      setUploadResult(result); setUploadProgress(100);
    } catch (err) { setUploadError(err.message || 'Upload failed'); }
    setUploading(false);
  };

  const selectedChannel = channels.find(c => c.channel_id === selectedChannelId);

  return (
    <div className="space-y-4">
      {/* Channel Selection */}
      <div>
        <label className="text-sm font-medium mb-1.5 block">YouTube Channel</label>
        {loadingChannels ? (
          <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
        ) : channels.length === 0 ? (
          <Button onClick={handleConnect} disabled={connecting} className="w-full bg-red-600 hover:bg-red-700 gap-2">
            {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />} Connect YouTube Channel
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
            <Button onClick={handleConnect} variant="outline" size="icon" className="h-10 w-10" title="Add channel"><Plus className="w-4 h-4" /></Button>
          </div>
        )}
        {selectedChannel && !selectedChannel.token_valid && (
          <div className="flex items-center gap-2 p-2 mt-2 bg-red-50 rounded text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5" /> Token expired.
            <Button onClick={handleConnect} size="sm" variant="outline" className="h-6 text-[10px] ml-auto border-red-300">Reconnect</Button>
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
          <Select value={privacy} onValueChange={onPrivacyChange}>
            <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="private">Private</SelectItem>
              <SelectItem value="unlisted">Unlisted</SelectItem>
              <SelectItem value="public">Public</SelectItem>
            </SelectContent>
          </Select>
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
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center gap-2 text-sm text-blue-700">
            <Loader2 className="w-4 h-4 animate-spin" /> Uploading to YouTube... <span className="ml-auto font-mono text-xs">{uploadProgress}%</span>
          </div>
          <Progress value={uploadProgress} className="h-2" />
          <p className="text-[10px] text-blue-500">Don't close this tab.</p>
        </div>
      )}

      {uploadError && (
        <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />{uploadError}
        </div>
      )}

      {uploadResult ? (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200 space-y-3">
          <div className="flex items-center gap-2 text-green-700"><Check className="w-5 h-5" /><span className="font-medium">Published to YouTube!</span></div>
          <a href={uploadResult.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
            <ExternalLink className="w-4 h-4" />{uploadResult.url}
          </a>
        </div>
      ) : (
        !uploading && (
          <Button onClick={handlePublish} disabled={!videoFile || !selectedChannelId || !title.trim()} className="w-full bg-red-600 hover:bg-red-700 gap-2 h-11">
            <Youtube className="w-5 h-5" /> Publish to YouTube
          </Button>
        )
      )}
    </div>
  );
}