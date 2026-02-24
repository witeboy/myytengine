import React, { useState, useEffect, useRef } from 'react';
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
import {
  Loader2, Download, ArrowRight, Import, Layers, ImageIcon, Film,
  Palette, Sparkles, Monitor, Clapperboard, Wand2, CheckCircle2,
  XCircle, Clock, Zap, Video, FolderDown, Hammer
} from 'lucide-react';

export default function ContentGeneration() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  
  // ── States ──────────────────────────────────────────────────────
  const [importing, setImporting] = useState(false);
  const [importPhase, setImportPhase] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [fixingImages, setFixingImages] = useState(false); 
  const [enhancingAll, setEnhancingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  
  const [audioLevels, setAudioLevels] = useState({ narration: 1, music: 0.3, sfx: 0.5 });
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, label: '' });
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0, sceneName: '' });
  const [videoProgress, setVideoProgress] = useState({
    current: 0, total: 0, sceneName: '',
    phase: '', 
    sceneStatuses: {} 
  });
  const pollAbortRef = useRef(false);

  // ── Data Fetching ───────────────────────────────────────────
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

  useEffect(() => {
    return () => { pollAbortRef.current = true; };
  }, []);

  // ── REPAIR LOGIC: Fix Base64 Images ─────────────────────────
  const handleFixImages = async () => {
    setFixingImages(true);
    try {
      const result = await base44.functions.invoke('fix_base64_images', { project_id: projectId });
      
      if (result && result.success) {
        await refetchScenes();
        console.log(`Successfully fixed ${result.summary?.fixed || 0} images.`);
      } else {
        console.error("Repair Function Error:", result?.error || "Unknown error");
        alert("The repair script ran but encountered an issue: " + (result?.error || "Unknown"));
      }
    } catch (err) {
      console.error('Repair failed:', err);
      alert("Repair failed with a server error. Please check your function logs in the dashboard.");
    } finally {
      setFixingImages(false);
    }
  };

  // ── Import & Script Processing ──────────────────────────────
  const handleImport = async () => {
    setImporting(true);
    try {
      setImportPhase('breakdown');
      setImportProgress('Analyzing script & breaking down into cinematic scenes...');
      await base44.functions.invoke('generateSceneBreakdown', { project_id: projectId });
      await refetchScenes();

      setImportPhase('prompts');
      setImportProgress('Converting director notes into visual prompts...');
      await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
      await refetchScenes();
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

  // ── Image Generation (Grok Imagine) ─────────────────────────
  const handleGenerateImages = async () => {
    setGeneratingImages(true);
    const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
    const readyScenes = freshScenes
      .filter(s => s.status === 'prompts_ready' || (!s.image_url && !s.image_prompt?.startsWith('DIRECTOR_NOTES:')))
      .sort((a, b) => a.scene_number - b.scene_number);

    setImageProgress({ current: 0, total: readyScenes.length, sceneName: '' });

    for (let i = 0; i < readyScenes.length; i++) {
      const scene = readyScenes[i];
      setImageProgress({ current: i + 1, total: readyScenes.length, sceneName: `Scene ${scene.scene_number}` });
      try {
        await base44.functions.invoke('generateSceneImage', { scene_id: scene.id });
      } catch (err) {
        console.warn(`Scene ${scene.scene_number} image failed:`, err.message);
      }
      await refetchScenes();
    }

    setGeneratingImages(false);
    setImageProgress({ current: 0, total: 0, sceneName: '' });
  };

  // ── Video Generation (Veo 3.1) ──────────────────────────────
  const handleGenerateVideos = async () => {
    const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
    
    const broken = freshScenes.filter(s => s.image_url?.startsWith('data:') && !s.video_url);
    if (broken.length > 0) {
      const fix = window.confirm(
        `${broken.length} scenes have Base64 images that Veo can't animate. Repair them now?`
      );
      if (fix) {
        await handleFixImages();
        return;
      }
    }

    const ready = freshScenes.filter(s => 
      s.image_url && 
      !s.image_url.startsWith('data:') && 
      !s.video_url
    );

    if (ready.length === 0) {
      return;
    }

    setGeneratingVideos(true);
    pollAbortRef.current = false;
    const initialStatuses = {};
    ready.forEach(s => { initialStatuses[s.id] = 'queued'; });

    setVideoProgress({
      current: 0, total: ready.length,
      sceneName: '', phase: 'submitting',
      sceneStatuses: { ...initialStatuses }
    });

    const pendingPolls = [];
    for (let i = 0; i < ready.length; i += 5) {
      if (pollAbortRef.current) break;
      const batch = ready.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map(scene => base44.functions.invoke('generateSceneVideo', { scene_id: scene.id }))
      );
      results.forEach((res, idx) => {
        if (res.status === 'fulfilled' && res.value?.task_id) {
          pendingPolls.push({ scene_id: batch[idx].id, task_id: res.value.task_id });
        }
      });
    }

    if (pendingPolls.length > 0) {
      setVideoProgress(p => ({ ...p, phase: 'polling', sceneName: 'Rendering with Veo 3.1...' }));
      let remaining = [...pendingPolls];
      while (remaining.length > 0 && !pollAbortRef.current) {
        await new Promise(r => setTimeout(r, 10000));
        const pollResults = await Promise.allSettled(
          remaining.map(item => base44.functions.invoke('pollSceneVideo', { scene_id: item.scene_id }))
        );
        const stillPending = [];
        pollResults.forEach((res, idx) => {
          if (res.status === 'fulfilled' && res.value?.status === 'COMPLETED') {
            // Done
          } else {
            stillPending.push(remaining[idx]);
          }
        });
        remaining = stillPending;
        await refetchScenes();
      }
    }
    setGeneratingVideos(false);
  };

  const handleEnhanceAll = async () => {
    setEnhancingAll(true);
    for (const scene of scenes) {
      await base44.functions.invoke('enhanceScenePrompts', { scene_id: scene.id, enhance_type: 'both' });
      await refetchScenes();
    }
    setEnhancingAll(false);
  };

  const handleContinueToTimeline = () => navigate(createPageUrl(`TimelineEditor?project_id=${projectId}`));

  // ── Computed Stats ──────────────────────────────────────────
  const imageCount = scenes.filter(s => s.image_url).length;
  const base64Count = scenes.filter(s => s.image_url?.startsWith('data:')).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      <StageProgress currentStage={2} />
      
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Content Generation</h1>
          <div className="flex gap-2">
            {imageCount > 0 && base64Count === 0 && (
              <Button onClick={handleContinueToTimeline} className="bg-blue-600 hover:bg-blue-700 shadow-md">
                Next: Timeline <ArrowRight className="ml-2 w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* 🚨 REPAIR BANNER */}
        {base64Count > 0 && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 mb-8 flex flex-col md:flex-row items-center gap-6 shadow-sm">
            <div className="bg-rose-100 p-4 rounded-full text-rose-600">
              <Hammer className="w-8 h-8" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h3 className="text-lg font-bold text-rose-900">{base64Count} Scenes Need Repair</h3>
              <p className="text-sm text-rose-700 leading-relaxed">
                Veo 3.1 cannot animate Base64 data. Click Repair to host these images 
                on a public URL automatically.
              </p>
            </div>
            <Button 
              onClick={handleFixImages} 
              disabled={fixingImages}
              className="bg-rose-600 hover:bg-rose-700 text-white min-w-[200px] h-12 font-bold"
            >
              {fixingImages ? <Loader2 className="animate-spin mr-2" /> : <Hammer className="mr-2 w-5 h-5" />}
              {fixingImages ? "Repairing..." : "Repair All Scenes"}
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {project && <OrientationSelector selectedOrientation={project.orientation} onSelect={async (o) => { await base44.entities.Projects.update(projectId, { orientation: o }); refetchProject(); }} />}
          {project && <VisualStyleSelector selectedStyle={project.visual_style} onSelect={async (s) => { await base44.entities.Projects.update(projectId, { visual_style: s }); refetchProject(); }} />}
        </div>

        <Card className="mb-8 border-none shadow-sm overflow-hidden">
          <CardContent className="p-4 flex flex-wrap items-center gap-4 bg-white">
            <div className="flex gap-4 items-center mr-4">
              <Badge variant="secondary" className="bg-slate-100 text-slate-700 px-3 py-1.5">{scenes.length} Scenes</Badge>
              <Badge className={`px-3 py-1.5 ${base64Count > 0 ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-green-100 text-green-700 border-green-200'}`}>
                <ImageIcon className="w-3 h-3 mr-1.5 inline" /> {imageCount} Images {base64Count > 0 && `(Repair Needed)`}
              </Badge>
            </div>
            <div className="flex-1" />
            <Button variant="outline" onClick={handleEnhanceAll} disabled={enhancingAll} className="border-purple-200 text-purple-700">
              <Sparkles className="w-4 h-4 mr-2" /> AI Enhance
            </Button>
            <Button variant="outline" onClick={handleGenerateImages} disabled={generatingImages}>
              Generate Images
            </Button>
            <Button 
              onClick={handleGenerateVideos} 
              disabled={generatingVideos || base64Count > 0 || imageCount === 0} 
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold"
            >
              {generatingVideos ? <Loader2 className="animate-spin" /> : <Video className="w-4 h-4 inline mr-2" />}
              Animate All
            </Button>
          </CardContent>
        </Card>

        {scenes.length > 0 && (
          <div className="mb-12">
            <SceneGrid scenes={scenes} onRefetch={refetchScenes} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <VoiceoverPanel project={project} onUpdate={refetchProject} />
          <MusicPanel project={project} />
          <AudioMixerPanel 
            narrationVolume={audioLevels.narration} 
            musicVolume={audioLevels.music} 
            sfxVolume={audioLevels.sfx} 
            onChange={(u) => setAudioLevels(p => ({...p, ...u}))} 
          />
        </div>
      </div>
    </div>
  );
}