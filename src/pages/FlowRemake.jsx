import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import VisualStyleSelector from '@/components/content/VisualStyleSelector';
import OrientationSelector from '@/components/content/OrientationSelector';
import {
 Loader2, ArrowRight, ArrowLeft, Film, ImageIcon, Music, Download,
  CheckCircle, XCircle, Pencil, Sparkles, Building2, Wrench,
  Car, TreePine, Home, Warehouse, MapPin, Plus, AlertCircle, Wand2, HomeIcon
} from 'lucide-react';
import { concatTimelapseVideos } from '@/lib/concatTimelapse';

const CATEGORIES = [
  { key: 'construction', label: 'Construction', icon: Building2, desc: 'Empty land → complete building', color: 'amber' },
  { key: 'renovation', label: 'Renovation', icon: Home, desc: 'Neglected → beautifully remodeled', color: 'blue' },
  { key: 'restoration', label: 'Restoration', icon: Wrench, desc: 'Damaged → showroom condition', color: 'red' },
  { key: 'space_remodel', label: 'Space Remodel', icon: Warehouse, desc: 'Empty warehouse → thriving office', color: 'purple' },
  { key: 'vehicle', label: 'Vehicle', icon: Car, desc: 'Rusted wreck → road-ready beauty', color: 'emerald' },
  { key: 'street_urban', label: 'Street / Urban', icon: MapPin, desc: 'Deteriorated → vibrant neighborhood', color: 'indigo' },
  { key: 'nature', label: 'Nature / Garden', icon: TreePine, desc: 'Bare earth → lush abundance', color: 'green' },
  { key: 'custom', label: 'Custom', icon: Plus, desc: 'Define your own 7 stages', color: 'gray' },
];

