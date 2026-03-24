import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Link2, Loader2, CheckCircle, AlertCircle, Clock, User, Youtube,
} from 'lucide-react';

export default function YouTubeUrlInput({ onResolved }) {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolved, setResolved] = useState(null);

  const isYouTubeUrl = (u) => {
    return /(?:youtube\.com|youtu\.be)/.test(u);
  };

  const handleResolve = async () => {
    if (!url.trim() || !isYouTubeUrl(url)) {
      setError('Paste a valid YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setResolved(null);

    try {
      const res = await base44.functions.invoke('resolveVideoUrl', { url: url.trim() });
      const data = res.data || res;

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to resolve video URL');
      }

      setResolved(data);
      onResolved?.({
        videoUrl: data.stream_url,
        audioUrl: data.audio_url,
        title: data.title,
        duration: data.duration,
        thumbnail: data.thumbnail,
        channel: data.channel,
        videoId: data.video_id,
        quality: data.quality,
      });

    } catch (err) {
      setError(err.message || 'Failed to resolve YouTube URL');
    } finally {
      setLoading(false);
    }
  };

  const handlePaste = async (e) => {
    const pasted = e.clipboardData?.getData('text') || '';
    if (isYouTubeUrl(pasted)) {
      setUrl(pasted);
      // Auto-resolve on paste
      setTimeout(() => {
        setUrl(pasted);
        handleResolve();
      }, 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleResolve();
  };

  const formatDuration = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}m ${s}s`;
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
            placeholder="Paste YouTube URL — youtube.com/watch?v=... or youtu.be/..."
            className="pl-9 h-10 text-sm"
            disabled={loading}
          />
        </div>
        <Button
          onClick={handleResolve}
          disabled={loading || !url.trim()}
          className="h-10 px-5 bg-red-600 hover:bg-red-700 text-white text-sm gap-1.5"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" />Resolving…</>
          ) : (
            <><Youtube className="w-4 h-4" />Resolve</>
          )}
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {/* Resolved Preview */}
      {resolved && (
        <div className="flex gap-3 p-3 rounded-lg bg-gray-50 border border-gray-200">
          {resolved.thumbnail && (
            <img
              src={resolved.thumbnail}
              alt=""
              className="w-32 h-20 rounded object-cover flex-shrink-0"
            />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 line-clamp-2">{resolved.title}</p>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
              {resolved.channel && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" /> {resolved.channel}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" /> {formatDuration(resolved.duration)}
              </span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {resolved.quality}
              </Badge>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              {resolved.has_streams ? (
                <>
                  <CheckCircle className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] text-emerald-600 font-medium">Stream URL resolved — ready to clip</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-3 h-3 text-amber-500" />
                  <span className="text-[10px] text-amber-600 font-medium">Metadata loaded — upload the file for clipping</span>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
