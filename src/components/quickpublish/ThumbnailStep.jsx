import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, CheckCircle2, RefreshCw, Image } from 'lucide-react';

export default function ThumbnailStep({ projectId, thumbnails, onRefetch, selectedThumbnailUrl, onSelect }) {
  const [generating, setGenerating] = useState(false);
  const [generatingImageId, setGeneratingImageId] = useState(null);

  const sortedThumbs = [...thumbnails].sort((a, b) => (a.rank || 0) - (b.rank || 0));
  const selectedThumb = sortedThumbs.find(t => t.is_selected);

  const handleGenerateImage = async (concept) => {
    setGeneratingImageId(concept.id);
    try {
      const res = await base44.functions.invoke('generateThumbnailImage', { concept_id: concept.id });
      const data = res.data;
      if (data.pending && data.task_id) {
        const taskType = data.task_type || 'kie';
        for (let i = 0; i < 30; i++) {
          await new Promise(r => setTimeout(r, 5000));
          const pollRes = await base44.functions.invoke('pollThumbnailTask', {
            task_id: data.task_id, concept_id: concept.id, task_type: taskType,
          });
          if (pollRes.data.completed) break;
        }
      }
      await onRefetch();
    } catch (e) {
      console.error('Thumbnail image gen failed:', e.message);
    }
    setGeneratingImageId(null);
  };

  const handleSelect = async (concept) => {
    try {
      await Promise.all(sortedThumbs.map(t =>
        base44.entities.ThumbnailConcepts.update(t.id, { is_selected: t.id === concept.id })
      ));
      onSelect(concept.image_url);
      await onRefetch();
    } catch (e) {
      console.error('Select failed:', e);
    }
  };

  if (thumbnails.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <Image className="w-10 h-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">Thumbnails will appear here after generation</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{thumbnails.length} concepts</span>
        {selectedThumb && (
          <Badge className="bg-green-100 text-green-700 text-xs">
            <CheckCircle2 className="w-3 h-3 mr-1" /> #{selectedThumb.rank} selected
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {sortedThumbs.slice(0, 6).map(concept => (
          <div
            key={concept.id}
            className={`rounded-lg border overflow-hidden transition-all cursor-pointer ${
              concept.is_selected ? 'ring-2 ring-green-500 shadow-md' : 'hover:shadow-md'
            }`}
          >
            {concept.image_url ? (
              <div onClick={() => handleSelect(concept)}>
                <img src={concept.image_url} className="w-full aspect-video object-cover" alt={`Thumb #${concept.rank}`} />
                <div className="p-2 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">#{concept.rank}</span>
                  {concept.is_selected ? (
                    <Badge className="bg-green-100 text-green-700 text-[10px]">Selected</Badge>
                  ) : (
                    <span className="text-[10px] text-blue-600 font-medium">Click to select</span>
                  )}
                </div>
              </div>
            ) : (
              <div className="aspect-video bg-gray-100 flex flex-col items-center justify-center p-3">
                {generatingImageId === concept.id ? (
                  <>
                    <Loader2 className="w-6 h-6 text-purple-500 animate-spin mb-2" />
                    <p className="text-[10px] text-gray-500">Generating...</p>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => handleGenerateImage(concept)} className="text-xs gap-1">
                    <Sparkles className="w-3 h-3" /> Generate
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}