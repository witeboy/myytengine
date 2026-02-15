import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Loader2, Plus, Star, StarOff, Trash2, Eye, Upload, Link2, Image as ImageIcon,
  CheckCircle2, Library, X, ChevronDown, ChevronUp
} from 'lucide-react';
import TemplateFeedDialog from './TemplateFeedDialog';
import TemplateDetailModal from './TemplateDetailModal';

export default function TemplateLibrary({ onSelectTemplate }) {
  const [feedOpen, setFeedOpen] = useState(false);
  const [detailTemplate, setDetailTemplate] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  const categoryLabels = {
    sports: '🏆 Sports',
    storytelling: '📖 Storytelling',
    finance: '💰 Finance',
    health_fitness: '💪 Health & Fitness',
    motivation: '🔥 Motivation',
    true_crime: '🔍 True Crime',
    tech: '💻 Tech',
    education: '📚 Education',
    entertainment: '🎬 Entertainment',
    other: '📌 Other',
  };

  const { data: templates = [], refetch, isLoading } = useQuery({
    queryKey: ['thumbnail-templates'],
    queryFn: () => base44.entities.ThumbnailTemplates.list('-created_date', 100),
  });

  const handleToggleFavorite = async (t) => {
    await base44.entities.ThumbnailTemplates.update(t.id, { is_favorite: !t.is_favorite });
    refetch();
  };

  const handleDelete = async (t) => {
    await base44.entities.ThumbnailTemplates.delete(t.id);
    refetch();
  };

  const handleSelect = (t) => {
    if (selectedId === t.id) {
      setSelectedId(null);
      onSelectTemplate?.(null);
    } else {
      setSelectedId(t.id);
      onSelectTemplate?.(t);
    }
  };

  const typeColors = {
    face_off: 'bg-red-100 text-red-700',
    centered_hero: 'bg-blue-100 text-blue-700',
    the_reveal: 'bg-purple-100 text-purple-700',
    the_contrast: 'bg-amber-100 text-amber-700',
    the_reaction: 'bg-green-100 text-green-700',
    bold_statement: 'bg-pink-100 text-pink-700',
    the_mystery: 'bg-indigo-100 text-indigo-700',
    the_warning: 'bg-orange-100 text-orange-700',
    before_after: 'bg-cyan-100 text-cyan-700',
    other: 'bg-gray-100 text-gray-700',
  };

  const filtered = templates.filter(t => {
    if (filterType === 'favorites' && !t.is_favorite) return false;
    if (filterType !== 'all' && filterType !== 'favorites' && t.template_type !== filterType) return false;
    if (filterCategory !== 'all' && t.library_category !== filterCategory) return false;
    return true;
  });

  return (
    <Card className="border-dashed border-2 border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Library className="w-4 h-4 text-amber-600" />
            Template Library
            {templates.length > 0 && (
              <Badge variant="secondary" className="text-xs">{templates.length} templates</Badge>
            )}
          </CardTitle>
          <Button size="sm" onClick={() => setFeedOpen(true)} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
            <Plus className="w-3.5 h-3.5" /> Feed Thumbnails
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {templates.length === 0 && !isLoading && (
          <div className="text-center py-6">
            <ImageIcon className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 mb-1">No templates yet</p>
            <p className="text-xs text-gray-400">Feed world-class thumbnails to build your template library</p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-amber-600 mx-auto" />
          </div>
        )}

        {templates.length > 0 && (
          <>
            {/* Category filter bar */}
            <div className="space-y-2">
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-gray-400 uppercase self-center mr-1">Niche:</span>
                <Button size="sm" variant={filterCategory === 'all' ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setFilterCategory('all')}>
                  All Niches
                </Button>
                {[...new Set(templates.map(t => t.library_category).filter(Boolean))].map(cat => (
                  <Button key={cat} size="sm" variant={filterCategory === cat ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setFilterCategory(cat)}>
                    {categoryLabels[cat] || cat}
                    <Badge variant="secondary" className="text-[9px] ml-1 px-1">{templates.filter(t => t.library_category === cat).length}</Badge>
                  </Button>
                ))}
              </div>
              {/* Composition type filter */}
              <div className="flex gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-gray-400 uppercase self-center mr-1">Type:</span>
                <Button size="sm" variant={filterType === 'all' ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setFilterType('all')}>
                  All
                </Button>
                <Button size="sm" variant={filterType === 'favorites' ? 'default' : 'outline'} className="text-xs h-7 gap-1" onClick={() => setFilterType('favorites')}>
                  <Star className="w-3 h-3" /> Favorites
                </Button>
                {[...new Set(templates.map(t => t.template_type))].filter(Boolean).map(type => (
                  <Button key={type} size="sm" variant={filterType === type ? 'default' : 'outline'} className="text-xs h-7" onClick={() => setFilterType(type)}>
                    {type.replace(/_/g, ' ')}
                  </Button>
                ))}
              </div>
            </div>

            {/* Template grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {filtered.map(t => (
                <div
                  key={t.id}
                  className={`relative group rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${
                    selectedId === t.id ? 'border-green-500 ring-2 ring-green-200 shadow-lg' : 'border-transparent hover:border-amber-300'
                  }`}
                  onClick={() => handleSelect(t)}
                >
                  <div className="aspect-video bg-gray-100">
                    {t.thumbnail_image_url ? (
                      <img src={t.thumbnail_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        <ImageIcon className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Overlay controls */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-end opacity-0 group-hover:opacity-100">
                    <div className="w-full p-1.5 flex gap-1">
                      <Button size="sm" variant="secondary" className="h-6 px-1.5 text-[10px]" onClick={e => { e.stopPropagation(); setDetailTemplate(t); }}>
                        <Eye className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="secondary" className="h-6 px-1.5 text-[10px]" onClick={e => { e.stopPropagation(); handleToggleFavorite(t); }}>
                        {t.is_favorite ? <Star className="w-3 h-3 fill-amber-500 text-amber-500" /> : <StarOff className="w-3 h-3" />}
                      </Button>
                      <Button size="sm" variant="destructive" className="h-6 px-1.5 text-[10px] ml-auto" onClick={e => { e.stopPropagation(); handleDelete(t); }}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Selected check */}
                  {selectedId === t.id && (
                    <div className="absolute top-1 right-1 bg-green-500 text-white rounded-full p-0.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    </div>
                  )}

                  {/* Category + Type badges */}
                  <div className="absolute top-1 left-1 flex flex-col gap-0.5">
                    {t.library_category && t.library_category !== 'other' && (
                      <Badge className="text-[8px] px-1 py-0 bg-white/90 text-gray-700 border border-gray-200">
                        {categoryLabels[t.library_category] || t.library_category}
                      </Badge>
                    )}
                    <Badge className={`text-[9px] px-1 py-0 ${typeColors[t.template_type] || typeColors.other}`}>
                      {(t.template_type || 'other').replace(/_/g, ' ')}
                    </Badge>
                  </div>

                  {t.is_favorite && (
                    <Star className="absolute top-1 right-1 w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  )}
                </div>
              ))}
            </div>

            {selectedId && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <p className="text-sm text-green-800">
                  Template selected — "Generate from Script" will use this composition as a blueprint.
                  <button className="text-green-600 underline ml-2 text-xs" onClick={() => { setSelectedId(null); onSelectTemplate?.(null); }}>Clear</button>
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>

      <TemplateFeedDialog open={feedOpen} onOpenChange={setFeedOpen} onComplete={refetch} />
      <TemplateDetailModal template={detailTemplate} open={!!detailTemplate} onOpenChange={o => { if (!o) setDetailTemplate(null); }} />
    </Card>
  );
}