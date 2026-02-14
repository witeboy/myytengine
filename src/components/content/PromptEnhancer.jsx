import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, ImageIcon, Film, Wand2 } from 'lucide-react';

export default function PromptEnhancer({ scene, onEnhanced }) {
  const [enhancing, setEnhancing] = useState(null); // "image" | "animation" | "both" | null

  const handleEnhance = async (type) => {
    setEnhancing(type);
    await base44.functions.invoke('enhanceScenePrompts', {
      scene_id: scene.id,
      enhance_type: type,
    });
    onEnhanced?.();
    setEnhancing(null);
  };

  const isLoading = !!enhancing;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Sparkles className="w-3 h-3 text-purple-500" />
        <span className="text-[10px] font-semibold text-purple-700 uppercase tracking-wide">AI Enhance</span>
      </div>
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleEnhance('image')}
          disabled={isLoading}
          className="flex-1 text-xs h-7 border-purple-200 text-purple-700 hover:bg-purple-50"
        >
          {enhancing === 'image' ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <ImageIcon className="w-3 h-3 mr-1" />
          )}
          Image
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleEnhance('animation')}
          disabled={isLoading}
          className="flex-1 text-xs h-7 border-purple-200 text-purple-700 hover:bg-purple-50"
        >
          {enhancing === 'animation' ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Film className="w-3 h-3 mr-1" />
          )}
          Motion
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => handleEnhance('both')}
          disabled={isLoading}
          className="flex-1 text-xs h-7 border-purple-200 text-purple-700 hover:bg-purple-50"
        >
          {enhancing === 'both' ? (
            <Loader2 className="w-3 h-3 animate-spin mr-1" />
          ) : (
            <Wand2 className="w-3 h-3 mr-1" />
          )}
          Both
        </Button>
      </div>
      {enhancing && (
        <p className="text-[10px] text-purple-500 animate-pulse">
          Enhancing {enhancing === 'both' ? 'image & animation' : enhancing} prompt with AI...
        </p>
      )}
    </div>
  );
}