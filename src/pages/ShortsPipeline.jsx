import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { createPageUrl } from '@/utils';
import { SHORTS_NICHES, SCRIPT_EXAMPLES } from '@/lib/shortsNicheData';
import ShortsNicheSelector from '@/components/shorts/ShortsNicheSelector';
import ShortsStructureView from '@/components/shorts/ShortsStructureView';
import ShortsScriptExample from '@/components/shorts/ShortsScriptExample';
import ShortsEngineSpecs from '@/components/shorts/ShortsEngineSpecs';
import ShortsScriptStage from '@/components/shorts/ShortsScriptStage';
import ShortsScenesStage from '@/components/shorts/ShortsScenesStage';
import {
  ArrowLeft, ArrowRight, Film, Loader2, CheckCircle2, Circle,
  FileText, Layers, ImageIcon, Zap
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
      isActive ? 'bg-green-500/20 text-green-300 ring-2 ring-green-500/40' :
      isComplete ? 'bg-green-900/30 text-green-500' :
      'bg-white/5 text-white/30'
    }`}>
      {isComplete ? <CheckCircle2 className="w-3.5 h-3.5" /> : isActive ? <div className="w-3.5 h-3.5 rounded-full bg-green-400 animate-pulse" /> : <Circle className="w-3.5 h-3.5" />}
      <Icon className="w-3.5 h-3.5" />
      {stage.label}
    </div>
  );
}

export default function ShortsPipeline() {
  const navigate = useNavigate();
  const projectId = new URLSearchParams(window.location.search).get('project_id');
  const [selectedNiche, setSelectedNiche] = useState('finance');

  const { data: project, refetch: refetchProject } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const list = await base44.entities.Projects.filter({ id: projectId });
      return list[0];
    },
    enabled: !!projectId,
  });

  const { data: scripts = [], refetch: refetchScripts } = useQuery({
    queryKey: ['shorts-scripts', projectId],
    queryFn: () => base44.entities.Scripts.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: scenes = [], refetch: refetchScenes } = useQuery({
    queryKey: ['shorts-scenes', projectId],
    queryFn: async () => {
      const all = await base44.entities.Scenes.filter({ project_id: projectId });
      return all.sort((a, b) => a.scene_number - b.scene_number);
    },
    enabled: !!projectId,
  });

  const hasFinalScript = scripts.some(s => s.version === 'final_aggregated');
  const hasScenes = scenes.length > 0;
  const allPromptsReady = hasScenes && scenes.every(s => s.status === 'prompts_ready' || s.status === 'image_generated');

  // Determine active stage
  let activeStage = 'blueprint';
  if (hasFinalScript && !hasScenes) activeStage = 'scenes';
  else if (hasFinalScript && hasScenes && !allPromptsReady) activeStage = 'scenes';
  else if (hasFinalScript && allPromptsReady) activeStage = 'handoff';
  else if (hasFinalScript) activeStage = 'scenes';

  // Allow user to go to script stage after viewing blueprint
  const [userAdvanced, setUserAdvanced] = useState(false);
  if (userAdvanced && !hasFinalScript) activeStage = 'script';

  const currentStructure = SHORTS_NICHES[selectedNiche];
  const currentExample = SCRIPT_EXAMPLES[selectedNiche];

  if (!project) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-green-400" />
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
          <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-lg">📱</div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{project.name}</h1>
              <Badge className="bg-green-500/20 text-green-300 border-green-500/30 text-[10px]">📱 YouTube Shorts</Badge>
            </div>
            <p className="text-xs text-white/40">90 seconds · 9:16 Portrait · Visual every 2-3s</p>
          </div>
          {activeStage === 'handoff' && (
            <Button
              onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))}
              className="bg-green-600 hover:bg-green-700 gap-2"
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
              <StagePill
                key={stage.key}
                stage={stage}
                isActive={stage.key === activeStage}
                isComplete={i < stageIdx || (activeStage === 'handoff' && i <= stageIdx)}
              />
            );
          })}
        </div>

        {/* Blueprint Stage */}
        {(activeStage === 'blueprint') && (
          <div className="space-y-6">
            {/* Blueprint Header */}
            <div className="text-center border-b border-green-500/20 pb-6">
              <p className="text-[9px] tracking-widest text-green-400 font-bold mb-2">PRODUCTION BLUEPRINT v1.0</p>
              <h2 className="text-2xl font-black text-white">90-SECOND SHORTS STRUCTURE</h2>
              <p className="text-[11px] text-white/30 mt-1">Second-by-second. Word-by-word. Ready for your engine.</p>
            </div>

            <ShortsNicheSelector value={selectedNiche} onChange={setSelectedNiche} />

            <Tabs defaultValue="structure">
              <TabsList className="bg-white/5 border-white/10">
                <TabsTrigger value="structure" className="text-[10px] data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300">Structure</TabsTrigger>
                <TabsTrigger value="script" className="text-[10px] data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300">Full Script Example</TabsTrigger>
                <TabsTrigger value="specs" className="text-[10px] data-[state=active]:bg-green-500/20 data-[state=active]:text-green-300">Engine Specs</TabsTrigger>
              </TabsList>

              <TabsContent value="structure" className="mt-4">
                {currentStructure && <ShortsStructureView structure={currentStructure} />}
              </TabsContent>
              <TabsContent value="script" className="mt-4">
                <ShortsScriptExample example={currentExample} niche={selectedNiche} />
              </TabsContent>
              <TabsContent value="specs" className="mt-4">
                <ShortsEngineSpecs />
              </TabsContent>
            </Tabs>

            <div className="text-center pt-4">
              <Button
                onClick={() => setUserAdvanced(true)}
                className="bg-green-600 hover:bg-green-700 gap-2 px-8"
              >
                Continue to Script Generation <ArrowRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Script Stage */}
        {(activeStage === 'script' || hasFinalScript) && (
          <div className="space-y-6">
            <ShortsScriptStage
              projectId={projectId}
              project={project}
              scripts={scripts}
              onRefetch={async () => {
                await Promise.all([refetchScripts(), refetchProject()]);
              }}
            />
          </div>
        )}

        {/* Scenes Stage */}
        {hasFinalScript && (
          <div className="mt-6">
            <ShortsScenesStage
              projectId={projectId}
              project={project}
              scenes={scenes}
              onRefetch={async () => {
                await Promise.all([refetchScenes(), refetchProject()]);
              }}
            />
          </div>
        )}

        {/* Handoff */}
        {activeStage === 'handoff' && (
          <Card className="bg-white/5 border-white/10 mt-6">
            <CardContent className="p-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-white mb-1">Shorts Pipeline Complete</h3>
              <p className="text-white/40 text-sm mb-4">
                {scenes.length} scenes with visual prompts ready. Hand off to Content Generation for image/video production.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  onClick={() => navigate(createPageUrl(`ContentGeneration?project_id=${projectId}`))}
                  className="bg-green-600 hover:bg-green-700 gap-2"
                >
                  <ImageIcon className="w-4 h-4" /> Go to Content Generation <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}