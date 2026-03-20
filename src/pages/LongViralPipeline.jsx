import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createPageUrl } from '@/utils';
import { buildNicheForDuration, LONG_VIRAL_NICHE_IDS } from '@/lib/longViralNicheData';
import LongViralNicheSelector from '@/components/longviral/LongViralNicheSelector';
import LongViralStructureView from '@/components/longviral/LongViralStructureView';
import LongViralScriptStage from '@/components/longviral/LongViralScriptStage';
import LongViralScenesStage from '@/components/longviral/LongViralScenesStage';
import {
  ArrowLeft, ArrowRight, Film, Loader2, CheckCircle2, Circle,
  FileText, Layers, ImageIcon, Zap, Clock
} from 'lucide-react';

const STAGES = [
  { key: 'blueprint', label: 'Blueprint', icon: Zap },
  { key: 'script', label: 'Script', icon: FileText },
  { key: 'scenes', label: 'Scenes', icon: Layers },
  { key: 'handoff', label: 'Content Gen', icon: Film },
];

function StagePill({ stage, isActive, isComplete }) {
  const Icon = stage.icon;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
      isActive ? 'bg-amber-500/20 text-amber-300 ring-2 ring-amber-500/40' :
      isComplete ? 'bg-amber-900/30 text-amber-500' :
      'bg-white/5 text-white/30'
    }`}>
      {isComplete ? <CheckCircle2 className="w-3.5 h-3.5" /> : isActive ? <div className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-pulse" /> : <Circle className="w-3.5 h-3.5" />}
      <Icon className="w-3.5 h-3.5" />
      {stage.label}
    </div>
  );
}

export default function LongViralPipeline() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [selectedNiche, setSelectedNiche] = useState('finance');
  const [durationMin, setDurationMin] = useState(10);
  const [userAdvanced, setUserAdvanced] = useState(false);
  const [savingDuration, setSavingDuration] = useState(false);

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: scripts = [], refetch: refetchScripts } = useQuery({
    queryKey: ['longviral-scripts', projectId],
    queryFn: () => base44.entities.Scripts.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: scenes = [], refetch: refetchScenes } = useQuery({
    queryKey: ['longviral-scenes', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => a.scene_number - b.scene_number);
    },
    enabled: !!projectId,
  });

  // Sync duration from project
  React.useEffect(() => {
    if (project?.video_duration_minutes) setDurationMin(project.video_duration_minutes);
  }, [project?.video_duration_minutes]);

  const hasFinalScript = scripts.some(s => s.version === 'final_aggregated');
  const hasScenes = scenes.length > 0;
  const allPromptsReady = hasScenes && scenes.every(s => s.status === 'prompts_ready' || s.status === 'image_generated');

  let activeStage = 'blueprint';
  if (hasFinalScript && !hasScenes) activeStage = 'scenes';
  else if (hasFinalScript && hasScenes && !allPromptsReady) activeStage = 'scenes';
  else if (hasFinalScript && allPromptsReady) activeStage = 'handoff';
  else if (hasFinalScript) activeStage = 'scenes';
  if (userAdvanced && !hasFinalScript) activeStage = 'script';

  const structure = buildNicheForDuration(selectedNiche, durationMin);

  const handleSaveDuration = async () => {
    setSavingDuration(true);
    await base44.entities.Projects.update(projectId, { video_duration_minutes: durationMin });
    await refetchProject();
    setSavingDuration(false);
  };

  if (!project) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-amber-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white" style={{ fontFamily: "'JetBrains Mono', 'SF Mono', ui-monospace, monospace" }}>
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white/60 hover:text-white hover:bg-white/10">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-lg">🎬</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{project.name}</h1>
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">🎬 Long Viral</Badge>
            </div>
            <p className="text-xs text-white/40">{durationMin} minutes · {project.orientation === 'portrait' ? '9:16 Portrait' : '16:9 Landscape'} · Same viral structure, long-form depth</p>
          </div>
          {activeStage === 'handoff' && (
            <Button
              onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))}
              className="bg-amber-600 hover:bg-amber-700 gap-2"
            >
              Content Generation <ArrowRight className="w-4 h-4" />
            </Button>
          )}
        </div>

        {/* Stage Progress */}
        <div className="flex flex-wrap gap-2 mb-6">
          {STAGES.map((stage, i) => {
            const stageIdx = STAGES.findIndex(s => s.key === activeStage);
            return (
              <StagePill key={stage.key} stage={stage} isActive={stage.key === activeStage}
                isComplete={i < stageIdx || (activeStage === 'handoff' && i <= stageIdx)} />
            );
          })}
        </div>

        {/* Blueprint Stage */}
        {activeStage === 'blueprint' && (
          <div className="space-y-6">
            <div className="text-center border-b border-amber-500/20 pb-6">
              <p className="text-[9px] tracking-widest text-amber-400 font-bold mb-2">PRODUCTION BLUEPRINT — LONG VIRAL</p>
              <h2 className="text-2xl font-black text-white">VIRAL STRUCTURE × LONG-FORM DEPTH</h2>
              <p className="text-[11px] text-white/30 mt-1">Same proven viral frameworks from Shorts, scaled to any duration you choose.</p>
            </div>

            {/* Duration Selector */}
            <Card className="bg-white/5 border-white/10">
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <Clock className="w-5 h-5 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Set Your Duration</h3>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 flex-1">
                    <Input
                      type="number"
                      min={3}
                      max={60}
                      value={durationMin}
                      onChange={e => setDurationMin(Math.max(3, Math.min(60, parseInt(e.target.value) || 10)))}
                      className="w-24 bg-white/10 border-white/20 text-white text-center"
                    />
                    <span className="text-sm text-white/50">minutes</span>
                  </div>
                  <div className="flex gap-2">
                    {[5, 8, 10, 15, 20].map(d => (
                      <button key={d} onClick={() => setDurationMin(d)}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-all ${
                          durationMin === d ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/50 hover:bg-white/20'
                        }`}>{d}m</button>
                    ))}
                  </div>
                  <Button size="sm" onClick={handleSaveDuration} disabled={savingDuration} className="bg-amber-600 hover:bg-amber-700">
                    {savingDuration ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
                  </Button>
                </div>
                <div className="flex gap-4 mt-3 text-[10px] text-white/30">
                  <span>~{durationMin * 160} words</span>
                  <span>·</span>
                  <span>~{Math.round(durationMin * 60 / 5)} scenes</span>
                  <span>·</span>
                  <span>Visual every 4-6s</span>
                </div>
              </CardContent>
            </Card>

            <LongViralNicheSelector value={selectedNiche} onChange={setSelectedNiche} />

            <Tabs defaultValue="structure">
              <TabsList className="bg-white/5 border-white/10">
                <TabsTrigger value="structure" className="text-[10px] data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300">Structure</TabsTrigger>
              </TabsList>
              <TabsContent value="structure" className="mt-4">
                {structure && <LongViralStructureView structure={structure} />}
              </TabsContent>
            </Tabs>

            <div className="text-center pt-4">
              <Button onClick={() => { handleSaveDuration(); setUserAdvanced(true); }}
                className="bg-amber-600 hover:bg-amber-700 gap-2 px-8">
                Continue to Script Generation <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Script Stage */}
        {(activeStage === 'script' || hasFinalScript) && (
          <div className="space-y-6">
            <LongViralScriptStage projectId={projectId} project={project} scripts={scripts}
              onRefetch={async () => { await Promise.all([refetchScripts(), refetchProject()]); }} />
          </div>
        )}

        {/* Scenes Stage */}
        {hasFinalScript && (
          <div className="mt-6">
            <LongViralScenesStage projectId={projectId} project={project} scenes={scenes}
              onRefetch={async () => { await Promise.all([refetchScenes(), refetchProject()]); }} />
          </div>
        )}

        {/* Handoff */}
        {activeStage === 'handoff' && (
          <Card className="bg-white/5 border-white/10 mt-6">
            <CardContent className="p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-amber-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">Long Viral Pipeline Complete</h3>
              <p className="text-white/40 text-sm mb-4">
                {scenes.length} scenes with visual prompts ready. Hand off to Content Generation for image/video production.
              </p>
              <Button onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))}
                className="bg-amber-600 hover:bg-amber-700 gap-2">
                <ImageIcon className="w-4 h-4" /> Go to Content Generation <ArrowRight className="w-4 h-4" />
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}