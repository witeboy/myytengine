import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  X, Clock, Loader2, ImageIcon, Film,
  Layers, Camera, Wand2, Volume2, ChevronDown, ChevronRight,
  RefreshCw, Play, CheckCircle2, XCircle, AlertTriangle
} from 'lucide-react';

export default function PropertiesPanel({ scene, onClose, onUpdateDuration, onRefetch }) {
  const [duration, setDuration] = useState(scene?.duration_seconds || 8);
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [pollingVideo, setPollingVideo] = useState(false);
  const [expanded, setExpanded] = useState({ basic: true, media: true, audio: false, prompt: false, transition: false });
  const pollRef = useRef(null);

  useEffect(() => {
    if (scene) setDuration(scene.duration_seconds || 8);
  }, [scene?.id]);

  // Auto-poll pending video tasks
  const hasPendingTask = scene?.video_url?.startsWith('grok_vid_task:') ||
    scene?.video_url?.startsWith('veo_task:');

  useEffect(() => {
    if (hasPendingTask && !pollingVideo) {
      setPollingVideo(true);
      setGeneratingVideo(true);
      pollRef.current = setInterval(async () => {
        const res = await base44.functions.invoke('pollSceneVideo', { scene_id: scene.id });
        const status = res.data?.status;
        if (status === 'COMPLETED' || status === 'FAILED') {
          clearInterval(pollRef.current);
          setPollingVideo(false);
          setGeneratingVideo(false);
          onRefetch?.();
        }
      }, 12000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [scene?.video_url, scene?.id]);

  if (!scene) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-gray-500 bg-[#16213e] px-4">
        <Layers className="w-6 h-6 mb-2 opacity-20" />
        <p className="text-[10px] text-center text-gray-600">Select a scene to edit</p>
      </div>
    );
  }

  const toggle = (key) => setExpanded(p => ({ ...p, [key]: !p[key] }));

  // Generate or regenerate image using generateSceneImage (same as ContentGeneration)
  const handleGenerateImage = async () => {
    setRegeneratingImage(true);
    await base44.functions.invoke('generateSceneImage', { scene_id: scene.id });
    onRefetch?.();
    setRegeneratingImage(false);
  };

  // Animate image to video using generateSceneVideo (same as ContentGeneration)
  const handleAnimateVideo = async () => {
    setGeneratingVideo(true);
    const res = await base44.functions.invoke('generateSceneVideo', { scene_id: scene.id });
    onRefetch?.();
    // Start polling
    const taskId = res.data?.task_id;
    if (taskId) {
      setPollingVideo(true);
      pollRef.current = setInterval(async () => {
        const pollRes = await base44.functions.invoke('pollSceneVideo', { scene_id: scene.id });
        const status = pollRes.data?.status;
        if (status === 'COMPLETED' || status === 'FAILED') {
          clearInterval(pollRef.current);
          setPollingVideo(false);
          setGeneratingVideo(false);
          onRefetch?.();
        }
      }, 12000);
    } else {
      setGeneratingVideo(false);
    }
  };

  const hasVideo = scene.video_url?.startsWith('http');
  const hasImage = scene.image_url?.startsWith('http');
  const isPendingVideo = hasPendingTask;
  const isFailed = scene.status === 'failed' || scene.status === 'video_failed';

  const statusLabel = isPendingVideo ? 'animating' : scene.status?.replace(/_/g, ' ');
  const statusColor = isPendingVideo
    ? 'text-amber-400 bg-amber-500/10'
    : hasVideo ? 'text-purple-400 bg-purple-500/10'
    : hasImage ? 'text-emerald-400 bg-emerald-500/10'
    : isFailed ? 'text-red-400 bg-red-500/10'
    : 'text-gray-500 bg-gray-500/10';

  const Section = ({ label, icon: Icon, sKey, children }) => (
    <div className="border-b border-gray-700/30">
      <button onClick={() => toggle(sKey)} className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-gray-400 hover:text-gray-200 hover:bg-white/5 transition-colors">
        {expanded[sKey] ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </button>
      {expanded[sKey] && <div className="px-3 pb-2.5 space-y-2">{children}</div>}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-[#16213e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/40 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold text-white">Scene {scene.scene_number}</span>
          <span className={`text-[8px] px-1.5 py-0.5 rounded ${statusColor} font-medium flex items-center gap-0.5`}>
            {isPendingVideo && <Loader2 className="w-2 h-2 animate-spin" />}
            {statusLabel}
          </span>
        </div>
        <button onClick={onClose} className="text-gray-600 hover:text-white transition-colors p-0.5">
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Basic */}
        <Section label="Basic" icon={Clock} sKey="basic">
          <div>
            <label className="text-[9px] text-gray-500 mb-0.5 block font-medium">Duration</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number" min={2} max={60} value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="h-6 w-14 text-[10px] bg-[#0f0f23] border border-gray-700/40 rounded px-1.5 text-white focus:outline-none focus:border-blue-500/50"
              />
              <Slider value={[duration]} onValueChange={([v]) => setDuration(v)} min={2} max={30} step={0.5} className="flex-1" />
              <Button size="sm" onClick={() => onUpdateDuration(duration)} className="h-6 text-[9px] px-2 bg-blue-600 hover:bg-blue-700">
                Save
              </Button>
            </div>
          </div>
          <div>
            <label className="text-[9px] text-gray-500 mb-0.5 block font-medium">Camera</label>
            <Select value={scene.camera_movement || 'slow_pan'} onValueChange={async (v) => { await base44.entities.Scenes.update(scene.id, { camera_movement: v }); onRefetch?.(); }}>
              <SelectTrigger className="h-6 text-[10px] bg-[#0f0f23] border-gray-700/40 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {['static','slow_pan','slow_zoom_in','slow_zoom_out','dolly_zoom','crane_shot','tracking_shot','orbital','tilt_up','tilt_down'].map(m => (
                  <SelectItem key={m} value={m} className="text-[10px]">{m.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Section>

        {/* Media — Image + Video generation */}
        <Section label="Media" icon={Film} sKey="media">
          {/* Preview */}
          <div className="aspect-video bg-black rounded overflow-hidden relative">
            {hasVideo ? (
              <video src={scene.video_url} className="w-full h-full object-cover" controls />
            ) : hasImage ? (
              <img src={scene.image_url} className="w-full h-full object-cover" alt="" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-700">
                <ImageIcon className="w-5 h-5" />
              </div>
            )}
            {isPendingVideo && (
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                <Loader2 className="w-5 h-5 text-amber-400 animate-spin mb-1" />
                <p className="text-[9px] text-amber-300 font-medium">Animating...</p>
                <p className="text-[8px] text-gray-400">Polling every 12s</p>
              </div>
            )}
            {isFailed && !hasVideo && !isPendingVideo && (
              <div className="absolute top-1 right-1 bg-red-500/80 rounded p-0.5">
                <AlertTriangle className="w-3 h-3 text-white" />
              </div>
            )}
          </div>

          {/* Generate Image button */}
          <Button size="sm" variant="outline" onClick={handleGenerateImage} disabled={regeneratingImage}
            className="w-full text-[9px] h-7 gap-1 border-gray-700/40 text-gray-300 hover:text-white hover:bg-emerald-500/10 hover:border-emerald-500/30">
            {regeneratingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
            {hasImage ? 'Regenerate Image' : 'Generate Image'}
          </Button>

          {/* Animate to Video button */}
          {hasImage && (
            <Button size="sm" variant="outline" onClick={handleAnimateVideo} disabled={generatingVideo || isPendingVideo}
              className="w-full text-[9px] h-7 gap-1 border-gray-700/40 text-gray-300 hover:text-white hover:bg-purple-500/10 hover:border-purple-500/30">
              {generatingVideo ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {pollingVideo ? 'Rendering...' : 'Submitting...'}
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  {hasVideo ? 'Re-Animate Video' : 'Animate to Video'}
                </>
              )}
            </Button>
          )}

          {/* Status row */}
          <div className="flex items-center gap-2 text-[8px]">
            <span className="flex items-center gap-0.5 text-gray-500">
              <ImageIcon className="w-2.5 h-2.5" />
              {hasImage ? <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> : <XCircle className="w-2.5 h-2.5 text-gray-600" />}
            </span>
            <span className="flex items-center gap-0.5 text-gray-500">
              <Film className="w-2.5 h-2.5" />
              {hasVideo ? <CheckCircle2 className="w-2.5 h-2.5 text-purple-400" /> : isPendingVideo ? <Loader2 className="w-2.5 h-2.5 text-amber-400 animate-spin" /> : <XCircle className="w-2.5 h-2.5 text-gray-600" />}
            </span>
          </div>
        </Section>

        {/* Audio */}
        <Section label="Audio" icon={Volume2} sKey="audio">
          {scene.sound_effect_url ? (
            <>
              <p className="text-[9px] text-gray-400">{scene.sound_effect || 'SFX'}</p>
              <audio src={scene.sound_effect_url} controls className="w-full h-6" />
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-gray-500 w-8">Vol</span>
                <Slider value={[scene.sfx_volume ?? 0.5]} onValueChange={async ([v]) => { await base44.entities.Scenes.update(scene.id, { sfx_volume: v }); onRefetch?.(); }} min={0} max={1} step={0.05} className="flex-1" />
                <span className="text-[9px] text-gray-500 w-7">{Math.round((scene.sfx_volume ?? 0.5) * 100)}%</span>
              </div>
            </>
          ) : (
            <p className="text-[9px] text-gray-600">No sound effect</p>
          )}
        </Section>

        {/* Transition */}
        <Section label="Transition" icon={Layers} sKey="transition">
          <Select value={scene.transition_type || 'cut'} onValueChange={async (v) => { await base44.entities.Scenes.update(scene.id, { transition_type: v }); onRefetch?.(); }}>
            <SelectTrigger className="h-6 text-[10px] bg-[#0f0f23] border-gray-700/40 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['cut','fade','dissolve','zoom','wipe','slide'].map(t => (
                <SelectItem key={t} value={t} className="text-[10px]">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {scene.transition_type && scene.transition_type !== 'cut' && (
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] text-gray-500 w-8">Dur</span>
              <Slider value={[scene.transition_duration || 0.5]} onValueChange={async ([v]) => { await base44.entities.Scenes.update(scene.id, { transition_duration: v }); onRefetch?.(); }} min={0.1} max={2} step={0.1} className="flex-1" />
              <span className="text-[9px] text-gray-500 w-8">{(scene.transition_duration || 0.5).toFixed(1)}s</span>
            </div>
          )}
        </Section>

        {/* Prompt */}
        <Section label="Prompt" icon={Wand2} sKey="prompt">
          <div>
            <label className="text-[8px] text-gray-500 font-medium block mb-0.5">Narration</label>
            <p className="text-[9px] text-gray-300 bg-[#0f0f23] rounded p-1.5 max-h-16 overflow-y-auto leading-snug">
              {scene.narration_text || '—'}
            </p>
          </div>
          <div>
            <label className="text-[8px] text-gray-500 font-medium block mb-0.5">Image Prompt</label>
            <p className="text-[9px] text-gray-300 bg-[#0f0f23] rounded p-1.5 max-h-16 overflow-y-auto leading-snug">
              {scene.image_prompt || '—'}
            </p>
          </div>
          <div>
            <label className="text-[8px] text-gray-500 font-medium block mb-0.5">Animation Prompt</label>
            <p className="text-[9px] text-gray-300 bg-[#0f0f23] rounded p-1.5 max-h-16 overflow-y-auto leading-snug">
              {scene.animation_prompt || '—'}
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}