import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Link2, Loader2, CheckCircle, AlertCircle, Clock, User, Youtube,
  Upload, ExternalLink,
} from 'lucide-react';

function getYouTubeID(url) {
  if (!url) return null;
  const regExp = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

export default function YouTubeUrlInput({ onResolved }) {
  const [url, setUrl] = useState('');
  const [videoId, setVideoId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [metadata, setMetadata] = useState(null);

  useEffect(() => {
    if (videoId) fetchMetadata(videoId);
  }, [videoId]);

  const handleUrlChange = (val) => {
    setUrl(val);
    setError('');
    setMetadata(null);
    const id = getYouTubeID(val);
    setVideoId(id || null);
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData?.getData('text') || '';
    if (pasted) {
      setTimeout(() => handleUrlChange(pasted), 50);
    }
  };

  const fetchMetadata = async (id) => {
    setLoading(true);
    setError('');

    try {
      const oembedUrl = 'https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=' + id + '&format=json';
      const res = await fetch(oembedUrl);

      if (!res.ok) throw new Error('Video not found or is private');

      const data = await res.json();

      const meta = {
        videoId: id,
        title: data.title || '',
        channel: data.author_name || '',
        thumbnail: 'https://img.youtube.com/vi/' + id + '/maxresdefault.jpg',
      };

      setMetadata(meta);

      onResolved?.({
        videoId: id,
        title: meta.title,
        channel: meta.channel,
        thumbnail: meta.thumbnail,
      });

    } catch (err) {
      setError(err.message || 'Failed to load video info');
      setMetadata(null);
    } finally {
      setLoading(false);
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
            onChange={(e) => handleUrlChange(e.target.value)}
            onPaste={handlePaste}
            placeholder="Paste YouTube URL — youtube.com/watch?v=... or youtu.be/..."
            className="pl-9 h-10 text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {loading && !metadata && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Loading video info...
        </div>
      )}

      {/* Resolved: Embedded YouTube Player + Info */}
      {metadata && videoId && (
        <div className="rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
          {/* Official YouTube IFrame embed — never blocked */}
          <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={'https://www.youtube.com/embed/' + videoId + '?rel=0&modestbranding=1'}
              title={metadata.title}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>

          <div className="p-3 space-y-2">
            <p className="text-sm font-medium text-gray-900 line-clamp-2">{metadata.title}</p>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {metadata.channel && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" /> {metadata.channel}
                </span>
              )}
              <a
                href={'https://www.youtube.com/watch?v=' + videoId}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-500 hover:underline"
              >
                <ExternalLink className="w-3 h-3" /> Open on YouTube
              </a>
            </div>

            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
              <Upload className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-800">Now upload this video file to extract clips</p>
                <p className="text-[10px] text-amber-600">Switch to "Upload File" tab above and drop the downloaded video</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
