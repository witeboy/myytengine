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
import { Loader2, Download, ArrowRight, Import, Layers, ImageIcon, Film, Palette, Sparkles, Monitor, Clapperboard, Wand2 } from 'lucide-react';

export default function ContentGeneration() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [importing, setImporting] = useState(false);
  const [importPhase, setImportPhase] = useState(''); // 'breakdown' | 'prompts' | ''
  const [importProgress, setImportProgress] = useState('');
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

  // ══════════════════════════════════════════════════════════════════
  // TWO-PHASE IMPORT: Scene Breakdown → Prompt Generation
  // Both are single-call functions — no batch looping needed
  // ══════════════════════════════════════════════════════════════════
  const handleImport = async () => {
    setImporting(true);

    try {
      // ── PHASE 1: Cinematic Scene Breakdown (single call) ───────
      setImportPhase('breakdown');
      setImportProgress('Analyzing script & breaking down into cinematic scenes...');
      console.log('🎬 Starting scene breakdown...');

      const breakdownResult = await base44.functions.invoke('generateSceneBreakdown', {
        project_id: projectId,
      });

      await refetchScenes();
      console.log(`✓ Scene breakdown complete! ${breakdownResult.scenes_created} scenes created.`);

      // ── PHASE 2: Generate Image & Animation Prompts (single call) ──
      setImportPhase('prompts');
      setImportProgress('Converting director notes into visual prompts...');
      console.log('🎨 Starting prompt generation...');

      const promptResult = await base44.functions.invoke('generateScenePrompts', {
        project_id: projectId,
      });

      await refetchScenes();
      console.log(`✓ All prompts generated! ${promptResult.prompts_applied} prompts applied.`);

    } catch (err) {
      console.error('Scene generation error:', err);
    } finally {
      await refetchScenes();
      await refetchProject();
      setImporting(false);
      setImportPhase('');
      setImportProgress('');
    }
  };

  // Generate all images
  const handleGenerateImages = async () => {
    setGeneratingImages(true);
    const pending = scenes.filter(s =>
      (s.status === 'prompts_ready' || !s.image_url) &&
      // Safety: skip scenes that still have raw director notes
      !s.image_prompt?.startsWith('DIRECTOR_NOTES:')
    );

    if (pending.length === 0 && scenes.some(s => s.image_prompt?.startsWith('DIRECTOR_NOTES:'))) {
      // Director notes haven't been converted — run prompt generator first
      console.log('⚠️ Scenes still have director notes. Running prompt generator...');
      try {
        await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
        await refetchScenes();
      } catch (err) {
        console.error('Auto prompt generation failed:', err);
      }
    }

    // Re-fetch after potential prompt generation
    const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
    const readyScenes = freshScenes
      .filter(s => s.status === 'prompts_ready' || (!s.image_url && !s.image_prompt?.startsWith('DIRECTOR_NOTES:')))
      .sort((a, b) => a.scene_number - b.scene_number);

    for (const scene of readyScenes) {
      try {
        await base44.functions.invoke('generateSceneImage', { scene_id: scene.id });
      } catch (err) {
        console.warn(`Scene ${scene.scene_number} image failed, skipping:`, err.message);
      }
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
  const breakdownReadyCount = scenes.filter(s => s.status === 'breakdown_ready').length;
  const promptsReadyCount = scenes.filter(s => s.status === 'prompts_ready').length;
  const directorNotesCount = scenes.filter(s => s.image_prompt?.startsWith('DIRECTOR_NOTES:')).length;

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

        {/* Visual Style Selector */}
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

        {/* Import Progress Banner */}
        {importing && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {importPhase === 'breakdown' ? (
                    <Badge className="bg-blue-100 text-blue-800 text-xs">
                      <Clapperboard className="w-3 h-3 mr-1" />
                      Phase 1: Director's Breakdown
                    </Badge>
                  ) : (
                    <Badge className="bg-purple-100 text-purple-800 text-xs">
                      <Wand2 className="w-3 h-3 mr-1" />
                      Phase 2: Visual Prompts
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-700">{importProgress}</p>
                {scenes.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {scenes.length} scenes created
                    {breakdownReadyCount > 0 && ` · ${breakdownReadyCount} awaiting prompts`}
                    {promptsReadyCount > 0 && ` · ${promptsReadyCount} ready for images`}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Director Notes Warning */}
        {!importing && directorNotesCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <Wand2 className="w-5 h-5 text-amber-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">
                  {directorNotesCount} scene{directorNotesCount > 1 ? 's have' : ' has'} director notes that need converting to image prompts
                </p>
                <p className="text-xs text-amber-600 mt-1">
                  Click below to generate visual prompts before creating images.
                </p>
              </div>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700"
                onClick={async () => {
                  setImporting(true);
                  setImportPhase('prompts');
                  setImportProgress('Converting director notes into visual prompts...');
                  try {
                    await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
                    await refetchScenes();
                  } catch (err) {
                    console.error('Prompt generation failed:', err);
                  }
                  setImporting(false);
                  setImportPhase('');
                  setImportProgress('');
                }}
              >
                <Wand2 className="w-4 h-4 mr-1" /> Generate Prompts
              </Button>
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="bg-white p-4 rounded-lg shadow-sm border mb-6 flex flex-wrap items-center gap-3">
          {scenes.length === 0 && !importing ? (
            <>
              <Button
                onClick={handleImport}
                disabled={importing || !project?.visual_style || !project?.orientation}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Import className="w-4 h-4 mr-2" />
                Import Script & Generate Scenes
              </Button>
              {(!project?.visual_style || !project?.orientation) && (
                <p className="text-sm text-amber-600 flex items-center gap-1">
                  <Palette className="w-4 h-4" /> Please select orientation and visual style above first
                </p>
              )}
            </>
          ) : scenes.length > 0 ? (
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
          ) : null}
        </div>

        {/* Scene Grid */}
        {scenes.length > 0 && (
          <div className="mb-8">
            <SceneGrid scenes={scenes} onRefetch={refetchScenes} />
          </div>
        )}

        {/* Audio Section */}
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
      </div>
    </div>
  );
}