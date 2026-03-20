import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ImageIcon, Film, Settings2, RefreshCw, Wrench, Check, ChevronDown } from 'lucide-react';
import AnimationEditor from './AnimationEditor';
import SceneSfxEditor from './SceneSfxEditor';
import PromptEnhancer from './PromptEnhancer';
import PromptEditor from './PromptEditor';
import BrollPreview from './BrollPreview';
import ProviderRegenButtons from './ProviderRegenButtons';

const statusColors = {
  pending: 'bg-gray-100 text-gray-600',
  prompts_ready: 'bg-yellow-100 text-yellow-800',
  image_generated: 'bg-green-100 text-green-800',
  video_generated: 'bg-purple-100 text-purple-800',
  failed: 'bg-red-100 text-red-800',
};


// ═══════════════════════════════════════════════════════════════════
// Per-Scene Fix Prompt Button — Module-level component
// ═══════════════════════════════════════════════════════════════════
function FixPromptButton({ sceneId, projectId, onFixed }) {
  const [fixing, setFixing] = useState(false);
  const [fixType, setFixType] = useState(null);
  const [result, setResult] = useState(null);
  const [showMenu, setShowMenu] = useState(false);

  const handleFix = async (type) => {
    setShowMenu(false);
    setFixing(true);
    setFixType(type);
    setResult(null);

    try {
      if (type === 'ai_clean') {
        // Fetch the current scene prompt, clean it via OpenAI, and save
        const sceneList = await base44.entities.Scenes.filter({ id: sceneId });
        const scene = sceneList[0];
        if (scene?.image_prompt) {
          const projectList = await base44.entities.Projects.filter({ id: projectId });
          const visualStyle = projectList[0]?.visual_style || '';
          const resp = await base44.functions.invoke('cleanScenePrompt', {
            prompt: scene.image_prompt,
            visual_style: visualStyle
          });
          const data = resp.data || resp;
          if (data.cleaned_prompt && data.cleaned_prompt !== scene.image_prompt) {
            await base44.entities.Scenes.update(sceneId, { image_prompt: data.cleaned_prompt });
            setResult({ fixed: 1, total: 1 });
          } else {
            setResult({ fixed: 0, total: 1 });
          }
        }
        onFixed?.();
      } else {
        const resp = await base44.functions.invoke('fixScenePrompts', {
          project_id: projectId,
          scene_id: sceneId,
          fix_type: type
        });
        const data = resp.data || resp;
        setResult(data);
        onFixed?.();
      }
    } catch (err) {
      console.error('Fix prompt failed:', err);
      setResult({ error: err.message });
    }

    setFixing(false);
    setFixType(null);
    setTimeout(() => setResult(null), 4000);
  };

  return (
    <div className="relative">
      <div className="flex gap-1">
        {/* Main fix button — runs "all" */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleFix('all')}
          disabled={fixing}
          className="flex-1 border-orange-200 text-orange-700 hover:bg-orange-50 text-xs"
        >
          {fixing ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : result?.fixed > 0 ? (
            <Check className="w-3 h-3 mr-1 text-green-600" />
          ) : (
            <Wrench className="w-3 h-3 mr-1" />
          )}
          {fixing
            ? `Fixing ${fixType === 'characters' ? 'chars' : fixType === 'cleanup' ? 'meta' : fixType === 'ai_clean' ? 'AI clean' : 'all'}...`
            : result?.fixed > 0
              ? 'Fixed!'
              : 'Fix Prompt'
          }
        </Button>

        {/* Dropdown for specific fix types */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowMenu(!showMenu)}
          disabled={fixing}
          className="px-1.5 border-orange-200 text-orange-700 hover:bg-orange-50"
        >
          <ChevronDown className="w-3 h-3" />
        </Button>
      </div>

      {/* Dropdown menu */}
      {showMenu && !fixing && (
        <div className="absolute bottom-full mb-1 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-50 w-52">
          {[
            { type: 'all', label: 'Fix Everything', icon: '🔧' },
            { type: 'characters', label: 'Fix Characters', icon: '👤' },
            { type: 'cleanup', label: 'Clean Metadata', icon: '🧹' },
            { type: 'quality', label: 'Check Quality', icon: '⚠️' },
            { type: 'ai_clean', label: 'AI Clean (OpenAI)', icon: '✨' },
          ].map(opt => (
            <button
              key={opt.type}
              onClick={() => handleFix(opt.type)}
              className="w-full text-left px-3 py-2 hover:bg-orange-50 first:rounded-t-lg last:rounded-b-lg flex items-center gap-2 text-xs"
            >
              <span>{opt.icon}</span>
              <span className="font-medium text-gray-700">{opt.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Result toast */}
      {result && (
        <div className={`absolute bottom-full mb-1 right-0 z-50 rounded-md px-2.5 py-1.5 shadow-md text-[10px] whitespace-nowrap ${
          result.error
            ? 'bg-red-50 border border-red-200 text-red-600'
            : result.fixed > 0
              ? 'bg-green-50 border border-green-200 text-green-700'
              : 'bg-gray-50 border border-gray-200 text-gray-500'
        }`}>
          {result.error
            ? `Error: ${result.error.substring(0, 40)}`
            : result.fixed > 0
              ? (result.character_fixes != null ? `✓ ${result.character_fixes || 0} chars · ${result.cleanup_fixes || 0} cleanup${result.quality_resets > 0 ? ` · ${result.quality_resets} flagged` : ''}` : '✓ Prompt cleaned')
              : 'No changes needed'
          }
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════
// MAIN COMPONENT — Scene Card
// ═══════════════════════════════════════════════════════════════════
export default function SceneCard({ scene, onRegenerateImage, onAnimateScene, onSceneUpdated, orientation }) {
  const [loadingImage, setLoadingImage] = useState(false);
  const [loadingVideo, setLoadingVideo] = useState(false);
  const [polling, setPolling] = useState(false);
  const [showAnimEditor, setShowAnimEditor] = useState(false);
  const [rephrasing, setRephrasing] = useState(false);
  const pollRef = useRef(null);

  const hasPendingTask = (
    (scene.video_url?.startsWith('grok_vid_task:') || scene.video_url?.startsWith('veo_task:')) &&
    scene.status !== 'failed' && scene.status !== 'video_failed'
  );

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    if (!hasPendingTask) {
      setPolling(false);
      setLoadingVideo(false);
      return;
    }

    setPolling(true);
    setLoadingVideo(true);
    pollRef.current = setInterval(async () => {
      try {
        const res = await base44.functions.invoke('pollSceneVideo', { scene_id: scene.id });
        const status = res.data?.status;
        if (status === 'COMPLETED' || status === 'FAILED') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPolling(false);
          setLoadingVideo(false);
          onSceneUpdated?.();
        }
      } catch (err) {
        console.warn(`Poll error for scene ${scene.scene_number}:`, err?.response?.data?.error || err.message);
        clearInterval(pollRef.current);
        pollRef.current = null;
        setPolling(false);
        setLoadingVideo(false);
      }
    }, 12000);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [scene.video_url]);

  const handleImage = async () => {
    setLoadingImage(true);
    try {
      await onRegenerateImage();
    } catch (err) {
      console.warn("Image generation failed:", err.message);
    }
    setLoadingImage(false);
  };

  const handleRephrase = async () => {
    setRephrasing(true);
    await base44.functions.invoke('rephraseScenePrompt', { scene_id: scene.id });
    onSceneUpdated?.();
    setRephrasing(false);
  };

  const handleVideo = async () => {
    setLoadingVideo(true);
    try {
      await onAnimateScene();
    } catch (err) {
      console.warn("Video generation failed:", err.message);
      setLoadingVideo(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* Preview */}
      <div className={`${orientation === 'portrait' || scene.orientation === 'portrait' ? 'aspect-[9/16]' : 'aspect-video'} bg-gray-100 relative`}>
        {scene.video_url && scene.video_url.startsWith('http') ? (
          <video src={scene.video_url} controls className="w-full h-full object-cover" />
        ) : scene.image_url ? (
          <img src={scene.image_url} alt={`Scene ${scene.scene_number}`} className="w-full h-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <ImageIcon className="w-10 h-10" />
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-1">
          <Badge className="bg-black/70 text-white text-xs">Scene {scene.scene_number}</Badge>
          <Badge className={`text-xs ${statusColors[scene.status]}`}>{scene.status?.replace(/_/g, ' ')}</Badge>
        </div>
        {scene.duration_seconds && (
          <Badge className="absolute top-2 right-2 bg-black/70 text-white text-xs">
            {scene.duration_seconds}s
          </Badge>
        )}
      </div>

      <CardContent className="pt-3 space-y-3">
        <p className="text-sm text-gray-700 line-clamp-3">{scene.narration_text}</p>

        {/* Prompts — editable */}
        <details className="text-xs">
          <summary className="cursor-pointer text-blue-600 font-medium">Edit Prompts</summary>
          <div className="mt-2 space-y-2">
            <PromptEditor scene={scene} onSaved={onSceneUpdated} onRegenerateImage={handleImage} />
            <div className="pt-2 border-t border-dashed">
              <PromptEnhancer scene={scene} onEnhanced={onSceneUpdated} />
            </div>
          </div>
        </details>

        {/* Animation settings badges */}
        {(scene.camera_movement || scene.animation_speed) && (
          <div className="flex flex-wrap gap-1">
            {scene.camera_movement && (
              <Badge variant="outline" className="text-[10px]">{scene.camera_movement.replace(/_/g, ' ')}</Badge>
            )}
            {scene.animation_speed && scene.animation_speed !== 'normal' && (
              <Badge variant="outline" className="text-[10px]">{scene.animation_speed}</Badge>
            )}
          </div>
        )}

        {/* Rephrase button for failed/no-image scenes */}
        {(scene.status === 'failed' || (scene.status === 'prompts_ready' && !scene.image_url)) && (
          <Button size="sm" variant="outline" onClick={handleRephrase} disabled={rephrasing} className="w-full border-amber-300 text-amber-700 hover:bg-amber-50">
            {rephrasing ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
            {rephrasing ? 'Rephrasing...' : 'Rephrase Prompt (Policy Fix)'}
          </Button>
        )}

        {/* Fix Prompt — inject characters, clean metadata, check quality */}
        {scene.image_prompt && !scene.image_prompt.startsWith('DIRECTOR_NOTES:') && (
          <FixPromptButton sceneId={scene.id} projectId={scene.project_id} onFixed={onSceneUpdated} />
        )}

        {/* Per-provider regeneration */}
        <ProviderRegenButtons scene={scene} onComplete={onSceneUpdated} />

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleImage} disabled={loadingImage} className="flex-1">
            {loadingImage ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ImageIcon className="w-3 h-3 mr-1" />}
            {scene.image_url ? 'Regen' : 'Generate'}
          </Button>
          <Button size="sm" variant="outline" onClick={handleVideo} disabled={loadingVideo || !scene.image_url} className="flex-1">
            {loadingVideo ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Film className="w-3 h-3 mr-1" />}
            Animate
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowAnimEditor(!showAnimEditor)} className="px-2">
            <Settings2 className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Animation Editor Panel */}
        {showAnimEditor && (
          <div className="border-t pt-3">
            <AnimationEditor scene={scene} onSave={() => { setShowAnimEditor(false); onSceneUpdated?.(); }} />
          </div>
        )}

        {/* B-Roll Preview */}
        {scene.broll_url && (
          <BrollPreview
            scene={scene}
            onRemove={async () => {
              await base44.entities.Scenes.update(scene.id, {
                broll_url: '',
                broll_source: '',
                broll_id: '',
                broll_thumbnail: '',
                broll_query: '',
              });
              onSceneUpdated?.();
            }}
          />
        )}

        {/* Sound Effect Editor */}
        <div className="border-t pt-2">
          <p className="text-[10px] font-medium text-gray-500 mb-1">Sound Effect</p>
          <SceneSfxEditor scene={scene} onUpdate={onSceneUpdated} />
        </div>
      </CardContent>
    </Card>
  );
}