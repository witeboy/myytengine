import React from 'react';
import { BookOpen, Image, Film, Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';

export default function StageProgress({ currentStage = 1 }) {
  const navigate = useNavigate();

  const stages = [
    { num: 1, label: 'Story Generation', Icon: BookOpen },
    { num: 2, label: 'Content Creation', Icon: Image },
    { num: 3, label: 'Timeline & Export', Icon: Film },
  ];

  const getStageClasses = (stageNum) => {
    if (currentStage === stageNum) return 'bg-blue-100 text-blue-700';
    if (currentStage > stageNum) return 'bg-green-100 text-green-700';
    return 'bg-gray-100 text-gray-400';
  };

  const getLineClass = (stageNum) => {
    return currentStage > stageNum ? 'bg-green-400' : 'bg-gray-200';
  };

  return (
    <div className="bg-white border-b shadow-sm">
      <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-4">
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
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${getStageClasses(stage.num)}`}>
                <stage.Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{stage.label}</span>
                <span className="sm:hidden">Stage {stage.num}</span>
              </div>
              {idx < stages.length - 1 && (
                <div className={`flex-1 h-0.5 ${getLineClass(stage.num)}`} />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}