import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock, Users } from 'lucide-react';
import { createPageUrl } from '@/utils';

function getUGCRoute(project) {
  const s = project.status;
  if (['voiceover_ready', 'scene_breakdown', 'breakdown_complete', 'content_generation', 'scenes_ready'].includes(s)) {
    return `ContentGeneration?project_id=${project.id}`;
  }
  if (['timeline_editing', 'compiled'].includes(s)) {
    return `TimelineEditor?project_id=${project.id}`;
  }
  if (['post_production', 'published'].includes(s)) {
    return `PostProduction?project_id=${project.id}`;
  }
  // script_complete — voiceover was generated, project created, go to content gen
  if (s === 'script_complete') {
    return `ContentGeneration?project_id=${project.id}`;
  }
  // Fallback — created / early status, not much to resume
  return `ContentGeneration?project_id=${project.id}`;
}

export default function OngoingUGCProjects() {
  const navigate = useNavigate();

  const { data: projects = [] } = useQuery({
    queryKey: ['ugc-projects'],
    queryFn: async () => {
      const all = await base44.entities.Projects.list('-created_date', 50);
      return all.filter(p => {
        if (p.archived) return false;
        const ugcNiches = ['beauty_guru', 'tech_reviewer', 'fitness_coach', 'food_reviewer', 'lifestyle', 'fashion', 'travel', 'gaming', 'food_creator', 'business', 'education'];
        return ugcNiches.includes(p.niche) || p.name?.startsWith('UGC:');
      });
    },
  });

  if (projects.length === 0) return null;

  return (
    <Card className="border-pink-200 bg-pink-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-pink-800">
          <Clock className="w-4 h-4" /> Your UGC Projects
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {projects.map(p => (
          <div
            key={p.id}
            onClick={() => navigate(createPageUrl(getUGCRoute(p)))}
            className="flex items-center justify-between bg-white rounded-lg border border-pink-100 px-3 py-2 cursor-pointer hover:border-pink-300 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-4 h-4 text-pink-500 shrink-0" />
              <span className="text-sm font-medium truncate">{p.name}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {p.status?.replace(/_/g, ' ')}
              </Badge>
            </div>
            <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}