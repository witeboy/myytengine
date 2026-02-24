import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Plus, Archive, BookOpen, Image, Film, FolderOpen, History, Users, RefreshCw, Search, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';

const STAGE_INFO = [
  { num: 1, label: 'Story', Icon: BookOpen, barClass: 'bg-blue-500', badgeClass: 'bg-blue-100 text-blue-800' },
  { num: 2, label: 'Content', Icon: Image, barClass: 'bg-purple-500', badgeClass: 'bg-purple-100 text-purple-800' },
  { num: 3, label: 'Timeline', Icon: Film, barClass: 'bg-green-500', badgeClass: 'bg-green-100 text-green-800' },
  { num: 4, label: 'Post Prod', Icon: Film, barClass: 'bg-orange-500', badgeClass: 'bg-orange-100 text-orange-800' },
];

function isUgcProject(project) {
  const ugcNiches = ['beauty_guru', 'tech_reviewer', 'fitness_coach', 'food_reviewer', 'lifestyle', 'fashion', 'travel', 'gaming'];
  return ugcNiches.includes(project.niche) || project.name?.startsWith('UGC:');
}

function isRepurposeProject(project) {
  return project.name?.startsWith('_repurpose_') || (project.tone && project.tone.length > 100);
}

function getStage(status) {
  if (['created', 'topics_ready', 'topic_selected', 'outline_ready', 'hooks_ready', 'scripting', 'script_complete'].includes(status)) return 1;
  if (['voiceover_ready', 'scene_breakdown', 'breakdown_complete', 'content_generation', 'scenes_ready'].includes(status)) return 2;
  if (['timeline_editing', 'compiled'].includes(status)) return 3;
  if (['post_production', 'published'].includes(status)) return 4;
  return 1;
}

function getRoute(project) {
  // UGC projects are self-contained (local state), just open the pipeline page
  if (isUgcProject(project)) return 'UGCPipeline';
  
  // Repurpose projects go to ContentGeneration (they skip repurpose flow once created)
  if (isRepurposeProject(project)) {
    const s = project.status;
    if (['timeline_editing', 'compiled'].includes(s)) return `TimelineEditor?project_id=${project.id}`;
    if (['post_production', 'published'].includes(s)) return `PostProduction?project_id=${project.id}`;
    return `ContentGeneration?project_id=${project.id}`;
  }

  const s = project.status;
  if (s === 'created' || s === 'topics_ready') return `StoryTopics?project_id=${project.id}`;
  if (s === 'topic_selected') return `StoryDuration?project_id=${project.id}`;
  if (s === 'outline_ready') return `StoryHooks?project_id=${project.id}`;
  if (s === 'hooks_ready' || s === 'scripting' || s === 'script_complete') return `StoryScript?project_id=${project.id}`;
  if (s === 'voiceover_ready' || s === 'scene_breakdown' || s === 'breakdown_complete') return `ContentGeneration?project_id=${project.id}`;
  if (s === 'content_generation' || s === 'scenes_ready') return `ContentGeneration?project_id=${project.id}`;
  if (s === 'timeline_editing' || s === 'compiled') return `TimelineEditor?project_id=${project.id}`;
  if (s === 'post_production' || s === 'published') return `PostProduction?project_id=${project.id}`;
  return `StoryTopics?project_id=${project.id}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: allProjects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Projects.list('-created_date'),
  });

  const projects = allProjects.filter(p => !p.archived);

  const archiveMutation = useMutation({
    mutationFn: (id) => base44.entities.Projects.update(id, { archived: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects'] }),
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">AI Video Engine</h1>
            <p className="text-gray-500 mt-1">Faceless YouTube content pipeline</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(createPageUrl('MediaLibrary'))}>
              <FolderOpen className="w-4 h-4 mr-2" /> Media Library
            </Button>
            <Button variant="outline" onClick={() => navigate(createPageUrl('UGCPipeline'))}>
              <Users className="w-4 h-4 mr-2" /> UGC Creator
            </Button>
            <Button variant="outline" onClick={() => navigate(createPageUrl('ContentRepurpose'))}>
              <RefreshCw className="w-4 h-4 mr-2" /> Repurpose
            </Button>
            <Button variant="outline" onClick={() => navigate(createPageUrl('ResearchTerminal'))}>
              <Search className="w-4 h-4 mr-2" /> Niche Research
            </Button>
            <Button variant="outline" onClick={() => navigate(createPageUrl('ChannelAuditor'))}>
              <Shield className="w-4 h-4 mr-2" /> Channel Auditor
            </Button>
            <Button onClick={() => navigate(createPageUrl('NewProject'))} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-5 h-5 mr-2" /> New Project
            </Button>
          </div>
        </div>

        {/* Stage Legend */}
        <div className="flex gap-6 mb-6 text-sm text-gray-500">
          {STAGE_INFO.map(s => (
            <div key={s.num} className="flex items-center gap-2">
              <s.Icon className="w-4 h-4" />
              Stage {s.num}: {s.label}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="bg-white rounded-xl h-48 animate-pulse" />)}
          </div>
        ) : projects.length === 0 ? (
          <Card className="text-center py-16">
            <p className="text-gray-500 mb-4">No projects yet</p>
            <Button onClick={() => navigate(createPageUrl('NewProject'))} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="w-4 h-4 mr-2" /> Create Your First Project
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {projects.map(project => {
              const stage = getStage(project.status);
              const info = STAGE_INFO[stage - 1];
              return (
                <Card
                  key={project.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer group"
                  onClick={() => navigate(createPageUrl(getRoute(project)))}
                >
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg group-hover:text-blue-600 transition-colors">{project.name}</CardTitle>
                        <p className="text-sm text-gray-500">{project.niche}</p>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={(e) => {
                          e.stopPropagation();
                          navigate(createPageUrl(`VersionHistory?project_id=${project.id}`));
                        }}>
                          <History className="w-4 h-4 text-gray-400" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(e) => {
                          e.stopPropagation();
                          if (confirm('Archive this project?')) archiveMutation.mutate(project.id);
                        }}>
                          <Archive className="w-4 h-4 text-gray-400" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Stage progress bars */}
                    <div className="flex items-center gap-1 mb-3">
                      {STAGE_INFO.map(s => (
                        <div
                          key={s.num}
                          className={`flex-1 h-2 rounded-full ${stage >= s.num ? s.barClass : 'bg-gray-200'}`}
                        />
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge className={info.badgeClass}>
                        Stage {stage}: {info.label}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {project.status?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    {project.video_duration_minutes && (
                      <p className="text-xs text-gray-400 mt-2">{project.video_duration_minutes} min video</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}