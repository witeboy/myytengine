import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ImageIcon, Film, Settings2, RefreshCw } from 'lucide-react';
import AnimationEditor from './AnimationEditor';
import SceneSfxEditor from './SceneSfxEditor';
import PromptEnhancer from './PromptEnhancer';

const statusColors = {
  pending: 'bg-gray-100 text-gray-600',
  prompts_ready: 'bg-yellow-100 text-yellow-800',
  image_generated: 'bg-green-100 text-green-800',
  video_generated: 'bg-purple-100 text-purple-800',
  failed: 'bg-red-100 text-red-800',
};

export default function SceneCard({ scene, onRegenerateImage, onAnimateScene, onSceneUpdated }) {
  const [loadingImage, setLoadingImage] = useState(false);
    const [loadingVideo, setLoadingVideo] = useState(false);
    const [polling, setPolling] = useState(false);
    const [showAnimEditor, setShowAnimEditor] = useState(false);
    const [rephrasing, setRephrasing] = useState(false);
  const pollRef = useRef(null);

  const hasPendingTask = scene.video_url?.startsWith('grok_vid_task:') ||
    scene.video_url?.startsWith('veo_task:') ||
    scene.video_url?.startsWith('runway_task:') ||
    scene.video_url?.startsWith('freepik_task:');

  useEffect(() => {
    if (hasPendingTask && !polling) {
      setPolling(true);
      setLoadingVideo(true);
      pollRef.current = setInterval(async () => {
        const res = await base44.functions.invoke('pollSceneVideo', {
          scene_id: scene.id,
        });
        const status = res.data?.status;
        if (status === 'COMPLETED' || status === 'FAILED') {
          clearInterval(pollRef.current);
          setPolling(false);
          setLoadingVideo(false);
          onSceneUpdated?.();
        }
      }, 12000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
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
      <div className="aspect-video bg-gray-100 relative">
        {scene.video_url && !scene.video_url.startsWith('freepik_task:') && !scene.video_url.startsWith('runway_task:') && !scene.video_url.startsWith('veo_task:') ? (
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

        {/* Prompts collapsible */}
        <details className="text-xs">
          <summary className="cursor-pointer text-blue-600 font-medium">View Prompts</summary>
          <div className="mt-2 space-y-2">
            <div>
              <p className="font-medium text-gray-500">Image Prompt:</p>
              <p className="text-gray-600">{scene.image_prompt}</p>
            </div>
            <div>
              <p className="font-medium text-gray-500">Animation Prompt:</p>
              <p className="text-gray-600">{scene.animation_prompt}</p>
            </div>
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

        {/* Sound Effect Editor */}
        <div className="border-t pt-2">
          <p className="text-[10px] font-medium text-gray-500 mb-1">Sound Effect</p>
          <SceneSfxEditor scene={scene} onUpdate={onSceneUpdated} />
        </div>
      </CardContent>
    </Card>
  );
}