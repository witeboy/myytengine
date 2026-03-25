import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Link2, Loader2, AlertCircle, User, Youtube,
  ExternalLink, CheckCircle, Play, Pause,
} from 'lucide-react';

function getYouTubeID(url) {
  if (!url) return null;
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

export default function YouTubeUrlInput({ onVideoReady }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolved, setResolved] = useState(null);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef(null);

  const handleResolve = async (inputUrl) => {
    const targetUrl = inputUrl || url;
    if (!targetUrl.trim()) return;

    const videoId = getYouTubeID(targetUrl);
    if (!videoId) {
      setError('Paste a valid YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setResolved(null);

    try {
      const res = await base44.functions.invoke('downloadYouTubeVideo', {
        url: targetUrl.trim(),
      });

      const data = res.data || res;

      if (!data?.success || !data?.video_url) {
        throw new Error(data?.error || 'Failed to get video download URL');
      }

      setResolved(data);

      // Notify parent — pipeline can start immediately
      onVideoReady?.({
        videoUrl: data.video_url,
        audioUrl: data.audio_url || data.video_url,
        title: data.title || '',
        channel: data.channel || '',
        videoId: data.video_id || videoId,
        thumbnail: data.thumbnail || '',
      });

    } catch (err) {
      setError(err.message || 'Failed to resolve video');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData?.getData('text') || '';
    if (pasted && getYouTubeID(pasted)) {
      setUrl(pasted);
      setTimeout(() => handleResolve(pasted), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleResolve();
  };

  const togglePlay = () => {
    const vid = videoRef.current;
    if (!vid) return;
    if (playing) {
      vid.pause();
      setPlaying(false);
    } else {
      vid.play();
      setPlaying(true);
    }
  };

  return (
    <div className="space-y-3">
      {/* URL Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(''); }}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            placeholder="Paste YouTube URL — youtube.com/watch?v=..."
            className="pl-9 h-10 text-sm"
            disabled={loading}
          />
        </div>
        <Button
          onClick={() => handleResolve()}
          disabled={loading || !url.trim()}
          className="h-10 px-5 bg-red-600 hover:bg-red-700 text-white text-sm gap-1.5"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Loading…</>
          ) : (
            <><Youtube className="w-4 h-4" />Get Video</>
          )}
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5" /> {error}
        </div>
      )}

      {/* Resolved: Native video player + info */}
      {resolved && (
        <div className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          {/* Native video player — plays the cobalt tunnel URL */}
          <div className="relative bg-black cursor-pointer group" onClick={togglePlay}>
            <video
              ref={videoRef}
              src={resolved.video_url}
              className="w-full aspect-video object-contain"
              preload="auto"
              crossOrigin="anonymous"
              playsInline
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              poster={resolved.thumbnail}
            />
            <div className={`absolute inset-0 flex items-center justify-center bg-black/20 transition-opacity ${playing ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
              <div className="w-16 h-16 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                {playing ? (
                  <Pause className="w-7 h-7 text-white" />
                ) : (
                  <Play className="w-7 h-7 text-white ml-1" />
                )}
              </div>
            </div>
          </div>

          {/* Info bar */}
          <div className="px-4 py-3">
            <p className="text-sm font-medium text-gray-900 line-clamp-2">{resolved.title}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
              {resolved.channel && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" /> {resolved.channel}
                </span>
              )}
              <a
                href={'https://www.youtube.com/watch?v=' + (resolved.video_id || '')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-500 hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> YouTube
              </a>
            </div>
            <div className="flex items-center gap-1.5 mt-2">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-medium text-emerald-600">Video loaded — ready to extract clips</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
