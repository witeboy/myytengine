import React from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { PenLine, Mic, Clapperboard, Film, Wand2, CheckCircle2 } from 'lucide-react';

const STAGES = [
  { key: 'script',   label: 'Scriptwriting',    icon: PenLine,      color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-100',
    statuses: ['created', 'topics_ready', 'topic_selected', 'outline_ready', 'hooks_ready', 'scripting', 'script_complete'] },
  { key: 'voice',    label: 'Voiceover',        icon: Mic,          color: 'text-rose-600',    bg: 'bg-rose-50 border-rose-100',
    statuses: ['voiceover_ready'] },
  { key: 'scenes',   label: 'Scene Production', icon: Clapperboard, color: 'text-purple-600',  bg: 'bg-purple-50 border-purple-100',
    statuses: ['scene_breakdown', 'breakdown_complete', 'content_generation', 'scenes_ready'] },
  { key: 'edit',     label: 'Timeline Editing', icon: Film,         color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100',
    statuses: ['timeline_editing', 'compiled'] },
  { key: 'post',     label: 'Post-Production',  icon: Wand2,        color: 'text-orange-600',  bg: 'bg-orange-50 border-orange-100',
    statuses: ['post_production'] },
  { key: 'done',     label: 'Published',        icon: CheckCircle2, color: 'text-gray-600',    bg: 'bg-gray-50 border-gray-200',
    statuses: ['published'] },
];

function getRoute(p) {
  if (p.project_mode === 'progression' || p.name?.startsWith('_flow_')) return `FlowRemake?project_id=${p.id}`;
  if (p.name?.startsWith('UGC:')) return `UGCPipeline?project_id=${p.id}`;
  const s = p.status;
  if (s === 'created' || s === 'topics_ready') return `StoryTopics?project_id=${p.id}`;
  if (s === 'topic_selected') return `StoryDuration?project_id=${p.id}`;
  if (s === 'outline_ready') return `StoryHooks?project_id=${p.id}`;
  if (['hooks_ready', 'scripting'].includes(s)) return `StoryScript?project_id=${p.id}`;
  if (['timeline_editing', 'compiled'].includes(s)) return `TimelineEditor?project_id=${p.id}`;
  if (['post_production', 'published'].includes(s)) return `PostProduction?project_id=${p.id}`;
  return `ContentGeneration?project_id=${p.id}`;
}

export default function ProjectStatusBoard({ projects = [] }) {
  const active = projects.filter(p => !p.archived);
  if (!active.length) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Production Status Board</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {STAGES.map(stage => {
          const items = active.filter(p => stage.statuses.includes(p.status));
          const Icon = stage.icon;
          return (
            <div key={stage.key} className={`rounded-xl border ${stage.bg} p-3 flex flex-col min-h-[140px]`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Icon className={`w-3.5 h-3.5 ${stage.color}`} />
                  <span className="text-xs font-semibold text-gray-700">{stage.label}</span>
                </div>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-white text-gray-500 border-gray-200">
                  {items.length}
                </Badge>
              </div>
              <div className="space-y-1.5 flex-1">
                {items.length === 0 ? (
                  <p className="text-[10px] text-gray-400 italic">No projects</p>
                ) : items.slice(0, 5).map(p => (
                  <Link
                    key={p.id}
                    to={`/${getRoute(p)}`}
                    className="block bg-white rounded-lg border border-gray-100 px-2 py-1.5 hover:shadow-sm hover:border-gray-300 transition-all"
                  >
                    <p className="text-[11px] font-medium text-gray-800 truncate">{p.name}</p>
                    <p className="text-[9px] text-gray-400 truncate">{p.status?.replace(/_/g, ' ')}{p.niche ? ` · ${p.niche}` : ''}</p>
                  </Link>
                ))}
                {items.length > 5 && (
                  <p className="text-[10px] text-gray-400 text-center">+{items.length - 5} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}