import React from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  BookOpen, Image, Film, Megaphone, ChevronRight, Home,
  Loader2, Import, Download, ArrowRight, GripVertical, Layers
} from 'lucide-react';
import DownloadAllMedia from '@/components/content/DownloadAllMedia';

const stages = [
  { num: 1, label: 'Story', icon: BookOpen, page: 'StoryTopics' },
  { num: 2, label: 'Content', icon: Image, page: 'ContentGeneration' },
  { num: 3, label: 'Timeline', icon: Film, page: 'TimelineEditor' },
  { num: 4, label: 'Post', icon: Megaphone, page: 'PostProduction' },
];

export default function EditorTopBar({
  project, scenes, scenesWithTiming, totalDuration,
  voiceoverUrl, musicUrl, importing, onImport,
  onShowReorder, onShowExporter
}) {
  const navigate = useNavigate();
  const projectId = project?.id || new URLSearchParams(window.location.search).get('project_id');
  const currentStageNum = 3;

  return (
    <div className="flex items-center h-10 bg-[#12122a] border-b border-white/[0.06] px-2 flex-shrink-0 gap-2">
      {/* Home */}
      <button
        onClick={() => navigate(createPageUrl('Dashboard'))}
        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors flex-shrink-0"
        title="Dashboard"
      >
        <Home className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-5 bg-white/[0.06]" />

      {/* Pipeline breadcrumb */}
      <nav className="flex items-center gap-0.5 flex-shrink-0">
        {stages.map((stage, idx) => {
          const isCurrent = stage.num === currentStageNum;
          const isPast = stage.num < currentStageNum;
          const Icon = stage.icon;
          return (
            <React.Fragment key={stage.num}>
              {idx > 0 && <ChevronRight className="w-3 h-3 text-gray-700 mx-0.5 flex-shrink-0" />}
              <button
                onClick={() => navigate(createPageUrl(`${stage.page}?project_id=${projectId}`))}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                  isCurrent
                    ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/30'
                    : isPast
                    ? 'text-emerald-400/80 hover:bg-white/5'
                    : 'text-gray-600 hover:text-gray-400 hover:bg-white/5'
                }`}
              >
                <Icon className="w-3 h-3" />
                <span className="hidden lg:inline">{stage.label}</span>
              </button>
            </React.Fragment>
          );
        })}
      </nav>

      <div className="w-px h-5 bg-white/[0.06] mx-1" />

      {/* Project title + stats */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <h1 className="text-[12px] font-semibold text-gray-200 truncate max-w-[220px]">
          {project?.name || 'Untitled'}
        </h1>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-[10px] text-gray-500 bg-white/[0.04] px-1.5 py-0.5 rounded">
            {scenes.length} scenes
          </span>
          <span className="text-[10px] text-gray-500 bg-white/[0.04] px-1.5 py-0.5 rounded">
            {Math.floor(totalDuration / 60)}:{String(Math.floor(totalDuration % 60)).padStart(2, '0')}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {(scenes.length === 0 || project?.status === 'content_generation' || project?.status === 'scenes_ready') && (
          <Button
            onClick={onImport}
            disabled={importing}
            size="sm"
            className="bg-blue-600 hover:bg-blue-500 text-white text-[11px] h-7 px-3 gap-1.5 rounded-md font-medium shadow-lg shadow-blue-600/20"
          >
            {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Import className="w-3 h-3" />}
            Import Scenes
          </Button>
        )}
        {scenes.length > 0 && (
          <>
            <button
              onClick={onShowReorder}
              className="h-7 px-2 rounded-md text-[11px] font-medium text-gray-400 hover:text-white hover:bg-white/10 flex items-center gap-1 transition-colors"
            >
              <GripVertical className="w-3 h-3" />
              <span className="hidden xl:inline">Reorder</span>
            </button>

            <DownloadAllMedia scenes={scenesWithTiming} voiceoverUrl={voiceoverUrl} musicUrl={musicUrl} projectName={project?.name} />

            <button
              onClick={onShowExporter}
              className="h-7 px-3 rounded-md text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-colors shadow-lg shadow-emerald-600/20"
            >
              <Download className="w-3 h-3" />
              Export
            </button>

            <button
              onClick={async () => {
                await base44.entities.Projects.update(projectId, { status: 'post_production', current_step: 11 });
                navigate(createPageUrl(`PostProduction?project_id=${projectId}`));
              }}
              className="h-7 px-3 rounded-md text-[11px] font-semibold bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5 transition-colors shadow-lg shadow-blue-600/20"
            >
              Next
              <ArrowRight className="w-3 h-3" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}