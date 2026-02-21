import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import MediaUploader from './MediaUploader';
import SceneTrimmer from './SceneTrimmer';
import TransitionPicker from './TransitionPicker';
import { X, Clock, RefreshCw, Loader2, ImageIcon, Film, Scissors, Layers } from 'lucide-react';

export default function ScenePreview({ scene, onClose, onUpdateDuration, onRefetch }) {
  const [duration, setDuration] = useState(scene?.duration_seconds || 8);
  const [regeneratingImage, setRegeneratingImage] = useState(false);
  const [regeneratingVideo, setRegeneratingVideo] = useState(false);

  if (!scene) return null;

  const handleSave = () => {
    onUpdateDuration(duration);
  };

  const handleRegenerateImage = async () => {
    setRegeneratingImage(true);
    await base44.functions.invoke('generateSceneImage', { scene_id: scene.id });
    onRefetch?.();
    setRegeneratingImage(false);
  };

  const handleRegenerateVideo = async () => {
    setRegeneratingVideo(true);
    await base44.functions.invoke('generateSceneVideo', { scene_id: scene.id });
    onRefetch?.();
    setRegeneratingVideo(false);
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            Scene {scene.scene_number} Preview
            <Badge className="bg-gray-100 text-gray-600">{scene.status?.replace(/_/g, ' ')}</Badge>
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Visual */}
          <div>
            <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden mb-2">
              {scene.video_url && scene.video_url.startsWith('http') ? (
                <video src={scene.video_url} className="w-full h-full object-cover" controls />
              ) : scene.image_url && scene.image_url.startsWith('http') ? (
                <img src={scene.image_url} className="w-full h-full object-cover" alt={`Scene ${scene.scene_number}`} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-gray-400">No image</div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={handleRegenerateImage} disabled={regeneratingImage} className="text-xs gap-1 h-7">
                {regeneratingImage ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImageIcon className="w-3 h-3" />}
                Regen Image
              </Button>
              {scene.image_url && (
                <Button size="sm" variant="outline" onClick={handleRegenerateVideo} disabled={regeneratingVideo} className="text-xs gap-1 h-7">
                  {regeneratingVideo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Film className="w-3 h-3" />}
                  Regen Video
                </Button>
              )}
              <MediaUploader scene={scene} onRefetch={onRefetch} />
            </div>
          </div>

          {/* Narration */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500">Narration</p>
            <p className="text-sm text-gray-700 max-h-32 overflow-y-auto">{scene.narration_text}</p>
            {scene.sound_effect_url && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 mb-1">Sound Effect</p>
                <audio src={scene.sound_effect_url} controls className="w-full h-8" />
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-500 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Duration (seconds)
              </label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  min={2}
                  max={60}
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="w-20"
                />
                <Button size="sm" onClick={handleSave} variant="outline">Save</Button>
              </div>
            </div>

            {/* Trim & Transition controls */}
            <SceneTrimmer scene={scene} onSave={onRefetch} />
            <TransitionPicker scene={scene} onSave={onRefetch} />

            <div>
              <p className="text-xs font-medium text-gray-500">Image Prompt</p>
              <p className="text-xs text-gray-600 mt-1 line-clamp-3">{scene.image_prompt}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}