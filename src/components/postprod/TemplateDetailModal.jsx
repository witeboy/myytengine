import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Star, X } from 'lucide-react';

export default function TemplateDetailModal({ template, open, onOpenChange }) {
  if (!template) return null;

  const sections = [
    { label: '🎬 Composition Blueprint', content: template.composition_blueprint },
    { label: '🎨 Color Strategy', content: template.color_strategy },
    { label: '📝 Text Strategy', content: template.text_strategy },
    { label: '🏃 Character Action Notes', content: template.character_action_notes },
    { label: '🔍 Full Forensic Analysis', content: template.forensic_description },
    { label: '🖼️ Recreate Prompt (Template)', content: template.recreate_prompt },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <div className="space-y-4">
          {/* Header with image */}
          <div className="flex gap-4">
            {template.thumbnail_image_url && (
              <div className="w-48 shrink-0">
                <img src={template.thumbnail_image_url} alt="" className="w-full rounded-lg shadow-md" />
              </div>
            )}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-amber-100 text-amber-700">
                  {(template.template_type || 'other').replace(/_/g, ' ')}
                </Badge>
                {template.emotional_tone && (
                  <Badge variant="outline">{template.emotional_tone}</Badge>
                )}
                {template.quality_score && (
                  <Badge className="bg-yellow-100 text-yellow-800 gap-1">
                    <Star className="w-3 h-3" /> {template.quality_score}/10
                  </Badge>
                )}
                {template.is_favorite && (
                  <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                )}
              </div>
              {template.niche_tags && (
                <div className="flex gap-1 flex-wrap">
                  {template.niche_tags.split(',').map((tag, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">{tag.trim()}</Badge>
                  ))}
                </div>
              )}
              {template.source_url && (
                <a href={template.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline truncate block">
                  {template.source_url}
                </a>
              )}
            </div>
          </div>

          {/* Sections */}
          {sections.map((s, i) => (
            s.content ? (
              <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="text-xs font-semibold text-gray-700">{s.label}</p>
                <p className="text-xs text-gray-600 whitespace-pre-wrap leading-relaxed">{s.content}</p>
              </div>
            ) : null
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}