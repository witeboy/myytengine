import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import StageProgress from '@/components/StageProgress';
import SceneGrid from '@/components/content/SceneGrid';
import VoiceoverPanel from '@/components/script/VoiceoverPanel';
import VisualStyleSelector from '@/components/content/VisualStyleSelector';
import OrientationSelector from '@/components/content/OrientationSelector';
import MusicPanel from '@/components/content/MusicPanel';
import AudioMixerPanel from '@/components/content/AudioMixerPanel';
import { Loader2, Download, ArrowRight, Import, Layers, ImageIcon, Film, Palette, Sparkles, Monitor } from 'lucide-react';

export default function ContentGeneration() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [importing, setImporting] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [audioLevels, setAudioLevels] = useState({ narration: 1, music: 0.3, sfx: 0.5 });
  const [enhancingAll, setEnhancingAll] = useState(false);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: scenes = [], refetch: refetchScenes } = useQuery({
    queryKey: ['scenes', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => a.scene_number - b.scene_number);
    },
    enabled: !!projectId,
  });

  // Import: break script into scenes (with live progress polling)
 // Import: break script into scenes (batch by batch to avoid timeouts)
  const handleImport = async () => {
    setImporting(true);
    let batchIndex = 0;
    let done = false;

    try {
      while (!done) {
        console.log(`Generating scene batch ${batchIndex + 1}...`);
        
        const result = await base44.functions.invoke('generateScenePrompts', { 
          project_id: projectId, 
          batch_index: batchIndex 
        });

        // Refresh scenes after each batch so user sees progress
        await refetchScenes();

        if (result.done) {
          done = true;
          console.log(`All scenes generated! Total: ${result.total_scenes}`);
        } else {
          batchIndex++;
        }
      }
    } catch (err) {
      console.error('Scene generation error:', err);
    } finally {
      await refetchScenes();
      await refetchProject();
      setImporting(false);
    }
  };

  // Generate all images
  const handleGenerateImages = async () => {
    setGeneratingImages(true);
    const pending = scenes.filter(s => s.status === 'prompts_ready' || !s.image_url);
    for (const scene of pending) {
      try {
        await base44.functions.invoke('generateSceneImage', { scene_id: scene.id });
      } catch (err) {
        console.warn(`Scene ${scene.scene_number} image failed, skipping:`, err.message);
      }
      // Refresh after each scene so user sees progress
      await refetchScenes();
    }
    setGeneratingImages(false);
  };

  // Generate all videos from images
  const handleGenerateVideos = async () => {
    setGeneratingVideos(true);
    const ready = scenes.filter(s => s.image_url && s.status === 'image_generated');
    for (const scene of ready) {
      try {
        await base44.functions.invoke('generateSceneVideo', { scene_id: scene.id });
      } catch (err) {
        console.warn(`Scene ${scene.scene_number} video failed, skipping:`, err.message);
      }
      await refetchScenes();
    }
    setGeneratingVideos(false);
  };

  // Enhance all scene prompts with AI
  const handleEnhanceAll = async () => {
    setEnhancingAll(true);
    for (const scene of scenes) {
      try {
        await base44.functions.invoke('enhanceScenePrompts', {
          scene_id: scene.id,
          enhance_type: 'both',
        });
      } catch (err) {
        console.warn(`Scene ${scene.scene_number} enhance failed:`, err.message);
      }
      await refetchScenes();
    }
    setEnhancingAll(false);
  };

  const handleExport = () => {
    const exportData = scenes.map(s => ({
      scene_number: s.scene_number,
      narration: s.narration_text,
      image_url: s.image_url,
      video_url: s.video_url,
      duration: s.duration_seconds,
    }));
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'scenes'}-content.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleContinueToTimeline = () => {
    navigate(createPageUrl(`TimelineEditor?project_id=${projectId}`));
  };

  const { data: scripts = [] } = useQuery({
    queryKey: ['scripts', projectId],
    queryFn: () => base44.entities.Scripts.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  const latestScript = scripts.find(s => s.version === 'final_aggregated') || null;

  const imageCount = scenes.filter(s => s.image_url).length;
  const videoCount = scenes.filter(s => s.video_url).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={2} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">Content Generation</h1>
          <div className="flex gap-2">
            {scenes.length > 0 && (
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-1" /> Export
              </Button>
            )}
            {scenes.length > 0 && imageCount > 0 && (
              <Button onClick={handleContinueToTimeline} className="bg-blue-600 hover:bg-blue-700 gap-2">
                Next: Timeline <ArrowRight className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-gray-600 mb-8">Import your script, generate scene images and animations</p>

        {/* Orientation Selector */}
        {project && (
          <div className="bg-white p-5 rounded-lg shadow-sm border mb-6">
            <OrientationSelector
              selectedOrientation={project.orientation || 'landscape'}
              onSelect={async (orientation) => {
                await base44.entities.Projects.update(projectId, { orientation });
                refetchProject();
              }}
            />
          </div>
        )}

        {/* Visual Style Selector - always show when project exists */}
        {project && (
          <div className="bg-white p-5 rounded-lg shadow-sm border mb-6">
            <VisualStyleSelector
              selectedStyle={project.visual_style}
              onSelect={async (style) => {
                await base44.entities.Projects.update(projectId, { visual_style: style });
                refetchProject();
              }}
            />
          </div>
        )}

        {/* Action Bar */}
        <div className="bg-white p-4 rounded-lg shadow-sm border mb-6 flex flex-wrap items-center gap-3">
          {scenes.length === 0 ? (
            <>
              <Button onClick={handleImport} disabled={importing || !project?.visual_style || !project?.orientation} className="bg-blue-600 hover:bg-blue-700">
                {importing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Import className="w-4 h-4 mr-2" />}
                {importing ? 'Breaking Script into Scenes...' : 'Import Script & Generate Scenes'}
              </Button>
              {(!project?.visual_style || !project?.orientation) && (
                <p className="text-sm text-amber-600 flex items-center gap-1">
                  <Palette className="w-4 h-4" /> Please select orientation and visual style above first
                </p>
              )}
            </>
          ) : (
            <>
              {project?.orientation && (
                      <Badge className="bg-blue-100 text-blue-800 text-xs">
                        <Monitor className="w-3 h-3 mr-1" />
                        {project.orientation === 'portrait' ? '9:16 Portrait' : '16:9 Landscape'}
                      </Badge>
                    )}
              {project?.visual_style && (
                      <Badge className="bg-purple-100 text-purple-800 text-xs">
                        <Palette className="w-3 h-3 mr-1" />
                        {project.visual_style.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Layers className="w-4 h-4 text-blue-600" />
                      {scenes.length} scenes
                    </div>
              <div className="flex items-center gap-2 text-sm">
                <ImageIcon className="w-4 h-4 text-green-600" />
                {imageCount}/{scenes.length} images
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Film className="w-4 h-4 text-purple-600" />
                {videoCount}/{scenes.length} videos
              </div>
              <div className="flex-1" />
              <Button
                onClick={handleEnhanceAll}
                disabled={enhancingAll}
                variant="outline"
                className="border-purple-200 text-purple-700 hover:bg-purple-50"
              >
                {enhancingAll ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                {enhancingAll ? 'Enhancing...' : 'AI Enhance All'}
              </Button>
              <Button
                onClick={handleGenerateImages}
                disabled={generatingImages}
                variant="outline"
              >
                {generatingImages ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <ImageIcon className="w-4 h-4 mr-1" />}
                {generatingImages ? 'Generating...' : 'Generate All Images'}
              </Button>
              <Button
                onClick={handleGenerateVideos}
                disabled={generatingVideos || imageCount === 0}
                variant="outline"
              >
                {generatingVideos ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Film className="w-4 h-4 mr-1" />}
                {generatingVideos ? 'Animating...' : 'Animate All Scenes'}
              </Button>
            </>
          )}
        </div>

        {/* Scene Grid with Drag & Drop, Acts, and Notes */}
        {scenes.length > 0 && (
          <div className="mb-8">
            <SceneGrid scenes={scenes} onRefetch={refetchScenes} />
          </div>
        )}

        {/* Audio Section: Voiceover, Music, Mixer */}
        {project && (
          <div className="mb-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {latestScript && (
              <VoiceoverPanel
                project={project}
                script={latestScript}
                onUpdate={() => refetchProject()}
              />
            )}
            <MusicPanel project={project} />
            <AudioMixerPanel
              narrationVolume={audioLevels.narration}
              musicVolume={audioLevels.music}
              sfxVolume={audioLevels.sfx}
              onChange={(update) => setAudioLevels(prev => ({ ...prev, ...update }))}
            />
          </div>
        )}

{/* Continue button moved to header */}
      </div>
    </div>
  );
}