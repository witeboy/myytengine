import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import TimelineTrack from '@/components/timeline/TimelineTrack';
import TimelineRuler from '@/components/timeline/TimelineRuler';
import ScenePreview from '@/components/timeline/ScenePreview';
import { Loader2, Import, Download, Play, Film } from 'lucide-react';

export default function TimelineEditor() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [importing, setImporting] = useState(false);
  const [selectedScene, setSelectedScene] = useState(null);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(10);
  const [compiling, setCompiling] = useState(false);
  const timelineRef = useRef(null);

  const { data: project } = useQuery({
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

  const totalDuration = scenesWithTiming.reduce((sum, s) => sum + s.duration_seconds, 0);

  const handleImport = async () => {
    setImporting(true);
    // Scenes already exist from content generation, just update project status
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

  const handleCompile = async () => {
    setCompiling(true);
    // Build compilation manifest
    const manifest = scenesWithTiming.map(s => ({
      scene_number: s.scene_number,
      image_url: s.image_url,
      video_url: s.video_url,
      duration: s.duration_seconds,
      start_time: s.start_time,
      narration: s.narration_text,
    }));

    const blob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'video'}-timeline-manifest.json`;
    a.click();
    URL.revokeObjectURL(url);

    await base44.entities.Projects.update(projectId, {
      status: 'compiled',
      current_step: 8,
    });

    setCompiling(false);
  };

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
              <Button onClick={handleCompile} disabled={compiling} className="bg-green-600 hover:bg-green-700">
                {compiling ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                Compile & Export
              </Button>
            )}
          </div>
        </div>

        {/* Selected Scene Preview */}
        {selectedScene && (
          <ScenePreview
            scene={scenesWithTiming.find(s => s.id === selectedScene)}
            onClose={() => setSelectedScene(null)}
            onUpdateDuration={(dur) => handleUpdateDuration(selectedScene, dur)}
          />
        )}

        {/* Timeline */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto" ref={timelineRef}>
              <div style={{ minWidth: Math.max(totalDuration * pixelsPerSecond + 100, 800) }}>
                {/* Ruler */}
                <TimelineRuler totalDuration={totalDuration} pixelsPerSecond={pixelsPerSecond} />

                {/* Video Track */}
                <div className="border-t">
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
                </div>

                {/* Audio Track (placeholder) */}
                <div className="border-t">
                  <div className="flex items-center">
                    <div className="w-24 flex-shrink-0 px-3 py-2 bg-gray-50 border-r text-xs font-medium text-gray-600 flex items-center gap-1">
                      <Play className="w-3 h-3" /> Audio
                    </div>
                    <div className="flex-1 h-16 bg-gradient-to-r from-blue-100 to-blue-50 flex items-center px-4">
                      {totalDuration > 0 && (
                        <div
                          className="h-8 bg-blue-200 rounded flex items-center px-3 text-xs text-blue-700"
                          style={{ width: totalDuration * pixelsPerSecond }}
                        >
                          Voiceover • {Math.round(totalDuration)}s
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}