import React, { useRef, useEffect, useState } from 'react';
import { Monitor, Film, Volume2, VolumeX } from 'lucide-react';

export default function PreviewMonitor({ currentScene, currentTime, isPlaying, totalScenes, totalDuration }) {
  const videoRef = useRef(null);
  const [videoError, setVideoError] = useState(false);

  const timeInScene = currentTime - (currentScene?.start_time || 0);
  const sceneDuration = currentScene?.duration_seconds || 8;
  const progress = Math.min(1, Math.max(0, timeInScene / sceneDuration));

  const hasVideo = currentScene?.video_url && !currentScene.video_url.startsWith('{');
  const hasImage = currentScene?.image_url;

  // Sync video playback
  useEffect(() => {
    if (!videoRef.current || !hasVideo) return;
    if (isPlaying) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  }, [isPlaying, hasVideo, currentScene?.id]);

  // Reset video on scene change
  useEffect(() => {
    setVideoError(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [currentScene?.id]);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-black rounded-xl overflow-hidden shadow-2xl border border-gray-800 mb-4">
      {/* Monitor frame */}
      <div className="relative aspect-video max-h-[420px] w-full bg-gray-950 flex items-center justify-center">
        {!currentScene ? (
          <div className="text-center text-gray-600">
            <Monitor className="w-16 h-16 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Press play to preview</p>
          </div>
        ) : hasVideo && !videoError ? (
          <video
            ref={videoRef}
            src={currentScene.video_url}
            className="w-full h-full object-contain"
            muted
            loop
            playsInline
            onError={() => setVideoError(true)}
          />
        ) : hasImage ? (
          <img
            src={currentScene.image_url}
            alt={`Scene ${currentScene.scene_number}`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="text-center text-gray-600">
            <Film className="w-12 h-12 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No media for Scene {currentScene.scene_number}</p>
          </div>
        )}

        {/* Scene progress bar overlay */}
        {currentScene && (
          <div className="absolute bottom-0 left-0 right-0">
            <div className="h-1 bg-gray-800">
              <div
                className="h-full bg-blue-500 transition-all duration-100"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Top-left scene badge */}
        {currentScene && (
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <div className="bg-black/70 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-medium">
              Scene {currentScene.scene_number} / {totalScenes}
            </div>
            {currentScene.status && (
              <div className={`text-[10px] px-2 py-0.5 rounded-full font-medium backdrop-blur-sm ${
                currentScene.status === 'video_generated' ? 'bg-green-500/20 text-green-300' :
                currentScene.status === 'image_generated' ? 'bg-blue-500/20 text-blue-300' :
                'bg-yellow-500/20 text-yellow-300'
              }`}>
                {currentScene.status.replace(/_/g, ' ')}
              </div>
            )}
          </div>
        )}

        {/* Top-right timecode */}
        {currentScene && (
          <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-full font-mono">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </div>
        )}
      </div>

      {/* Narration subtitle bar */}
      {currentScene?.narration_text && (
        <div className="bg-gray-900 px-4 py-2.5 border-t border-gray-800">
          <p className="text-gray-200 text-sm text-center leading-relaxed line-clamp-2">
            {currentScene.narration_text}
          </p>
        </div>
      )}
    </div>
  );
}