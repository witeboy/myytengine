import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  ZoomIn, ZoomOut, Undo2, Redo2, Scissors, Trash2, Copy,
  Import, Download, Home, ChevronRight, ChevronDown, ChevronUp,
  Image, Music, Type, Layers, Wand2, Film, Mic, Settings,
  Loader2, CheckCircle, AlertCircle, RefreshCw, Sparkles,
  LayoutGrid, List, FolderOpen, Plus, GripVertical, X,
  SplitSquareHorizontal, Maximize, Volume1
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════════
// CAPCUT-STYLE TIMELINE EDITOR
// ══════════════════════════════════════════════════════════════════
// Full video editing timeline with:
// - Left panel: Media, Effects, Captions, Transitions tabs
// - Center: Preview + Timeline tracks
// - Right: Properties panel
// - AutoSync to match media to audio beats
// ══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════

const TRACK_HEIGHT = 64;
const LABEL_WIDTH = 48;

// ═══════════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatTimeFull(seconds) {
  if (!seconds || isNaN(seconds)) return '00:00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const f = Math.floor((seconds % 1) * 30); // frames at 30fps
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════════
// MEDIA PANEL (Left Sidebar)
// ═══════════════════════════════════════════════════════════════════

function MediaPanel({ scenes, onAddToTimeline, selectedTab, onTabChange }) {
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

  return (
    <div className="h-full flex flex-col bg-[#1a1a2e]">
      {/* Tabs */}
      <div className="flex border-b border-gray-700">
        {['Media', 'Effects', 'Captions', 'Audio'].map(tab => (
          <button
            key={tab}
            onClick={() => onTabChange(tab.toLowerCase())}
            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
              selectedTab === tab.toLowerCase()
                ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/10'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {selectedTab === 'media' && (
          <>
            {/* View Toggle */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-gray-400">{scenes.length} items</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white'}`}
                >
                  <LayoutGrid size={14} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-500 hover:text-white'}`}
                >
                  <List size={14} />
                </button>
              </div>
            </div>

            {/* Media Grid/List */}
            {scenes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <FolderOpen className="w-12 h-12 text-gray-600 mb-3" />
                <p className="text-sm text-gray-400 mb-2">No media found</p>
                <p className="text-xs text-gray-500">Generate scenes first in Content Generation</p>
              </div>
            ) : viewMode === 'grid' ? (
              <div className="grid grid-cols-2 gap-2">
                {scenes.map(scene => (
                  <div
                    key={scene.id}
                    className="group relative aspect-video bg-gray-800 rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-cyan-500"
                    onClick={() => onAddToTimeline(scene)}
                  >
                    {scene.image_url ? (
                      <img src={scene.image_url} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Image className="w-6 h-6 text-gray-600" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Plus className="w-8 h-8 text-white" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
                      <p className="text-[10px] text-white font-medium">Scene {scene.scene_number}</p>
                      <p className="text-[9px] text-gray-300">{scene.duration_seconds || 5}s</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {scenes.map(scene => (
                  <div
                    key={scene.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700 cursor-pointer"
                    onClick={() => onAddToTimeline(scene)}
                  >
                    <div className="w-12 h-8 bg-gray-700 rounded overflow-hidden flex-shrink-0">
                      {scene.image_url && (
                        <img src={scene.image_url} className="w-full h-full object-cover" alt="" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate">Scene {scene.scene_number}</p>
                      <p className="text-[10px] text-gray-400">{scene.duration_seconds || 5}s</p>
                    </div>
                    <Plus className="w-4 h-4 text-gray-500" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {selectedTab === 'effects' && (
          <div className="grid grid-cols-2 gap-2">
            {['Ken Burns', 'Zoom In', 'Zoom Out', 'Pan Left', 'Pan Right', 'Fade', 'Blur', 'Glow'].map(effect => (
              <div
                key={effect}
                className="p-3 bg-gray-800/50 rounded-lg text-center cursor-pointer hover:bg-purple-500/20 hover:ring-1 hover:ring-purple-500"
              >
                <Sparkles className="w-5 h-5 mx-auto text-purple-400 mb-1" />
                <p className="text-[10px] text-gray-300">{effect}</p>
              </div>
            ))}
          </div>
        )}

        {selectedTab === 'captions' && (
          <div className="space-y-2">
            <Button size="sm" className="w-full bg-cyan-600 hover:bg-cyan-700 gap-2">
              <Wand2 size={14} /> Auto-Generate Captions
            </Button>
            <div className="grid grid-cols-2 gap-2 mt-4">
              {['Default', 'Bold', 'Minimal', 'TikTok', 'Netflix'].map(style => (
                <div
                  key={style}
                  className="p-3 bg-gray-800/50 rounded-lg text-center cursor-pointer hover:bg-orange-500/20 hover:ring-1 hover:ring-orange-500"
                >
                  <Type className="w-5 h-5 mx-auto text-orange-400 mb-1" />
                  <p className="text-[10px] text-gray-300">{style}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {selectedTab === 'audio' && (
          <div className="space-y-3">
            <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="w-4 h-4 text-blue-400" />
                <span className="text-xs text-blue-300">Voiceover</span>
              </div>
              <p className="text-[10px] text-gray-400">Generated from script</p>
            </div>
            <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Music className="w-4 h-4 text-green-400" />
                <span className="text-xs text-green-300">Background Music</span>
              </div>
              <p className="text-[10px] text-gray-400">Add music tracks</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// PREVIEW PANEL
// ═══════════════════════════════════════════════════════════════════

function PreviewPanel({ currentScene, currentTime, isPlaying, captions, orientation }) {
  const aspectClass = orientation === 'portrait' ? 'aspect-[9/16] max-w-[200px]' : 'aspect-video';

  // Find active caption
  const activeCaption = captions.find(
    c => currentTime >= c.startTime && currentTime < c.startTime + c.duration
  );

  return (
    <div className="h-full flex flex-col bg-black">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className={`relative ${aspectClass} w-full bg-gray-900 rounded-lg overflow-hidden`}>
          {currentScene?.image_url ? (
            <img
              src={currentScene.image_url}
              className="w-full h-full object-contain"
              alt={`Scene ${currentScene.scene_number}`}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film className="w-16 h-16 text-gray-700" />
            </div>
          )}

          {/* Caption overlay */}
          {activeCaption && (
            <div className="absolute bottom-8 left-4 right-4">
              <div className="bg-black/80 rounded-lg px-4 py-2 text-center">
                <p className="text-white text-sm font-medium leading-relaxed">
                  {activeCaption.text}
                </p>
              </div>
            </div>
          )}

          {/* Scene indicator */}
          <div className="absolute top-3 left-3 bg-black/60 rounded px-2 py-1">
            <span className="text-[10px] text-white font-medium">
              Scene {currentScene?.scene_number || '-'}
            </span>
          </div>

          {/* Play indicator */}
          {isPlaying && (
            <div className="absolute top-3 right-3">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TIMELINE RULER
// ═══════════════════════════════════════════════════════════════════

function TimelineRuler({ totalDuration, pixelsPerSecond, currentTime, onSeek }) {
  const markers = [];
  const interval = pixelsPerSecond >= 15 ? 5 : pixelsPerSecond >= 8 ? 10 : 30;

  for (let t = 0; t <= totalDuration; t += interval) {
    markers.push(t);
  }

  return (
    <div
      className="h-6 bg-[#0d0d1a] border-b border-gray-800 relative cursor-pointer select-none"
      style={{ width: Math.max(totalDuration * pixelsPerSecond, 800), marginLeft: LABEL_WIDTH }}
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const t = Math.max(0, Math.min(totalDuration, x / pixelsPerSecond));
        onSeek(t);
      }}
    >
      {markers.map(t => (
        <div
          key={t}
          className="absolute bottom-0 flex flex-col items-center"
          style={{ left: t * pixelsPerSecond }}
        >
          <span className="text-[9px] text-gray-500 font-mono">{formatTime(t)}</span>
          <div className="w-px h-2 bg-gray-600" />
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// TIMELINE TRACK
// ═══════════════════════════════════════════════════════════════════

function TimelineTrackRow({
  track,
  clips,
  pixelsPerSecond,
  totalDuration,
  currentTime,
  selectedClipId,
  onSelectClip,
  onUpdateClip,
  collapsed,
  onToggle
}) {
  const trackColors = {
    video: { bg: '#059669', border: '#10b981' },
    audio: { bg: '#4f46e5', border: '#6366f1' },
    caption: { bg: '#d97706', border: '#f59e0b' },
    music: { bg: '#16a34a', border: '#22c55e' }
  };

  const colors = trackColors[track.type] || trackColors.video;
  const Icon = track.type === 'video' ? Image : track.type === 'audio' ? Mic : track.type === 'caption' ? Type : Music;

  return (
    <div className="flex border-b border-gray-800">
      {/* Track Label */}
      <div
        className="flex-shrink-0 bg-[#12121f] flex items-center gap-1 px-2 cursor-pointer hover:bg-[#1a1a2e]"
        style={{ width: LABEL_WIDTH }}
        onClick={onToggle}
      >
        <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: colors.bg }} />
        <Icon size={12} className="text-gray-400" />
        {collapsed ? <ChevronRight size={10} className="text-gray-600" /> : <ChevronDown size={10} className="text-gray-600" />}
      </div>

      {/* Track Content */}
      {!collapsed && (
        <div
          className="relative bg-[#0a0a14]"
          style={{
            height: TRACK_HEIGHT,
            width: Math.max(totalDuration * pixelsPerSecond, 800)
          }}
        >
          {/* Clips */}
          {clips.map(clip => {
            const left = clip.startTime * pixelsPerSecond;
            const width = Math.max(20, clip.duration * pixelsPerSecond);
            const isSelected = selectedClipId === clip.id;

            return (
              <div
                key={clip.id}
                className={`absolute top-1 bottom-1 rounded cursor-pointer transition-all overflow-hidden ${
                  isSelected ? 'ring-2 ring-white z-10' : ''
                }`}
                style={{
                  left,
                  width,
                  backgroundColor: colors.bg,
                  borderLeft: `2px solid ${colors.border}`
                }}
                onClick={() => onSelectClip(clip.id)}
              >
                {/* Thumbnail for video track */}
                {track.type === 'video' && clip.thumbnail && (
                  <img
                    src={clip.thumbnail}
                    className="absolute inset-0 w-full h-full object-cover opacity-80"
                    alt=""
                  />
                )}

                {/* Clip info */}
                <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-transparent p-1.5">
                  <p className="text-[9px] text-white font-medium truncate">
                    {clip.label || `Scene ${clip.sceneNumber}`}
                  </p>
                  <p className="text-[8px] text-white/70">{clip.duration.toFixed(1)}s</p>
                </div>

                {/* Beat sync indicator */}
                {clip.beatSynced && (
                  <div className="absolute top-1 right-1 w-2 h-2 bg-green-400 rounded-full" title="Synced" />
                )}

                {/* Resize handles */}
                <div className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30" />
                <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/30" />
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-20"
            style={{ left: currentTime * pixelsPerSecond }}
          />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MAIN TIMELINE EDITOR
// ═══════════════════════════════════════════════════════════════════

export default function CapcutTimeline() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project_id');
  const queryClient = useQueryClient();

  // ═══ STATE ═══
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(15);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [selectedTab, setSelectedTab] = useState('media');
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [collapsedTracks, setCollapsedTracks] = useState({});

  // Timeline clips state
  const [videoClips, setVideoClips] = useState([]);
  const [audioClips, setAudioClips] = useState([]);
  const [captionClips, setCaptionClips] = useState([]);

  // AutoSync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState(null);

  // Refs
  const playbackRef = useRef(null);
  const audioRef = useRef(null);
  const timelineRef = useRef(null);

  // ═══ DATA FETCHING ═══
  const { data: project, isLoading: projectLoading, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId
  });

  const { data: scenes = [], isLoading: scenesLoading, refetch: refetchScenes } = useQuery({
    queryKey: ['scenes', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
    },
    enabled: !!projectId
  });

  const { data: prodSettings = [] } = useQuery({
    queryKey: ['prod-settings', projectId],
    queryFn: () => base44.entities.ProductionSettings.filter({ project_id: projectId }),
    enabled: !!projectId
  });

  const voiceoverUrl = prodSettings[0]?.voiceover_url;
  const voiceoverDuration = prodSettings[0]?.voiceover_duration_seconds || 0;

  // ═══ CALCULATE TIMING ═══
  const scenesWithTiming = React.useMemo(() => {
    let offset = 0;
    return scenes.map(scene => {
      const duration = scene.duration_seconds || scene.audio_duration || 5;
      const result = {
        ...scene,
        startTime: offset,
        endTime: offset + duration,
        duration
      };
      offset += duration;
      return result;
    });
  }, [scenes]);

  const totalDuration = React.useMemo(() => {
    if (voiceoverDuration > 0) return voiceoverDuration;
    return scenesWithTiming.reduce((sum, s) => sum + s.duration, 0) || 60;
  }, [scenesWithTiming, voiceoverDuration]);

  // ═══ INITIALIZE CLIPS FROM SCENES ═══
  useEffect(() => {
    if (scenesWithTiming.length === 0) return;

    const newVideoClips = scenesWithTiming.map(scene => ({
      id: `video-${scene.id}`,
      sceneId: scene.id,
      sceneNumber: scene.scene_number,
      type: 'video',
      startTime: scene.startTime,
      duration: scene.duration,
      label: `Scene ${scene.scene_number}`,
      thumbnail: scene.image_url,
      beatSynced: scene.beat_synced || false
    }));

    const newAudioClips = scenesWithTiming.filter(s => s.audio_url).map(scene => ({
      id: `audio-${scene.id}`,
      sceneId: scene.id,
      sceneNumber: scene.scene_number,
      type: 'audio',
      startTime: scene.startTime,
      duration: scene.duration,
      label: `Audio ${scene.scene_number}`,
      src: scene.audio_url,
      beatSynced: scene.beat_synced || false
    }));

    const newCaptionClips = [];
    scenesWithTiming.forEach(scene => {
      if (!scene.narration_text && !scene.voiceover_text) return;
      const text = scene.narration_text || scene.voiceover_text;
      const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
      const sentenceDuration = scene.duration / Math.max(sentences.length, 1);
      
      sentences.forEach((sentence, idx) => {
        newCaptionClips.push({
          id: `caption-${scene.id}-${idx}`,
          sceneId: scene.id,
          sceneNumber: scene.scene_number,
          type: 'caption',
          startTime: scene.startTime + (idx * sentenceDuration),
          duration: sentenceDuration,
          text: sentence.trim(),
          label: sentence.trim().slice(0, 30) + '...'
        });
      });
    });

    setVideoClips(newVideoClips);
    setAudioClips(newAudioClips);
    setCaptionClips(newCaptionClips);
  }, [scenesWithTiming]);

  // ═══ PLAYBACK ═══
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
      }, 33); // ~30fps
    } else {
      if (playbackRef.current) clearInterval(playbackRef.current);
    }
    return () => {
      if (playbackRef.current) clearInterval(playbackRef.current);
    };
  }, [isPlaying, totalDuration]);

  // Audio sync
  useEffect(() => {
    if (voiceoverUrl && audioRef.current) {
      audioRef.current.currentTime = currentTime;
      audioRef.current.volume = isMuted ? 0 : volume;
      if (isPlaying) audioRef.current.play().catch(() => {});
      else audioRef.current.pause();
    }
  }, [isPlaying, voiceoverUrl, volume, isMuted]);

  // ═══ GET CURRENT SCENE ═══
  const currentScene = React.useMemo(() => {
    return scenesWithTiming.find(s => currentTime >= s.startTime && currentTime < s.endTime);
  }, [scenesWithTiming, currentTime]);

  // ═══ AUTOSYNC ═══
  const handleAutoSync = async () => {
    setIsSyncing(true);
    setSyncStatus(null);

    try {
      // Call backend to sync media to audio
      const result = await base44.functions.invoke('syncMediaToAudio', { project_id: projectId });
      const data = result.data || result;

      if (data.success) {
        setSyncStatus('success');
        refetchScenes();
      } else {
        throw new Error(data.error || 'Sync failed');
      }
    } catch (err) {
      console.error('AutoSync error:', err);
      setSyncStatus('error');

      // Fallback: client-side sync
      let offset = 0;
      const updatedClips = scenesWithTiming.map(scene => {
        const duration = scene.audio_duration || scene.duration_seconds || 5;
        const clip = {
          ...videoClips.find(c => c.sceneId === scene.id),
          startTime: offset,
          duration,
          beatSynced: true
        };
        offset += duration;
        return clip;
      });
      setVideoClips(updatedClips.filter(Boolean));
    }

    setIsSyncing(false);
    setTimeout(() => setSyncStatus(null), 3000);
  };

  // ═══ HANDLERS ═══
  const handleSeek = (time) => {
    setCurrentTime(Math.max(0, Math.min(totalDuration, time)));
    if (audioRef.current) audioRef.current.currentTime = time;
  };

  const handlePlayPause = () => setIsPlaying(!isPlaying);
  const handleSkipBack = () => handleSeek(currentTime - 5);
  const handleSkipForward = () => handleSeek(currentTime + 5);

  const handleAddToTimeline = (scene) => {
    // Scene is already in timeline, just select it
    const clip = videoClips.find(c => c.sceneId === scene.id);
    if (clip) {
      setSelectedClipId(clip.id);
      handleSeek(clip.startTime);
    }
  };

  const zoomIn = () => setPixelsPerSecond(prev => Math.min(50, prev * 1.25));
  const zoomOut = () => setPixelsPerSecond(prev => Math.max(3, prev / 1.25));

  // ═══ LOADING STATE ═══
  if (projectLoading || scenesLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0a0a14]">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  const tracks = [
    { id: 'video', name: 'Video', type: 'video' },
    { id: 'audio', name: 'Audio', type: 'audio' },
    { id: 'caption', name: 'Captions', type: 'caption' }
  ];

  const trackClips = {
    video: videoClips,
    audio: audioClips,
    caption: captionClips
  };

  return (
    <div className="h-screen flex flex-col bg-[#0a0a14] text-white overflow-hidden">
      {/* Hidden audio element */}
      {voiceoverUrl && <audio ref={audioRef} src={voiceoverUrl} preload="auto" />}

      {/* ═══ TOP BAR ═══ */}
      <div className="flex items-center justify-between px-3 py-2 bg-[#12121f] border-b border-gray-800 flex-shrink-0">
        {/* Left */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(createPageUrl('Dashboard'))}
            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white"
          >
            <Home size={18} />
          </button>
          <div className="h-4 w-px bg-gray-700" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white truncate max-w-[200px]">
              {project?.name || 'Untitled Project'}
            </span>
            <span className="text-xs text-gray-500 bg-gray-800 px-2 py-0.5 rounded">
              {scenes.length} scenes
            </span>
          </div>
        </div>

        {/* Center - AutoSync */}
        <Button
          onClick={handleAutoSync}
          disabled={isSyncing}
          className={`gap-2 ${
            syncStatus === 'success' ? 'bg-green-600' :
            syncStatus === 'error' ? 'bg-red-600' :
            'bg-gradient-to-r from-cyan-600 to-purple-600'
          }`}
        >
          {isSyncing ? (
            <><Loader2 size={16} className="animate-spin" /> Syncing...</>
          ) : syncStatus === 'success' ? (
            <><CheckCircle size={16} /> Synced!</>
          ) : (
            <><Wand2 size={16} /> AutoSync to Audio</>
          )}
        </Button>

        {/* Right */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-2 border-gray-700">
            <Download size={14} /> Export
          </Button>
        </div>
      </div>

      {/* ═══ MAIN AREA ═══ */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel - Media Browser */}
        <div className="w-56 flex-shrink-0 border-r border-gray-800">
          <MediaPanel
            scenes={scenes}
            onAddToTimeline={handleAddToTimeline}
            selectedTab={selectedTab}
            onTabChange={setSelectedTab}
          />
        </div>

        {/* Center - Preview */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 min-h-0">
            <PreviewPanel
              currentScene={currentScene}
              currentTime={currentTime}
              isPlaying={isPlaying}
              captions={captionClips}
              orientation={project?.orientation || 'landscape'}
            />
          </div>

          {/* Transport Controls */}
          <div className="flex items-center justify-center gap-4 py-3 bg-[#12121f] border-t border-gray-800">
            <button onClick={handleSkipBack} className="p-2 text-gray-400 hover:text-white">
              <SkipBack size={20} />
            </button>
            <button
              onClick={handlePlayPause}
              className={`w-12 h-12 rounded-full flex items-center justify-center ${
                isPlaying ? 'bg-red-600' : 'bg-white'
              }`}
            >
              {isPlaying ? (
                <Pause size={24} className="text-white" />
              ) : (
                <Play size={24} className="text-gray-900 ml-1" />
              )}
            </button>
            <button onClick={handleSkipForward} className="p-2 text-gray-400 hover:text-white">
              <SkipForward size={20} />
            </button>

            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm font-mono text-cyan-400">{formatTimeFull(currentTime)}</span>
              <span className="text-gray-600">/</span>
              <span className="text-sm font-mono text-gray-500">{formatTimeFull(totalDuration)}</span>
            </div>
          </div>
        </div>

        {/* Right Panel - Properties (optional) */}
        <div className="w-48 flex-shrink-0 border-l border-gray-800 bg-[#12121f] p-3">
          <h3 className="text-xs font-medium text-gray-400 mb-3">Properties</h3>
          {selectedClipId ? (
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-500">Selected</label>
                <p className="text-xs text-white">{selectedClipId}</p>
              </div>
            </div>
          ) : (
            <p className="text-[10px] text-gray-500">Select a clip to edit</p>
          )}
        </div>
      </div>

      {/* ═══ TOOLBAR ═══ */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#12121f] border-t border-gray-800 flex-shrink-0">
        {/* Left - Tools */}
        <div className="flex items-center gap-1">
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <Undo2 size={16} />
          </button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <Redo2 size={16} />
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <Scissors size={16} />
          </button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <Copy size={16} />
          </button>
          <button className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <Trash2 size={16} />
          </button>
        </div>

        {/* Center - Info */}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{videoClips.length} video</span>
          <span>{audioClips.length} audio</span>
          <span>{captionClips.length} captions</span>
        </div>

        {/* Right - Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={zoomOut} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <ZoomOut size={16} />
          </button>
          <span className="text-[10px] text-gray-500 w-8 text-center">{Math.round(pixelsPerSecond)}</span>
          <button onClick={zoomIn} className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10">
            <ZoomIn size={16} />
          </button>
          <div className="w-px h-4 bg-gray-700 mx-1" />
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-white/10"
          >
            {isMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          </button>
        </div>
      </div>

      {/* ═══ TIMELINE ═══ */}
      <div className="h-52 flex-shrink-0 bg-[#0a0a14] border-t border-gray-700 overflow-x-auto" ref={timelineRef}>
        {/* Ruler */}
        <TimelineRuler
          totalDuration={totalDuration}
          pixelsPerSecond={pixelsPerSecond}
          currentTime={currentTime}
          onSeek={handleSeek}
        />

        {/* Tracks */}
        {scenes.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-gray-500">
            <div className="text-center">
              <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No scenes to display</p>
              <p className="text-xs text-gray-600">Generate scenes in Content Generation first</p>
            </div>
          </div>
        ) : (
          tracks.map(track => (
            <TimelineTrackRow
              key={track.id}
              track={track}
              clips={trackClips[track.id] || []}
              pixelsPerSecond={pixelsPerSecond}
              totalDuration={totalDuration}
              currentTime={currentTime}
              selectedClipId={selectedClipId}
              onSelectClip={setSelectedClipId}
              onUpdateClip={() => {}}
              collapsed={collapsedTracks[track.id]}
              onToggle={() => setCollapsedTracks(prev => ({ ...prev, [track.id]: !prev[track.id] }))}
            />
          ))
        )}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-30"
          style={{ left: currentTime * pixelsPerSecond + LABEL_WIDTH }}
        />
      </div>
    </div>
  );
}
