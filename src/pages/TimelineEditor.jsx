import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { debounce } from 'lodash';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import TimelineToolbar from '@/components/timeline/TimelineToolbar';
import SfxGenerateDialog from '@/components/timeline/SfxGenerateDialog';
import InlineWaveform from '@/components/timeline/InlineWaveform';
import {
  Loader2, Film, Play, Pause, SkipBack, SkipForward,
  Volume2, VolumeX, Mic, Music, Monitor
} from 'lucide-react';

export default function TimelineEditor() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [importing, setImporting] = useState(false);
  const [selectedScene, setSelectedScene] = useState(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(10);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showExporter, setShowExporter] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [transitionTarget, setTransitionTarget] = useState(null);
  const [previewOrientation, setPreviewOrientation] = useState(null);
  const [editingTrack, setEditingTrack] = useState(null); // 'voiceover' | 'music' | 'sfx-{sceneId}'
  const exportHook = useVideoExport();
  const timelineRef = useRef(null);

  // Track states
  const [activeTrack, setActiveTrack] = useState(null);
  const [collapsedTracks, setCollapsedTracks] = useState({});
  const [showSfxDialog, setShowSfxDialog] = useState(false);

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

  // Spacebar play/pause
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'Space' && !e.target.closest('input, textarea, [contenteditable]')) {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
    // Allow clicks on inline waveform editing areas
    if (e.target.closest('[data-inline-edit]')) return;
    // Don't interfere with buttons
    if (e.target.closest('button')) return;
    // Move playhead to clicked position
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

  const toggleTrackCollapse = (track) => {
    setCollapsedTracks(prev => ({ ...prev, [track]: !prev[track] }));
  };

  // Inline audio edit save handler
  const handleInlineAudioSave = async (trackTarget, wavBlob, newDuration) => {
    const file = new File([wavBlob], 'edited_audio.wav', { type: 'audio/wav' });
    const { file_url } = await base44.integrations.Core.UploadFile({ file });

    if (trackTarget === 'voiceover') {
      const ps = prodSettings[0];
      if (ps) {
        await base44.entities.ProductionSettings.update(ps.id, {
          voiceover_url: file_url,
          total_duration_seconds: Math.round(newDuration * 10) / 10,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['prod-settings', projectId] });
    } else if (trackTarget === 'music') {
      if (selectedMusic) {
        await base44.entities.MusicTracks.update(selectedMusic.id, { audio_url: file_url });
      }
      queryClient.invalidateQueries({ queryKey: ['music-timeline', projectId] });
    } else if (trackTarget?.startsWith('sfx-')) {
      const sceneId = trackTarget.replace('sfx-', '');
      await base44.entities.Scenes.update(sceneId, { sound_effect_url: file_url });
      refetchScenes();
    }
    setEditingTrack(null);
  };

  const trackHeight = { expanded: 'h-20', collapsed: 'h-5' };

  return (
    <div className="h-screen flex flex-col bg-[#0d0d1a] text-white overflow-hidden" tabIndex={-1}>
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

      {/* ═══════ BOTTOM: Transport + Toolbar + Timeline ═══════ */}
      <div className="flex-shrink-0 bg-[#0f0f23] border-t border-gray-700/50">
        {/* Transport bar */}
        <div className="flex items-center gap-2 px-3 py-1 border-b border-gray-800/50">
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
          <span className="text-[9px] text-gray-700 ml-1">Space=Play</span>

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
        </div>

        {/* Timeline Edit Toolbar */}
        <TimelineToolbar
          activeTrack={activeTrack}
          hasSelection={false}
          onCut={() => {
            if (activeTrack === 'voiceover' && voiceoverUrl) setEditingTrack('voiceover');
            else if (activeTrack === 'music' && musicUrl) setEditingTrack('music');
            else if (activeTrack === 'sfx') {
              const sc = getCurrentScene(currentTime);
              if (sc?.sound_effect_url) setEditingTrack(`sfx-${sc.id}`);
            }
          }}
          onTrim={() => {
            if (activeTrack === 'voiceover' && voiceoverUrl) setEditingTrack('voiceover');
            else if (activeTrack === 'music' && musicUrl) setEditingTrack('music');
          }}
          onSplit={() => {
            if (activeTrack === 'voiceover' && voiceoverUrl) setEditingTrack('voiceover');
            else if (activeTrack === 'music' && musicUrl) setEditingTrack('music');
          }}
          onDelete={() => {}}
          onUndo={() => {}}
          canUndo={false}
          onDetectSilence={() => {
            if (voiceoverUrl) setEditingTrack('voiceover');
          }}
          onGenerateSfx={() => setShowSfxDialog(true)}
          collapsedTracks={collapsedTracks}
          onToggleCollapse={toggleTrackCollapse}
          pixelsPerSecond={pixelsPerSecond}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
        />

        {/* Timeline tracks — click anywhere to move playhead */}
        <div className="overflow-x-auto max-h-[280px] overflow-y-auto" ref={timelineRef} onClick={handleTimelineClick}>
          <div style={{ minWidth: Math.max(totalDuration * pixelsPerSecond + 100, 800) }}>
            {/* Ruler — click to seek */}
            <div className="relative cursor-pointer">
              <TimelineRuler totalDuration={totalDuration} pixelsPerSecond={pixelsPerSecond} />
              {scenes.length > 0 && (
                <div className="absolute top-0 z-30 pointer-events-auto" style={{ left: currentTime * pixelsPerSecond + 64 - 6, bottom: '-500px' }}>
                  <div className="w-3 flex flex-col items-center cursor-col-resize" onMouseDown={handlePlayheadMouseDown} style={{ height: '100vh' }}>
                    <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent border-t-red-500 flex-shrink-0" />
                    <div className="w-0.5 flex-1 bg-red-500" />
                  </div>
                </div>
              )}
            </div>

            {/* Video Track */}
            <div
              className={`border-t border-gray-800/50 relative cursor-pointer transition-all ${activeTrack === 'video' ? 'ring-1 ring-inset ring-purple-500/40' : ''}`}
              onClick={(e) => { e.stopPropagation(); setActiveTrack('video'); }}
            >
              <div className="flex items-center">
                <div
                  className="w-16 flex-shrink-0 px-2 py-1.5 bg-[#1a1a2e] border-r border-gray-800/50 text-[10px] font-medium text-purple-400 flex items-center gap-1 cursor-pointer select-none"
                  onClick={(e) => { e.stopPropagation(); toggleTrackCollapse('video'); }}
                >
                  <Film className="w-3 h-3" /> Video
                </div>
                <div className={`flex-1 relative transition-all ${collapsedTracks.video ? 'h-5' : ''}`} style={{ minWidth: totalDuration * pixelsPerSecond }}>
                  {!collapsedTracks.video ? (
                    <>
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
                    </>
                  ) : (
                    <div className="h-5 bg-[#0a0a1a] flex items-center px-2">
                      <span className="text-[8px] text-purple-400/50">{scenes.length} scenes · {Math.round(sceneDuration)}s</span>
                    </div>
                  )}
                </div>
              </div>
              {scenes.length > 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none" style={{ left: currentTime * pixelsPerSecond + 64 }} />
              )}
            </div>

            {/* Voiceover Track */}
            <div
              className={`border-t border-gray-800/50 relative cursor-pointer transition-all ${activeTrack === 'voiceover' ? 'ring-1 ring-inset ring-blue-500/40' : ''}`}
              onClick={(e) => { e.stopPropagation(); setActiveTrack('voiceover'); }}
            >
              <div className="flex items-center">
                <div
                  className="w-16 flex-shrink-0 px-2 py-1 bg-[#1a1a2e] border-r border-gray-800/50 text-[10px] font-medium text-blue-400 flex items-center gap-1 cursor-pointer select-none"
                  onClick={(e) => { e.stopPropagation(); toggleTrackCollapse('voiceover'); }}
                >
                  <Mic className="w-3 h-3" /> VO
                </div>
                <div
                  data-inline-edit={editingTrack === 'voiceover' ? 'true' : undefined}
                  className={`flex-1 bg-[#0a0a1a] relative transition-all ${collapsedTracks.voiceover ? 'h-5' : editingTrack === 'voiceover' ? 'h-16' : 'h-8'}`}
                  style={{ minHeight: editingTrack === 'voiceover' ? 64 : undefined }}
                >
                  {voiceoverDuration > 0 && voiceoverUrl && (
                    <InlineWaveform
                      audioUrl={voiceoverUrl}
                      trackColor="blue"
                      pixelsPerSecond={pixelsPerSecond}
                      totalTimelineDuration={totalDuration}
                      currentTime={currentTime}
                      onSeek={(t) => { setCurrentTime(t); if (voiceoverRef.current) voiceoverRef.current.currentTime = t; }}
                      isEditing={editingTrack === 'voiceover'}
                      onStartEdit={() => setEditingTrack('voiceover')}
                      onStopEdit={() => setEditingTrack(null)}
                      onSave={(blob, dur) => handleInlineAudioSave('voiceover', blob, dur)}
                      label={`VO • ${Math.round(voiceoverDuration)}s`}
                      trackDuration={voiceoverDuration}
                    />
                  )}
                </div>
              </div>
              {scenes.length > 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none" style={{ left: currentTime * pixelsPerSecond + 64 }} />
              )}
            </div>

            {/* Music Track */}
            <div
              className={`border-t border-gray-800/50 relative cursor-pointer transition-all ${activeTrack === 'music' ? 'ring-1 ring-inset ring-green-500/40' : ''}`}
              onClick={(e) => { e.stopPropagation(); setActiveTrack('music'); }}
            >
              <div className="flex items-center">
                <div
                  className="w-16 flex-shrink-0 px-2 py-1 bg-[#1a1a2e] border-r border-gray-800/50 text-[10px] font-medium text-green-400 flex items-center gap-1 cursor-pointer select-none"
                  onClick={(e) => { e.stopPropagation(); toggleTrackCollapse('music'); }}
                >
                  <Music className="w-3 h-3" /> Music
                </div>
                <div
                  data-inline-edit={editingTrack === 'music' ? 'true' : undefined}
                  className={`flex-1 bg-[#0a0a1a] relative transition-all ${collapsedTracks.music ? 'h-5' : editingTrack === 'music' ? 'h-16' : 'h-8'}`}
                  style={{ minHeight: editingTrack === 'music' ? 64 : undefined }}
                >
                  {musicUrl && (
                    <InlineWaveform
                      audioUrl={musicUrl}
                      trackColor="green"
                      pixelsPerSecond={pixelsPerSecond}
                      totalTimelineDuration={totalDuration}
                      currentTime={currentTime}
                      onSeek={(t) => { setCurrentTime(t); }}
                      isEditing={editingTrack === 'music'}
                      onStartEdit={() => setEditingTrack('music')}
                      onStopEdit={() => setEditingTrack(null)}
                      onSave={(blob, dur) => handleInlineAudioSave('music', blob, dur)}
                      label={selectedMusic?.title || 'Music'}
                      trackDuration={selectedMusic?.duration_seconds || totalDuration}
                    />
                  )}
                </div>
              </div>
              {scenes.length > 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none" style={{ left: currentTime * pixelsPerSecond + 64 }} />
              )}
            </div>

            {/* SFX Track */}
            <div
              className={`border-t border-gray-800/50 relative cursor-pointer transition-all ${activeTrack === 'sfx' ? 'ring-1 ring-inset ring-amber-500/40' : ''}`}
              onClick={(e) => { e.stopPropagation(); setActiveTrack('sfx'); }}
            >
              <div className="flex items-center">
                <div
                  className="w-16 flex-shrink-0 px-2 py-1 bg-[#1a1a2e] border-r border-gray-800/50 text-[10px] font-medium text-amber-400 flex items-center gap-1 cursor-pointer select-none"
                  onClick={(e) => { e.stopPropagation(); toggleTrackCollapse('sfx'); }}
                >
                  <Volume2 className="w-3 h-3" /> SFX
                </div>
                <div
                  data-inline-edit={editingTrack?.startsWith('sfx-') ? 'true' : undefined}
                  className={`flex-1 bg-[#0a0a1a] relative transition-all ${collapsedTracks.sfx ? 'h-5' : editingTrack?.startsWith('sfx-') ? 'h-16' : 'h-8'}`}
                  style={{ minHeight: editingTrack?.startsWith('sfx-') ? 64 : undefined }}
                >
                  {!collapsedTracks.sfx ? (
                    <>
                      {scenesWithTiming.filter(s => s.sound_effect_url).map(scene => {
                        const sfxKey = `sfx-${scene.id}`;
                        const isEditingSfx = editingTrack === sfxKey;
                        return (
                          <div
                            key={scene.id}
                            className="absolute top-0 bottom-0"
                            style={{
                              left: scene.start_time * pixelsPerSecond,
                              width: Math.max(scene.duration_seconds * pixelsPerSecond, 30),
                            }}
                          >
                            <InlineWaveform
                              audioUrl={scene.sound_effect_url}
                              trackColor="amber"
                              pixelsPerSecond={pixelsPerSecond}
                              totalTimelineDuration={totalDuration}
                              currentTime={currentTime - scene.start_time}
                              onSeek={(t) => { setCurrentTime(scene.start_time + t); }}
                              isEditing={isEditingSfx}
                              onStartEdit={() => setEditingTrack(sfxKey)}
                              onStopEdit={() => setEditingTrack(null)}
                              onSave={(blob, dur) => handleInlineAudioSave(sfxKey, blob, dur)}
                              label={scene.sound_effect || `S${scene.scene_number}`}
                              trackDuration={scene.duration_seconds}
                            />
                          </div>
                        );
                      })}
                      {scenesWithTiming.filter(s => !s.sound_effect_url).map(scene => (
                        <div
                          key={`empty-${scene.id}`}
                          className="absolute top-0.5 bottom-0.5 border border-dashed border-amber-500/20 rounded text-[7px] text-amber-400/30 px-1 flex items-center cursor-pointer hover:border-amber-500/40 hover:text-amber-400/50 transition-colors"
                          style={{
                            left: scene.start_time * pixelsPerSecond,
                            width: Math.max(scene.duration_seconds * pixelsPerSecond, 30),
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedScene(scene.id);
                            setShowSfxDialog(scene.id);
                          }}
                          title="Click to add SFX"
                        >
                          + S{scene.scene_number}
                        </div>
                      ))}
                    </>
                  ) : (
                    <div className="h-5 flex items-center px-2">
                      <span className="text-[8px] text-amber-400/50">{scenesWithTiming.filter(s => s.sound_effect_url).length} effects</span>
                    </div>
                  )}
                </div>
              </div>
              {scenes.length > 0 && (
                <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 pointer-events-none" style={{ left: currentTime * pixelsPerSecond + 64 }} />
              )}
            </div>
          </div>
        </div>

        {/* SFX Generate Dialog */}
        {showSfxDialog && currentScene && (
          <div className="relative">
            <SfxGenerateDialog
              scene={scenesWithTiming.find(s => s.id === (showSfxDialog === true ? currentScene.id : showSfxDialog)) || currentScene}
              onGenerated={() => { refetchScenes(); setShowSfxDialog(false); }}
              onClose={() => setShowSfxDialog(false)}
            />
          </div>
        )}
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