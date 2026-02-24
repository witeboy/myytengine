import React, { useRef, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Monitor, Film, Maximize2, Minimize2, Smartphone, MonitorIcon } from 'lucide-react';

export default function PreviewPanel({ currentScene, currentTime, isPlaying, totalScenes, totalDuration, orientation, projectId, onOrientationChange }) {
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);

  const timeInScene = currentTime - (currentScene?.start_time || 0);
  const sceneDuration = currentScene?.duration_seconds || 8;
  const progress = Math.min(1, Math.max(0, timeInScene / sceneDuration));

  const hasVideo = currentScene?.video_url?.startsWith('http');
  const hasImage = currentScene?.image_url?.startsWith('http');
  const isPortrait = orientation === 'portrait';

  useEffect(() => {
    if (!videoRef.current || !hasVideo) return;
    if (isPlaying) videoRef.current.play().catch(() => {});
    else videoRef.current.pause();
  }, [isPlaying, hasVideo, currentScene?.id]);

  useEffect(() => {
    setVideoError(false);
    if (videoRef.current) videoRef.current.currentTime = 0;
  }, [currentScene?.id]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const handleToggleOrientation = async () => {
    const newOrientation = isPortrait ? 'landscape' : 'portrait';
    if (projectId) {
      await base44.entities.Projects.update(projectId, { orientation: newOrientation });
    }
    onOrientationChange?.(newOrientation);
  };

  return (
    <div ref={containerRef} className="h-full flex flex-col bg-[#0d0d1a] items-center justify-center relative">
      {/* Top bar with orientation toggle */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-3 py-1.5 z-10">
        <span className="text-[10px] text-gray-500 font-medium">Player</span>
        <div className="flex items-center gap-1">
          {/* Orientation toggle */}
          <div className="flex items-center bg-black/40 backdrop-blur-sm rounded-md overflow-hidden border border-gray-700/50">
            <button
              onClick={handleToggleOrientation}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${
                !isPortrait ? 'bg-blue-600/80 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Landscape 16:9"
            >
              <MonitorIcon className="w-3 h-3" />
              <span>16:9</span>
            </button>
            <button
              onClick={handleToggleOrientation}
              className={`flex items-center gap-1 px-2 py-1 text-[10px] font-medium transition-colors ${
                isPortrait ? 'bg-blue-600/80 text-white' : 'text-gray-400 hover:text-white'
              }`}
              title="Portrait 9:16"
            >
              <Smartphone className="w-3 h-3" />
              <span>9:16</span>
            </button>
          </div>
          <button onClick={toggleFullscreen} className="bg-black/40 backdrop-blur-sm border border-gray-700/50 hover:bg-black/70 text-gray-400 hover:text-white p-1 rounded-md transition-colors">
            {isFullscreen ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {/* Preview container */}
      <div
        className="relative bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800/30 flex items-center justify-center"
        style={isPortrait
          ? { aspectRatio: '9/16', maxHeight: 'calc(100% - 60px)', width: 'auto', maxWidth: '50%' }
          : { aspectRatio: '16/9', maxWidth: '95%', maxHeight: 'calc(100% - 60px)', width: '100%' }
        }
      >
        {!currentScene ? (
          <div className="text-center text-gray-600 p-6">
            <Monitor className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-[11px]">Press play to preview</p>
          </div>
        ) : hasVideo && !videoError ? (
          <video
            ref={videoRef}
            src={currentScene.video_url}
            className="w-full h-full object-contain"
            muted loop playsInline
            onError={() => setVideoError(true)}
          />
        ) : hasImage ? (
          <img src={currentScene.image_url} alt={`Scene ${currentScene.scene_number}`} className="w-full h-full object-contain" />
        ) : (
          <div className="text-center text-gray-600 p-6">
            <Film className="w-8 h-8 mx-auto mb-2 opacity-20" />
            <p className="text-[11px]">No media — Scene {currentScene.scene_number}</p>
          </div>
        )}

        {/* Progress bar */}
        {currentScene && (
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gray-800">
            <div className="h-full bg-blue-500 transition-all duration-100" style={{ width: `${progress * 100}%` }} />
          </div>
        )}

        {/* Scene / time overlays */}
        {currentScene && (
          <>
            <div className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded font-medium">
              S{currentScene.scene_number}/{totalScenes}
            </div>
            <div className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-0.5 rounded font-mono">
              {formatTime(currentTime)}
            </div>
          </>
        )}
      </div>

      {/* Narration */}
      {currentScene?.narration_text && (
        <div className="absolute bottom-1 left-2 right-2">
          <p className="text-gray-400 text-[10px] text-center leading-snug line-clamp-2 bg-black/50 backdrop-blur-sm rounded px-2 py-1">
            {currentScene.narration_text}
          </p>
        </div>
      )}
    </div>
  );
}