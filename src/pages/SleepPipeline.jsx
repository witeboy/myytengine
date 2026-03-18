import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import SleepScriptStage from '@/components/sleep/SleepScriptStage';
import SleepScenesStage from '@/components/sleep/SleepScenesStage';
import SleepBrollStage from '@/components/sleep/SleepBrollStage';
import {
  ArrowLeft, Moon, Sparkles, Layers, ImageIcon, Film,
  Clapperboard, ArrowRight, CheckCircle2, Circle, Loader2
} from 'lucide-react';

const STAGES = [
  { key: 'script', label: 'Script', icon: Sparkles },
  { key: 'scenes', label: 'Scene Breakdown', icon: Layers },
  { key: 'broll', label: 'B-Roll', icon: Clapperboard },
  { key: 'handoff', label: 'Timeline', icon: Film },
];

function StagePill({ stage, isActive, isComplete }) {
  const Icon = stage.icon;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
      isActive ? 'bg-indigo-100 text-indigo-800 ring-2 ring-indigo-300' :
      isComplete ? 'bg-green-50 text-green-700' :
      'bg-gray-100 text-gray-400'
    }`}>
      {isComplete ? <CheckCircle2 className="w-3.5 h-3.5" /> : isActive ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Circle className="w-3.5 h-3.5" />}
      <Icon className="w-3.5 h-3.5" />
      {stage.label}
    </div>
  );
}

export default function SleepPipeline() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectId = new URLSearchParams(window.location.search).get('project_id');

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: batches = [], refetch: refetchBatches } = useQuery({
    queryKey: ['sleep-batches', projectId],
    queryFn: async () => {
      const all = await base44.entities.ScriptBatches.filter({ project_id: projectId });
      return all.sort((a, b) => a.batch_number - b.batch_number);
    },
    enabled: !!projectId,
  });

  const { data: scripts = [], refetch: refetchScripts } = useQuery({
    queryKey: ['sleep-scripts', projectId],
    queryFn: () => base44.entities.Scripts.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: scenes = [], refetch: refetchScenes } = useQuery({
    queryKey: ['sleep-scenes', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => a.scene_number - b.scene_number);
    },
    enabled: !!projectId,
  });

  const allBatchesDone = batches.length > 0 && batches.every(b => b.status === 'completed');
  const hasFinalScript = scripts.some(s => s.version === 'final_aggregated');
  const scriptReady = allBatchesDone && hasFinalScript;

  const scenesDone = scenes.length > 0 && scenes.every(s => s.status !== 'pending');
  const breakdownDone = scenes.length > 0 && scenes.filter(s => s.status === 'breakdown_ready' || s.status === 'prompts_ready').length === scenes.length;

  const brollCount = scenes.filter(s => s.broll_url && s.broll_url.startsWith('http')).length;
  const brollDone = scenes.length > 0 && brollCount >= scenes.length * 0.7; // 70% threshold

  // Determine active stage
  let activeStage = 'script';
  if (scriptReady && !breakdownDone) activeStage = 'scenes';
  else if (scriptReady && breakdownDone && !brollDone) activeStage = 'broll';
  else if (scriptReady && breakdownDone && brollDone) activeStage = 'handoff';

  const isMeditation = project?.project_mode === 'sleep_meditation';
  const modeLabel = isMeditation ? '🧘 Sleep Meditation' : '🌙 Sleep Story';

  const handleGoToTimeline = () => {
    navigate(createPageUrl(`TimelineEditor?project_id=${projectId}`));
  };

  const handleGoToContentGen = () => {
    navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`));
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white/60 hover:text-white hover:bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Moon className="w-8 h-8 text-indigo-400" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{project.name}</h1>
              <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30 text-[10px]">{modeLabel}</Badge>
            </div>
            <p className="text-sm text-white/50">{project.video_duration_minutes || 15} min · Sleep Pipeline</p>
          </div>
          {activeStage === 'handoff' && (
            <div className="flex gap-2">
              <Button onClick={handleGoToContentGen} variant="outline" className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10">
                <ImageIcon className="w-4 h-4 mr-1" /> Content Gen
              </Button>
              <Button onClick={handleGoToTimeline} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                Timeline <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Stage Progress */}
        <div className="flex flex-wrap gap-2 mb-8">
          {STAGES.map((stage, i) => {
            const stageIdx = STAGES.findIndex(s => s.key === activeStage);
            const thisIdx = i;
            return (
              <StagePill
                key={stage.key}
                stage={stage}
                isActive={stage.key === activeStage}
                isComplete={thisIdx < stageIdx || (activeStage === 'handoff' && thisIdx <= stageIdx)}
              />
            );
          })}
        </div>

        {/* Stage Content */}
        <div className="space-y-6">
          {(activeStage === 'script' || !scriptReady) && (
            <SleepScriptStage
              projectId={projectId}
              project={project}
              batches={batches}
              scripts={scripts}
              onRefetch={async () => {
                await Promise.all([refetchBatches(), refetchScripts(), refetchProject()]);
              }}
            />
          )}

          {scriptReady && (activeStage === 'scenes' || activeStage === 'broll' || activeStage === 'handoff') && (
            <SleepScenesStage
              projectId={projectId}
              project={project}
              scenes={scenes}
              breakdownDone={breakdownDone}
              onRefetch={async () => {
                await Promise.all([refetchScenes(), refetchProject()]);
              }}
            />
          )}

          {scriptReady && breakdownDone && (activeStage === 'broll' || activeStage === 'handoff') && (
            <SleepBrollStage
              projectId={projectId}
              scenes={scenes}
              brollCount={brollCount}
              brollDone={brollDone}
              onRefetch={refetchScenes}
            />
          )}

          {activeStage === 'handoff' && (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white mb-1">Sleep Pipeline Complete</h3>
                <p className="text-white/50 text-sm mb-4">
                  {scenes.length} scenes with {brollCount} B-roll clips ready.
                  Continue to Content Generation for image/video creation, or go directly to Timeline.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button onClick={handleGoToContentGen} variant="outline" className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10">
                    <ImageIcon className="w-4 h-4 mr-1" /> Generate Images & Videos
                  </Button>
                  <Button onClick={handleGoToTimeline} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
                    Go to Timeline <ArrowRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}