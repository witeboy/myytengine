import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, ImageIcon, RotateCcw } from 'lucide-react';

export default function PromptEditor({ scene, onSaved, onRegenerateImage }) {
  const [imagePrompt, setImagePrompt] = useState(scene.image_prompt || '');
  const [animPrompt, setAnimPrompt] = useState(scene.animation_prompt || '');
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setImagePrompt(scene.image_prompt || '');
    setAnimPrompt(scene.animation_prompt || '');
    setDirty(false);
  }, [scene.id, scene.image_prompt, scene.animation_prompt]);

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Scenes.update(scene.id, {
      image_prompt: imagePrompt,
      animation_prompt: animPrompt,
    });
    setDirty(false);
    setSaving(false);
    onSaved?.();
  };

  const handleSaveAndRegenerate = async () => {
    setRegenerating(true);
    // Save first
    await base44.entities.Scenes.update(scene.id, {
      image_prompt: imagePrompt,
      animation_prompt: animPrompt,
      status: 'prompts_ready', // reset status so image gen picks it up
    });
    setDirty(false);
    onSaved?.();
    // Then regenerate
    await onRegenerateImage?.();
    setRegenerating(false);
  };

  const handleReset = () => {
    setImagePrompt(scene.image_prompt || '');
    setAnimPrompt(scene.animation_prompt || '');
    setDirty(false);
  };

  return (
    <div className="space-y-2">
      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Image Prompt</label>
        <Textarea
          value={imagePrompt}
          onChange={(e) => { setImagePrompt(e.target.value); setDirty(true); }}
          className="text-xs mt-1 min-h-[120px] font-mono leading-relaxed"
          placeholder="Describe the scene for image generation..."
        />
        <p className="text-[9px] text-gray-400 mt-0.5">{imagePrompt.split(/\s+/).filter(Boolean).length} words · {imagePrompt.length} chars</p>
      </div>
      <div>
        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Animation Prompt</label>
        <Textarea
          value={animPrompt}
          onChange={(e) => { setAnimPrompt(e.target.value); setDirty(true); }}
          className="text-xs mt-1 min-h-[60px] font-mono leading-relaxed"
          placeholder="Describe the camera movement and animation..."
        />
      </div>
      <div className="flex gap-1.5">
        {dirty && (
          <Button size="sm" variant="ghost" onClick={handleReset} className="text-xs h-7 text-gray-500">
            <RotateCcw className="w-3 h-3 mr-1" /> Reset
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="text-xs h-7 border-blue-200 text-blue-700 hover:bg-blue-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
          Save
        </Button>
        <Button
          size="sm"
          onClick={handleSaveAndRegenerate}
          disabled={regenerating}
          className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {regenerating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <ImageIcon className="w-3 h-3 mr-1" />}
          {regenerating ? 'Generating...' : dirty ? 'Save & Regenerate' : 'Regenerate Image'}
        </Button>
      </div>
    </div>
  );
}