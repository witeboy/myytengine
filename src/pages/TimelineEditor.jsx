import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  ZoomIn, ZoomOut, RefreshCw, Lock, Unlock, Wand2, 
  Image, Music, Type, Layers, ChevronDown, ChevronRight,
  Scissors, Copy, Trash2, Undo, Redo, Download, Settings,
  AlertCircle, CheckCircle, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';

// ══════════════════════════════════════════════════════════════════
// TIMELINE EDITOR — Full-Featured Video Timeline with AutoSync
// ══════════════════════════════════════════════════════════════════

const TRACK_HEIGHT = 60;
const LABEL_WIDTH = 140;
const MIN_CLIP_WIDTH = 20;

// ══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ══════════════════════════════════════════════════════════════════

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00.0';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${m}:${s.toString().padStart(2, '0')}.${ms}`;
}

function formatTimeFull(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ══════════════════════════════════════════════════════════════════
// TIMELINE RULER
// ══════════════════════════════════════════════════════════════════

function TimelineRuler({ totalDuration, pixelsPerSecond, currentTime, onSeek }) {
  const markers = [];
  
  // Adaptive interval based on zoom
  let interval = 1;
  if (pixelsPerSecond < 5) interval = 30;
  else if (pixelsPerSecond < 10) interval = 10;
  else if (pixelsPerSecond < 20) interval = 5;
  else if (pixelsPerSecond < 50) interval = 2;
  else interval = 1;

  for (let t = 0; t <= totalDuration; t += interval) {
    markers.push(t);
  }

  // Sub-markers for finer detail
  const subMarkers = [];
  if (pixelsPerSecond >= 20) {
    const subInterval = interval / 5;
    for (let t = 0; t <= totalDuration; t += subInterval) {
      if (t % interval !== 0) {
        subMarkers.push(t);
      }
    }
  }

  const handleClick = (e) => {
    if (!onSeek) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const t = Math.max(0, Math.min(totalDuration, x / pixelsPerSecond));
    onSeek(t);
  };

  return (
    <div
      className="h-8 bg-[#1a1a2e] border-b border-gray-700 relative cursor-pointer select-none"
      onClick={handleClick}
      style={{ width: totalDuration * pixelsPerSecond }}
    >
      {/* Sub-markers */}
      {subMarkers.map(t => (
        <div
          key={`sub-${t}`}
          className="absolute bottom-0 w-px h-2 bg-gray-700"
          style={{ left: t * pixelsPerSecond }}
        />
      ))}
      
      {/* Main markers */}
      {markers.map(t => (
        <div
          key={t}
          className="absolute bottom-0 flex flex-col items-center"
          style={{ left: t * pixelsPerSecond }}
        >
          <span className="text-[10px] text-gray-400 font-mono mb-1">
            {formatTime(t)}
          </span>
          <div className="w-px h-3 bg-gray-500" />
        </div>
      ))}
      
      {/* Playhead indicator on ruler */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
        style={{ left: currentTime * pixelsPerSecond }}
      >
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rotate-45" />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TIMELINE CLIP
// ══════════════════════════════════════════════════════════════════

function TimelineClip({ 
  clip, 
  pixelsPerSecond, 
  trackColor,
  isSelected,
  onSelect,
  onMove,
  onResize,
  onDoubleClick
}) {
  const clipRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(null); // 'left' | 'right' | null
  const [dragStart, setDragStart] = useState({ x: 0, startTime: 0, duration: 0 });

  const left = clip.startTime * pixelsPerSecond;
  const width = Math.max(MIN_CLIP_WIDTH, clip.duration * pixelsPerSecond);

  const handleMouseDown = (e, action = 'move') => {
    e.stopPropagation();
    onSelect?.(clip.id);
    
    if (action === 'move') {
      setIsDragging(true);
    } else {
      setIsResizing(action);
    }
    
    setDragStart({
      x: e.clientX,
      startTime: clip.startTime,
      duration: clip.duration
    });
  };

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - dragStart.x;
      const deltaTime = deltaX / pixelsPerSecond;

      if (isDragging) {
        const newStart = Math.max(0, dragStart.startTime + deltaTime);
        onMove?.(clip.id, newStart);
      } else if (isResizing === 'left') {
        const newStart = Math.max(0, dragStart.startTime + deltaTime);
        const newDuration = Math.max(0.1, dragStart.duration - deltaTime);
        onResize?.(clip.id, newStart, newDuration);
      } else if (isResizing === 'right') {
        const newDuration = Math.max(0.1, dragStart.duration + deltaTime);
        onResize?.(clip.id, clip.startTime, newDuration);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, pixelsPerSecond, clip, onMove, onResize]);

  return (
    <div
      ref={clipRef}
      className={`absolute top-1 bottom-1 rounded-md overflow-hidden cursor-move transition-shadow ${
        isSelected ? 'ring-2 ring-white shadow-lg z-10' : ''
      }`}
      style={{
        left,
        width,
        backgroundColor: trackColor,
      }}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
      onDoubleClick={() => onDoubleClick?.(clip)}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-20"
        onMouseDown={(e) => handleMouseDown(e, 'left')}
      />
      
      {/* Clip content */}
      <div className="absolute inset-0 flex items-center px-2 overflow-hidden pointer-events-none">
        {clip.thumbnail && (
          <img 
            src={clip.thumbnail} 
            className="h-full w-auto object-cover rounded mr-2 opacity-80"
            alt=""
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-white truncate drop-shadow">
            {clip.label || `Scene ${clip.sceneNumber || ''}`}
          </p>
          <p className="text-[10px] text-white/70">
            {formatTime(clip.duration)}
          </p>
        </div>
      </div>
      
      {/* Waveform overlay for audio */}
      {clip.type === 'audio' && clip.waveform && (
        <div 
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            backgroundImage: `url(${clip.waveform})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}
      
      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/20 z-20"
        onMouseDown={(e) => handleMouseDown(e, 'right')}
      />
      
      {/* Beat marker indicators */}
      {clip.beatSynced && (
        <div className="absolute top-0 right-1">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" title="Beat synced" />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// TIMELINE TRACK
// ══════════════════════════════════════════════════════════════════

function TimelineTrack({
  track,
  clips,
  pixelsPerSecond,
  totalDuration,
  currentTime,
  selectedClipId,
  onSelectClip,
  onMoveClip,
  onResizeClip,
  onDoubleClickClip,
  onTrackToggle,
  collapsed
}) {
  const trackIcons = {
    audio: Music,
    video: Image,
    caption: Type,
    overlay: Layers
  };
  
  const trackColors = {
    audio: '#4f46e5',
    video: '#059669',
    caption: '#d97706',
    overlay: '#7c3aed'
  };

  const Icon = trackIcons[track.type] || Layers;
  const color = trackColors[track.type] || '#6b7280';

  return (
    <div className={`flex border-b border-gray-800 ${collapsed ? 'h-8' : ''}`}>
      {/* Track Label */}
      <div 
        className="flex-shrink-0 bg-[#12121f] border-r border-gray-800 flex items-center gap-2 px-3"
        style={{ width: LABEL_WIDTH }}
      >
        <button
          onClick={() => onTrackToggle?.(track.id)}
          className="text-gray-500 hover:text-white"
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        </button>
        <div 
          className="w-3 h-3 rounded-sm"
          style={{ backgroundColor: color }}
        />
        <Icon size={14} className="text-gray-400" />
        <span className="text-xs text-gray-300 truncate flex-1">{track.name}</span>
        {track.locked ? (
          <Lock size={12} className="text-gray-600" />
        ) : (
          <Unlock size={12} className="text-gray-600 opacity-0 group-hover:opacity-100" />
        )}
      </div>
      
      {/* Track Content */}
      {!collapsed && (
        <div 
          className="flex-1 relative bg-[#0d0d1a]"
          style={{ 
            height: TRACK_HEIGHT,
            minWidth: totalDuration * pixelsPerSecond 
          }}
        >
          {/* Grid lines */}
          <div className="absolute inset-0 opacity-20">
            {Array.from({ length: Math.ceil(totalDuration / 5) }, (_, i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-px bg-gray-600"
                style={{ left: i * 5 * pixelsPerSecond }}
              />
            ))}
          </div>
          
          {/* Clips */}
          {clips.map(clip => (
            <TimelineClip
              key={clip.id}
              clip={clip}
              pixelsPerSecond={pixelsPerSecond}
              trackColor={color}
              isSelected={selectedClipId === clip.id}
              onSelect={onSelectClip}
              onMove={onMoveClip}
              onResize={onResizeClip}
              onDoubleClick={onDoubleClickClip}
            />
          ))}
          
          {/* Playhead line */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20"
            style={{ left: currentTime * pixelsPerSecond }}
          />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CAPTION DISPLAY (Real-time)
// ══════════════════════════════════════════════════════════════════

function CaptionDisplay({ captions, currentTime }) {
  // Find active caption
  const activeCaption = captions.find(
    c => currentTime >= c.startTime && currentTime < c.startTime + c.duration
  );

  if (!activeCaption) return null;

  // Calculate word-by-word highlighting
  const words = activeCaption.text.split(' ');
  const wordDuration = activeCaption.duration / words.length;
  const elapsedInCaption = currentTime - activeCaption.startTime;
  const activeWordIndex = Math.floor(elapsedInCaption / wordDuration);

  return (
    <div className="absolute bottom-16 left-1/2 -translate-x-1/2 max-w-[80%] text-center">
      <div className="bg-black/80 backdrop-blur-sm rounded-lg px-6 py-3">
        <p className="text-xl font-bold text-white leading-relaxed">
          {words.map((word, idx) => (
            <span
              key={idx}
              className={`transition-colors duration-100 ${
                idx < activeWordIndex 
                  ? 'text-white' 
                  : idx === activeWordIndex 
                    ? 'text-yellow-300' 
                    : 'text-gray-400'
              }`}
            >
              {word}{' '}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN TIMELINE EDITOR
// ══════════════════════════════════════════════════════════════════

export default function TimelineEditor({ 
  scenes = [],
  projectId,
  onScenesUpdate,
  onExport
}) {
  // ═══ STATE ═══
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(60);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(20);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  
  const [tracks, setTracks] = useState([
    { id: 'audio', name: 'Audio / Voiceover', type: 'audio', locked: false },
    { id: 'video', name: 'Video / Images', type: 'video', locked: false },
    { id: 'caption', name: 'Captions', type: 'caption', locked: false }
  ]);
  const [collapsedTracks, setCollapsedTracks] = useState({});
  
  const [clips, setClips] = useState({ audio: [], video: [], caption: [] });
  const [selectedClipId, setSelectedClipId] = useState(null);
  
  const [isAutoSyncing, setIsAutoSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null); // 'success' | 'error' | null
  
  const timelineRef = useRef(null);
  const audioRef = useRef(null);
  const playbackRef = useRef(null);

  // ═══ INITIALIZE CLIPS FROM SCENES ═══
  useEffect(() => {
    if (!scenes || scenes.length === 0) return;

    // Sort scenes by scene_number
    const sortedScenes = [...scenes].sort((a, b) => 
      (a.scene_number || 0) - (b.scene_number || 0)
    );

    let currentOffset = 0;
    const audioClips = [];
    const videoClips = [];
    const captionClips = [];

    sortedScenes.forEach((scene, idx) => {
      // Get duration from scene data or default
      const duration = scene.audio_duration || scene.duration || 5;
      
      // Audio clip
      if (scene.audio_url) {
        audioClips.push({
          id: `audio-${scene.id}`,
          sceneId: scene.id,
          sceneNumber: scene.scene_number,
          type: 'audio',
          startTime: currentOffset,
          duration,
          label: `Scene ${scene.scene_number} Audio`,
          src: scene.audio_url,
          beatSynced: !!scene.beat_synced
        });
      }

      // Video/Image clip
      if (scene.image_url) {
        videoClips.push({
          id: `video-${scene.id}`,
          sceneId: scene.id,
          sceneNumber: scene.scene_number,
          type: 'video',
          startTime: currentOffset,
          duration,
          label: `Scene ${scene.scene_number}`,
          thumbnail: scene.image_url,
          beatSynced: !!scene.beat_synced
        });
      }

      // Caption clips from voiceover text
      if (scene.voiceover_text) {
        // Split into sentence-based captions
        const sentences = scene.voiceover_text.match(/[^.!?]+[.!?]+/g) || [scene.voiceover_text];
        const sentenceDuration = duration / sentences.length;
        
        sentences.forEach((sentence, sIdx) => {
          captionClips.push({
            id: `caption-${scene.id}-${sIdx}`,
            sceneId: scene.id,
            sceneNumber: scene.scene_number,
            type: 'caption',
            startTime: currentOffset + (sIdx * sentenceDuration),
            duration: sentenceDuration,
            text: sentence.trim(),
            label: sentence.trim().slice(0, 30) + '...'
          });
        });
      }

      currentOffset += duration;
    });

    setClips({
      audio: audioClips,
      video: videoClips,
      caption: captionClips
    });
    
    setTotalDuration(Math.max(currentOffset, 10));
  }, [scenes]);

  // ═══ PLAYBACK LOGIC ═══
  useEffect(() => {
    if (isPlaying) {
      const startTime = Date.now() - (currentTime * 1000);
      
      playbackRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTime) / 1000;
        if (elapsed >= totalDuration) {
          setIsPlaying(false);
          setCurrentTime(0);
        } else {
          setCurrentTime(elapsed);
        }
      }, 16); // ~60fps
    } else {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
      }
    }

    return () => {
      if (playbackRef.current) {
        clearInterval(playbackRef.current);
      }
    };
  }, [isPlaying, totalDuration]);

  // ═══ AUTOSYNC FUNCTION ═══
  const handleAutoSync = useCallback(async () => {
    setIsAutoSyncing(true);
    setSyncStatus(null);

    try {
      // Calculate proper timing from audio durations
      const sortedScenes = [...scenes].sort((a, b) => 
        (a.scene_number || 0) - (b.scene_number || 0)
      );

      let currentOffset = 0;
      const newVideoClips = [];
      const newCaptionClips = [];
      const updatedScenes = [];

      for (const scene of sortedScenes) {
        // Get actual audio duration if we have audio
        let audioDuration = scene.audio_duration || 5;
        
        // If we have audio URL, try to get actual duration
        if (scene.audio_url) {
          try {
            const audio = new Audio(scene.audio_url);
            await new Promise((resolve, reject) => {
              audio.addEventListener('loadedmetadata', () => {
                audioDuration = audio.duration;
                resolve();
              });
              audio.addEventListener('error', reject);
              setTimeout(reject, 5000); // 5s timeout
            });
          } catch (e) {
            console.log('Could not load audio duration, using default');
          }
        }

        // Update video clip to match audio
        if (scene.image_url) {
          newVideoClips.push({
            id: `video-${scene.id}`,
            sceneId: scene.id,
            sceneNumber: scene.scene_number,
            type: 'video',
            startTime: currentOffset,
            duration: audioDuration,
            label: `Scene ${scene.scene_number}`,
            thumbnail: scene.image_url,
            beatSynced: true
          });
        }

        // Update captions with proper word timing
        if (scene.voiceover_text) {
          const words = scene.voiceover_text.split(' ');
          const wordsPerCaption = 8; // Show ~8 words at a time
          const captionCount = Math.ceil(words.length / wordsPerCaption);
          const captionDuration = audioDuration / captionCount;

          for (let i = 0; i < captionCount; i++) {
            const captionWords = words.slice(i * wordsPerCaption, (i + 1) * wordsPerCaption);
            newCaptionClips.push({
              id: `caption-${scene.id}-${i}`,
              sceneId: scene.id,
              sceneNumber: scene.scene_number,
              type: 'caption',
              startTime: currentOffset + (i * captionDuration),
              duration: captionDuration,
              text: captionWords.join(' '),
              label: captionWords.join(' ').slice(0, 30) + '...'
            });
          }
        }

        // Track scene updates
        updatedScenes.push({
          ...scene,
          start_time: currentOffset,
          duration: audioDuration,
          audio_duration: audioDuration,
          beat_synced: true
        });

        currentOffset += audioDuration;
      }

      // Update clips state
      setClips(prev => ({
        ...prev,
        video: newVideoClips,
        caption: newCaptionClips
      }));

      setTotalDuration(currentOffset);
      setSyncStatus('success');

      // Notify parent of scene updates
      if (onScenesUpdate) {
        onScenesUpdate(updatedScenes);
      }

    } catch (error) {
      console.error('AutoSync error:', error);
      setSyncStatus('error');
    }

    setIsAutoSyncing(false);
    
    // Clear status after 3s
    setTimeout(() => setSyncStatus(null), 3000);
  }, [scenes, onScenesUpdate]);

  // ═══ CLIP OPERATIONS ═══
  const handleMoveClip = (clipId, newStartTime) => {
    setClips(prev => {
      const newClips = { ...prev };
      for (const trackId of Object.keys(newClips)) {
        newClips[trackId] = newClips[trackId].map(clip => 
          clip.id === clipId ? { ...clip, startTime: newStartTime, beatSynced: false } : clip
        );
      }
      return newClips;
    });
  };

  const handleResizeClip = (clipId, newStartTime, newDuration) => {
    setClips(prev => {
      const newClips = { ...prev };
      for (const trackId of Object.keys(newClips)) {
        newClips[trackId] = newClips[trackId].map(clip => 
          clip.id === clipId 
            ? { ...clip, startTime: newStartTime, duration: newDuration, beatSynced: false } 
            : clip
        );
      }
      return newClips;
    });
  };

  // ═══ ZOOM CONTROLS ═══
  const handleZoomIn = () => setPixelsPerSecond(prev => Math.min(100, prev * 1.5));
  const handleZoomOut = () => setPixelsPerSecond(prev => Math.max(2, prev / 1.5));

  // ═══ PLAYBACK CONTROLS ═══
  const handlePlayPause = () => setIsPlaying(!isPlaying);
  const handleSeek = (time) => setCurrentTime(Math.max(0, Math.min(totalDuration, time)));
  const handleSkipBack = () => handleSeek(currentTime - 5);
  const handleSkipForward = () => handleSeek(currentTime + 5);

  // ═══ TRACK TOGGLE ═══
  const handleTrackToggle = (trackId) => {
    setCollapsedTracks(prev => ({ ...prev, [trackId]: !prev[trackId] }));
  };

  // Get all caption clips for display
  const allCaptions = clips.caption || [];

  return (
    <div className="flex flex-col h-full bg-[#0a0a14] text-white rounded-xl overflow-hidden">
      {/* ═══ TOOLBAR ═══ */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#12121f] border-b border-gray-800">
        {/* Left: Playback Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkipBack}
            className="text-gray-400 hover:text-white"
          >
            <SkipBack size={18} />
          </Button>
          
          <Button
            size="sm"
            onClick={handlePlayPause}
            className={`w-10 h-10 rounded-full ${isPlaying ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} className="ml-0.5" />}
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkipForward}
            className="text-gray-400 hover:text-white"
          >
            <SkipForward size={18} />
          </Button>
          
          <div className="flex items-center gap-2 ml-4 text-sm font-mono">
            <span className="text-white">{formatTimeFull(currentTime)}</span>
            <span className="text-gray-500">/</span>
            <span className="text-gray-400">{formatTimeFull(totalDuration)}</span>
          </div>
        </div>

        {/* Center: AutoSync Button */}
        <div className="flex items-center gap-3">
          <Button
            onClick={handleAutoSync}
            disabled={isAutoSyncing}
            className={`gap-2 ${
              syncStatus === 'success' 
                ? 'bg-green-600 hover:bg-green-700' 
                : syncStatus === 'error'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700'
            }`}
          >
            {isAutoSyncing ? (
              <><Loader2 size={16} className="animate-spin" /> Syncing...</>
            ) : syncStatus === 'success' ? (
              <><CheckCircle size={16} /> Synced!</>
            ) : syncStatus === 'error' ? (
              <><AlertCircle size={16} /> Retry</>
            ) : (
              <><Wand2 size={16} /> AutoSync to Audio</>
            )}
          </Button>
          
          {syncStatus === 'success' && (
            <Badge className="bg-green-900 text-green-300 text-xs">
              Media aligned to voiceover beats
            </Badge>
          )}
        </div>

        {/* Right: Zoom & Volume */}
        <div className="flex items-center gap-4">
          {/* Volume */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMuted(!isMuted)}
              className="text-gray-400 hover:text-white"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </Button>
            <Slider
              value={[isMuted ? 0 : volume * 100]}
              onValueChange={([v]) => { setVolume(v / 100); setIsMuted(v === 0); }}
              max={100}
              step={1}
              className="w-20"
            />
          </div>
          
          <div className="w-px h-6 bg-gray-700" />
          
          {/* Zoom */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomOut}
              className="text-gray-400 hover:text-white"
            >
              <ZoomOut size={18} />
            </Button>
            <span className="text-xs text-gray-400 w-12 text-center">
              {Math.round(pixelsPerSecond)}px/s
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleZoomIn}
              className="text-gray-400 hover:text-white"
            >
              <ZoomIn size={18} />
            </Button>
          </div>
        </div>
      </div>

      {/* ═══ PREVIEW AREA WITH CAPTIONS ═══ */}
      <div className="relative h-48 bg-black flex items-center justify-center border-b border-gray-800">
        {/* Current frame preview */}
        {clips.video.length > 0 && (
          <div className="relative w-full h-full">
            {clips.video.map(clip => {
              const isVisible = currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;
              if (!isVisible) return null;
              return (
                <img
                  key={clip.id}
                  src={clip.thumbnail}
                  className="absolute inset-0 w-full h-full object-contain"
                  alt=""
                />
              );
            })}
            
            {/* Real-time Captions */}
            <CaptionDisplay captions={allCaptions} currentTime={currentTime} />
          </div>
        )}
        
        {clips.video.length === 0 && (
          <p className="text-gray-500">No media loaded</p>
        )}
      </div>

      {/* ═══ TIMELINE AREA ═══ */}
      <div className="flex-1 overflow-auto" ref={timelineRef}>
        <div className="flex">
          {/* Track Labels Column */}
          <div className="flex-shrink-0" style={{ width: LABEL_WIDTH }}>
            <div className="h-8 bg-[#12121f] border-b border-gray-700" /> {/* Ruler spacer */}
          </div>
          
          {/* Timeline Ruler */}
          <div className="flex-1 overflow-x-auto">
            <TimelineRuler
              totalDuration={totalDuration}
              pixelsPerSecond={pixelsPerSecond}
              currentTime={currentTime}
              onSeek={handleSeek}
            />
          </div>
        </div>

        {/* Tracks */}
        <div className="overflow-x-auto">
          {tracks.map(track => (
            <TimelineTrack
              key={track.id}
              track={track}
              clips={clips[track.id] || []}
              pixelsPerSecond={pixelsPerSecond}
              totalDuration={totalDuration}
              currentTime={currentTime}
              selectedClipId={selectedClipId}
              onSelectClip={setSelectedClipId}
              onMoveClip={handleMoveClip}
              onResizeClip={handleResizeClip}
              onTrackToggle={handleTrackToggle}
              collapsed={collapsedTracks[track.id]}
            />
          ))}
        </div>
      </div>

      {/* ═══ STATUS BAR ═══ */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#12121f] border-t border-gray-800 text-xs text-gray-400">
        <div className="flex items-center gap-4">
          <span>{scenes.length} scenes</span>
          <span>{clips.video.length} video clips</span>
          <span>{clips.caption.length} captions</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Duration: {formatTimeFull(totalDuration)}</span>
          {selectedClipId && <span>Selected: {selectedClipId}</span>}
        </div>
      </div>
    </div>
  );
}