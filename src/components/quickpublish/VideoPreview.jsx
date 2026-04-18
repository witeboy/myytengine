import React, { useEffect, useState, useRef } from 'react';
import { FileVideo, Clock, Monitor, HardDrive, X } from 'lucide-react';

function formatDuration(seconds) {
  if (!seconds || !isFinite(seconds)) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!bytes) return '—';
  const mb = bytes / 1048576;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export default function VideoPreview({ videoFile, onClear }) {
  const [meta, setMeta] = useState({ duration: null, width: null, height: null });
  const [previewUrl, setPreviewUrl] = useState('');
  const videoRef = useRef(null);

  useEffect(() => {
    if (!videoFile) {
      setPreviewUrl('');
      setMeta({ duration: null, width: null, height: null });
      return;
    }
    const url = URL.createObjectURL(videoFile);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setMeta({
      duration: v.duration,
      width: v.videoWidth,
      height: v.videoHeight,
    });
  };

  if (!videoFile) return null;

  const sizeWarning = videoFile.size > 2 * 1024 * 1024 * 1024; // > 2GB

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <div className="relative bg-black aspect-video">
        {previewUrl && (
          <video
            ref={videoRef}
            src={previewUrl}
            onLoadedMetadata={handleLoadedMetadata}
            controls
            className="w-full h-full object-contain"
          />
        )}
        <button
          onClick={onClear}
          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/70 hover:bg-black/90 text-white flex items-center justify-center transition-colors"
          title="Remove video"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <FileVideo className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <p className="text-sm font-medium truncate">{videoFile.name}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="flex items-center gap-1 text-gray-600">
            <Clock className="w-3 h-3" />
            <span>{formatDuration(meta.duration)}</span>
          </div>
          <div className="flex items-center gap-1 text-gray-600">
            <Monitor className="w-3 h-3" />
            <span>{meta.width ? `${meta.width}×${meta.height}` : '—'}</span>
          </div>
          <div className={`flex items-center gap-1 ${sizeWarning ? 'text-amber-600' : 'text-gray-600'}`}>
            <HardDrive className="w-3 h-3" />
            <span>{formatSize(videoFile.size)}</span>
          </div>
        </div>
        {sizeWarning && (
          <p className="text-[10px] text-amber-600">
            Large file — upload may take a while on slow connections.
          </p>
        )}
      </div>
    </div>
  );
}