export default function FlowRemake() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');

  const [step, setStep] = useState(projectId ? 2 : 1);
  const [category, setCategory] = useState('construction');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visualStyle, setVisualStyle] = useState('photorealistic_4k');
  const [orientation, setOrientation] = useState('portrait');
  const [currentProjectId, setCurrentProjectId] = useState(projectId);
  const [generating, setGenerating] = useState(false);
  const [generatingImages, setGeneratingImages] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [imageProgress, setImageProgress] = useState({ current: 0, total: 7 });
  const [videoProgress, setVideoProgress] = useState({ current: 0, total: 6 });
  const [sceneErrors, setSceneErrors] = useState({}); // {sceneNumber: errorMessage}
  const [error, setError] = useState(null);
  const [compiling, setCompiling] = useState(false);
  const [compileProgress, setCompileProgress] = useState(null);
  const [finalVideoUrl, setFinalVideoUrl] = useState(null);

  const { data: scenes = [], refetch: refetchScenes } = useQuery({
    queryKey: ['flow-scenes', currentProjectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: currentProjectId });
      return all.sort((a, b) => a.scene_number - b.scene_number);
    },
    enabled: !!currentProjectId,
  });

  // ═══ STEP 1: Create project + generate prompts ═══
  const handleGenerate = async () => {
    setGenerating(true);
    setError(null);

    try {
      // If retrying, use existing project. If fresh, create new.
      let pid = currentProjectId;
      
      // If project exists but we want fresh prompts, just reuse pid
      if (pid) {
        console.log(`Reusing existing project: ${pid}`);
      }

      if (!pid) {
        const project = await base44.entities.Projects.create({
          name: `_flow_${title}`,
          niche: category,
          visual_style: visualStyle,
          orientation,
          status: 'created',
          current_step: 1,
        });
        pid = project.id;
        setCurrentProjectId(pid);
      }

      const res = await base44.functions.invoke('generateProgressionPrompts', {
        project_id: pid,
        title,
        category,
        subject_description: description,
        visual_style: visualStyle,
        orientation,
      });

      const data = res.data || res;
      if (data?.success) {
        await refetchScenes();
        setStep(2);
      } else {
        throw new Error(data?.error || 'Generation failed');
      }
    } catch (err) {
      setError(err.message);
    }

    setGenerating(false);
  };

  // ═══ STEP 2: Generate images SEQUENTIALLY with reference chaining ═══
  const handleGenerateImages = async () => {
    if (scenes.length === 0) {
      setError('No scenes loaded yet. Go back and generate prompts first.');
      return;
    }

    setGeneratingImages(true);
    setSceneErrors({});
    setImageProgress({ current: 0, total: scenes.length });

    let previousImageUrl = null;
    const errors = {};

    for (let i = 0; i < scenes.length; i++) {
      const refLabel = previousImageUrl ? ' (chaining)' : ' (first)';
      setImageProgress({
        current: i + 1,
        total: scenes.length,
        label: `Scene ${i + 1}/${scenes.length}: ${scenes[i].narration_text}${refLabel}`,
      });

      try {
        const res = await base44.functions.invoke('generateProgressionImage', {
          scene_id: scenes[i].id,
          reference_image_url: previousImageUrl,
        });
        const data = res.data || res;
        if (data?.image_url?.startsWith('http')) {
          previousImageUrl = data.image_url;
          console.log(`✓ Scene ${i + 1}${data.used_reference ? ' (ref)' : ''}: ${data.image_url.substring(0, 60)}`);
        } else {
          errors[scenes[i].scene_number] = data?.error || 'No image URL returned';
          console.warn(`✗ Scene ${i + 1}: no image returned`);
        }
      } catch (err) {
        errors[scenes[i].scene_number] = err.message;
        console.warn(`✗ Scene ${i + 1} failed:`, err.message);
      }

      await refetchScenes();
      if (i < scenes.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

    setSceneErrors(errors);
    setImageProgress({
      current: scenes.length,
      total: scenes.length,
      label: Object.keys(errors).length ? `Done — ${Object.keys(errors).length} failed` : 'All images ready!',
    });
    setGeneratingImages(false);
  };

  // Retry a single failed image
  const retryImage = async (sceneIdx) => {
    const scene = scenes[sceneIdx];
    if (!scene) return;
    const prev = sceneIdx > 0 ? scenes[sceneIdx - 1]?.image_url : null;
    setSceneErrors(prev2 => { const n = { ...prev2 }; delete n[scene.scene_number]; return n; });
    try {
      await base44.functions.invoke('generateProgressionImage', {
        scene_id: scene.id,
        reference_image_url: prev?.startsWith('http') ? prev : null,
      });
      await refetchScenes();
    } catch (err) {
      setSceneErrors(prev2 => ({ ...prev2, [scene.scene_number]: err.message }));
    }
  };

  // ═══ STEP 3: Generate transition videos (parallel submission + poll) ═══
  const handleGenerateVideos = async () => {
    setGeneratingVideos(true);
    setSceneErrors({});

    const freshScenes = await base44.entities.Scenes.filter({ project_id: currentProjectId });
    const sorted = freshScenes.sort((a, b) => a.scene_number - b.scene_number);
    const transitions = sorted.length - 1;

    // Only process transitions that don't already have a completed video
    const pending = [];
    for (let i = 0; i < transitions; i++) {
      const v = sorted[i].video_url;
      if (!v?.startsWith('http')) pending.push(i);
    }

    setVideoProgress({
      current: 0,
      total: transitions,
      label: `Rendering ${pending.length} transitions in parallel — Kling 2.1 Master, 10s clips…`,
    });

    let completed = transitions - pending.length;
    const errors = {};

    // Submit all pending transitions in parallel — each one blocks server-side
    // until Kling completes (up to ~7 min), but they run concurrently so total
    // wall time ≈ max(single transition) instead of sum.
    await Promise.all(pending.map(async (i) => {
      try {
        await base44.functions.invoke('generateProgressionVideo', {
          start_scene_id: sorted[i].id,
          end_scene_id: sorted[i + 1].id,
          poll: true,
        });
      } catch (err) {
        errors[sorted[i].scene_number] = err.message;
        console.warn(`✗ Transition ${i + 1}→${i + 2}:`, err.message);
      }
      completed += 1;
      const fresh = await base44.entities.Scenes.filter({ project_id: currentProjectId });
      setVideoProgress({
        current: completed,
        total: transitions,
        label: `${completed}/${transitions} transitions ready`,
      });
      queryClient.setQueryData(['flow-scenes', currentProjectId], fresh.sort((a, b) => a.scene_number - b.scene_number));
    }));

    setSceneErrors(errors);
    setVideoProgress({
      current: transitions,
      total: transitions,
      label: Object.keys(errors).length ? `Done — ${Object.keys(errors).length} failed` : 'All transitions ready!',
    });
    await refetchScenes();
    setGeneratingVideos(false);
  };

  // ═══ STEP 5: Compile final time-lapse (browser-side ffmpeg concat) ═══
  const handleCompileFinal = async () => {
    setCompiling(true);
    setCompileProgress({ phase: 'starting', message: 'Loading video engine…', percent: 0 });
    setFinalVideoUrl(null);

    try {
      const sorted = [...scenes].sort((a, b) => a.scene_number - b.scene_number);
      const videoUrls = sorted
        .slice(0, -1) // last scene has no outgoing transition
        .map(s => s.video_url)
        .filter(u => u?.startsWith('http'));

      if (videoUrls.length === 0) {
        throw new Error('No completed transition videos to compile');
      }

      const blob = await concatTimelapseVideos(videoUrls, setCompileProgress);
      const url = URL.createObjectURL(blob);
      setFinalVideoUrl(url);

      // Auto-download
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title || 'timelapse'}_final.mp4`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      setCompileProgress({ phase: 'error', message: err.message, percent: 0 });
    }
    setCompiling(false);
  };

  const imageCount = scenes.filter(s => s.image_url?.startsWith('http')).length;
  const videoCount = scenes.filter(s => s.video_url?.startsWith('http')).length;
  const pendingVideos = scenes.filter(s => s.video_url?.startsWith('grok_vid_task:')).length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-orange-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Film className="w-8 h-8 text-amber-600" />
              Flow / Re-make
            </h1>
            <p className="text-gray-500 mt-1">Camera-locked visual progression — 7 scenes, no voiceover</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(createPageUrl('Dashboard'))}>
              <Home className="w-4 h-4 mr-1" /> Home
            </Button>
            {step > 1 && (
              <Button variant="outline" onClick={() => navigate(createPageUrl(`TimelineEditor?project_id=${currentProjectId}`))}>
                Open Timeline <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-8">
          {['Setup', 'Review Prompts', 'Images', 'Videos', 'Finish'].map((label, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                step > i + 1 ? 'bg-green-500 text-white' : step === i + 1 ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                {step > i + 1 ? <CheckCircle className="w-4 h-4" /> : i + 1}
              </div>
              <span className={`text-sm ${step === i + 1 ? 'font-semibold text-gray-900' : 'text-gray-400'}`}>{label}</span>
              {i < 4 && <div className={`w-8 h-0.5 ${step > i + 1 ? 'bg-green-400' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        {/* ═══ STEP 1: Setup ═══ */}
        {step === 1 && (
          <div className="space-y-6">
            <Card>
              <CardHeader><CardTitle>Category</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat.key}
                      onClick={() => setCategory(cat.key)}
                      className={`p-4 rounded-xl border-2 text-left transition-all ${
                        category === cat.key ? 'border-amber-500 bg-amber-50 ring-2 ring-amber-200' : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <cat.icon className={`w-6 h-6 mb-2 ${category === cat.key ? 'text-amber-600' : 'text-gray-400'}`} />
                      <p className="font-semibold text-sm">{cat.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{cat.desc}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Project Details</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-700">Title</label>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="e.g. Modern Dream House Build"
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Subject Description</label>
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="e.g. Modern 2-story concrete house with flat roof, large floor-to-ceiling windows, minimalist design, in a Bangalore suburb with palm trees"
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <OrientationSelector selectedOrientation={orientation} onSelect={setOrientation} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <VisualStyleSelector selectedStyle={visualStyle} onSelect={setVisualStyle} />
              </CardContent>
            </Card>

            {error && <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{error}</div>}

            <Button
              onClick={handleGenerate}
              disabled={generating || !title}
              className="w-full h-12 bg-amber-600 hover:bg-amber-700 text-lg"
            >
              {generating ? <><Loader2 className="w-5 h-5 animate-spin mr-2" /> Generating 7 Scene Prompts...</> : <><Sparkles className="w-5 h-5 mr-2" /> Generate Progression Scenes</>}
            </Button>
          </div>
        )}

        {/* ═══ STEP 2: Review Prompts ═══ */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">7 Scene Prompts</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
                <Button onClick={() => setStep(3)} className="bg-amber-600 hover:bg-amber-700">
                  Next: Generate Images <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>

            {scenes.map(scene => (
              <Card key={scene.id} className={scene.scene_number === 7 ? 'border-amber-300 bg-amber-50/50' : ''}>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge className={scene.scene_number <= 6 ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}>
                      S{scene.scene_number} {scene.scene_number <= 6 ? '🔒' : '🔓'}
                    </Badge>
                    <span className="font-semibold text-sm">{scene.narration_text}</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div>
                      <span className="font-medium text-gray-500">Image Prompt:</span>
                      <p className="text-gray-700 mt-0.5 bg-white rounded p-2 border">{scene.image_prompt}</p>
                    </div>
                    {scene.animation_prompt && (
                      <div>
                        <span className="font-medium text-gray-500">Video Transition:</span>
                        <p className="text-gray-700 mt-0.5 bg-white rounded p-2 border">{scene.animation_prompt}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ═══ STEP 3: Generate Images ═══ */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Generate Images (Sequential)</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
                {imageCount === 7 && (
                  <Button onClick={() => setStep(4)} className="bg-amber-600 hover:bg-amber-700">
                    Next: Videos <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border">
              <p className="text-sm text-gray-600 mb-3">Images generate one at a time. Each scene builds on the camera-locked perspective.</p>
              <Button onClick={handleGenerateImages} disabled={generatingImages} className="w-full bg-emerald-600 hover:bg-emerald-700">
                {generatingImages ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {imageProgress.label || `Scene ${imageProgress.current + 1}/7`}</>
                ) : (
                  <><ImageIcon className="w-4 h-4 mr-2" /> Generate All 7 Images ({imageCount}/7 done)</>
                )}
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {scenes.map((s, idx) => {
                const hasImg = s.image_url?.startsWith('http');
                const errMsg = sceneErrors[s.scene_number];
                return (
                  <div key={s.id} className={`bg-white rounded-lg border overflow-hidden ${errMsg ? 'border-red-300' : ''}`}>
                    {hasImg ? (
                      <img src={s.image_url} alt={`S${s.scene_number}`} className="w-full aspect-video object-cover" />
                    ) : (
                      <div className={`w-full aspect-video flex flex-col items-center justify-center text-xs ${errMsg ? 'bg-red-50 text-red-500' : 'bg-gray-100 text-gray-400'}`}>
                        {errMsg ? <AlertCircle className="w-5 h-5 mb-1" /> : null}
                        S{s.scene_number} — {errMsg ? 'Failed' : 'Pending'}
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs font-medium">{s.narration_text}</p>
                      <div className="flex items-center justify-between mt-1">
                        <Badge className={`text-[9px] ${hasImg ? 'bg-green-100 text-green-700' : errMsg ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-500'}`}>
                          {hasImg ? '✓ Generated' : errMsg ? '✗ Error' : 'Pending'}
                        </Badge>
                        {!hasImg && !generatingImages && (
                          <button
                            onClick={() => retryImage(idx)}
                            className="text-[9px] text-blue-600 hover:text-blue-700 underline"
                          >
                            Retry
                          </button>
                        )}
                      </div>
                      {errMsg && <p className="text-[9px] text-red-500 mt-1 line-clamp-2" title={errMsg}>{errMsg}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ STEP 4: Generate Videos ═══ */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Generate Transition Videos</h2>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
                <Button onClick={() => setStep(5)} className="bg-amber-600 hover:bg-amber-700">
                  Finish <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border">
              <p className="text-sm text-gray-600 mb-3">6 transition videos: each shows time-lapse between consecutive scenes.</p>
              <Button onClick={handleGenerateVideos} disabled={generatingVideos || imageCount < 7} className="w-full bg-violet-600 hover:bg-violet-700">
                {generatingVideos ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {videoProgress.label}</>
                ) : (
                  <><Film className="w-4 h-4 mr-2" /> Generate 6 Transition Videos ({videoCount} done, {pendingVideos} rendering)</>
                )}
              </Button>
            </div>

            <div className="space-y-2">
              {scenes.slice(0, -1).map((s, i) => {
                const errMsg = sceneErrors[s.scene_number];
                const isReady = s.video_url?.startsWith('http');
                const isRendering = s.video_url?.startsWith('grok_vid_task:');
                return (
                  <div key={s.id} className={`bg-white rounded-lg border p-3 flex items-center gap-3 ${errMsg ? 'border-red-300' : ''}`}>
                    <div className="flex items-center gap-2 flex-1">
                      <Badge>S{s.scene_number}</Badge>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <Badge>S{s.scene_number + 1}</Badge>
                      <span className="text-xs text-gray-500 ml-2 truncate">{s.narration_text} → {scenes[i + 1]?.narration_text}</span>
                    </div>
                    {isReady ? (
                      <Badge className="bg-green-100 text-green-700">✓ Ready</Badge>
                    ) : isRendering ? (
                      <Badge className="bg-amber-100 text-amber-700">⏳ Rendering</Badge>
                    ) : errMsg ? (
                      <Badge className="bg-red-100 text-red-700" title={errMsg}>✗ Failed</Badge>
                    ) : (
                      <Badge className="bg-gray-100 text-gray-500">Pending</Badge>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ STEP 5: Finish ═══ */}
        {step === 5 && (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Progression Complete!</h2>
            <p className="text-gray-500 mb-4">{imageCount} images · {videoCount} videos ready</p>

            {/* Asset preview grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-4xl mx-auto mb-6 text-left">
              {scenes.map(s => (
                <div key={s.id} className="bg-white rounded-lg border overflow-hidden">
                  {s.image_url?.startsWith('http') ? (
                    <img src={s.image_url} alt={`S${s.scene_number}`} className="w-full aspect-video object-cover" />
                  ) : (
                    <div className="w-full aspect-video bg-gray-100 flex items-center justify-center text-gray-400 text-xs">No image</div>
                  )}
                  <div className="p-2 space-y-1">
                    <p className="text-[10px] font-medium truncate">{s.narration_text}</p>
                    <div className="flex gap-1">
                      {s.image_url?.startsWith('http') && (
                        <a href={s.image_url} download={`scene_${s.scene_number}_image.png`} target="_blank" rel="noopener"
                          className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded hover:bg-blue-100">
                          Image ↓
                        </a>
                      )}
                      {s.video_url?.startsWith('http') && !s.video_url.includes('grok_vid_task') && (
                        <a href={s.video_url} download={`scene_${s.scene_number}_video.mp4`} target="_blank" rel="noopener"
                          className="text-[9px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded hover:bg-purple-100">
                          Video ↓
                        </a>
                      )}
                      {s.video_url?.startsWith('grok_vid_task') && (
                        <span className="text-[9px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">Rendering...</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* ═══ FINAL TIME-LAPSE COMPILATION ═══ */}
            {videoCount > 0 && (
              <div className="max-w-2xl mx-auto mb-6 bg-gradient-to-br from-amber-100 to-orange-100 border-2 border-amber-300 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <Wand2 className="w-5 h-5 text-amber-700" />
                  <h3 className="text-lg font-bold text-amber-900">Compile Final Time-lapse</h3>
                </div>
                <p className="text-xs text-amber-800 mb-3">
                  Stitch all {videoCount} transitions into one seamless MP4 — ready to upload.
                </p>

                {!finalVideoUrl && (
                  <Button
                    onClick={handleCompileFinal}
                    disabled={compiling || videoCount < 1}
                    className="w-full bg-amber-600 hover:bg-amber-700 h-11"
                  >
                    {compiling ? (
                      <><Loader2 className="w-4 h-4 animate-spin mr-2" /> {compileProgress?.message || 'Compiling…'}</>
                    ) : (
                      <><Film className="w-4 h-4 mr-2" /> Compile & Download Final MP4</>
                    )}
                  </Button>
                )}

                {compiling && compileProgress?.percent > 0 && (
                  <div className="mt-3">
                    <div className="h-2 bg-amber-200 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-600 transition-all" style={{ width: `${compileProgress.percent}%` }} />
                    </div>
                    <p className="text-[10px] text-amber-700 mt-1">{compileProgress.message}</p>
                  </div>
                )}

                {compileProgress?.phase === 'error' && (
                  <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{compileProgress.message}</span>
                  </div>
                )}

                {finalVideoUrl && (
                  <div className="mt-3 space-y-2">
                    <video src={finalVideoUrl} controls className="w-full rounded-lg bg-black" />
                    <a
                      href={finalVideoUrl}
                      download={`${title || 'timelapse'}_final.mp4`}
                      className="flex items-center justify-center gap-2 w-full h-10 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium"
                    >
                      <Download className="w-4 h-4" /> Download Final Time-lapse
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 justify-center flex-wrap">
              <Button variant="outline" onClick={() => setStep(3)}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Images
              </Button>
              <Button
                variant="outline"
                className="border-green-300 text-green-700 hover:bg-green-50"
                onClick={async () => {
                  const freshScenes = await base44.entities.Scenes.filter({ project_id: currentProjectId });
                  const sorted = freshScenes.sort((a, b) => a.scene_number - b.scene_number);
                  for (const scene of sorted) {
                    if (scene.image_url?.startsWith('http')) {
                      const a = document.createElement('a');
                      a.href = scene.image_url;
                      a.download = `${title || 'flow'}_scene_${scene.scene_number}_image.png`;
                      a.target = '_blank';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      await new Promise(r => setTimeout(r, 500));
                    }
                    if (scene.video_url?.startsWith('http') && !scene.video_url.includes('grok_vid_task')) {
                      const a = document.createElement('a');
                      a.href = scene.video_url;
                      a.download = `${title || 'flow'}_scene_${scene.scene_number}_video.mp4`;
                      a.target = '_blank';
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      await new Promise(r => setTimeout(r, 500));
                    }
                  }
                }}
              >
                <Download className="w-4 h-4 mr-1" /> Download All Assets
              </Button>
              <Button onClick={() => navigate(createPageUrl(`TimelineEditor?project_id=${currentProjectId}`))} className="bg-blue-600 hover:bg-blue-700">
                Open Timeline <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}