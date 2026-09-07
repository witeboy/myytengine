import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

const PROVIDERS = [
  { id: 'ai33_seedream', label: 'Seedream', emoji: '🌱', color: 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100' },
  { id: 'grok', label: 'Grok', emoji: '⚡', color: 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100' },
  { id: 'nano_banana', label: 'Nano', emoji: '🍌', color: 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100' },
];

export default function ProviderRegenButtons({ scene, onComplete }) {
  const [generating, setGenerating] = useState(null); // provider id

  const handleGenerate = async (providerId) => {
    setGenerating(providerId);
    try {
      // Submit with specific provider
      await base44.functions.invoke('generateSceneImage', {
        scene_id: scene.id,
        preferred_provider: providerId
      });

      // Poll until done (max ~2 min)
      for (let i = 0; i < 24; i++) {
        await new Promise(r => setTimeout(r, 5000));
        const pollRes = await base44.functions.invoke('pollSceneImage', { scene_id: scene.id });
        const result = (pollRes.data || pollRes).results?.[0];
        if (result?.status === 'done' || result?.status === 'failed') break;
      }

      onComplete?.();
    } catch (err) {
      console.warn(`${providerId} generation failed:`, err.message);
    }
    setGenerating(null);
  };

  return (
    <div className="flex gap-1">
      {PROVIDERS.map(p => (
        <button
          key={p.id}
          onClick={() => handleGenerate(p.id)}
          disabled={generating !== null}
          title={`Regenerate with ${p.label}`}
          className={`flex-1 flex items-center justify-center gap-1 px-1.5 py-1 rounded-md border text-[10px] font-medium transition-colors ${
            generating === p.id
              ? 'bg-gray-100 border-gray-200 text-gray-400'
              : p.color
          } disabled:opacity-50`}
        >
          {generating === p.id ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <span>{p.emoji}</span>
          )}
          <span>{p.label}</span>
        </button>
      ))}
    </div>
  );
}