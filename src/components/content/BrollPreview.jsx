import React, { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Film, ExternalLink, X } from 'lucide-react';

export default function BrollPreview({ scene, onRemove }) {
  const [showVideo, setShowVideo] = useState(false);

  if (!scene.broll_url) return null;

  const sourceLabel = scene.broll_source === 'pexels' ? 'Pexels' :
                      scene.broll_source === 'pixabay' ? 'Pixabay' :
                      scene.broll_source || 'Stock';

  const sourceColor = scene.broll_source === 'pexels' ? 'bg-green-100 text-green-700' :
                      scene.broll_source === 'pixabay' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-700';

  return (
    <div className="border-t pt-2">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-medium text-gray-500 flex items-center gap-1">
          <Film className="w-3 h-3" /> B-Roll
        </p>
        <div className="flex items-center gap-1">
          <Badge className={`text-[9px] ${sourceColor}`}>{sourceLabel}</Badge>
          {scene.broll_query && (
            <Badge variant="outline" className="text-[9px]">"{scene.broll_query}"</Badge>
          )}
        </div>
      </div>

      {showVideo ? (
        <div className="relative rounded overflow-hidden bg-black">
          <video
            src={scene.broll_url}
            controls
            autoPlay
            className="w-full aspect-video object-contain"
          />
          <button
            onClick={() => setShowVideo(false)}
            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ) : (
        <div
          className="relative rounded overflow-hidden bg-gray-900 cursor-pointer group"
          onClick={() => setShowVideo(true)}
        >
          {scene.broll_thumbnail && !scene.broll_thumbnail.includes('undefined') ? (
            <img
              src={scene.broll_thumbnail}
              alt="B-roll thumbnail"
              className="w-full aspect-video object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            />
          ) : (
            <div className="w-full aspect-video flex items-center justify-center">
              <Film className="w-6 h-6 text-gray-500" />
            </div>
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="bg-white/90 rounded-full p-1.5 shadow group-hover:scale-110 transition-transform">
              <Film className="w-3.5 h-3.5 text-gray-700" />
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 mt-1.5">
        <a
          href={scene.broll_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5 flex-1"
        >
          <ExternalLink className="w-2.5 h-2.5" /> Open original
        </a>
        {onRemove && (
          <button
            onClick={onRemove}
            className="text-[10px] text-red-500 hover:text-red-700"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}