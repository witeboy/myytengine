import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Youtube, Upload, Check, Plus, Trash2, Star, Loader2,
  FileVideo, Image, Tag, AlertCircle, ExternalLink, X, Settings
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// Browser-side YouTube Resumable Upload
// ══════════════════════════════════════════════════════════════════
async function uploadToYouTube({ accessToken, file, metadata, thumbnailBlob, onProgress }) {
  // Step 1: Init resumable upload
  const initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Length': file.size,
      'X-Upload-Content-Type': file.type || 'video/mp4',
    },
    body: JSON.stringify({
      snippet: {
        title: metadata.title,
        description: metadata.description,
        tags: metadata.tags,
        categoryId: metadata.categoryId || '22',
        defaultLanguage: 'en',
      },
      status: {
        privacyStatus: metadata.privacy || 'private',
        selfDeclaredMadeForKids: false,
      },
    }),
  });

  if (!initRes.ok) {
    const err = await initRes.text();
    throw new Error(`YouTube init failed (${initRes.status}): ${err}`);
  }

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl) throw new Error('No upload URL returned from YouTube');

  // Step 2: Upload in 5MB chunks
  const CHUNK_SIZE = 5 * 1024 * 1024;
  let offset = 0;
  let videoId = null;

  while (offset < file.size) {
    const end = Math.min(offset + CHUNK_SIZE, file.size);
    const chunk = file.slice(offset, end);

    const chunkRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': chunk.size,
        'Content-Range': `bytes ${offset}-${end - 1}/${file.size}`,
      },
      body: chunk,
    });

    if (chunkRes.status === 200 || chunkRes.status === 201) {
      const data = await chunkRes.json();
      videoId = data.id;
      onProgress?.(100);
      break;
    } else if (chunkRes.status === 308) {
      const range = chunkRes.headers.get('Range');
      if (range) {
        offset = parseInt(range.split('-')[1]) + 1;
        onProgress?.(Math.round((offset / file.size) * 95));
      } else {
        offset = end;
        onProgress?.(Math.round((end / file.size) * 95));
      }
    } else {
      const err = await chunkRes.text();
      throw new Error(`Upload chunk failed (${chunkRes.status}): ${err}`);
    }
  }

  if (!videoId) throw new Error('Upload completed but no video ID returned');

  // Step 3: Set thumbnail
  if (thumbnailBlob && videoId) {
    try {
      await fetch(`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': thumbnailBlob.type || 'image/jpeg',
        },
        body: thumbnailBlob,
      });
    } catch (e) { console.warn('Thumbnail upload failed:', e.message); }
  }

  return { videoId, url: `https://youtu.be/${videoId}` };
}

// ══════════════════════════════════════════════════════════════════
// Main Component
// ══════════════════════════════════════════════════════════════════
export default function YouTubePublishPanel({ project }) {
  const [channels, setChannels] = useState([]);
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [categoryId, setCategoryId] = useState('22');
  const [titleOptions, setTitleOptions] = useState([]);
  const [descriptionOptions, setDescriptionOptions] = useState([]);
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  const [videoFile, setVideoFile] = useState(null);
  const fileInputRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // ── Load channels ─────────────────────────────────────────────
  useEffect(() => { loadChannels(); }, []);

  const loadChannels = async () => {
    setLoadingChannels(true);
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'list_channels' });
      const ch = res.data?.channels || [];
      setChannels(ch);
      const def = ch.find(c => c.is_default) || ch[0];
      if (def) setSelectedChannelId(def.channel_id);
    } catch (err) { console.warn('Failed to load channels:', err.message); }
    setLoadingChannels(false);
  };

  // ── Load metadata ─────────────────────────────────────────────
  useEffect(() => {
    if (!project?.id) return;
    loadMetadata();
  }, [project?.id]);

  const loadMetadata = async () => {
    try {
      const meta = await base44.entities.UploadMetadata.filter({ project_id: project.id });
      if (meta[0]) {
        const m = meta[0];
        setTitle(m.title_primary || project.name || '');
        setDescription(m.description_template || '');
        if (m.selected_channel_id) setSelectedChannelId(m.selected_channel_id);

        const titles = [m.title_primary, m.title_variation_1, m.title_variation_2, m.title_variation_3, m.title_variation_4].filter(Boolean);
        setTitleOptions(titles);

        const descs = [];
        if (m.description_template) descs.push({ label: 'Hook-Heavy', content: m.description_template });
        if (m.description_alt_1) descs.push({ label: 'SEO-Optimized', content: m.description_alt_1 });
        if (m.description_alt_2) descs.push({ label: 'Storytelling', content: m.description_alt_2 });
        setDescriptionOptions(descs);

        try { setTags(JSON.parse(m.tags || '[]').join(', ')); } catch (_) { setTags(m.tags || ''); }
      }

      const thumbs = await base44.entities.ThumbnailConcepts.filter({ project_id: project.id });
      const selected = thumbs.find(t => t.is_selected && t.image_url) || thumbs.find(t => t.image_url);
      if (selected) setThumbnailUrl(selected.image_url);
    } catch (err) { console.warn('Failed to load metadata:', err.message); }
  };

  // ── Connect channel ───────────────────────────────────────────
  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'get_auth_url' });
      if (res.data?.auth_url) window.location.href = res.data.auth_url;
    } catch (err) { setUploadError('Failed to get auth URL: ' + err.message); }
    setConnecting(false);
  };

  const handleDisconnect = async (chId) => {
    try {
      await base44.functions.invoke('youtubeAuth', { action: 'disconnect', channel_id: chId });
      await loadChannels();
    } catch (err) { console.warn('Disconnect failed:', err.message); }
  };

  const handleSetDefault = async (chId) => {
    try {
      await base44.functions.invoke('youtubeAuth', { action: 'set_default', channel_id: chId });
      await loadChannels();
    } catch (err) { console.warn('Set default failed:', err.message); }
  };

  // ── File picker ───────────────────────────────────────────────
  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('video/')) { setUploadError('Please select a video file'); return; }
      setVideoFile(file);
      setUploadError('');
    }
  };

  // ── Publish ───────────────────────────────────────────────────
  const handlePublish = async () => {
    if (!videoFile) { setUploadError('Select a video file first'); return; }
    if (!selectedChannelId) { setUploadError('Select a YouTube channel first'); return; }
    if (!title.trim()) { setUploadError('Title is required'); return; }

    setUploading(true);
    setUploadProgress(0);
    setUploadError('');
    setUploadResult(null);

    try {
      // Save selected channel to project metadata
      try {
        const meta = await base44.entities.UploadMetadata.filter({ project_id: project.id });
        if (meta[0]) await base44.entities.UploadMetadata.update(meta[0].id, { selected_channel_id: selectedChannelId });
      } catch (_) {}

      // Get fresh token
      const tokenRes = await base44.functions.invoke('youtubeAuth', { action: 'get_token', channel_id: selectedChannelId });
      if (!tokenRes.data?.access_token) throw new Error(tokenRes.data?.error || 'Failed to get token. Reconnect channel.');

      // Fetch thumbnail as blob
      let thumbnailBlob = null;
      if (thumbnailUrl) {
        try {
          const r = await fetch(thumbnailUrl);
          if (r.ok) thumbnailBlob = await r.blob();
        } catch (_) {}
      }

      // Upload to YouTube
      const tagArray = tags.split(',').map(t => t.trim()).filter(Boolean);
      const result = await uploadToYouTube({
        accessToken: tokenRes.data.access_token,
        file: videoFile,
        metadata: { title: title.trim(), description: description.trim(), tags: tagArray, privacy, categoryId },
        thumbnailBlob,
        onProgress: setUploadProgress,
      });

      setUploadResult(result);
      setUploadProgress(100);
    } catch (err) {
      console.error('YouTube upload failed:', err);
      setUploadError(err.message || 'Upload failed');
    }
    setUploading(false);
  };

  const selectedChannel = channels.find(c => c.channel_id === selectedChannelId);

  return (
    <Card className="border-red-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Youtube className="w-5 h-5 text-red-600" />
          <span>Publish to YouTube</span>
          {uploadResult && <Badge className="bg-green-100 text-green-800 text-xs ml-auto">Published!</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Channel Selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium">YouTube Channel</label>
            {channels.length > 0 && <button onClick={() => setShowSettings(!showSettings)} className="text-gray-400 hover:text-gray-600"><Settings className="w-3.5 h-3.5" /></button>}
          </div>

          {loadingChannels ? (
            <div className="flex items-center gap-2 text-sm text-gray-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading channels...</div>
          ) : channels.length === 0 ? (
            <Button onClick={handleConnect} disabled={connecting} className="w-full bg-red-600 hover:bg-red-700 gap-2">
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Youtube className="w-4 h-4" />}
              Connect YouTube Channel
            </Button>
          ) : (
            <div className="space-y-2">
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

              {showSettings && (
                <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                  <p className="text-xs font-medium text-gray-600">Connected Channels</p>
                  {channels.map(ch => (
                    <div key={ch.channel_id} className="flex items-center gap-2 p-2 bg-white rounded border">
                      {ch.channel_thumbnail && <img src={ch.channel_thumbnail} className="w-6 h-6 rounded-full" alt="" />}
                      <span className="flex-1 text-sm truncate">{ch.channel_name}</span>
                      {ch.is_default && <Badge className="bg-amber-100 text-amber-700 text-[9px]">Default</Badge>}
                      {!ch.token_valid && <Badge className="bg-red-100 text-red-700 text-[9px]">Expired</Badge>}
                      <button onClick={() => handleSetDefault(ch.channel_id)} className="text-gray-400 hover:text-amber-500" title="Set default"><Star className="w-3.5 h-3.5" /></button>
                      <button onClick={() => handleDisconnect(ch.channel_id)} className="text-gray-400 hover:text-red-500" title="Disconnect"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  <Button onClick={handleConnect} variant="outline" size="sm" className="w-full gap-1.5 text-xs"><Plus className="w-3 h-3" /> Connect Another Channel</Button>
                </div>
              )}

              {selectedChannel && !selectedChannel.token_valid && (
                <div className="flex items-center gap-2 p-2 bg-red-50 rounded text-xs text-red-700">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Token expired.</span>
                  <Button onClick={handleConnect} size="sm" variant="outline" className="h-6 text-[10px] ml-auto border-red-300">Reconnect</Button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Video File */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">Video File</label>
          <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />
          {videoFile ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <FileVideo className="w-5 h-5 text-green-600" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{videoFile.name}</p>
                <p className="text-xs text-gray-500">{(videoFile.size / 1048576).toFixed(1)} MB</p>
              </div>
              <button onClick={() => setVideoFile(null)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full p-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-colors text-center">
              <Upload className="w-6 h-6 mx-auto text-gray-400 mb-2" />
              <p className="text-sm text-gray-600">Click to select your exported MP4</p>
              <p className="text-xs text-gray-400 mt-1">.mp4, .mov, .webm</p>
            </button>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">Title</label>
          <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Video title" maxLength={100} />
          <span className={`text-[10px] ${title.length > 60 ? 'text-red-500' : 'text-gray-400'}`}>{title.length}/100</span>
          {titleOptions.length > 1 && (
            <div className="mt-1.5 max-h-24 overflow-y-auto space-y-1">
              {titleOptions.map((t, i) => (
                <button key={i} onClick={() => setTitle(t)}
                  className={`w-full text-left px-2 py-1.5 rounded text-xs ${title === t ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}>
                  {t}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="text-sm font-medium mb-1.5 block">Description</label>
          <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Video description" className="text-sm" />
          {descriptionOptions.length > 1 && (
            <div className="flex gap-1 mt-1.5">
              {descriptionOptions.map((d, i) => (
                <button key={i} onClick={() => setDescription(d.content)}
                  className={`flex-1 px-2 py-1 rounded text-[10px] font-medium ${description === d.content ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Tags */}
        <div>
          <label className="text-sm font-medium mb-1.5 block flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Tags</label>
          <Textarea value={tags} onChange={e => setTags(e.target.value)} rows={2} placeholder="tag1, tag2, tag3..." className="text-xs" />
          <p className="text-[10px] text-gray-400 mt-0.5">{tags.split(',').filter(t => t.trim()).length} tags</p>
        </div>

        {/* Thumbnail */}
        {thumbnailUrl && (
          <div>
            <label className="text-sm font-medium mb-1.5 block flex items-center gap-1"><Image className="w-3.5 h-3.5" /> Thumbnail</label>
            <img src={thumbnailUrl} className="w-full aspect-video object-cover rounded-lg border" alt="Thumbnail" />
          </div>
        )}

        {/* Privacy + Category */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="text-sm font-medium mb-1.5 block">Privacy</label>
            <Select value={privacy} onValueChange={setPrivacy}>
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
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="22">People & Blogs</SelectItem>
                <SelectItem value="27">Education</SelectItem>
                <SelectItem value="28">Science & Tech</SelectItem>
                <SelectItem value="24">Entertainment</SelectItem>
                <SelectItem value="26">Howto & Style</SelectItem>
                <SelectItem value="1">Film & Animation</SelectItem>
                <SelectItem value="10">Music</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Progress */}
        {uploading && (
          <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Uploading to YouTube...</span>
              <span className="ml-auto font-mono text-xs">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-[10px] text-blue-500">Uploading from your browser. Don't close this tab.</p>
          </div>
        )}

        {uploadError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-200 text-sm text-red-700">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" /><span>{uploadError}</span>
          </div>
        )}

        {uploadResult && (
          <div className="p-4 bg-green-50 rounded-lg border border-green-200 space-y-3">
            <div className="flex items-center gap-2 text-green-700"><Check className="w-5 h-5" /><span className="font-medium">Published to YouTube!</span></div>
            <a href={uploadResult.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
              <ExternalLink className="w-4 h-4" />{uploadResult.url}
            </a>
            <Button onClick={() => setUploadResult(null)} variant="outline" size="sm" className="w-full">Upload Another Video</Button>
          </div>
        )}

        {!uploading && !uploadResult && (
          <Button onClick={handlePublish} disabled={!videoFile || !selectedChannelId || !title.trim()} className="w-full bg-red-600 hover:bg-red-700 gap-2 h-11">
            <Youtube className="w-5 h-5" /> Publish to YouTube
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
