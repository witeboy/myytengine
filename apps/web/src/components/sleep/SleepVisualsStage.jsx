import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ImageIcon, RefreshCw, Clock, Sparkles } from 'lucide-react';

export default function SleepVisualsStage({ projectId, project, scenes, onRefetch }) {
  const [generating, setGenerating] = useState(false);
  const [phase, setPhase] = useState('');
  const [autoStarted, setAutoStarted] = useState(false);

  const breakdownDone = scenes.length > 0 && scenes.every(s => s.status !== 'pending');
  const promptsReady = scenes.filter(s => s.status === 'prompts_ready' || s.status === 'image_generated').length;
  const imagesGenerated = scenes.filter(s => s.image_url && s.image_url.startsWith('http')).length;
  const allImagesReady = scenes.length > 0 && imagesGenerated === scenes.length;

  // Auto-start breakdown if no scenes exist
  useEffect(() => {
    if (autoStarted || generating || scenes.length > 0) return;
    setAutoStarted(true);
    handleFullGeneration();
  }, [autoStarted, generating, scenes.length]);

  const handleFullGeneration = async () => {
    setGenerating(true);

    // Step 1: Generate ambient image definitions
    setPhase('Designing ambient images...');
    try {
      await base44.functions.invoke('sleepSceneBreakdown', { project_id: projectId });
      await onRefetch();
    } catch (err) {
      if (err?.response?.status === 504) {
        await new Promise(r => setTimeout(r, 8000));
        await onRefetch();
      } else {
        console.error('Breakdown error:', err);
        setGenerating(false);
        return;
      }
    }

    // Step 2: Convert director notes to image prompts
    setPhase('Creating image prompts...');
    let promptsDone = false;
    while (!promptsDone) {
      try {
        const resp = await base44.functions.invoke('generateScenePrompts', { project_id: projectId });
        const data = resp.data || resp;
        promptsDone = data.done === true;
        await onRefetch();
      } catch (err) {
        const status = err?.response?.status;
        if (status === 504 || status === 500) {
          await new Promise(r => setTimeout(r, 8000));
          continue;
        }
        break;
      }
    }

    // Step 3: Generate all images
    setPhase('Generating images...');
    const freshScenes = await base44.entities.Scenes.filter({ project_id: projectId });
    const ready = freshScenes.filter(s => s.status === 'prompts_ready').sort((a, b) => a.scene_number - b.scene_number);

    for (const scene of ready) {
      setPhase(`Generating image ${scene.scene_number}/${freshScenes.length}...`);
      try {
        await base44.functions.invoke('generateSceneImage', { scene_id: scene.id });
        await onRefetch();
      } catch (err) {
        console.warn(`Image ${scene.scene_number} failed:`, err.message);
      }
      if (scene.scene_number < ready.length) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    await onRefetch();
    setGenerating(false);
    setPhase('');
  };

  const handleRegenerateImage = async (sceneId) => {
    setGenerating(true);
    setPhase('Regenerating...');
    try {
      await base44.entities.Scenes.update(sceneId, { status: 'prompts_ready', image_url: '' });
      await base44.functions.invoke('generateSceneImage', { scene_id: sceneId });
      await onRefetch();
    } catch (err) {
      console.error('Regen failed:', err);
    }
    setGenerating(false);
    setPhase('');
  };

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-white">
          <ImageIcon className="w-4 h-4 text-indigo-400" />
          Ambient Visuals
          <Badge className="bg-indigo-500/20 text-indigo-300 text-[10px]">
            {scenes.length > 0 ? `${scenes.length} images` : 'Topic-matched'}
          </Badge>
          {allImagesReady && <Badge className="bg-green-500/20 text-green-300 text-[10px] ml-1">Complete</Badge>}
          {generating && <Loader2 className="w-4 h-4 animate-spin text-indigo-400 ml-2" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {generating && phase && (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-indigo-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              {phase}
            </div>
            {scenes.length > 0 && (
              <div className="w-full bg-white/10 rounded-full h-1.5 mt-2">
                <div
                  className="bg-indigo-500 h-1.5 rounded-full transition-all duration-700"
                  style={{ width: `${scenes.length ? (imagesGenerated / scenes.length) * 100 : 0}%` }}
                />
              </div>
            )}
          </div>
        )}

        {!generating && !allImagesReady && scenes.length > 0 && imagesGenerated < scenes.length && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 mb-4">
            <p className="text-xs text-amber-300 mb-2">
              {imagesGenerated}/{scenes.length} images generated. Some may have failed.
            </p>
            <Button
              size="sm"
              onClick={handleFullGeneration}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry Missing
            </Button>
          </div>
        )}

        {scenes.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wider">
              Each image holds for several minutes with ultra-slow Ken Burns motion
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {scenes.map(scene => {
                let mood = '';
                let durationMin = 0;
                let topicMatch = '';
                if (scene.image_prompt?.startsWith('DIRECTOR_NOTES:')) {
                  try {
                    const notes = JSON.parse(scene.image_prompt.substring(15));
                    mood = notes.mood || '';
                    durationMin = notes.duration_minutes || 0;
                    topicMatch = notes.topic_match || '';
                  } catch (_) {}
                }
                const hasImage = scene.image_url && scene.image_url.startsWith('http');

                return (
                  <div key={scene.id} className="bg-white/5 rounded-lg overflow-hidden group">
                    {hasImage ? (
                      <div className="relative">
                        <img
                          src={scene.image_url}
                          alt={`Ambient ${scene.scene_number}`}
                          className="w-full aspect-video object-cover"
                        />
                        <button
                          onClick={() => handleRegenerateImage(scene.id)}
                          disabled={generating}
                          className="absolute top-1 right-1 bg-black/60 text-white/80 p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Regenerate"
                        >
                          <RefreshCw className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-full aspect-video bg-indigo-500/10 flex items-center justify-center">
                        {generating ? (
                          <Loader2 className="w-5 h-5 animate-spin text-indigo-400/50" />
                        ) : (
                          <Sparkles className="w-5 h-5 text-indigo-400/30" />
                        )}
                      </div>
                    )}
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-white/40">Image {scene.scene_number}</span>
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-white/30" />
                          <span className="text-[10px] text-white/50">
                            {durationMin > 0 ? `${durationMin.toFixed(0)}min` : `${(scene.duration_seconds / 60).toFixed(1)}min`}
                          </span>
                        </div>
                      </div>
                      {mood && (
                        <p className="text-[9px] text-indigo-300/60 truncate">{mood}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!generating && scenes.length === 0 && (
          <div className="text-center py-4">
            <Sparkles className="w-8 h-8 text-indigo-400/30 mx-auto mb-2" />
            <p className="text-sm text-white/40 mb-3">Generate dreamy, topic-matched ambient images</p>
            <Button size="sm" onClick={handleFullGeneration} className="bg-indigo-600 hover:bg-indigo-700">
              <ImageIcon className="w-3.5 h-3.5 mr-1" /> Generate Ambient Visuals
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}