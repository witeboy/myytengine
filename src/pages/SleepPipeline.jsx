import React from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '@/utils';
import SleepScriptStage from '@/components/sleep/SleepScriptStage';
import SleepVisualsStage from '@/components/sleep/SleepVisualsStage';
import SleepMusicStage from '@/components/sleep/SleepMusicStage';
import {
  ArrowLeft, Moon, Sparkles, ImageIcon, Music,
  Film, ArrowRight, CheckCircle2, Circle, Loader2
} from 'lucide-react';

const STAGES = [
  { key: 'script', label: 'Script', icon: Sparkles },
  { key: 'visuals', label: 'Ambient Visuals', icon: ImageIcon },
  { key: 'music', label: '432Hz Music', icon: Music },
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

  const allImagesReady = scenes.length > 0 && scenes.every(s => s.image_url && s.image_url.startsWith('http'));

  // Determine active stage
  let activeStage = 'script';
  if (scriptReady && !allImagesReady) activeStage = 'visuals';
  else if (scriptReady && allImagesReady) activeStage = 'music';

  // Check if music exists
  const { data: musicTracks = [] } = useQuery({
    queryKey: ['sleep-music', projectId],
    queryFn: () => base44.entities.MusicTracks.filter({ project_id: projectId }),
    enabled: !!projectId,
  });
  const hasMusicReady = musicTracks.some(t => t.is_selected && t.audio_url);
  if (scriptReady && allImagesReady && hasMusicReady) activeStage = 'handoff';

  const isMeditation = project?.project_mode === 'sleep_meditation';
  const modeLabel = isMeditation ? '🧘 Sleep Meditation' : '🌙 Sleep Story';

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
            <p className="text-sm text-white/50">{project.video_duration_minutes || 15} min · Ambient Sleep Pipeline</p>
          </div>
          {activeStage === 'handoff' && (
            <Button
              onClick={() => navigate(createPageUrl(`TimelineEditor?project_id=${projectId}`))}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
            >
              Timeline <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Stage Progress */}
        <div className="flex flex-wrap gap-2 mb-8">
          {STAGES.map((stage, i) => {
            const stageIdx = STAGES.findIndex(s => s.key === activeStage);
            return (
              <StagePill
                key={stage.key}
                stage={stage}
                isActive={stage.key === activeStage}
                isComplete={i < stageIdx || (activeStage === 'handoff' && i <= stageIdx)}
              />
            );
          })}
        </div>

        {/* Info Banner */}
        <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <Moon className="w-5 h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-indigo-200 font-medium">Ambient Sleep Format</p>
              <p className="text-xs text-white/40 mt-1">
                {scenes.length > 0 ? `${scenes.length} gorgeous ambient images` : '8-12 gorgeous ambient images'}, each holding for several minutes with ultra-slow Ken Burns motion.
                Voice + 432Hz music do the real work — visuals are warm ambient wallpaper.
              </p>
            </div>
          </div>
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

          {scriptReady && (
            <SleepVisualsStage
              projectId={projectId}
              project={project}
              scenes={scenes}
              onRefetch={async () => {
                await Promise.all([refetchScenes(), refetchProject()]);
              }}
            />
          )}

          {scriptReady && allImagesReady && (
            <SleepMusicStage
              projectId={projectId}
              project={project}
              onRefetch={refetchProject}
            />
          )}

          {activeStage === 'handoff' && (
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
                <h3 className="text-lg font-bold text-white mb-1">Sleep Pipeline Complete</h3>
                <p className="text-white/50 text-sm mb-4">
                  {scenes.length} ambient images + 432Hz music ready.
                  Each image will hold for several minutes with ultra-slow Ken Burns motion.
                </p>
                <div className="flex gap-3 justify-center">
                  <Button
                    onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))}
                    variant="outline"
                    className="border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10"
                  >
                    <ImageIcon className="w-4 h-4 mr-1" /> Edit in Content Gen
                  </Button>
                  <Button
                    onClick={() => navigate(createPageUrl(`TimelineEditor?project_id=${projectId}`))}
                    className="bg-indigo-600 hover:bg-indigo-700 gap-2"
                  >
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