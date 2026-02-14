import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ImageIcon, Film, RefreshCw } from 'lucide-react';

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
  const pollRef = useRef(null);

  // Check if scene has a pending video task (runway or freepik)
  const pendingTask = (() => {
    if (scene.video_url?.startsWith('runway_task:')) {
      return { taskId: scene.video_url.replace('runway_task:', ''), provider: 'runway' };
    }
    if (scene.video_url?.startsWith('freepik_task:')) {
      return { taskId: scene.video_url.replace('freepik_task:', ''), provider: 'freepik' };
    }
    return null;
  })();

  useEffect(() => {
    if (pendingTask && !polling) {
      setPolling(true);
      setLoadingVideo(true);
      pollRef.current = setInterval(async () => {
        const res = await base44.functions.invoke('checkSceneVideoStatus', {
          task_id: pendingTask.taskId,
          scene_id: scene.id,
          provider: pendingTask.provider,
        });
        const status = res.data?.status;
        if (status === 'COMPLETED' || status === 'FAILED') {
          clearInterval(pollRef.current);
          setPolling(false);
          setLoadingVideo(false);
          onSceneUpdated?.();
        }
      }, 8000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [pendingTask?.taskId]);

  const handleImage = async () => {
    setLoadingImage(true);
    await onRegenerateImage();
    setLoadingImage(false);
  };

  const handleVideo = async () => {
    setLoadingVideo(true);
    await onAnimateScene();
    // After invoke, scene will have freepik_task:xxx, polling will start via useEffect on re-render
  };

  return (
    <Card className="overflow-hidden">
      {/* Image/Video Preview */}
      <div className="aspect-video bg-gray-100 relative">
        {scene.video_url && !scene.video_url.startsWith('freepik_task:') && !scene.video_url.startsWith('runway_task:') ? (
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
        {/* Narration */}
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
          </div>
        </details>

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={handleImage} disabled={loadingImage} className="flex-1">
            {loadingImage ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ImageIcon className="w-3 h-3 mr-1" />}
            {scene.image_url ? 'Regen' : 'Generate'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleVideo}
            disabled={loadingVideo || !scene.image_url}
            className="flex-1"
          >
            {loadingVideo ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Film className="w-3 h-3 mr-1" />}
            Animate
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}