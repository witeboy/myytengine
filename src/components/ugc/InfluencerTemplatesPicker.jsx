import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Star, Trash2, User, ChevronDown, ChevronUp, Zap, Mic, Target, Heart, MessageCircle, DollarSign } from "lucide-react";

function TemplateDetailPanel({ template }) {
  let phrases = [];
  try { phrases = JSON.parse(template.voice_phrases || "[]"); } catch {}
  let trustSignals = [];
  try { trustSignals = JSON.parse(template.trust_signals || "[]"); } catch {}

  return (
    <div className="mt-2 pt-2 border-t space-y-2 text-[11px]">
      {template.archetype && (
        <div className="flex items-start gap-1.5">
          <Zap className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
          <div><span className="font-medium text-gray-700">Archetype:</span> <span className="text-gray-600">{template.archetype}</span></div>
        </div>
      )}
      {template.energy && (
        <div className="flex items-start gap-1.5">
          <Heart className="w-3 h-3 text-pink-500 mt-0.5 flex-shrink-0" />
          <div><span className="font-medium text-gray-700">Energy:</span> <span className="text-gray-600">{template.energy}</span></div>
        </div>
      )}
      {template.voice_style && (
        <div className="flex items-start gap-1.5">
          <Mic className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
          <div><span className="font-medium text-gray-700">Voice:</span> <span className="text-gray-600">{template.voice_style}</span></div>
        </div>
      )}
      {phrases.length > 0 && (
        <div className="flex items-start gap-1.5">
          <MessageCircle className="w-3 h-3 text-purple-500 mt-0.5 flex-shrink-0" />
          <div className="flex flex-wrap gap-1">
            {phrases.map((p, i) => (
              <span key={i} className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded text-[10px] italic">"{p}"</span>
            ))}
          </div>
        </div>
      )}
      {template.target_audience && (
        <div className="flex items-start gap-1.5">
          <Target className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
          <div><span className="font-medium text-gray-700">Audience:</span> <span className="text-gray-600">{template.target_audience}</span></div>
        </div>
      )}
      {template.monetization_fit && (
        <div className="flex items-start gap-1.5">
          <DollarSign className="w-3 h-3 text-green-600 mt-0.5 flex-shrink-0" />
          <div><span className="font-medium text-gray-700">Monetization:</span> <span className="text-gray-600">{template.monetization_fit}</span></div>
        </div>
      )}
      {trustSignals.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {trustSignals.map((s, i) => (
            <Badge key={i} variant="outline" className="text-[9px] bg-green-50 text-green-700 border-green-200">{s}</Badge>
          ))}
        </div>
      )}
      {template.content_structure && (
        <p className="text-[10px] text-gray-500 bg-gray-50 rounded p-1.5">{template.content_structure}</p>
      )}
      {template.flaws && (
        <p className="text-[10px] text-orange-600 italic">Flaws: {template.flaws}</p>
      )}
    </div>
  );
}

export default function InfluencerTemplatesPicker({ onSelect }) {
  const [expandedId, setExpandedId] = useState(null);
  const { data: templates, isLoading, refetch } = useQuery({
    queryKey: ["influencer-templates"],
    queryFn: () => base44.entities.InfluencerTemplates.list("-created_date", 50),
    initialData: [],
  });

  const handleDelete = async (e, id) => {
    e.stopPropagation();
    await base44.entities.InfluencerTemplates.delete(id);
    refetch();
  };

  const toggleExpand = (e, id) => {
    e.stopPropagation();
    setExpandedId(prev => prev === id ? null : id);
  };

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>;
  if (!templates.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Saved Influencer Templates</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {templates.map(t => (
          <Card key={t.id} className="group cursor-pointer hover:shadow-md transition-all overflow-hidden" onClick={() => onSelect(t)}>
            <CardContent className="p-2.5">
              <div className="flex gap-2">
                {t.base_image_url ? (
                  <img src={t.base_image_url} alt={t.name} className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-md bg-gradient-to-br from-pink-100 to-rose-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-pink-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-semibold truncate">{t.name}</p>
                    {t.is_favorite && <Star className="w-3 h-3 text-amber-400 fill-amber-400 flex-shrink-0" />}
                  </div>
                  <p className="text-[10px] text-gray-500">{t.gender} · {t.skin_tone} · {t.ethnicity || "—"}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    {t.influencer_type && <Badge variant="outline" className="text-[8px]">{t.influencer_type}</Badge>}
                    {t.energy && <Badge className="text-[8px] bg-pink-50 text-pink-600 border-pink-200" variant="outline">{t.energy.split('.')[0]}</Badge>}
                  </div>
                </div>
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={(e) => toggleExpand(e, t.id)}>
                    {expandedId === t.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={(e) => handleDelete(e, t.id)}>
                    <Trash2 className="w-3 h-3 text-red-400" />
                  </Button>
                </div>
              </div>
              {expandedId === t.id && <TemplateDetailPanel template={t} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}