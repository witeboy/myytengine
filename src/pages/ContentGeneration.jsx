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
  XCircle, Clock, Zap, Video, FolderDown
} from 'lucide-react';

export default function ContentGeneration() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [importing, setImporting] = useState(false);
  const [importPhase, setImportPhase] = useState('');
  const [importProgress, setImportProgress] = useState('');
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [audioLevels, setAudioLevels] = useState({ narration: 1, music: 0.3, sfx: 0.5 });
  const [enhancingAll, setEnhancingAll] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0, label: '' });

  // ── Per-scene generation tracking ─────────────────────────────
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 0, sceneName: '' });
  const [videoProgress, setVideoProgress] = useState({
    current: 0, total: 0, sceneName: '',
    phase: '', // 'submitting' | 'polling' | 'done'
    sceneStatuses: {} // { [scene_id]: 'queued' | 'submitting' | 'polling' | 'done' | 'failed' }
  });
  const pollAbortRef = useRef(false);

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

  // Cleanup on unmount
  useEffect(() => {
    return () => { pollAbortRef.current = true; };
  }, []);

  // ══════════════════════════════════════════════════════════════════
  // TWO-PHASE IMPORT: Scene Breakdown → Prompt Generation
  // ══════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════
  // GENERATE ALL IMAGES (Grok Imagine via Kie)
  // ══════════════════════════════════════════════════════════════════
  const handleGenerateImages = async () => {
    setGeneratingImages(true);

    const pending = scenes.filter(s =>
      (s.status === 'prompts_ready' || !s.image_url) &&
      !s.image_prompt?.startsWith('DIRECTOR_NOTES:')
    );

    if (pending.length === 0 && scenes.some(s => s.image_prompt?.startsWith('DIRECTOR_NOTES:'))) {
      setImageProgress({ current: 0, total: 0, sceneName: 'Converting director notes first...' });
      try {
        await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
        await refetchScenes();
      } catch (err) {
        console.error('Auto prompt generation failed:', err);
      }
    }

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

  // ══════════════════════════════════════════════════════════════════
  // GENERATE & POLL ALL VIDEOS (Veo 3.1 Quality via Kie)
  // ══════════════════════════════════════════════════════════════════
  //
  // SPEED OPTIMIZATIONS:
  //   1. Parallel batch submission (5 at a time via Promise.allSettled)
  //   2. Parallel polling (ALL pending at once, not sequential)
  //   3. 10s poll interval (was 15s — Veo tasks resolve in ~60-90s)
  //   4. 1080p upgrade removed from pollSceneVideo (Veo3 = native 1080p)
  //
  // Before: 24 scenes × 1.5s submit = 36s + 20 pending × 1s poll = 20s/round
  // After:  24 scenes / 5 batch × 2s = 10s + all parallel = 2s/round
  // ══════════════════════════════════════════════════════════════════

  const handleGenerateVideos = async () => {
    setGeneratingVideos(true);
    pollAbortRef.current = false;

    // Re-fetch fresh scene data before filtering
    const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
    const sortedScenes = freshScenes.sort((a, b) => a.scene_number - b.scene_number);

    // Any scene with a real image_url that doesn't already have a video_url
    const ready = sortedScenes.filter(s =>
      s.image_url &&
      s.image_url.length > 10 &&
      !s.image_url.startsWith('data:') &&
      !s.video_url
    );

    console.log(`🎬 Animate All: ${ready.length}/${sortedScenes.length} scenes ready (have image, no video)`);

    if (ready.length === 0) {
      console.log(`⚠️ No scenes to animate. Statuses: ${sortedScenes.map(s => `S${s.scene_number}:${s.status}|img:${!!s.image_url}|vid:${!!s.video_url}`).join(', ')}`);
      setGeneratingVideos(false);
      alert(`No scenes to animate. ${sortedScenes.filter(s => s.video_url).length} already have videos, ${sortedScenes.filter(s => !s.image_url).length} are missing images.`);
      return;
    }

    const initialStatuses = {};
    ready.forEach(s => { initialStatuses[s.id] = 'queued'; });

    setVideoProgress({
      current: 0, total: ready.length,
      sceneName: '', phase: 'submitting',
      sceneStatuses: { ...initialStatuses }
    });

    // ── Phase 1: Submit all scenes to Veo (parallel batches of 5) ──
    const pendingPolls = [];
    const SUBMIT_BATCH = 5;

    for (let i = 0; i < ready.length; i += SUBMIT_BATCH) {
      if (pollAbortRef.current) break;
      const batch = ready.slice(i, i + SUBMIT_BATCH);

      setVideoProgress(prev => ({
        ...prev,
        current: Math.min(i + batch.length, ready.length),
        sceneName: `Submitting scenes ${i + 1}-${Math.min(i + batch.length, ready.length)}...`,
        phase: 'submitting',
        sceneStatuses: batch.reduce(
          (acc, s) => ({ ...acc, [s.id]: 'submitting' }),
          { ...prev.sceneStatuses }
        )
      }));

      const batchResults = await Promise.allSettled(
        batch.map(scene =>
          base44.functions.invoke('generateSceneVideo', { scene_id: scene.id })
            .then(result => ({ scene, result, ok: true }))
            .catch(err => ({ scene, err, ok: false }))
        )
      );

      for (const settled of batchResults) {
        const item = settled.status === 'fulfilled' ? settled.value : settled.reason;
        if (!item) continue;

        if (item.ok && item.result?.task_id) {
          pendingPolls.push({
            scene_id: item.scene.id,
            task_id: item.result.task_id,
            scene_number: item.scene.scene_number
          });
          setVideoProgress(prev => ({
            ...prev,
            sceneStatuses: { ...prev.sceneStatuses, [item.scene.id]: 'polling' }
          }));
        } else {
          console.warn(`Scene ${item.scene?.scene_number} submit failed:`, item.err?.message);
          setVideoProgress(prev => ({
            ...prev,
            sceneStatuses: { ...prev.sceneStatuses, [item.scene?.id]: 'failed' }
          }));
        }
      }
    }

    // ── Phase 2: Poll all pending scenes in parallel rounds ──────
    if (pendingPolls.length > 0) {
      setVideoProgress(prev => ({
        ...prev,
        phase: 'polling',
        sceneName: `${pendingPolls.length} scenes rendering with Veo 3.1...`
      }));

      let remaining = [...pendingPolls];
      let pollCount = 0;
      const MAX_POLLS = 90;      // 90 × 10s = 15 min max
      const POLL_INTERVAL = 10000; // 10 seconds

      while (remaining.length > 0 && pollCount < MAX_POLLS && !pollAbortRef.current) {
        await new Promise(r => setTimeout(r, POLL_INTERVAL));
        pollCount++;

        // Poll ALL pending scenes in parallel
        const pollResults = await Promise.allSettled(
          remaining.map(item =>
            base44.functions.invoke('pollSceneVideo', { scene_id: item.scene_id })
              .then(result => ({ item, result, ok: true }))
              .catch(err => ({ item, err, ok: false }))
          )
        );

        const stillPending = [];

        for (const settled of pollResults) {
          const entry = settled.status === 'fulfilled' ? settled.value : null;

          if (!entry || !entry.ok || !entry.result) {
            // Network error or invocation failure — keep polling
            const failedItem = settled.status === 'fulfilled'
              ? entry?.item
              : (settled.reason?.item || remaining.find(r => true));
            if (failedItem) stillPending.push(failedItem);
            continue;
          }

          const { item, result } = entry;

          if (result.status === 'COMPLETED') {
            setVideoProgress(prev => ({
              ...prev,
              sceneStatuses: { ...prev.sceneStatuses, [item.scene_id]: 'done' }
            }));
          } else if (result.status === 'FAILED') {
            setVideoProgress(prev => ({
              ...prev,
              sceneStatuses: { ...prev.sceneStatuses, [item.scene_id]: 'failed' }
            }));
          } else {
            // PROCESSING or UNKNOWN — keep polling
            stillPending.push(item);
          }
        }

        remaining = stillPending;
        await refetchScenes();

        // Update summary text
        setVideoProgress(prev => {
          const s = prev.sceneStatuses;
          const done = Object.values(s).filter(v => v === 'done').length;
          const failed = Object.values(s).filter(v => v === 'failed').length;
          return {
            ...prev,
            current: done + failed,
            sceneName: remaining.length > 0
              ? `${done} done · ${remaining.length} still rendering...`
              : `All complete! ${done} videos generated.`
          };
        });
      }

      // Timeout warning
      if (remaining.length > 0 && pollCount >= MAX_POLLS) {
        console.warn(`Polling timed out with ${remaining.length} scenes still pending`);
      }
    }

    await refetchScenes();
    setGeneratingVideos(false);
    setVideoProgress({ current: 0, total: 0, sceneName: '', phase: '', sceneStatuses: {} });
  };

  // ══════════════════════════════════════════════════════════════════
  // ENHANCE ALL
  // ══════════════════════════════════════════════════════════════════
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

  // ══════════════════════════════════════════════════════════════════
  // EXPORT — Download all assets as numbered zip
  // ══════════════════════════════════════════════════════════════════

  const loadJSZip = async () => {
    if (window.JSZip) return window.JSZip;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
      script.onload = () => resolve(window.JSZip);
      script.onerror = () => reject(new Error('Failed to load JSZip'));
      document.head.appendChild(script);
    });
  };

  const getArcLabel = (scene) => {
    try {
      if (scene.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
        const notes = JSON.parse(scene.image_prompt.substring('DIRECTOR_NOTES:'.length));
        const arc = notes.arc_position || notes.phase || '';
        if (arc.includes('cold_open') || arc.includes('setup')) return 'setup';
        if (arc.includes('rising')) return 'rising';
        if (arc.includes('emotional_core') || arc.includes('climax')) return 'climax';
        if (arc.includes('resolution')) return 'resolution';
      }
    } catch (_) {}
    const pos = scene.scene_number / scenes.length;
    if (pos <= 0.15) return 'setup';
    if (pos <= 0.50) return 'rising';
    if (pos <= 0.75) return 'climax';
    return 'resolution';
  };

  const fetchAsBlob = async (url) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.blob();
    } catch (_) {
      return null;
    }
  };

  const getExtension = (url, fallback) => {
    try {
      const path = new URL(url).pathname;
      const ext = path.split('.').pop()?.toLowerCase();
      if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return ext;
      if (['mp4', 'webm', 'mov'].includes(ext)) return ext;
    } catch (_) {}
    return fallback;
  };

  const handleExport = async () => {
    setExporting(true);
    const projectName = (project?.name || 'project').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 40);

    try {
      const JSZip = await loadJSZip();
      const zip = new JSZip();
      const folder = zip.folder(`${projectName}_assets`);

      const totalAssets = scenes.reduce((sum, s) => {
        let count = 0;
        if (s.image_url && !s.image_url.startsWith('data:')) count++;
        if (s.video_url && !s.video_url.startsWith('veo_task:') && s.video_url.startsWith('http')) count++;
        return sum + count;
      }, 0);

      setExportProgress({ current: 0, total: totalAssets, label: 'Preparing...' });
      let downloaded = 0;

      for (const scene of scenes) {
        const num = String(scene.scene_number).padStart(2, '0');
        const arc = getArcLabel(scene);
        const prefix = `S${num}_${arc}`;

        if (scene.image_url && !scene.image_url.startsWith('data:')) {
          setExportProgress({ current: downloaded, total: totalAssets, label: `${prefix}_image` });
          const ext = getExtension(scene.image_url, 'png');
          const blob = await fetchAsBlob(scene.image_url);
          if (blob) folder.file(`${prefix}_image.${ext}`, blob);
          downloaded++;
        }

        if (scene.video_url && !scene.video_url.startsWith('veo_task:') && scene.video_url.startsWith('http')) {
          setExportProgress({ current: downloaded, total: totalAssets, label: `${prefix}_video` });
          const ext = getExtension(scene.video_url, 'mp4');
          const blob = await fetchAsBlob(scene.video_url);
          if (blob) folder.file(`${prefix}_video.${ext}`, blob);
          downloaded++;
        }
      }

      const manifest = scenes.map(s => ({
        scene_number: s.scene_number,
        arc_position: getArcLabel(s),
        narration: s.narration_text,
        duration: s.duration_seconds,
        image_file: s.image_url ? `S${String(s.scene_number).padStart(2, '0')}_${getArcLabel(s)}_image.${getExtension(s.image_url, 'png')}` : null,
        video_file: (s.video_url && !s.video_url.startsWith('veo_task:') && s.video_url.startsWith('http'))
          ? `S${String(s.scene_number).padStart(2, '0')}_${getArcLabel(s)}_video.${getExtension(s.video_url, 'mp4')}`
          : null,
      }));
      folder.file('manifest.json', JSON.stringify(manifest, null, 2));

      setExportProgress({ current: totalAssets, total: totalAssets, label: 'Compressing zip...' });
      const zipBlob = await zip.generateAsync({ type: 'blob' }, (meta) => {
        setExportProgress(prev => ({ ...prev, label: `Compressing... ${Math.round(meta.percent)}%` }));
      });

      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}_assets.zip`;
      a.click();
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('Export failed:', err);
      const exportData = scenes.map(s => ({
        scene_number: s.scene_number,
        arc_position: getArcLabel(s),
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
    } finally {
      setExporting(false);
      setExportProgress({ current: 0, total: 0, label: '' });
    }
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

  // ── Computed counts ───────────────────────────────────────────
  const imageCount = scenes.filter(s => s.image_url).length;
  const videoCount = scenes.filter(s => s.video_url && !s.video_url.startsWith('veo_task:')).length;
  const animatingCount = scenes.filter(s => s.video_url?.startsWith('veo_task:') || s.status === 'animating').length;
  const breakdownReadyCount = scenes.filter(s => s.status === 'breakdown_ready').length;
  const promptsReadyCount = scenes.filter(s => s.status === 'prompts_ready').length;
  const directorNotesCount = scenes.filter(s => s.image_prompt?.startsWith('DIRECTOR_NOTES:')).length;

  const videoStatusCounts = videoProgress.sceneStatuses
    ? {
        queued: Object.values(videoProgress.sceneStatuses).filter(s => s === 'queued').length,
        submitting: Object.values(videoProgress.sceneStatuses).filter(s => s === 'submitting').length,
        polling: Object.values(videoProgress.sceneStatuses).filter(s => s === 'polling').length,
        done: Object.values(videoProgress.sceneStatuses).filter(s => s === 'done').length,
        failed: Object.values(videoProgress.sceneStatuses).filter(s => s === 'failed').length,
      }
    : { queued: 0, submitting: 0, polling: 0, done: 0, failed: 0 };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <StageProgress currentStage={2} />
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-3xl font-bold">Content Generation</h1>
          <div className="flex gap-2">
            {scenes.length > 0 && (
              <Button variant="outline" onClick={handleExport} disabled={exporting}>
                {exporting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    {exportProgress.total > 0
                      ? `${exportProgress.current}/${exportProgress.total}`
                      : 'Preparing...'}
                  </>
                ) : (
                  <>
                    <FolderDown className="w-4 h-4 mr-1" /> Export Zip
                  </>
                )}
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

        {/* ═══════════════════════════════════════════════════════════
            IMPORT PROGRESS BANNER
            ═══════════════════════════════════════════════════════════ */}
        {importing && (
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
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

        {/* ═══════════════════════════════════════════════════════════
            IMAGE GENERATION PROGRESS
            ═══════════════════════════════════════════════════════════ */}
        {generatingImages && imageProgress.total > 0 && (
          <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-600" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-emerald-100 text-emerald-800 text-xs">
                    <ImageIcon className="w-3 h-3 mr-1" />
                    Generating Images
                  </Badge>
                  <span className="text-xs font-medium text-emerald-700">
                    {imageProgress.current} / {imageProgress.total}
                  </span>
                </div>
                <div className="w-full bg-emerald-100 rounded-full h-2 mt-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(imageProgress.current / imageProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  {imageProgress.sceneName} · Grok Imagine via Kie
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            VIDEO GENERATION PROGRESS
            ═══════════════════════════════════════════════════════════ */}
        {generatingVideos && videoProgress.total > 0 && (
          <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-violet-600" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Badge className="bg-violet-100 text-violet-800 text-xs">
                    <Video className="w-3 h-3 mr-1" />
                    {videoProgress.phase === 'submitting'
                      ? 'Submitting to Veo 3.1 Quality'
                      : 'Rendering with Veo 3.1 · 1080p'}
                  </Badge>
                </div>

                {/* Progress bar */}
                <div className="w-full bg-violet-100 rounded-full h-2 mb-3">
                  <div
                    className="bg-violet-500 h-2 rounded-full transition-all duration-700"
                    style={{
                      width: `${((videoStatusCounts.done + videoStatusCounts.failed) / videoProgress.total) * 100}%`
                    }}
                  />
                </div>

                {/* Per-scene status chips */}
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(videoProgress.sceneStatuses).map(([sceneId, status]) => {
                    const scene = scenes.find(s => s.id === sceneId);
                    const num = scene?.scene_number || '?';
                    const colors = {
                      done:       'bg-green-100 text-green-700',
                      failed:     'bg-red-100 text-red-700',
                      polling:    'bg-amber-100 text-amber-700',
                      submitting: 'bg-blue-100 text-blue-700',
                      queued:     'bg-gray-100 text-gray-500',
                    };
                    const icons = {
                      done:       <CheckCircle2 className="w-3 h-3" />,
                      failed:     <XCircle className="w-3 h-3" />,
                      polling:    <Clock className="w-3 h-3 animate-pulse" />,
                      submitting: <Zap className="w-3 h-3" />,
                      queued:     <Clock className="w-3 h-3 opacity-40" />,
                    };
                    return (
                      <span
                        key={sceneId}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-500'}`}
                      >
                        {icons[status]}
                        S{num}
                      </span>
                    );
                  })}
                </div>

                <p className="text-xs text-gray-500 mt-2">
                  {videoStatusCounts.done > 0 && `${videoStatusCounts.done} complete`}
                  {videoStatusCounts.polling > 0 && ` · ${videoStatusCounts.polling} rendering`}
                  {videoStatusCounts.queued > 0 && ` · ${videoStatusCounts.queued} queued`}
                  {videoStatusCounts.failed > 0 && ` · ${videoStatusCounts.failed} failed`}
                  {videoProgress.phase === 'polling' && ' · Polling every 10s'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════
            EXPORT PROGRESS BANNER
            ═══════════════════════════════════════════════════════════ */}
        {exporting && exportProgress.total > 0 && (
          <div className="bg-gradient-to-r from-sky-50 to-cyan-50 border border-sky-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-sky-600" />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge className="bg-sky-100 text-sky-800 text-xs">
                    <FolderDown className="w-3 h-3 mr-1" />
                    Exporting Assets
                  </Badge>
                  <span className="text-xs font-medium text-sky-700">
                    {exportProgress.current} / {exportProgress.total}
                  </span>
                </div>
                <div className="w-full bg-sky-100 rounded-full h-2 mt-2">
                  <div
                    className="bg-sky-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(exportProgress.current / exportProgress.total) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  {exportProgress.label}
                </p>
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
                {animatingCount > 0 && (
                  <span className="text-xs text-amber-600 font-medium">
                    ({animatingCount} rendering)
                  </span>
                )}
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