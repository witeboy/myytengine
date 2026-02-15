import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, Sparkles, CheckCircle2, Image as ImageIcon, Star, Eye, X } from 'lucide-react';

export default function ThumbnailGrid({ thumbnails, projectId, onRefetch }) {
  const [generatingImage, setGeneratingImage] = useState(null);
  const [selecting, setSelecting] = useState(null);
  const [previewThumb, setPreviewThumb] = useState(null);

  const handleGenerateImage = async (thumb) => {
    setGeneratingImage(thumb.id);
    const { url } = await base44.integrations.Core.GenerateImage({
      prompt: thumb.image_prompt,
    });
    await base44.entities.ThumbnailConcepts.update(thumb.id, { image_url: url });
    onRefetch();
    setGeneratingImage(null);
  };

  const handleSelect = async (thumb) => {
    setSelecting(thumb.id);
    // Deselect all others
    for (const t of thumbnails) {
      if (t.is_selected && t.id !== thumb.id) {
        await base44.entities.ThumbnailConcepts.update(t.id, { is_selected: false });
      }
    }
    await base44.entities.ThumbnailConcepts.update(thumb.id, { is_selected: !thumb.is_selected });
    onRefetch();
    setSelecting(null);
  };

  const sorted = [...thumbnails].sort((a, b) => a.rank - b.rank);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {sorted.map(thumb => (
        <Card
          key={thumb.id}
          className={`overflow-hidden transition-all ${thumb.is_selected ? 'ring-2 ring-green-500 shadow-lg' : 'hover:shadow-md'}`}
        >
          {/* Image area */}
          <div className="aspect-video bg-gray-100 relative">
            {thumb.image_url ? (
              <img src={thumb.image_url} alt={thumb.concept_description} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                <ImageIcon className="w-8 h-8" />
                <span className="text-xs">No image yet</span>
              </div>
            )}
            {thumb.is_selected && (
              <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full p-1">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            )}
            <Badge className="absolute top-2 left-2 bg-black/70 text-white text-xs">
              #{thumb.rank}
            </Badge>
          </div>

          <CardContent className="p-4 space-y-3">
            <p className="text-sm font-medium line-clamp-2">{thumb.concept_description}</p>

            <div className="flex flex-wrap gap-1.5">
              <Badge variant="outline" className="text-xs">{thumb.style_reference}</Badge>
              {thumb.text_overlay && (
                <Badge variant="secondary" className="text-xs">"{thumb.text_overlay}"</Badge>
              )}
              <Badge className="bg-amber-100 text-amber-800 text-xs gap-1">
                <Star className="w-3 h-3" /> CTR {thumb.ctr_score}/10
              </Badge>
            </div>

            {thumb.visual_metaphor && (
              <p className="text-xs text-gray-500">Metaphor: {thumb.visual_metaphor}</p>
            )}

            <div className="flex gap-2">
              <Button
                size="sm"
                variant={thumb.image_url ? 'outline' : 'default'}
                className="flex-1 gap-1"
                onClick={() => handleGenerateImage(thumb)}
                disabled={generatingImage === thumb.id}
              >
                {generatingImage === thumb.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Sparkles className="w-3 h-3" />
                )}
                {thumb.image_url ? 'Regenerate' : 'Generate'}
              </Button>
              <Button
                size="sm"
                variant={thumb.is_selected ? 'default' : 'outline'}
                className={`flex-1 gap-1 ${thumb.is_selected ? 'bg-green-600 hover:bg-green-700' : ''}`}
                onClick={() => handleSelect(thumb)}
                disabled={selecting === thumb.id || !thumb.image_url}
              >
                {selecting === thumb.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3 h-3" />
                )}
                {thumb.is_selected ? 'Selected' : 'Select'}
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}