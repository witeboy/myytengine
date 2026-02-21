import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Star, Trash2, User } from "lucide-react";

export default function InfluencerTemplatesPicker({ onSelect }) {
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

  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-gray-400" /></div>;
  if (!templates.length) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Saved Influencer Templates</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {templates.map(t => (
          <Card key={t.id} className="group cursor-pointer hover:shadow-md transition-all overflow-hidden" onClick={() => onSelect(t)}>
            <CardContent className="p-2">
              <div className="flex gap-2">
                {t.base_image_url ? (
                  <img src={t.base_image_url} alt={t.name} className="w-12 h-12 rounded-md object-cover flex-shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center flex-shrink-0">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold truncate">{t.name}</p>
                  <p className="text-[10px] text-gray-500">{t.gender} · {t.skin_tone} · {t.ethnicity || "—"}</p>
                  {t.influencer_type && <Badge variant="outline" className="text-[8px] mt-0.5">{t.influencer_type}</Badge>}
                </div>
                <Button size="icon" variant="ghost" className="h-5 w-5 opacity-0 group-hover:opacity-100 flex-shrink-0" onClick={(e) => handleDelete(e, t.id)}>
                  <Trash2 className="w-3 h-3 text-red-400" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}