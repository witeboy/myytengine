import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock, RefreshCw } from 'lucide-react';
import { createPageUrl } from '@/utils';

function getRepurposeRoute(project) {
  const s = project.status;
  // Repurpose projects that reached script_complete go straight to ContentGeneration
  if (['voiceover_ready', 'scene_breakdown', 'breakdown_complete', 'content_generation', 'scenes_ready'].includes(s)) {
    return `ContentGeneration?project_id=${project.id}`;
  }
  if (['timeline_editing', 'compiled'].includes(s)) {
    return `TimelineEditor?project_id=${project.id}`;
  }
  if (['post_production', 'published'].includes(s)) {
    return `PostProduction?project_id=${project.id}`;
  }
  // script_complete or earlier — still in repurpose flow or content gen
  if (s === 'script_complete') {
    return `ContentGeneration?project_id=${project.id}`;
  }
  return `ContentGeneration?project_id=${project.id}`;
}

export default function OngoingRepurposeProjects() {
  const navigate = useNavigate();

  const { data: projects = [] } = useQuery({
    queryKey: ['repurpose-projects'],
    queryFn: async () => {
      const all = await base44.entities.Projects.list('-created_date', 50);
      // Repurpose projects are created via ContentRepurpose pipeline
      // They have status >= script_complete and are NOT UGC and NOT archived temp projects
      return all.filter(p => {
        if (p.archived) return false;
        if (p.name?.startsWith('_repurpose_temp_')) return false;
        const ugcNiches = ['beauty_guru', 'tech_reviewer', 'fitness_coach', 'food_reviewer', 'lifestyle', 'fashion', 'travel', 'gaming', 'food_creator', 'business', 'education'];
        if (ugcNiches.includes(p.niche) || p.name?.startsWith('UGC:')) return false;
        // Identify repurpose projects — they don't go through topics flow, they jump to script_complete
        // Heuristic: created with script_complete status and no selected_topic_id
        if (!p.selected_topic_id && p.status && p.status !== 'created') return true;
        return false;
      });
    },
  });

  if (projects.length === 0) return null;

  return (
    <Card className="border-emerald-200 bg-emerald-50/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
          <Clock className="w-4 h-4" /> Your Repurposed Projects
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {projects.map(p => (
          <div
            key={p.id}
            onClick={() => navigate(createPageUrl(getRepurposeRoute(p)))}
            className="flex items-center justify-between bg-white rounded-lg border border-emerald-100 px-3 py-2 cursor-pointer hover:border-emerald-300 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <RefreshCw className="w-4 h-4 text-emerald-500 shrink-0" />
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