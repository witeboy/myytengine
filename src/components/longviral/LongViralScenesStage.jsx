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
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-bold text-gray-900">Stage 2: Scene Breakdown</h3>
            {allPromptsReady && <Badge className="bg-green-100 text-green-700 text-[10px]">Complete</Badge>}
          </div>
          <Button onClick={handleBreakdown} disabled={generating} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {generating ? phase : hasScenes ? 'Regenerate Scenes' : 'Break Down into Scenes'}
          </Button>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Visual change every 4-6 seconds. Each section gets its own set of scenes with visual specs, audio direction, and timing.
        </p>

        {generating && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            <p className="text-sm text-blue-700">{phase}</p>
          </div>
        )}

        {hasScenes && (
          <div className="space-y-2 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary" className="text-[10px]">{scenes.length} scenes</Badge>
              <Badge className="bg-amber-100 text-amber-700 text-[10px]">
                {scenes.filter(s => s.status === 'prompts_ready').length} prompts ready
              </Badge>
              <Badge variant="secondary" className="text-[10px]">
                ~{Math.round(scenes.reduce((s, sc) => s + (sc.duration_seconds || 0), 0) / 60)}min total
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 max-h-64 overflow-y-auto">
              {scenes.map(scene => (
                <div key={scene.id} className="bg-gray-50 rounded-lg p-2.5 border border-gray-200">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[10px] font-bold text-gray-700">S{scene.scene_number}</span>
                    {scene.status === 'prompts_ready' ? (
                      <CheckCircle2 className="w-3 h-3 text-green-500" />
                    ) : (
                      <ImageIcon className="w-3 h-3 text-gray-400" />
                    )}
                  </div>
                  <p className="text-[10px] text-gray-500 leading-relaxed line-clamp-2">
                    {scene.narration_text?.substring(0, 60)}...
                  </p>
                  <p className="text-[9px] text-blue-500 mt-1">{scene.duration_seconds?.toFixed(1)}s</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}