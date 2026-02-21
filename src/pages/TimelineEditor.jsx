import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import TimelineTrack from '@/components/timeline/TimelineTrack';
import TimelineRuler from '@/components/timeline/TimelineRuler';
import ScenePreview from '@/components/timeline/ScenePreview';
import PlaybackControls from '@/components/timeline/PlaybackControls';
import TranscriptBar from '@/components/timeline/TranscriptBar';
import PreviewMonitor from '@/components/timeline/PreviewMonitor';
import ExportPanel from '@/components/timeline/ExportPanel';
import VideoExporter from '@/components/timeline/VideoExporter';
import useVideoExport from '@/components/timeline/useVideoExport';
import { Loader2, Import, Download, Film, Play, Package, ArrowRight, Upload } from 'lucide-react';
import DownloadAllMedia from '@/components/content/DownloadAllMedia';

export default function TimelineEditor() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [importing, setImporting] = useState(false);
  const [selectedScene, setSelectedScene] = useState(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(10);
  const [showExportPanel, setShowExportPanel] = useState(false);
  const [showExporter, setShowExporter] = useState(false);
  const exportHook = useVideoExport();
  const timelineRef = useRef(null);

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

  // Fetch voiceover and music
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
  const musicVolume = selectedMusic?.volume ?? 0.3;

  // Calculate cumulative start times
  const scenesWithTiming = scenes.reduce((acc, scene, idx) => {
    const prevEnd = idx > 0 ? acc[idx - 1].start_time + acc[idx - 1].duration_seconds : 0;
    acc.push({
      ...scene,
      start_time: prevEnd,
      duration_seconds: scene.duration_seconds || 8,
    });
    return acc;
  }, []);

  // Master duration = voiceover length (if available), otherwise sum of scenes
  const sceneDuration = scenesWithTiming.reduce((sum, s) => sum + s.duration_seconds, 0);
  const totalDuration = voiceoverDuration > 0 ? voiceoverDuration : sceneDuration;

  // Find current scene based on playback time
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
          if (next >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
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
    a.volume = volume;
    voiceoverRef.current = a;
  }, [voiceoverUrl]);

  // Audio: background music
  useEffect(() => {
    if (!musicUrl) return;
    if (musicRef.current) musicRef.current.pause();
    const a = new Audio(musicUrl);
    a.loop = true;
    a.volume = musicVolume * volume;
    musicRef.current = a;
  }, [musicUrl]);

  // Sync audio play/pause with playback state
  useEffect(() => {
    if (isPlaying) {
      if (voiceoverRef.current) {
        voiceoverRef.current.currentTime = currentTime;
        voiceoverRef.current.volume = volume;
        voiceoverRef.current.play().catch(() => {});
      }
      if (musicRef.current) {
        musicRef.current.volume = musicVolume * volume;
        musicRef.current.play().catch(() => {});
      }
    } else {
      voiceoverRef.current?.pause();
      musicRef.current?.pause();
      // Pause all sfx
      Object.values(sfxRefs.current).forEach(a => a?.pause());
    }
  }, [isPlaying]);

  // Sync volume changes live
  useEffect(() => {
    if (voiceoverRef.current) voiceoverRef.current.volume = volume;
    if (musicRef.current) musicRef.current.volume = musicVolume * volume;
  }, [volume, musicVolume]);

  // SFX: play scene sound effects at correct times
  useEffect(() => {
    if (!isPlaying) return;
    const scene = getCurrentScene(currentTime);
    if (!scene?.sound_effect_url) return;
    const timeInScene = currentTime - scene.start_time;
    // Play SFX at start of scene (within first 0.3s)
    if (timeInScene >= 0 && timeInScene < 0.3) {
      if (!sfxRefs.current[scene.id] || sfxRefs.current[scene.id].paused) {
        const sfx = new Audio(scene.sound_effect_url);
        sfx.volume = (scene.sfx_volume ?? 0.5) * volume;
        sfx.play().catch(() => {});
        sfxRefs.current[scene.id] = sfx;
      }
    }
  }, [currentTime, isPlaying]);

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      voiceoverRef.current?.pause();
      musicRef.current?.pause();
      Object.values(sfxRefs.current).forEach(a => a?.pause());
    };
  }, []);

  // Auto-scroll timeline to follow playhead
  useEffect(() => {
    if (isPlaying && timelineRef.current) {
      const playheadX = currentTime * pixelsPerSecond + 96; // 96 = label width
      const container = timelineRef.current;
      const scrollLeft = container.scrollLeft;
      const containerWidth = container.clientWidth;
      if (playheadX > scrollLeft + containerWidth - 100 || playheadX < scrollLeft + 100) {
        container.scrollLeft = playheadX - containerWidth / 2;
      }
    }
  }, [currentTime, isPlaying, pixelsPerSecond]);

  const isDraggingPlayhead = useRef(false);

  const getTimeFromMouseEvent = (e) => {
    const container = timelineRef.current;
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left + container.scrollLeft - 96;
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
    const t = getTimeFromMouseEvent(e);
    setCurrentTime(t);
    if (voiceoverRef.current) voiceoverRef.current.currentTime = t;
    sfxRefs.current = {};
  };

  const handlePlayPause = () => setIsPlaying(prev => !prev);
  const handleSeek = (time) => setCurrentTime(Math.max(0, Math.min(totalDuration, time)));

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
    await base44.entities.Projects.update(projectId, {
      status: 'timeline_editing',
      current_step: 7,
    });
    setImporting(false);
  };

  const handleUpdateDuration = async (sceneId, newDuration) => {
    await base44.entities.Scenes.update(sceneId, { duration_seconds: Math.max(2, newDuration) });
    refetchScenes();
  };

  // Compile handled by ExportPanel

  const zoomIn = () => setPixelsPerSecond(prev => Math.min(prev + 5, 50));
  const zoomOut = () => setPixelsPerSecond(prev => Math.max(prev - 5, 3));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={3} />
      <div className="max-w-full mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Timeline Editor</h1>
            <p className="text-gray-600">
              {scenes.length} scenes • {Math.round(totalDuration)}s total ({Math.round(totalDuration / 60)} min)
              {voiceoverDuration > 0 && <span className="text-blue-600 ml-1">· VO: {Math.round(voiceoverDuration)}s</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {scenes.length === 0 || project?.status === 'content_generation' || project?.status === 'scenes_ready' ? (
              <Button onClick={handleImport} disabled={importing} className="bg-blue-600 hover:bg-blue-700">
                {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Import className="w-4 h-4 mr-2" />}
                Import from Content
              </Button>
            ) : null}
            <Button variant="outline" onClick={zoomOut}>−</Button>
            <Button variant="outline" onClick={zoomIn}>+</Button>
            {scenes.length > 0 && (
              <>
                <Button onClick={() => setShowExporter(true)} className="bg-green-600 hover:bg-green-700">
                  <Download className="w-4 h-4 mr-2" />
                  Export MP4
                </Button>
                <Button variant="outline" onClick={() => setShowExportPanel(p => !p)}>
                  <Package className="w-4 h-4 mr-2" />
                  {showExportPanel ? 'Hide Assets' : 'Export Assets'}
                </Button>
                <Button
                  onClick={async () => {
                    await base44.entities.Projects.update(projectId, { status: 'post_production', current_step: 11 });
                    navigate(createPageUrl(`PostProduction?project_id=${projectId}`));
                  }}
                  className="bg-blue-600 hover:bg-blue-700 gap-2"
                >
                  Next: Post Production <ArrowRight className="w-4 h-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Download All Media */}
        {scenes.length > 0 && (
          <DownloadAllMedia
            scenes={scenesWithTiming}
            voiceoverUrl={voiceoverUrl}
            musicUrl={musicUrl}
            projectName={project?.name}
          />
        )}

        {/* Export Assets Panel */}
        {showExportPanel && scenes.length > 0 && (
          <ExportPanel
            project={project}
            scenesWithTiming={scenesWithTiming}
            voiceoverUrl={voiceoverUrl}
            musicUrl={musicUrl}
            musicVolume={musicVolume}
            totalDuration={totalDuration}
            onClose={() => setShowExportPanel(false)}
            onStatusUpdate={refetchProject}
          />
        )}

        {/* Live Preview Monitor */}
        {scenes.length > 0 && (
          <PreviewMonitor
            currentScene={currentScene}
            currentTime={currentTime}
            isPlaying={isPlaying}
            totalScenes={scenes.length}
            totalDuration={totalDuration}
          />
        )}

        {/* Selected Scene Preview */}
        {selectedScene && (
          <ScenePreview
            scene={scenesWithTiming.find(s => s.id === selectedScene)}
            onClose={() => setSelectedScene(null)}
            onUpdateDuration={(dur) => handleUpdateDuration(selectedScene, dur)}
            onRefetch={refetchScenes}
          />
        )}

        {/* Playback Controls */}
        {scenes.length > 0 && (
          <div className="mb-3">
            <PlaybackControls
              isPlaying={isPlaying}
              onPlayPause={handlePlayPause}
              onPrevScene={handlePrevScene}
              onNextScene={handleNextScene}
              onSeek={handleSeek}
              currentTime={currentTime}
              totalDuration={totalDuration}
              volume={volume}
              onVolumeChange={setVolume}
              currentSceneNumber={currentSceneIndex + 1}
              totalScenes={scenes.length}
            />
          </div>
        )}

        {/* Timeline */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto" ref={timelineRef} onClick={handleTimelineClick}>
              <div style={{ minWidth: Math.max(totalDuration * pixelsPerSecond + 100, 800) }}>
                {/* Ruler */}
                <div className="relative">
                  <TimelineRuler totalDuration={totalDuration} pixelsPerSecond={pixelsPerSecond} />
                  {/* Playhead on ruler - draggable */}
                  {scenes.length > 0 && (
                    <div
                      className="absolute top-0 bottom-0 z-30"
                      style={{ left: currentTime * pixelsPerSecond + 96 - 6 }}
                    >
                      <div
                        className="w-3 h-full flex flex-col items-center cursor-col-resize"
                        onMouseDown={handlePlayheadMouseDown}
                      >
                        <div className="w-3 h-3 bg-red-500 rounded-full mt-0.5 shadow-md hover:scale-125 transition-transform" />
                        <div className="w-0.5 flex-1 bg-red-500" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Video Track */}
                <div className="border-t relative">
                  <div className="flex items-center">
                    <div className="w-24 flex-shrink-0 px-3 py-2 bg-gray-50 border-r text-xs font-medium text-gray-600 flex items-center gap-1">
                      <Film className="w-3 h-3" /> Video
                    </div>
                    <TimelineTrack
                      scenes={scenesWithTiming}
                      pixelsPerSecond={pixelsPerSecond}
                      selectedScene={selectedScene}
                      onSelectScene={setSelectedScene}
                      onUpdateDuration={handleUpdateDuration}
                    />
                  </div>
                  {/* Playhead line on video track */}
                  {scenes.length > 0 && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 cursor-col-resize"
                      style={{ left: currentTime * pixelsPerSecond + 96 }}
                      onMouseDown={handlePlayheadMouseDown}
                    />
                  )}
                </div>

                {/* Audio Track — Voiceover (master timeline) */}
                <div className="border-t relative">
                  <div className="flex items-center">
                    <div className="w-24 flex-shrink-0 px-3 py-2 bg-gray-50 border-r text-xs font-medium text-gray-600 flex items-center gap-1">
                      <Play className="w-3 h-3" /> Audio
                    </div>
                    <div className="flex-1 h-16 bg-gradient-to-r from-blue-100 to-blue-50 flex items-center px-4">
                      {voiceoverDuration > 0 ? (
                        <div
                          className="h-8 bg-blue-300 rounded flex items-center px-3 text-xs text-blue-800 font-medium border border-blue-400"
                          style={{ width: voiceoverDuration * pixelsPerSecond }}
                        >
                          🎙 Voiceover (Master) • {Math.round(voiceoverDuration)}s
                        </div>
                      ) : totalDuration > 0 ? (
                        <div
                          className="h-8 bg-blue-200 rounded flex items-center px-3 text-xs text-blue-700"
                          style={{ width: totalDuration * pixelsPerSecond }}
                        >
                          Audio • {Math.round(totalDuration)}s
                        </div>
                      ) : null}
                    </div>
                  </div>
                  {/* Playhead line on audio track */}
                  {scenes.length > 0 && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 cursor-col-resize"
                      style={{ left: currentTime * pixelsPerSecond + 96 }}
                      onMouseDown={handlePlayheadMouseDown}
                    />
                  )}
                </div>

                {/* SFX Track */}
                <div className="border-t relative">
                  <div className="flex items-center">
                    <div className="w-24 flex-shrink-0 px-3 py-2 bg-gray-50 border-r text-xs font-medium text-gray-600 flex items-center gap-1">
                      🔊 SFX
                    </div>
                    <div className="flex-1 h-12 bg-gradient-to-r from-amber-50 to-amber-100/30 relative">
                      {scenesWithTiming.filter(s => s.sound_effect_url).map(scene => (
                        <div
                          key={scene.id}
                          className="absolute top-1 bottom-1 bg-amber-200 border border-amber-400 rounded text-[9px] text-amber-800 px-1 flex items-center truncate"
                          style={{
                            left: scene.start_time * pixelsPerSecond,
                            width: Math.max(scene.duration_seconds * pixelsPerSecond, 20),
                          }}
                        >
                          S{scene.scene_number} SFX
                        </div>
                      ))}
                    </div>
                  </div>
                  {scenes.length > 0 && (
                    <div
                      className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20 cursor-col-resize"
                      style={{ left: currentTime * pixelsPerSecond + 96 }}
                      onMouseDown={handlePlayheadMouseDown}
                    />
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transcript Bar */}
        {scenes.length > 0 && (
          <TranscriptBar currentScene={currentScene} currentTime={currentTime} />
        )}
      </div>

      {/* Video Export Modal */}
      <VideoExporter
        open={showExporter}
        onClose={() => setShowExporter(false)}
        scenes={scenesWithTiming}
        orientation={project?.orientation || 'landscape'}
        voiceoverUrl={voiceoverUrl}
        musicUrl={musicUrl}
        musicVolume={musicVolume}
        projectName={project?.name}
        exportHook={exportHook}
      />
    </div>
  );
}