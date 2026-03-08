import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAudioSync, usePlayback } from './useAudioSync';
import RealtimeCaptions from './RealtimeCaptions';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Maximize, Minimize, Settings, Wand2, Loader2, CheckCircle
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// VideoPreview — Full Video Preview with Synced Audio & Captions
// ══════════════════════════════════════════════════════════════════

export default function VideoPreview({
  scenes = [],
  projectId,
  orientation = 'landscape', // 'landscape' | 'portrait'
  captionStyle = 'default'
}) {
  const containerRef = useRef(null);
  const audioRef = useRef(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);

  // Use audio sync hook
  const {
    syncedScenes,
    totalDuration,
    isLoading: isSyncing,
    syncToAudio,
    getSceneAtTime,
    getCaptionAtTime
  } = useAudioSync(scenes, projectId);

  // Use playback hook
  const {
    isPlaying,
    currentTime,
    toggle,
    seek,
    skipForward,
    skipBackward,
    restart
  } = usePlayback(totalDuration);

  // Get current scene and caption
  const currentScene = getSceneAtTime(currentTime);
  const currentCaption = getCaptionAtTime(currentTime);

  // Play audio for current scene
  useEffect(() => {
    if (!audioRef.current || !currentScene?.audio_url) return;
    
    // Check if we need to switch audio source
    if (audioRef.current.src !== currentScene.audio_url) {
      audioRef.current.src = currentScene.audio_url;
      audioRef.current.currentTime = currentTime - currentScene.start_time;
    }

    if (isPlaying) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentScene, currentTime]);

  // Sync audio time with timeline
  useEffect(() => {
    if (!audioRef.current || !currentScene) return;
    
    const sceneTime = currentTime - currentScene.start_time;
    if (Math.abs(audioRef.current.currentTime - sceneTime) > 0.5) {
      audioRef.current.currentTime = sceneTime;
    }
  }, [currentTime, currentScene]);

  // Volume control
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Fullscreen toggle
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  }, []);

  // Format time
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // Aspect ratio classes
  const aspectRatio = orientation === 'portrait' ? 'aspect-[9/16]' : 'aspect-video';

  return (
    <div 
      ref={containerRef}
      className="relative bg-black rounded-xl overflow-hidden"
    >
      {/* Hidden audio element */}
      <audio ref={audioRef} preload="auto" />

      {/* Video/Image Display */}
      <div className={`relative ${aspectRatio} bg-gray-900`}>
        {/* Current scene image */}
        {currentScene?.image_url ? (
          <img
            src={currentScene.image_url}
            alt={`Scene ${currentScene.scene_number}`}
            className="absolute inset-0 w-full h-full object-contain"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-500">No scene</p>
          </div>
        )}

        {/* Real-time Captions */}
        <RealtimeCaptions
          caption={currentCaption}
          currentTime={currentTime}
          style={captionStyle}
          position="bottom"
        />

        {/* Scene indicator */}
        <div className="absolute top-4 left-4 bg-black/60 rounded-lg px-3 py-1.5">
          <p className="text-white text-sm font-medium">
            Scene {currentScene?.scene_number || '-'} / {syncedScenes.length}
          </p>
        </div>

        {/* Sync status */}
        {isSyncing && (
          <div className="absolute top-4 right-4 bg-purple-600 rounded-lg px-3 py-1.5 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-white" />
            <span className="text-white text-sm">Syncing...</span>
          </div>
        )}
      </div>

      {/* Controls Bar */}
      <div className="bg-gray-900 p-3">
        {/* Progress bar */}
        <div 
          className="relative h-1.5 bg-gray-700 rounded-full cursor-pointer mb-3 group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - rect.left) / rect.width;
            seek(pct * totalDuration);
          }}
        >
          {/* Scene segments */}
          {syncedScenes.map((scene, idx) => (
            <div
              key={scene.id}
              className="absolute top-0 bottom-0 border-r border-gray-600"
              style={{
                left: `${(scene.start_time / totalDuration) * 100}%`,
                width: `${(scene.duration / totalDuration) * 100}%`,
                backgroundColor: idx % 2 === 0 ? '#374151' : '#4B5563'
              }}
            />
          ))}
          
          {/* Progress */}
          <div 
            className="absolute top-0 bottom-0 left-0 bg-purple-500 rounded-full"
            style={{ width: `${(currentTime / totalDuration) * 100}%` }}
          />
          
          {/* Handle */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
            style={{ left: `calc(${(currentTime / totalDuration) * 100}% - 6px)` }}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          {/* Left: Playback */}
          <div className="flex items-center gap-2">
            <button
              onClick={skipBackward}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <SkipBack size={20} />
            </button>
            
            <button
              onClick={toggle}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:bg-gray-200 transition-colors"
            >
              {isPlaying ? (
                <Pause size={20} className="text-gray-900" />
              ) : (
                <Play size={20} className="text-gray-900 ml-0.5" />
              )}
            </button>
            
            <button
              onClick={skipForward}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <SkipForward size={20} />
            </button>
            
            <span className="text-sm text-gray-400 ml-2 font-mono">
              {formatTime(currentTime)} / {formatTime(totalDuration)}
            </span>
          </div>

          {/* Center: AutoSync */}
          <button
            onClick={syncToAudio}
            disabled={isSyncing}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white text-sm font-medium disabled:opacity-50"
          >
            {isSyncing ? (
              <><Loader2 size={16} className="animate-spin" /> Syncing...</>
            ) : (
              <><Wand2 size={16} /> AutoSync</>
            )}
          </button>

          {/* Right: Volume & Fullscreen */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                setIsMuted(false);
              }}
              className="w-20 accent-purple-500"
            />
            
            <button
              onClick={toggleFullscreen}
              className="p-2 text-gray-400 hover:text-white transition-colors ml-2"
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MiniTimeline — Compact scene overview
// ══════════════════════════════════════════════════════════════════

export function MiniTimeline({
  scenes = [],
  currentTime,
  totalDuration,
  onSeek
}) {
  return (
    <div className="flex gap-1 p-2 bg-gray-900 rounded-lg overflow-x-auto">
      {scenes.map((scene, idx) => {
        const isActive = currentTime >= scene.start_time && currentTime < scene.end_time;
        const progress = isActive 
          ? ((currentTime - scene.start_time) / scene.duration) * 100 
          : currentTime >= scene.end_time ? 100 : 0;

        return (
          <div
            key={scene.id}
            className={`relative flex-shrink-0 w-16 h-10 rounded overflow-hidden cursor-pointer transition-all ${
              isActive ? 'ring-2 ring-purple-500 scale-105' : 'opacity-60 hover:opacity-100'
            }`}
            onClick={() => onSeek?.(scene.start_time)}
          >
            {scene.image_url && (
              <img
                src={scene.image_url}
                alt=""
                className="w-full h-full object-cover"
              />
            )}
            
            {/* Progress overlay */}
            <div 
              className="absolute inset-0 bg-purple-500/30"
              style={{ width: `${progress}%` }}
            />
            
            {/* Scene number */}
            <div className="absolute bottom-0 right-0 bg-black/70 text-[10px] text-white px-1">
              {scene.scene_number}
            </div>
          </div>
        );
      })}
    </div>
  );
}
