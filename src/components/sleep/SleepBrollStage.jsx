import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Clapperboard, Moon } from 'lucide-react';

export default function SleepBrollStage({ projectId, scenes, brollCount, brollDone, onRefetch }) {
  const [populating, setPopulating] = useState(false);
  const [autoStarted, setAutoStarted] = useState(false);

  // Auto-start b-roll population
  useEffect(() => {
    if (autoStarted || populating || brollCount > 0) return;
    if (scenes.length === 0) return;
    setAutoStarted(true);
    handlePopulate();
  }, [autoStarted, populating, brollCount, scenes.length]);

  const handlePopulate = async () => {
    setPopulating(true);
    try {
      await base44.functions.invoke('sleepBrollPopulate', { project_id: projectId });
      await onRefetch();
    } catch (err) {
      console.error('B-roll populate error:', err);
    } finally {
      setPopulating(false);
    }
  };

  const scenesWithBroll = scenes.filter(s => s.broll_url && s.broll_url.startsWith('http'));

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2 text-white">
          <Clapperboard className="w-4 h-4 text-indigo-400" />
          Sleep B-Roll
          <Badge className="bg-indigo-500/20 text-indigo-300 text-[10px]">
            <Moon className="w-3 h-3 mr-0.5" /> Dark & Ambient
          </Badge>
          {brollDone && <Badge className="bg-green-500/20 text-green-300 text-[10px] ml-2">Complete</Badge>}
          {populating && <Loader2 className="w-4 h-4 animate-spin text-indigo-400 ml-2" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {populating && (
          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2 text-sm text-indigo-300">
              <Loader2 className="w-4 h-4 animate-spin" />
              Searching dark nature & ambient footage...
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 text-xs text-white/50 mb-3">
          <span>{brollCount}/{scenes.length} scenes with B-roll</span>
          {brollDone && <span className="text-green-400">Ready for timeline</span>}
        </div>

        {scenesWithBroll.length > 0 && (
          <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 gap-2 max-h-48 overflow-y-auto">
            {scenesWithBroll.map(scene => (
              <div key={scene.id} className="relative">
                {scene.broll_thumbnail && scene.broll_thumbnail.startsWith('http') ? (
                  <img
                    src={scene.broll_thumbnail}
                    alt={`S${scene.scene_number}`}
                    className="w-full aspect-video rounded object-cover"
                  />
                ) : (
                  <div className="w-full aspect-video rounded bg-indigo-500/10 flex items-center justify-center">
                    <Moon className="w-4 h-4 text-indigo-400/50" />
                  </div>
                )}
                <span className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[8px] text-center py-0.5 rounded-b">
                  S{scene.scene_number}
                </span>
              </div>
            ))}
          </div>
        )}

        {!populating && brollCount < scenes.length && scenes.length > 0 && (
          <Button
            size="sm"
            onClick={handlePopulate}
            className="bg-indigo-600 hover:bg-indigo-700 mt-3"
          >
            <Clapperboard className="w-3.5 h-3.5 mr-1" />
            {brollCount > 0 ? 'Fill Remaining B-Roll' : 'Auto-Populate B-Roll'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}