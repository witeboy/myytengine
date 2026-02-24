import React from 'react';
import { BookOpen, Image, Film, Home, Megaphone } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';

export default function StageProgress({ currentStage = 1, projectStatus }) {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');

  const stages = [
    { num: 1, label: 'Story Generation', Icon: BookOpen, page: 'StoryTopics' },
    { num: 2, label: 'Content Creation', Icon: Image, page: 'ContentGeneration' },
    { num: 3, label: 'Timeline & Export', Icon: Film, page: 'TimelineEditor' },
    { num: 4, label: 'Post Production', Icon: Megaphone, page: 'PostProduction' },
  ];

  // Stage 1 sub-steps for navigation
  const storySubSteps = [
    { label: 'Topics', page: 'StoryTopics', statuses: ['created', 'topics_ready'] },
    { label: 'Duration', page: 'StoryDuration', statuses: ['topic_selected'] },
    { label: 'Hooks', page: 'StoryHooks', statuses: ['outline_ready'] },
    { label: 'Script', page: 'StoryScript', statuses: ['hooks_ready', 'scripting', 'script_complete', 'voiceover_ready'] },
  ];

  // All statuses in pipeline order — used to determine reachability
  const allStatuses = [
    'created', 'topics_ready', 'topic_selected', 'outline_ready',
    'hooks_ready', 'scripting', 'script_complete', 'voiceover_ready',
    'scene_breakdown', 'breakdown_complete', 'content_generation', 'scenes_ready',
    'timeline_editing', 'compiled',
    'post_production', 'published'
  ];

  const currentStatusIdx = allStatuses.indexOf(projectStatus);

  // Determine what stage number a status maps to
  const getStageForStatus = (status) => {
    if (['created', 'topics_ready', 'topic_selected', 'outline_ready', 'hooks_ready', 'scripting', 'script_complete', 'voiceover_ready'].includes(status)) return 1;
    if (['scene_breakdown', 'breakdown_complete', 'content_generation', 'scenes_ready'].includes(status)) return 2;
    if (['timeline_editing', 'compiled'].includes(status)) return 3;
    if (['post_production', 'published'].includes(status)) return 4;
    return 1;
  };

  const highestReachedStage = projectStatus ? getStageForStatus(projectStatus) : 1;

  const getStageClasses = (stageNum) => {
    if (currentStage === stageNum) return 'bg-blue-100 text-blue-700';
    if (highestReachedStage >= stageNum) return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-400';
  };

  const getLineClass = (stageNum) => {
    return highestReachedStage > stageNum ? 'bg-green-400' : 'bg-gray-200';
  };

  // A stage is clickable if the project has reached it at some point
  const isStageClickable = (stageNum) => {
    return highestReachedStage >= stageNum;
  };

  // Determine which sub-step is reachable based on projectStatus
  const getSubStepReachable = (subStep) => {
    if (!projectStatus) return false;
    const subStepMinIdx = Math.min(...subStep.statuses.map(s => allStatuses.indexOf(s)).filter(i => i >= 0));
    return currentStatusIdx >= subStepMinIdx;
  };

  const handleStageClick = (stage) => {
    if (projectId && isStageClickable(stage.num)) {
      navigate(createPageUrl(`${stage.page}?project_id=${projectId}`));
    }
  };

  return (
    <div className="bg-white border-b shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-3">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(createPageUrl('Dashboard'))}
            className="flex-shrink-0"
          >
            <Home className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1">
            {stages.map((stage, idx) => (
              <React.Fragment key={stage.num}>
                <button
                  onClick={() => handleStageClick(stage)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${getStageClasses(stage.num)} cursor-pointer hover:ring-2 hover:ring-blue-300`}
                >
                  <stage.Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{stage.label}</span>
                  <span className="sm:hidden">Stage {stage.num}</span>
                </button>
                {idx < stages.length - 1 && (
                  <div className={`flex-1 h-0.5 ${getLineClass(stage.num)}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
        {/* Sub-steps for Stage 1 */}
        {currentStage === 1 && projectStatus && (
          <div className="flex items-center gap-1 mt-2 ml-12 overflow-x-auto">
            {storySubSteps.map((sub, idx) => {
              const reachable = getSubStepReachable(sub);
              const isCurrent = sub.statuses.includes(projectStatus);
              return (
                <React.Fragment key={sub.label}>
                  <button
                    onClick={() => projectId && navigate(createPageUrl(`${sub.page}?project_id=${projectId}`))}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                      isCurrent ? 'bg-blue-600 text-white' :
                      reachable ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' :
                      'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600'
                    }`}
                  >
                    {sub.label}
                  </button>
                  {idx < storySubSteps.length - 1 && (
                    <div className={`w-3 h-0.5 ${reachable ? 'bg-blue-300' : 'bg-gray-200'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}