import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Users, ChevronRight } from 'lucide-react';

export default function OngoingUGCProjects() {

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
        <p className="text-xs text-gray-500 mb-1">UGC projects are self-contained — start a new one anytime.</p>
        {projects.map(p => (
          <Link
            key={p.id}
            to={createPageUrl('UGCPipeline') + '?project_id=' + p.id}
            className="flex items-center justify-between bg-white rounded-lg border border-pink-100 px-3 py-2 hover:bg-pink-50 hover:border-pink-300 transition-colors cursor-pointer group"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Users className="w-4 h-4 text-pink-500 shrink-0" />
              <span className="text-sm font-medium truncate">{p.name}</span>
              <Badge variant="outline" className="text-[10px] shrink-0">
                {p.status?.replace(/_/g, ' ')}
              </Badge>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] text-gray-400">{new Date(p.created_date).toLocaleDateString()}</span>
              <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-pink-500 transition-colors" />
            </div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}