import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Youtube, Upload, Loader2, CheckCircle, AlertCircle, Link2,
  Unlink2, Copy, Globe, Lock, Eye,
} from 'lucide-react';

export default function ClipAutoPublish({ clip, clipIndex, enhancement, clipBlob }) {
  var [channels, setChannels] = useState([]);
  var [selectedChannel, setSelectedChannel] = useState('');
  var [connecting, setConnecting] = useState(false);
  var [loadingChannels, setLoadingChannels] = useState(true);
  var [title, setTitle] = useState('');
  var [description, setDescription] = useState('');
  var [tags, setTags] = useState('');
  var [privacy, setPrivacy] = useState('private');
  var [publishing, setPublishing] = useState(false);
  var [published, setPublished] = useState(false);
  var [publishUrl, setPublishUrl] = useState('');
  var [error, setError] = useState('');

  useEffect(function() { loadChannels(); }, []);

  useEffect(function() {
    if (enhancement && enhancement.seo) {
      var seo = enhancement.seo;
      setTitle(seo.title || (clip && clip.title) || '');
      setDescription(seo.description || '');
      setTags((seo.hashtags || []).join(', '));
    } else {
      setTitle((clip && clip.title) || '');
    }
  }, [enhancement, clip]);

  var loadChannels = async function() {
    setLoadingChannels(true);
    try {
      var res = await base44.functions.invoke('youtubeAuth', { action: 'list_channels' });
      var data = res.data || res;
      if (data && data.channels && data.channels.length > 0) {
        setChannels(data.channels);
        var defaultCh = data.channels.find(function(c) { return c.is_default; }) || data.channels[0];
        setSelectedChannel(defaultCh.channel_id);
      }
    } catch (err) {
      console.log('No YouTube channels connected yet');
    } finally {
      setLoadingChannels(false);
    }
  };

  var connectChannel = async function() {
    setConnecting(true);
    setError('');
    try {
      var res = await base44.functions.invoke('youtubeAuth', { action: 'get_auth_url' });
      var data = res.data || res;
      if (data && data.auth_url) {
        var authWindow = window.open(data.auth_url, 'youtube-auth', 'width=600,height=700');
        var pollInterval = setInterval(async function() {
          if (authWindow && authWindow.closed) {
            clearInterval(pollInterval);
            await loadChannels();
            setConnecting(false);
          }
        }, 1000);
        setTimeout(function() { clearInterval(pollInterval); setConnecting(false); }, 120000);
      }
    } catch (err) {
      setError('Failed to start YouTube auth: ' + err.message);
      setConnecting(false);
    }
  };

  var disconnectChannel = async function() {
    if (!selectedChannel) return;
    try {
      await base44.functions.invoke('youtubeAuth', { action: 'disconnect', channel_id: selectedChannel });
      await loadChannels();
    } catch (err) {
      console.error('Disconnect failed:', err);
    }
  };

  var handlePublish = async function() {
    if (!clipBlob && !(clip && clip.clip_url)) {
      setError('Export the clip first, then publish');
      return;
    }
    if (!selectedChannel) {
      setError('Connect a YouTube channel first');
      return;
    }

    setPublishing(true);
    setError('');

    try {
      // Step 1: Get fresh access token via youtubeAuth
      var tokenRes = await base44.functions.invoke('youtubeAuth', {
        action: 'get_token',
        channel_id: selectedChannel,
      });
      var tokenData = tokenRes.data || tokenRes;
      if (!tokenData || !tokenData.access_token) {
        throw new Error('Failed to get access token — try reconnecting the channel');
      }
      var accessToken = tokenData.access_token;

      // Step 2: Get the video file
      var videoBlob = clipBlob;
      if (!videoBlob && clip && clip.clip_url) {
        var dlRes = await fetch(clip.clip_url);
        videoBlob = await dlRes.blob();
      }

      // Step 3: Build hashtag string
      var hashtagStr = tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean).map(function(t) { return t.startsWith('#') ? t : '#' + t; }).join(' ');
      var fullDescription = (description + '\n\n' + hashtagStr).trim();

      // Step 4: Upload to YouTube via resumable upload API
      var metadata = {
        snippet: {
          title: title.substring(0, 100),
          description: fullDescription.substring(0, 5000),
          tags: tags.split(',').map(function(t) { return t.trim(); }).filter(Boolean),
          categoryId: '22',
        },
        status: {
          privacyStatus: privacy,
          selfDeclaredMadeForKids: false,
        },
      };

      // Initiate resumable upload
      var initRes = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + accessToken,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Length': videoBlob.size.toString(),
          'X-Upload-Content-Type': videoBlob.type || 'video/mp4',
        },
        body: JSON.stringify(metadata),
      });

      if (!initRes.ok) {
        var errText = await initRes.text();
        throw new Error('YouTube upload init failed: ' + initRes.status + ' ' + errText.substring(0, 200));
      }

      var uploadUrl = initRes.headers.get('Location');
      if (!uploadUrl) throw new Error('No upload URL returned from YouTube');

      // Upload the video binary
      var uploadRes = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': videoBlob.type || 'video/mp4',
          'Content-Length': videoBlob.size.toString(),
        },
        body: videoBlob,
      });

      if (!uploadRes.ok) {
        var uploadErr = await uploadRes.text();
        throw new Error('YouTube upload failed: ' + uploadRes.status + ' ' + uploadErr.substring(0, 200));
      }

      var uploadData = await uploadRes.json();
      var videoId = uploadData.id;

      if (videoId) {
        setPublished(true);
        setPublishUrl('https://youtube.com/shorts/' + videoId);
        console.log('Published to YouTube Shorts: ' + videoId);
      } else {
        throw new Error('Upload completed but no video ID returned');
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  var copySeo = function() {
    var text = title + '\n\n' + description + '\n\n' + tags.split(',').map(function(t) { return '#' + t.trim(); }).join(' ');
    navigator.clipboard.writeText(text);
  };

  var selectedChannelObj = channels.find(function(c) { return c.channel_id === selectedChannel; });

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
            <Youtube className="w-3.5 h-3.5 text-red-500" />
            YouTube channel
          </span>
          {channels.length > 0 && (
            <button onClick={disconnectChannel}
              className="text-[10px] text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors">
              <Unlink2 className="w-3 h-3" /> Disconnect
            </button>
          )}
        </div>

        {loadingChannels ? (
          <div className="flex items-center gap-2 text-xs text-gray-400 p-3 rounded-lg bg-gray-50">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading channels...
          </div>
        ) : channels.length > 0 ? (
          <div className="space-y-2">
            {channels.length > 1 && (
              <Select value={selectedChannel} onValueChange={setSelectedChannel}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder="Select channel" />
                </SelectTrigger>
                <SelectContent>
                  {channels.map(function(ch) {
                    return <SelectItem key={ch.channel_id} value={ch.channel_id}>{ch.channel_name}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            )}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200">
              <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-emerald-800">{selectedChannelObj ? selectedChannelObj.channel_name : 'Connected'}</p>
                <p className="text-[10px] text-emerald-600">Token auto-refreshes — stays connected forever</p>
              </div>
            </div>
          </div>
        ) : (
          <Button variant="outline" size="sm"
            className="w-full h-9 text-xs gap-1.5 border-red-200 text-red-600 hover:bg-red-50"
            onClick={connectChannel} disabled={connecting}>
            {connecting ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" />Connecting...</>
            ) : (
              <><Link2 className="w-3.5 h-3.5" />Connect YouTube Channel</>
            )}
          </Button>
        )}
      </div>

      <div className="space-y-2.5">
        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Title</label>
          <Input value={title} onChange={function(e) { setTitle(e.target.value); }} className="h-8 text-xs mt-1" maxLength={100} />
          <span className="text-[10px] text-gray-400">{title.length}/100</span>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Description</label>
          <Textarea value={description} onChange={function(e) { setDescription(e.target.value); }} className="text-xs mt-1 min-h-[60px]" maxLength={5000} />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">Tags</label>
          <Input value={tags} onChange={function(e) { setTags(e.target.value); }} className="h-8 text-xs mt-1" placeholder="viral, shorts, fyp" />
        </div>
        {enhancement && enhancement.seo && enhancement.seo.ab_titles && enhancement.seo.ab_titles.length > 0 && (
          <div>
            <span className="text-[10px] uppercase tracking-wider text-gray-400 font-medium">A/B titles</span>
            <div className="space-y-1 mt-1">
              {enhancement.seo.ab_titles.map(function(t, i) {
                return (
                  <button key={i} onClick={function() { setTitle(t); }}
                    className="w-full text-left px-2 py-1.5 rounded text-xs text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-100">
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <Select value={privacy} onValueChange={setPrivacy}>
          <SelectTrigger className="h-9 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="private"><Lock className="w-3 h-3 inline mr-1" />Private</SelectItem>
            <SelectItem value="unlisted"><Eye className="w-3 h-3 inline mr-1" />Unlisted</SelectItem>
            <SelectItem value="public"><Globe className="w-3 h-3 inline mr-1" />Public</SelectItem>
          </SelectContent>
        </Select>
        <Button className="flex-1 h-9 text-xs bg-red-600 hover:bg-red-700 text-white gap-1.5"
          onClick={handlePublish} disabled={publishing || published || !selectedChannel}>
          {publishing ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Publishing...</>
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

      {publishUrl && (
        <a href={publishUrl} target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 hover:underline">
          <CheckCircle className="w-4 h-4" />
          Live on YouTube Shorts
        </a>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-600 p-2 rounded bg-red-50 border border-red-200">
          <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
}