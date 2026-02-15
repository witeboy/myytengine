import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Plus, Library, Sparkles, ChevronRight, Image as ImageIcon,
  CheckCircle2, Eye, Trash2, Dna
} from 'lucide-react';
import CreateNicheDialog from './CreateNicheDialog';
import NicheDetailPanel from './NicheDetailPanel';

export default function NicheManager({ onSelectNiche, selectedNicheId }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [expandedNiche, setExpandedNiche] = useState(null);

  const { data: niches = [], refetch: refetchNiches, isLoading } = useQuery({
    queryKey: ['thumbnail-niches'],
    queryFn: () => base44.entities.ThumbnailNiches.list('-created_date', 50),
  });

  const handleSelect = (niche) => {
    if (selectedNicheId === niche.id) {
      onSelectNiche?.(null);
    } else {
      onSelectNiche?.(niche);
    }
  };

  return (
    <Card className="border-dashed border-2 border-amber-200 bg-amber-50/30">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Library className="w-4 h-4 text-amber-600" />
            Niche Template Library
            {niches.length > 0 && (
              <Badge variant="secondary" className="text-xs">{niches.length} niches</Badge>
            )}
          </CardTitle>
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
            <Plus className="w-3.5 h-3.5" /> Create Niche
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Create niches, feed them world-class thumbnails, then select a niche to generate thumbnails in that exact style.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <div className="text-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-amber-600 mx-auto" />
          </div>
        )}

        {!isLoading && niches.length === 0 && (
          <div className="text-center py-8">
            <Library className="w-10 h-10 text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 mb-1">No niches yet</p>
            <p className="text-xs text-gray-400 mb-3">Create a niche like "Sports", "Storytelling", "Finance" and feed it thumbnails</p>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Create Your First Niche
            </Button>
          </div>
        )}

        {niches.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {niches.map(niche => (
              <div
                key={niche.id}
                className={`rounded-xl border-2 p-4 cursor-pointer transition-all hover:shadow-md ${
                  selectedNicheId === niche.id
                    ? 'border-green-500 bg-green-50 ring-2 ring-green-200 shadow-lg'
                    : 'border-gray-200 bg-white hover:border-amber-300'
                }`}
                onClick={() => handleSelect(niche)}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{niche.icon || '📁'}</span>
                    <div>
                      <p className="font-semibold text-sm">{niche.name}</p>
                      <p className="text-[11px] text-gray-500">{niche.template_count || 0} thumbnails fed</p>
                    </div>
                  </div>
                  {selectedNicheId === niche.id && (
                    <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  )}
                </div>

                {niche.description && (
                  <p className="text-xs text-gray-500 mb-2 line-clamp-2">{niche.description}</p>
                )}

                <div className="flex items-center gap-1.5 flex-wrap">
                  {niche.synthesized_dna && (
                    <Badge className="bg-purple-100 text-purple-700 text-[10px] gap-0.5">
                      <Dna className="w-2.5 h-2.5" /> DNA Ready
                    </Badge>
                  )}
                  {!niche.synthesized_dna && (niche.template_count || 0) > 0 && (
                    <Badge className="bg-amber-100 text-amber-700 text-[10px]">
                      Needs Synthesis
                    </Badge>
                  )}
                  {(!niche.template_count || niche.template_count === 0) && (
                    <Badge variant="outline" className="text-[10px]">Empty</Badge>
                  )}
                </div>

                <div className="flex gap-1.5 mt-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs flex-1 gap-1"
                    onClick={e => { e.stopPropagation(); setExpandedNiche(niche); }}
                  >
                    <Eye className="w-3 h-3" /> Manage
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedNicheId && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-800">
              Niche selected — "Generate from Script" will use this niche's learned style DNA.
              <button className="text-green-600 underline ml-2 text-xs" onClick={() => onSelectNiche?.(null)}>Clear</button>
            </p>
          </div>
        )}
      </CardContent>

      <CreateNicheDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refetchNiches} />
      {expandedNiche && (
        <NicheDetailPanel
          niche={expandedNiche}
          open={!!expandedNiche}
          onOpenChange={o => { if (!o) setExpandedNiche(null); }}
          onUpdate={() => { refetchNiches(); setExpandedNiche(null); }}
        />
      )}
    </Card>
  );
}