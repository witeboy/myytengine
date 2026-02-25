import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { debounce } from 'lodash';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { createPageUrl } from '@/utils';
import EditorTopBar from '@/components/timeline/EditorTopBar';
import TimelineTrack from '@/components/timeline/TimelineTrack';
import TimelineRuler from '@/components/timeline/TimelineRuler';
import PreviewPanel from '@/components/timeline/PreviewPanel';
import PropertiesPanel from '@/components/timeline/PropertiesPanel';
import MediaBrowser from '@/components/timeline/MediaBrowser';
import ExportPanel from '@/components/timeline/ExportPanel';
import VideoExporter from '@/components/timeline/VideoExporter';
import useVideoExport from '@/components/timeline/useVideoExport';
import SceneReorder from '@/components/timeline/SceneReorder';
import TransitionLibrary from '@/components/timeline/TransitionLibrary';
// DownloadAllMedia moved to EditorTopBar
import AudioEditor from '@/components/timeline/AudioEditor';
import {
  Loader2, Film, Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Mic, Music, ZoomIn, ZoomOut, Monitor, Scissors
} from 'lucide-react';

export default function TimelineEditor() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [importing, setImporting] = useState(false);
  const [selectedScene, setSelectedScene] = useState(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(10);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showExporter, setShowExporter] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [previewOrientation, setPreviewOrientation] = useState(null);
  const exportHook = useVideoExport();
  const timelineRef = useRef(null);

  // Audio mixer state
  const [voVol, setVoVol] = useState(1.0);
  const [musicVol, setMusicVol] = useState(0.3);
  const [sfxMasterVol, setSfxMasterVol] = useState(0.5);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const playIntervalRef = useRef(null);
  const voiceoverRef = useRef(null);
  const musicRef = useRef(null);
  const sfxRefs = useRef({});

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: scenes = [], refetch: refetchScenes } = useQuery({
    queryKey: ['scenes-timeline', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => a.scene_number - b.scene_number);
    },
    enabled: !!projectId,
  });

  const { data: prodSettings = [] } = useQuery({
    queryKey: ['prod-settings', projectId],
    queryFn: () => base44.entities.ProductionSettings.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  const voiceoverUrl = prodSettings[0]?.voiceover_url;
  const voiceoverDuration = prodSettings[0]?.voiceover_duration_seconds || prodSettings[0]?.total_duration_seconds || 0;

  const { data: musicTracks = [] } = useQuery({
    queryKey: ['music-timeline', projectId],
    queryFn: () => base44.entities.MusicTracks.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  const selectedMusic = musicTracks.find(t => t.is_selected);
  const musicUrl = selectedMusic?.audio_url;

  useEffect(() => {
    if (selectedMusic?.volume != null) setMusicVol(selectedMusic.volume);
  }, [selectedMusic?.volume]);

  // Calculate cumulative start times
  const scenesWithTiming = scenes.reduce((acc, scene, idx) => {
    const prevEnd = idx > 0 ? acc[idx - 1].start_time + acc[idx - 1].duration_seconds : 0;
    acc.push({ ...scene, start_time: prevEnd, duration_seconds: scene.duration_seconds || 8 });
    return acc;
  }, []);

  const sceneDuration = scenesWithTiming.reduce((sum, s) => sum + s.duration_seconds, 0);
  const totalDuration = voiceoverDuration > 0 ? voiceoverDuration : sceneDuration;

  const getCurrentScene = useCallback((time) => {
    for (let i = scenesWithTiming.length - 1; i >= 0; i--) {
      if (time >= scenesWithTiming[i].start_time) return scenesWithTiming[i];
    }
    return scenesWithTiming[0] || null;
  }, [scenesWithTiming]);

  const currentScene = getCurrentScene(currentTime);
  const currentSceneIndex = currentScene ? scenesWithTiming.findIndex(s => s.id === currentScene.id) : 0;

  // Playback engine
  useEffect(() => {
    if (isPlaying) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTime(prev => {
          const next = prev + 0.1;
          if (next >= totalDuration) { setIsPlaying(false); return 0; }
          return next;
        });
      }, 100);
    } else {
      clearInterval(playIntervalRef.current);
    }
    return () => clearInterval(playIntervalRef.current);
  }, [isPlaying, totalDuration]);

  // Audio: voiceover
  useEffect(() => {
    if (!voiceoverUrl) return;
    if (voiceoverRef.current) voiceoverRef.current.pause();
    const a = new Audio(voiceoverUrl);
    a.volume = voVol * volume;
    voiceoverRef.current = a;
  }, [voiceoverUrl]);

  // Audio: background music
  useEffect(() => {
    if (!musicUrl) return;
    if (musicRef.current) musicRef.current.pause();
    const a = new Audio(musicUrl);
    a.loop = true;
    a.volume = musicVol * volume;
    musicRef.current = a;
  }, [musicUrl]);

  // Sync audio play/pause
  useEffect(() => {
    if (isPlaying) {
      if (voiceoverRef.current) {
        voiceoverRef.current.currentTime = currentTime;
        voiceoverRef.current.volume = voVol * volume;
        voiceoverRef.current.play().catch(() => {});
      }
      if (musicRef.current) {
        musicRef.current.volume = musicVol * volume;
        musicRef.current.play().catch(() => {});
      }
    } else {
      voiceoverRef.current?.pause();
      musicRef.current?.pause();
      Object.values(sfxRefs.current).forEach(a => a?.pause());
    }
  }, [isPlaying]);

  // Sync volume changes
  useEffect(() => {
    if (voiceoverRef.current) voiceoverRef.current.volume = voVol * volume;
    if (musicRef.current) musicRef.current.volume = musicVol * volume;
  }, [volume, musicVol, voVol]);

  // SFX
  useEffect(() => {
    if (!isPlaying) return;
    const scene = getCurrentScene(currentTime);
    if (!scene?.sound_effect_url) return;
    const timeInScene = currentTime - scene.start_time;
    if (timeInScene >= 0 && timeInScene < 0.3) {
      if (!sfxRefs.current[scene.id] || sfxRefs.current[scene.id].paused) {
        const sfx = new Audio(scene.sound_effect_url);
        sfx.volume = (scene.sfx_volume ?? 0.5) * sfxMasterVol * volume;
        sfx.play().catch(() => {});
        sfxRefs.current[scene.id] = sfx;
      }
    }
  }, [currentTime, isPlaying]);

  useEffect(() => {
    return () => {
      voiceoverRef.current?.pause();
      musicRef.current?.pause();
      Object.values(sfxRefs.current).forEach(a => a?.pause());
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (isPlaying && timelineRef.current) {
      const playheadX = currentTime * pixelsPerSecond + 64;
      const container = timelineRef.current;
      if (playheadX > container.scrollLeft + container.clientWidth - 100 || playheadX < container.scrollLeft + 100) {
        container.scrollLeft = playheadX - container.clientWidth / 2;
      }
    }
  }, [currentTime, isPlaying, pixelsPerSecond]);

  const isDraggingPlayhead = useRef(false);

  const getTimeFromMouseEvent = (e) => {
    const container = timelineRef.current;
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft - 64;
    return Math.max(0, Math.min(totalDuration, x / pixelsPerSecond));
  };

  const handlePlayheadMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    isDraggingPlayhead.current = true;
    const wasPlaying = isPlaying;
    if (wasPlaying) setIsPlaying(false);

    const onMove = (ev) => {
      if (isDraggingPlayhead.current) {
        const t = getTimeFromMouseEvent(ev);
        setCurrentTime(t);
        if (voiceoverRef.current) voiceoverRef.current.currentTime = t;
      }
    };
    const onUp = () => {
      isDraggingPlayhead.current = false;
      sfxRefs.current = {};
      if (wasPlaying) setIsPlaying(true);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleTimelineClick = (e) => {
    if (e.target.closest('[data-scene-block]')) return;
    if (e.target.closest('button')) return;
    const t = getTimeFromMouseEvent(e);
    setCurrentTime(t);
    if (voiceoverRef.current) voiceoverRef.current.currentTime = t;
    sfxRefs.current = {};
  };

  const handlePlayPause = () => setIsPlaying(prev => !prev);

  const handlePrevScene = () => {
    const idx = Math.max(0, currentSceneIndex - 1);
    setCurrentTime(scenesWithTiming[idx]?.start_time || 0);
  };
  const handleNextScene = () => {
    const idx = Math.min(scenesWithTiming.length - 1, currentSceneIndex + 1);
    setCurrentTime(scenesWithTiming[idx]?.start_time || 0);
  };

  const handleImport = async () => {
    setImporting(true);
    await base44.entities.Projects.update(projectId, { status: 'timeline_editing', current_step: 7 });
    setImporting(false);
  };

  const handleUpdateDuration = useMemo(() => debounce(async (sceneId, newDuration) => {
    await base44.entities.Scenes.update(sceneId, { duration_seconds: Math.max(2, newDuration) });
    refetchScenes();
  }, 500), [refetchScenes]);

  const zoomIn = () => setPixelsPerSecond(prev => Math.min(prev + 5, 50));
  const zoomOut = () => setPixelsPerSecond(prev => Math.max(prev - 5, 3));

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const f = Math.floor((seconds % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${f}`;
  };

  const handleSaveMixLevels = async () => {
    if (selectedMusic) {
      await base44.entities.MusicTracks.update(selectedMusic.id, { volume: musicVol });
    }
  };

  return (
    <div className="h-screen flex flex-col bg-[#0d0d1a] text-white overflow-hidden">
      {/* Top Navigation Bar */}
      <EditorTopBar
        project={project}
        scenes={scenes}
        scenesWithTiming={scenesWithTiming}
        totalDuration={totalDuration}
        voiceoverUrl={voiceoverUrl}
        musicUrl={musicUrl}
        importing={importing}
        onImport={handleImport}
        onShowReorder={() => setShowReorder(p => !p)}
        onShowExporter={() => setShowExporter(true)}
      />

      {/* Reorder & Export Panels */}
      {showReorder && scenes.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-700/50 bg-[#16213e]">
          <SceneReorder scenes={scenesWithTiming} onRefetch={refetchScenes} />
        </div>
      )}
      {showExportPanel && scenes.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-700/50 bg-[#16213e]">
          <ExportPanel
            project={project} scenesWithTiming={scenesWithTiming} voiceoverUrl={voiceoverUrl}
            musicUrl={musicUrl} musicVolume={musicVol} totalDuration={totalDuration}
            onClose={() => setShowExportPanel(false)} onStatusUpdate={refetchProject}
          />
        </div>
      )}

      {/* ═══════ MAIN EDITOR AREA: 3-Panel Layout ═══════ */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* LEFT: Media Browser */}
        <div className="w-56 flex-shrink-0 overflow-hidden">
          <MediaBrowser
            scenes={scenesWithTiming}
            selectedScene={selectedScene}
            onSelectScene={setSelectedScene}
            voiceoverUrl={voiceoverUrl}
            musicUrl={musicUrl}
          />
        </div>

        {/* CENTER: Properties Panel */}
        <div className="w-64 flex-shrink-0 overflow-hidden">
          <PropertiesPanel
            scene={scenesWithTiming.find(s => s.id === selectedScene)}
            onClose={() => setSelectedScene(null)}
            onUpdateDuration={(dur) => handleUpdateDuration(selectedScene, dur)}
            onRefetch={refetchScenes}
          />
        </div>

        {/* RIGHT: Preview Monitor */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {scenes.length > 0 ? (
            <PreviewPanel
              currentScene={currentScene}
              currentTime={currentTime}
              isPlaying={isPlaying}
              totalScenes={scenes.length}
              totalDuration={totalDuration}
              orientation={previewOrientation || project?.orientation || 'landscape'}
              projectId={projectId}
              onOrientationChange={(o) => { setPreviewOrientation(o); refetchProject(); }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 bg-[#0d0d1a]">
              <Monitor className="w-16 h-16 mb-3 opacity-20" />
              <p className="text-sm">Import scenes to start editing</p>
            </div>
          )}
        </div>
      </div>

      {/* ═══════ BOTTOM: Transport + Timeline ═══════ */}
      <div className="flex-shrink-0 bg-[#0f0f23] border-t border-gray-700/50">
        {/* Transport bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-800/50">
          {/* Playback controls */}
          <div className="flex items-center gap-0.5">
            <button onClick={handlePrevScene} className="w-7 h-7 rounded hover:bg-white/10 flex items-center justify-center">
              <SkipBack className="w-3.5 h-3.5 text-gray-400" />
            </button>
            <button onClick={handlePlayPause} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center">
              {isPlaying ? <Pause className="w-4 h-4 text-white" /> : <Play className="w-4 h-4 text-white ml-0.5" />}
            </button>
            <button onClick={handleNextScene} className="w-7 h-7 rounded hover:bg-white/10 flex items-center justify-center">
              <SkipForward className="w-3.5 h-3.5 text-gray-400" />
            </button>
          </div>

          {/* Timecode */}
          <div className="flex items-center gap-1 font-mono">
            <span className="text-[11px] text-blue-400 min-w-[60px]">{formatTime(currentTime)}</span>
            <span className="text-gray-600 text-[10px]">/</span>
            <span className="text-[11px] text-gray-500 min-w-[60px]">{formatTime(totalDuration)}</span>
          </div>

          <span className="text-[10px] text-gray-600 ml-1">S{currentSceneIndex + 1}/{scenes.length}</span>

          <div className="flex-1" />

          {/* Audio mixer inline */}
          <div className="flex items-center gap-3 text-[10px]">
            <div className="flex items-center gap-1">
              <Mic className="w-3 h-3 text-blue-400" />
              <Slider value={[voVol]} onValueChange={([v]) => setVoVol(v)} min={0} max={1} step={0.05} className="w-12" />
              <span className="text-gray-600 w-5">{Math.round(voVol * 100)}</span>
            </div>
            <div className="flex items-center gap-1">
              <Music className="w-3 h-3 text-green-400" />
              <Slider value={[musicVol]} onValueChange={([v]) => setMusicVol(v)} min={0} max={1} step={0.05} className="w-12" />
              <span className="text-gray-600 w-5">{Math.round(musicVol * 100)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-amber-400 text-[10px]">SFX</span>
              <Slider value={[sfxMasterVol]} onValueChange={([v]) => setSfxMasterVol(v)} min={0} max={1} step={0.05} className="w-12" />
              <span className="text-gray-600 w-5">{Math.round(sfxMasterVol * 100)}</span>
            </div>
            <button onClick={() => setVolume(volume > 0 ? 0 : 0.8)} className="hover:opacity-80">
              {volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-gray-500" /> : <Volume2 className="w-3.5 h-3.5 text-gray-300" />}
            </button>
            <Button size="sm" variant="ghost" className="text-[9px] text-gray-500 h-5 px-1.5" onClick={handleSaveMixLevels}>
              Save
            </Button>
          </div>

          <div className="w-px h-4 bg-gray-700 mx-1" />

          {/* Zoom controls */}
          <div className="flex items-center gap-0.5">
            <button onClick={zoomOut} className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center">
              <ZoomOut className="w-3 h-3 text-gray-400" />
            </button>
            <span className="text-[9px] text-gray-500 w-5 text-center">{pixelsPerSecond}</span>
            <button onClick={zoomIn} className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center">
              <ZoomIn className="w-3 h-3 text-gray-400" />
            </button>
          </div>
        </div>

        {/* Timeline tracks */}
        <div className="overflow-x-auto max-h-[200px]" ref={timelineRef} onClick={handleTimelineClick}>
          <div style={{ minWidth: Math.max(totalDuration * pixelsPerSecond + 100, 800) }}>
            {/* Ruler */}
            <div className="relative">
              <TimelineRuler totalDuration={totalDuration} pixelsPerSecond={pixelsPerSecond} />
              {scenes.length > 0 && (
                <div className="absolute top-0 bottom-0 z-30" style={{ left: currentTime * pixelsPerSecond + 64 - 6 }}>
                  <div className="w-3 h-full flex flex-col items-center cursor-col-resize" onMouseDown={handlePlayheadMouseDown}>
                    <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-red-500" />
                    <div className="w-0.5 flex-1 bg-red-500" />
                  </div>
                </div>
              )}
            </div>

            {/* Video Track */}
            <div className="border-t border-gray-800/50 relative">
              <div className="flex items-center">
                <div className="w-16 flex-shrink-0 px-2 py-1.5 bg-[#1a1a2e] border-r border-gray-800/50 text-[10px] font-medium text-gray-400 flex items-center gap-1">
                  <Film className="w-3 h-3" /> Video
                </div>
                <div className="flex-1 relative" style={{ minWidth: totalDuration * pixelsPerSecond }}>
                  <TimelineTrack
                    scenes={scenesWithTiming}
                    pixelsPerSecond={pixelsPerSecond}
                    selectedScene={selectedScene}
                    onSelectScene={setSelectedScene}
                    onUpdateDuration={handleUpdateDuration}
                    onTransitionClick={(sceneA, sceneB) => setTransitionTarget({ sceneA, sceneB })}
                  />
                  {voiceoverDuration > 0 && sceneDuration < voiceoverDuration && (
                    <div
                      className="absolute top-0 bottom-0 bg-red-900/20 border-l border-red-500/50 border-dashed flex items-center justify-center"
                      style={{ left: sceneDuration * pixelsPerSecond, width: (voiceoverDuration - sceneDuration) * pixelsPerSecond }}
                    >
                      <span className="text-[9px] text-red-400 whitespace-nowrap px-1">Gap ({Math.round(voiceoverDuration - sceneDuration)}s)</span>
                    </div>
                  )}
                </div>
              </div>
              {scenes.length > 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20" style={{ left: currentTime * pixelsPerSecond + 64 }} />
              )}
            </div>

            {/* Voiceover Track */}
            <div className="border-t border-gray-800/50 relative">
              <div className="flex items-center">
                <div className="w-16 flex-shrink-0 px-2 py-1 bg-[#1a1a2e] border-r border-gray-800/50 text-[10px] font-medium text-blue-400 flex items-center gap-1">
                  <Mic className="w-3 h-3" /> VO
                </div>
                <div className="flex-1 h-8 bg-[#0a0a1a] relative">
                  {voiceoverDuration > 0 && (
                    <div
                      className="absolute top-0.5 bottom-0.5 bg-blue-500/15 border border-blue-500/30 rounded flex items-center px-2"
                      style={{ width: voiceoverDuration * pixelsPerSecond }}
                    >
                      <div className="flex items-center gap-0.5">
                        <div className="w-0.5 h-2 bg-blue-400/60 rounded-full" />
                        <div className="w-0.5 h-3 bg-blue-400/60 rounded-full" />
                        <div className="w-0.5 h-1.5 bg-blue-400/60 rounded-full" />
                        <div className="w-0.5 h-2.5 bg-blue-400/60 rounded-full" />
                        <div className="w-0.5 h-2 bg-blue-400/60 rounded-full" />
                      </div>
                      <span className="text-[8px] text-blue-400/70 ml-1.5">VO • {Math.round(voiceoverDuration)}s</span>
                    </div>
                  )}
                </div>
              </div>
              {scenes.length > 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20" style={{ left: currentTime * pixelsPerSecond + 64 }} />
              )}
            </div>

            {/* Music Track */}
            <div className="border-t border-gray-800/50 relative">
              <div className="flex items-center">
                <div className="w-16 flex-shrink-0 px-2 py-1 bg-[#1a1a2e] border-r border-gray-800/50 text-[10px] font-medium text-green-400 flex items-center gap-1">
                  <Music className="w-3 h-3" /> Music
                </div>
                <div className="flex-1 h-8 bg-[#0a0a1a] relative">
                  {musicUrl && (
                    <div
                      className="absolute top-0.5 bottom-0.5 bg-green-500/15 border border-green-500/30 rounded flex items-center px-2"
                      style={{ width: totalDuration * pixelsPerSecond }}
                    >
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className="w-0.5 bg-green-400/60 rounded-full" style={{ height: 3 + Math.random() * 10 }} />
                        ))}
                      </div>
                      <span className="text-[8px] text-green-400/70 ml-1.5">{selectedMusic?.title || 'Music'}</span>
                    </div>
                  )}
                </div>
              </div>
              {scenes.length > 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20" style={{ left: currentTime * pixelsPerSecond + 64 }} />
              )}
            </div>

            {/* SFX Track */}
            <div className="border-t border-gray-800/50 relative">
              <div className="flex items-center">
                <div className="w-16 flex-shrink-0 px-2 py-1 bg-[#1a1a2e] border-r border-gray-800/50 text-[10px] font-medium text-amber-400 flex items-center gap-1">
                  <Volume2 className="w-3 h-3" /> SFX
                </div>
                <div className="flex-1 h-7 bg-[#0a0a1a] relative">
                  {scenesWithTiming.filter(s => s.sound_effect_url).map(scene => (
                    <div
                      key={scene.id}
                      className="absolute top-0.5 bottom-0.5 bg-amber-500/15 border border-amber-500/30 rounded text-[7px] text-amber-400/70 px-1 flex items-center truncate"
                      style={{
                        left: scene.start_time * pixelsPerSecond,
                        width: Math.max(scene.duration_seconds * pixelsPerSecond, 20),
                      }}
                    >
                      {scene.sound_effect || `S${scene.scene_number}`}
                    </div>
                  ))}
                </div>
              </div>
              {scenes.length > 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20" style={{ left: currentTime * pixelsPerSecond + 64 }} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <TransitionLibrary
        open={!!transitionTarget}
        onClose={() => setTransitionTarget(null)}
        sceneA={transitionTarget?.sceneA}
        sceneB={transitionTarget?.sceneB}
        onApply={refetchScenes}
      />
      <VideoExporter
        open={showExporter}
        onClose={() => setShowExporter(false)}
        scenes={scenesWithTiming}
        orientation={project?.orientation || 'landscape'}
        voiceoverUrl={voiceoverUrl}
        musicUrl={musicUrl}
        musicVolume={musicVol}
        projectName={project?.name}
        exportHook={exportHook}
      />
    </div>
  );
}