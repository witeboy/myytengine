import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Archive } from 'lucide-react';

const STAGES = [
  { label: 'Story', barClass: 'bg-blue-500', badgeClass: 'bg-blue-100 text-blue-800' },
  { label: 'Content', barClass: 'bg-purple-500', badgeClass: 'bg-purple-100 text-purple-800' },
  { label: 'Timeline', barClass: 'bg-green-500', badgeClass: 'bg-green-100 text-green-800' },
  { label: 'Post Prod', barClass: 'bg-orange-500', badgeClass: 'bg-orange-100 text-orange-800' },
];

function getStage(status) {
  if (['created', 'topics_ready', 'topic_selected', 'outline_ready', 'hooks_ready', 'scripting', 'script_complete'].includes(status)) return 1;
  if (['voiceover_ready', 'scene_breakdown', 'breakdown_complete', 'content_generation', 'scenes_ready'].includes(status)) return 2;
  if (['timeline_editing', 'compiled'].includes(status)) return 3;
  if (['post_production', 'published'].includes(status)) return 4;
  return 1;
}

function getRoute(project) {
  if (project.project_mode === 'progression' || project.name?.startsWith('_flow_')) return `FlowRemake?project_id=${project.id}`;
  if (project.name?.startsWith('UGC:')) return `UGCPipeline?project_id=${project.id}`;
  if (project.name?.startsWith('_repurpose_')) {
    const s = project.status;
    if (['timeline_editing', 'compiled'].includes(s)) return `TimelineEditor?project_id=${project.id}`;
    if (['post_production', 'published'].includes(s)) return `PostProduction?project_id=${project.id}`;
    return `ContentGeneration?project_id=${project.id}`;
  }
  const s = project.status;
  if (s === 'created' || s === 'topics_ready') return `StoryTopics?project_id=${project.id}`;
  if (s === 'topic_selected') return `StoryDuration?project_id=${project.id}`;
  if (s === 'outline_ready') return `StoryHooks?project_id=${project.id}`;
  if (['hooks_ready', 'scripting', 'script_complete'].includes(s)) return `StoryScript?project_id=${project.id}`;
  if (['voiceover_ready', 'scene_breakdown', 'breakdown_complete', 'content_generation', 'scenes_ready'].includes(s)) return `ContentGeneration?project_id=${project.id}`;
  if (['timeline_editing', 'compiled'].includes(s)) return `TimelineEditor?project_id=${project.id}`;
  if (['post_production', 'published'].includes(s)) return `PostProduction?project_id=${project.id}`;
  return `StoryTopics?project_id=${project.id}`;
}

export default function ActiveProjectsStrip({ projects, onArchive }) {
  const active = projects.filter(p => !p.archived).slice(0, 8);

  if (active.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Active Projects</h3>
        <span className="text-xs text-gray-400">{active.length} project{active.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {active.map(p => {
          const stage = getStage(p.status);
          const info = STAGES[stage - 1];
          return (
            <Link key={p.id} to={`/${getRoute(p)}`} className="block">
              <Card className="hover:shadow-md transition-all cursor-pointer group border-gray-100">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-800 group-hover:text-blue-600 transition-colors truncate flex-1">{p.name}</h4>
                    <button
                      onClick={(e) => { e.stopPropagation(); e.preventDefault(); onArchive(p.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity ml-2"
                    >
                      <Archive className="w-3.5 h-3.5 text-gray-400 hover:text-red-500" />
                    </button>
                  </div>
                  <div className="flex gap-0.5 mb-2">
                    {STAGES.map((s, i) => (
                      <div key={i} className={`flex-1 h-1.5 rounded-full ${stage > i ? s.barClass : 'bg-gray-200'}`} />
                    ))}
                  </div>
                  <div className="flex items-center justify-between">
                    <Badge className={`text-[9px] ${info.badgeClass}`}>{info.label}</Badge>
                    <span className="text-[10px] text-gray-400">{p.status?.replace(/_/g, ' ')}</span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}