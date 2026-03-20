import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Wand2, CheckCircle2, ImageIcon, Layers } from 'lucide-react';

export default function LongViralScenesStage({ projectId, project, scenes, onRefetch }) {
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState('');

  const hasScenes = scenes.length > 0;
  const allPromptsReady = hasScenes && scenes.every(s => s.status === 'prompts_ready' || s.status === 'image_generated');

  const handleBreakdown = async () => {
    setGenerating(true);
    setPhase('Extracting character DNA...');
    try {
      try {
        await base44.functions.invoke('extractCharacterDNA', { project_id: projectId });
      } catch (e) {
        console.warn('Character DNA extraction failed (non-fatal):', e.message);
      }

      setPhase('Breaking script into visual scenes...');
      await base44.functions.invoke('longViralSceneBreakdown', { project_id: projectId });
      setPhase('Generating image prompts...');
      await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
      setPhase('Scenes ready!');
      await onRefetch();
    } catch (err) {
      console.error('Long Viral scene breakdown failed:', err);
      setPhase('Failed: ' + (err.message || 'Unknown error'));
    }
    setGenerating(false);
  };

  return (
    <Card className="bg-white/5 border-white/10">
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-bold text-white">Stage 2: Scene Breakdown</h3>
            {allPromptsReady && <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">Complete</Badge>}
          </div>
          <Button onClick={handleBreakdown} disabled={generating} className="bg-cyan-600 hover:bg-cyan-700 gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {generating ? phase : hasScenes ? 'Regenerate Scenes' : 'Break Down into Scenes'}
          </Button>
        </div>

        <p className="text-xs text-white/40 mb-4">
          Visual change every 4-6 seconds. Each section gets its own set of scenes with visual specs, audio direction, and timing.
        </p>

        {generating && (
          <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-lg p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
            <p className="text-sm text-cyan-300">{phase}</p>
          </div>
        )}

        {hasScenes && (
          <div className="space-y-2 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Badge className="bg-white/10 text-white/60 text-[10px]">{scenes.length} scenes</Badge>
              <Badge className="bg-amber-500/20 text-amber-300 text-[10px]">
                {scenes.filter(s => s.status === 'prompts_ready').length} prompts ready
              </Badge>
              <Badge className="bg-white/10 text-white/40 text-[10px]">
                ~{Math.round(scenes.reduce((s, sc) => s + (sc.duration_seconds || 0), 0) / 60)}min total
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
              {scenes.map(scene => (
                <div key={scene.id} className="bg-white/5 rounded-lg p-2.5 border border-white/10">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-bold text-white/70">S{scene.scene_number}</span>
                    {scene.status === 'prompts_ready' ? (
                      <CheckCircle2 className="w-3 h-3 text-amber-400" />
                    ) : (
                      <ImageIcon className="w-3 h-3 text-white/30" />
                    )}
                  </div>
                  <p className="text-[10px] text-white/40 leading-relaxed line-clamp-2">
                    {scene.narration_text?.substring(0, 60)}...
                  </p>
                  <p className="text-[9px] text-cyan-400 mt-1">{scene.duration_seconds?.toFixed(1)}s</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}