import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X, Clock } from 'lucide-react';

export default function ScenePreview({ scene, onClose, onUpdateDuration }) {
  const [duration, setDuration] = useState(scene?.duration_seconds || 8);

  if (!scene) return null;

  const handleSave = () => {
    onUpdateDuration(duration);
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
          <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
            {scene.image_url ? (
              <img src={scene.image_url} className="w-full h-full object-cover" alt={`Scene ${scene.scene_number}`} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">No image</div>
            )}
          </div>

          {/* Narration */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-500">Narration</p>
            <p className="text-sm text-gray-700 max-h-32 overflow-y-auto">{scene.narration_text}</p>
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
                  max={30}
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="w-20"
                />
                <Button size="sm" onClick={handleSave} variant="outline">Save</Button>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Image Prompt</p>
              <p className="text-xs text-gray-600 mt-1 line-clamp-3">{scene.image_prompt}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500">Animation</p>
              <p className="text-xs text-gray-600 mt-1 line-clamp-3">{scene.animation_prompt}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}