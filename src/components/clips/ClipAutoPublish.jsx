import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Youtube, Upload, Loader2, CheckCircle, AlertCircle, Link2,
  Unlink2, Copy, Hash, Clock, Globe, Lock, Eye,
} from 'lucide-react';

export default function ClipAutoPublish({ clip, clipIndex, enhancement, clipBlob }) {
  // ── YouTube Auth State ──────────────────────────────────────
  const [channels, setChannels] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(true);

  // ── Publish State ───────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState('private');
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(false);
  const [publishUrl, setPublishUrl] = useState('');
  const [error, setError] = useState('');

  // ── Load connected channels ─────────────────────────────────
  useEffect(() => {
    loadChannels();
  }, []);

  // ── Pre-fill from enhancement SEO data ──────────────────────
  useEffect(() => {
    if (enhancement?.seo) {
      const seo = enhancement.seo;
      setTitle(seo.title || clip?.title || '');
      setDescription(seo.description || '');
      setTags((seo.hashtags || []).join(', '));
    } else {
      setTitle(clip?.title || '');
    }
  }, [enhancement, clip]);

  const loadChannels = async () => {
    setLoadingChannels(true);
    try {
      // Check for stored YouTube auth tokens
      const stored = await base44.entities.ProductionSettings.list('-created_date', 10);
      const ytSettings = stored?.filter(s => s.setting_type === 'youtube_channel' && s.is_active);

      if (ytSettings?.length > 0) {
        setChannels(ytSettings.map(s => ({
          id: s.id,
          name: s.channel_name || s.name || 'YouTube Channel',
          channelId: s.channel_id,
          thumbnail: s.thumbnail_url,
        })));
        setSelectedChannel(ytSettings[0].id);
      }
    } catch (err) {
      console.error('Failed to load channels:', err);
    } finally {
      setLoadingChannels(false);
    }
  };

  // ── Connect YouTube Channel ─────────────────────────────────
  const connectChannel = async () => {
    setConnecting(true);
    setError('');
    try {
      const res = await base44.functions.invoke('youtubeAuth', { action: 'getAuthUrl' });
      const data = res.data || res;
      if (data?.auth_url) {
        // Open OAuth window
        const authWindow = window.open(data.auth_url, 'youtube-auth', 'width=600,height=700');

        // Poll for completion
        const pollInterval = setInterval(async () => {
          if (authWindow?.closed) {
            clearInterval(pollInterval);
            await loadChannels();
            setConnecting(false);
          }
        }, 1000);

        // Timeout after 2 minutes
        setTimeout(() => {
          clearInterval(pollInterval);
          setConnecting(false);
        }, 120000);
      }
    } catch (err) {
      setError('Failed to start YouTube auth: ' + err.message);
      setConnecting(false);
    }
  };

  // ── Disconnect Channel ──────────────────────────────────────
  const disconnectChannel = async (channelSettingId) => {
    try {
      await base44.entities.ProductionSettings.update(channelSettingId, { is_active: false });
      await loadChannels();
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  };

  // ── Publish to YouTube Shorts ───────────────────────────────
  const handlePublish = async () => {
    if (!clipBlob && !clip?.clip_url) {
      setError('Clip not yet exported — clip the video first, then publish');
      return;
    }
    if (!selectedChannel) {
      setError('Connect a YouTube channel first');
      return;
    }

    setPublishing(true);
    setError('');

    try {
      // Upload clip file to get a URL
      let videoUrl = clip?.clip_url;

      if (clipBlob) {
        const file = new File([clipBlob], `${(title || 'clip').replace(/[^a-zA-Z0-9]/g, '_')}.mp4`, {
          type: 'video/mp4',
        });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        videoUrl = file_url;
      }

      // Build hashtag string for description
      const hashtagStr = tags
        .split(',')
        .map(t => t.trim())
        .filter(Boolean)
        .map(t => t.startsWith('#') ? t : `#${t}`)
        .join(' ');

      const fullDescription = `${description}\n\n${hashtagStr}`.trim();

      // Publish via YouTube API
      const publishRes = await base44.functions.invoke('youtubeAuth', {
        action: 'uploadVideo',
        channel_setting_id: selectedChannel,
        video_url: videoUrl,
        title: title.substring(0, 100),
        description: fullDescription.substring(0, 5000),
        tags: tags.split(',').map(t => t.trim()).filter(Boolean),
        privacy_status: privacy,
        category_id: '22', // People & Blogs (best for Shorts)
        is_short: true,
      });

      const publishData = publishRes.data || publishRes;

      if (publishData?.video_id) {
        setPublished(true);
        setPublishUrl(`https://youtube.com/shorts/${publishData.video_id}`);
      } else {
        throw new Error(publishData?.error || 'Upload failed');
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  // ── Copy SEO to clipboard ──────────────────────────────────
  const copySeo = () => {
    const text = `${title}\n\n${description}\n\n${tags.split(',').map(t => '#' + t.trim()).join(' ')}`;
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="space-y-4">

      {/* Channel Connection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
            <Youtube className="w-3.5 h-3.5 text-red-500" />
            YouTube channel
          </span>

          {channels.length > 0 && (
            <button
              onClick={() => disconnectChannel(selectedChannel)}
              className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors"
            >
              <Unlink2 className="w-3 h-3" /> Disconnect
            </button>
          )}
        </div>

        {loadingChannels ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 p-3 rounded-lg bg-gray-50">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading channels…
          </div>
        ) : channels.length > 0 ? (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
            <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-emerald-800">{channels.find(c => c.id === selectedChannel)?.name || 'Connected'}</p>
              <p className="text-[10px] text-emerald-600">Channel stays connected until you disconnect</p>
            </div>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="w-full h-9 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
            onClick={connectChannel}
            disabled={connecting}
          >
            {connecting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Connecting…</>
            ) : (
              <><Link2 className="w-3.5 h-3.5" />Connect YouTube Channel</>
            )}
          </Button>
        )}
      </div>

      {/* SEO Fields (pre-filled from Claude) */}
      <div className="space-y-2.5">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-8 text-xs mt-1"
            maxLength={100}
          />
          <span className="text-[10px] text-gray-400">{title.length}/100</span>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="text-xs mt-1 min-h-[60px]"
            maxLength={5000}
          />
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Tags (comma separated)</label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="h-8 text-xs mt-1"
            placeholder="viral, shorts, fyp, ..."
          />
        </div>

        {/* A/B Title Variants */}
        {enhancement?.seo?.ab_titles?.length > 0 && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">A/B title variants (click to use)</span>
            <div className="space-y-1 mt-1">
              {enhancement.seo.ab_titles.map((t, i) => (
                <button
                  key={i}
                  onClick={() => setTitle(t)}
                  className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-100 transition-colors"
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Privacy + Publish */}
      <div className="flex gap-2">
        <Select value={privacy} onValueChange={setPrivacy}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="private"><Lock className="w-3 h-3 inline mr-1" />Private</SelectItem>
            <SelectItem value="unlisted"><Eye className="w-3 h-3 inline mr-1" />Unlisted</SelectItem>
            <SelectItem value="public"><Globe className="w-3 h-3 inline mr-1" />Public</SelectItem>
          </SelectContent>
        </Select>

        <Button
          className="flex-1 h-9 text-xs bg-red-600 hover:bg-red-700 text-white gap-1.5"
          onClick={handlePublish}
          disabled={publishing || published || !selectedChannel}
        >
          {publishing ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Publishing…</>
          ) : published ? (
            <><CheckCircle className="w-3.5 h-3.5" />Published!</>
          ) : (
            <><Upload className="w-3.5 h-3.5" />Publish to Shorts</>
          )}
        </Button>

        <Button variant="outline" size="sm" className="h-9 text-xs gap-1" onClick={copySeo}>
          <Copy className="w-3 h-3" />
        </Button>
      </div>

      {/* Published link */}
      {publishUrl && (
        <a
          href={publishUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 hover:underline"
        >
          <CheckCircle className="w-4 h-4" />
          Live on YouTube Shorts → {publishUrl}
        </a>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-xs text-red-600 p-2 rounded bg-red-50 border border-red-200">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}
